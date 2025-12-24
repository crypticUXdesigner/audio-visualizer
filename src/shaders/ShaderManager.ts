// ShaderManager - Manages multiple shader instances
// Handles shader registration, switching, and parameter management

import { ShaderInstance } from './ShaderInstance.js';
import { ShaderLogger } from './utils/ShaderLogger.js';
import type { ShaderConfig, ExtendedAudioData } from '../types/index.js';
import type { AudioAnalyzer } from '../core/audio/AudioAnalyzer.js';
import type { Colors } from '../types/webgl.js';
import type { ShaderEntry, LoudnessControls, ParameterValue } from '../types/shader.js';

export class ShaderManager {
    shaders: Map<string, ShaderEntry>;
    activeShader: ShaderInstance | null;
    audioAnalyzer: AudioAnalyzer | null;
    colors: Colors | null;
    colorUpdateCallback: ((audioData: ExtendedAudioData) => void) | null;
    onFirstColorUpdate: (() => void) | null;
    loudnessControls: LoudnessControls | null;
    
    constructor() {
        this.shaders = new Map(); // name -> ShaderInstance
        this.activeShader = null;
        this.audioAnalyzer = null;
        this.colors = null;
        this.colorUpdateCallback = null; // Callback for dynamic color updates
        this.onFirstColorUpdate = null; // Callback for when shader receives first colors
        this.loudnessControls = null; // Loudness controls for time offset manager
    }
    
    /**
     * Set loudness controls for all shaders
     * @param controls - Controls object with loudnessAnimationEnabled and loudnessThreshold
     */
    setLoudnessControls(controls: LoudnessControls): void {
        this.loudnessControls = controls;
        
        // Inject into active shader if it exists
        if (this.activeShader && this.activeShader.timeOffsetManager) {
            this.activeShader.timeOffsetManager.setLoudnessControls(controls);
        }
    }
    
    /**
     * Set callback for dynamic color updates (called from render loop)
     * @param callback - Callback function (audioData) => void
     */
    setColorUpdateCallback(callback: ((audioData: ExtendedAudioData) => void) | null): void {
        this.colorUpdateCallback = callback;
    }
    
    /**
     * Register a shader configuration
     * @param config - Shader configuration object
     * @throws Error If config is invalid
     */
    registerShader(config: ShaderConfig): void {
        // Validate config structure
        if (!config || typeof config !== 'object') {
            throw new Error('Shader config must be an object');
        }
        
        if (!config.name || typeof config.name !== 'string') {
            throw new Error('Shader config must have a string "name" property');
        }
        
        if (!config.fragmentPath || typeof config.fragmentPath !== 'string') {
            throw new Error('Shader config must have a string "fragmentPath" property');
        }
        
        if (!config.vertexPath || typeof config.vertexPath !== 'string') {
            throw new Error('Shader config must have a string "vertexPath" property');
        }
        
        // Validate parameters if present
        if (config.parameters) {
            if (typeof config.parameters !== 'object') {
                throw new Error('Shader config "parameters" must be an object');
            }
            for (const [name, paramConfig] of Object.entries(config.parameters)) {
                if (!paramConfig.type || !['float', 'int'].includes(paramConfig.type)) {
                    throw new Error(`Parameter "${name}" must have valid "type" (float or int)`);
                }
                if (paramConfig.min !== undefined && paramConfig.max !== undefined) {
                    if (paramConfig.min > paramConfig.max) {
                        throw new Error(`Parameter "${name}" has invalid range: min > max`);
                    }
                }
            }
        }
        
        if (this.shaders.has(config.name)) {
            ShaderLogger.warn(`Shader "${config.name}" already registered, overwriting`);
        }
        
        // Store config, will create instance when needed
        this.shaders.set(config.name, {
            config,
            instance: null,
            canvasId: config.canvasId || `canvas-${config.name}`
        });
        
        ShaderLogger.info(`Registered shader: ${config.name}`);
    }
    
