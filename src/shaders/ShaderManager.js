// ShaderManager - Manages multiple shader instances
// Handles shader registration, switching, and parameter management

import { ShaderInstance } from './ShaderInstance.js';
import { ShaderLogger } from './utils/ShaderLogger.js';

export class ShaderManager {
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
     * @param {Object} controls - Controls object with loudnessAnimationEnabled and loudnessThreshold
     */
    setLoudnessControls(controls) {
        this.loudnessControls = controls;
        
        // Inject into active shader if it exists
        if (this.activeShader && this.activeShader.timeOffsetManager) {
            this.activeShader.timeOffsetManager.setLoudnessControls(controls);
        }
    }
    
    /**
     * Set callback for dynamic color updates (called from render loop)
     * @param {Function} callback - Callback function (audioData) => void
     */
    setColorUpdateCallback(callback) {
        this.colorUpdateCallback = callback;
    }
    
    /**
     * Register a shader configuration
     * @param {Object} config - Shader configuration object
     * @throws {Error} If config is invalid
     */
    registerShader(config) {
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
     * @param {string} name - Shader name
     * @returns {Promise<ShaderInstance>} The activated shader instance
     */
    async setActiveShader(name) {
        if (!this.shaders.has(name)) {
            throw new Error(`Shader "${name}" not registered`);
        }
        
        const shaderEntry = this.shaders.get(name);
        
        // Stop current active shader
        if (this.activeShader) {
            this.activeShader.stopRenderLoop();
        }
        
        // Create instance if it doesn't exist
        if (!shaderEntry.instance) {
            const instance = new ShaderInstance(shaderEntry.canvasId, shaderEntry.config);
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
     * @returns {ShaderInstance|null}
     */
    getActiveShader() {
        return this.activeShader;
    }
    
    /**
     * Get shader by name
     * @param {string} name - Shader name
     * @returns {ShaderInstance|null}
     */
    getShader(name) {
        const entry = this.shaders.get(name);
        return entry ? entry.instance : null;
    }
    
    /**
     * Set audio analyzer for all shaders
     * @param {AudioAnalyzer} audioAnalyzer
     */
    setAudioAnalyzer(audioAnalyzer) {
        this.audioAnalyzer = audioAnalyzer;
        
        // Restart render loop if active shader exists
        if (this.activeShader && this.colors) {
            this.activeShader.stopRenderLoop();
            this.activeShader.startRenderLoop(this.audioAnalyzer, this.colors);
        }
    }
    
    /**
     * Set colors for all shaders
     * @param {Object} colors - Color object with color, color2, etc.
     */
    setColors(colors) {
        this.colors = colors;
        
        // Update active shader's render loop with new colors
        if (this.activeShader) {
            // If render loop is running, update colors without restarting (more efficient)
            if (this.activeShader.renderLoopId) {
                this.activeShader.updateColors(this.colors);
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
    updateAllShaders(audioData) {
        // Render loops handle this automatically, but we can trigger manual renders if needed
        if (this.activeShader) {
            this.activeShader.render(audioData, this.colors);
        }
    }
    
    /**
     * Get parameter panel configuration for active shader
     * @returns {Object|null} Parameter configuration object
     */
    getParameterPanelConfig() {
        if (!this.activeShader) return null;
        
        return {
            shaderName: this.activeShader.config.name,
            displayName: this.activeShader.config.displayName || this.activeShader.config.name,
            parameters: this.activeShader.config.parameters || {}
        };
    }
    
    /**
     * Set parameter on active shader
     * @param {string} name - Parameter name
     * @param {*} value - Parameter value
     */
    setParameter(name, value) {
        if (this.activeShader) {
            return this.activeShader.setParameter(name, value);
        }
        return false;
    }
    
    /**
     * Get parameter from active shader
     * @param {string} name - Parameter name
     * @returns {*} Parameter value
     */
    getParameter(name) {
        if (this.activeShader) {
            return this.activeShader.getParameter(name);
        }
        return null;
    }
    
    /**
     * Get all registered shader names
     * @returns {string[]}
     */
    getShaderNames() {
        return Array.from(this.shaders.keys());
    }
    
    /**
     * Destroy all shader instances
     */
    destroy() {
        this.shaders.forEach((entry) => {
            if (entry.instance) {
                entry.instance.destroy();
            }
        });
        this.shaders.clear();
        this.activeShader = null;
    }
}

