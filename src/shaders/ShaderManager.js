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
     */
    registerShader(config) {
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
            await instance.init();
            shaderEntry.instance = instance;
        } else {
            // Update reference if instance already exists
            shaderEntry.instance._shaderManager = this;
        }
        
        this.activeShader = shaderEntry.instance;
        
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