    /**
     * Set the active shader
     * @param name - Shader name
     * @returns Promise that resolves with the activated shader instance
     */
    async setActiveShader(name: string): Promise<ShaderInstance> {
        if (!this.shaders.has(name)) {
            throw new Error(`Shader "${name}" not registered`);
        }
        
        const shaderEntry = this.shaders.get(name)!;
        
        // Stop ALL shader instances' render loops to prevent multiple shaders rendering
        this.shaders.forEach((entry) => {
            if (entry.instance) {
                entry.instance.stopRenderLoop();
            }
        });
        
        // Create instance if it doesn't exist
        if (!shaderEntry.instance) {
            // Convert ShaderConfig to ShaderConfigWithHooks
            // The plugin type is intentionally different but compatible at runtime
            const configWithHooks = shaderEntry.config as ShaderInstance['config'];
            const instance = new ShaderInstance(shaderEntry.canvasId, configWithHooks);
            instance._shaderManager = this; // Store reference to shader manager
            try {
                await instance.init();
                shaderEntry.instance = instance;
            } catch (error) {
                // If initialization fails, don't store the instance
                // This prevents leaving a broken instance in the map
                ShaderLogger.error(`Failed to initialize shader "${name}":`, error);
                throw error;
            }
        } else {
            // Update reference if instance already exists
            shaderEntry.instance._shaderManager = this;
        }
        
        this.activeShader = shaderEntry.instance;
        
        // Inject loudness controls if available
        if (this.loudnessControls && this.activeShader.timeOffsetManager) {
            this.activeShader.timeOffsetManager.setLoudnessControls(this.loudnessControls);
        }
        
        // Start render loop if we have audio analyzer and colors
        if (this.audioAnalyzer && this.colors) {
            this.activeShader.startRenderLoop(this.audioAnalyzer, this.colors);
        } else if (this.audioAnalyzer) {
            // Start with null colors, will be updated when colors are ready
            this.activeShader.startRenderLoop(this.audioAnalyzer, null);
        }
        
        ShaderLogger.info(`Activated shader: ${name}`);
        return this.activeShader;
    }
    
    /**
     * Get the active shader instance
     * @returns Active shader instance or null
     */
    getActiveShader(): ShaderInstance | null {
        return this.activeShader;
    }
    
    /**
     * Get shader by name
     * @param name - Shader name
     * @returns Shader instance or null
     */
    getShader(name: string): ShaderInstance | null {
        const entry = this.shaders.get(name);
        return entry ? entry.instance : null;
    }
    
    /**
     * Set audio analyzer for all shaders
     * @param audioAnalyzer - Audio analyzer instance
     */
    setAudioAnalyzer(audioAnalyzer: AudioAnalyzer | null): void {
        this.audioAnalyzer = audioAnalyzer;
        
        // Restart render loop if active shader exists
        if (this.activeShader && this.colors) {
            this.activeShader.stopRenderLoop();
            this.activeShader.startRenderLoop(this.audioAnalyzer!, this.colors);
        }
    }
    
    /**
     * Set colors for all shaders
     * @param colors - Color object with color, color2, etc.
     */
    setColors(colors: Colors | null): void {
        this.colors = colors;
        
        // Update active shader's render loop with new colors
        if (this.activeShader) {
            // If render loop is running, update colors without restarting (more efficient)
            if (this.activeShader.renderLoop.isRunning()) {
                this.activeShader.updateColors(this.colors!);
            } else if (this.audioAnalyzer) {
                // Render loop not running yet, start it
                this.activeShader.startRenderLoop(this.audioAnalyzer, this.colors);
            }
        }
    }
    
    /**
     * Update all shaders with new audio data
     * This is called automatically by render loops, but can be called manually
     */
    updateAllShaders(audioData: ExtendedAudioData | null): void {
        // Render loops handle this automatically, but we can trigger manual renders if needed
        if (this.activeShader) {
            this.activeShader.render(audioData, this.colors);
        }
    }
    
    /**
     * Get parameter panel configuration for active shader
     * @returns Parameter configuration object or null
     */
    getParameterPanelConfig(): { shaderName: string; displayName: string; parameters: Record<string, ParameterValue> } | null {
        if (!this.activeShader) return null;
        
        return {
            shaderName: this.activeShader.config.name,
            displayName: this.activeShader.config.displayName || this.activeShader.config.name,
            parameters: this.activeShader.config.parameters || {}
        };
    }
    
    /**
     * Set parameter on active shader
     * @param name - Parameter name
     * @param value - Parameter value
     */
    setParameter(name: string, value: ParameterValue): boolean {
        if (this.activeShader) {
            return this.activeShader.setParameter(name, value);
        }
        return false;
    }
    
    /**
     * Get parameter from active shader
     * @param name - Parameter name
     * @returns Parameter value
     */
    getParameter(name: string): ParameterValue | undefined {
        if (this.activeShader) {
            return this.activeShader.getParameter(name);
        }
        return undefined;
    }
    
    /**
     * Get all registered shader names
     * @returns Array of shader names
     */
    getShaderNames(): string[] {
        return Array.from(this.shaders.keys());
    }
    
    /**
     * Destroy all shader instances
     */
    destroy(): void {
        this.shaders.forEach((entry) => {
            if (entry.instance) {
                entry.instance.destroy();
            }
        });
        this.shaders.clear();
        this.activeShader = null;
    }
}

