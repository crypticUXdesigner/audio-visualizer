// BaseShaderPlugin - Abstract base class for shader-specific plugins
// Provides hooks for shader-specific initialization, rendering, and uniform updates

export class BaseShaderPlugin {
    /**
     * @param {ShaderInstance} shaderInstance - Reference to the ShaderInstance
     * @param {Object} config - Shader configuration object
     */
    constructor(shaderInstance, config) {
        this.shaderInstance = shaderInstance;
        this.config = config;
    }
    
    /**
     * Called after shader initialization
     * Override to perform plugin-specific setup
     */
    onInit() {
        // Default: no-op
    }
    
    /**
     * Called when shader is destroyed
     * Override to clean up plugin-specific resources
     */
    onDestroy() {
        // Default: no-op
    }
    
    /**
     * Called before each render frame
     * Override to perform pre-render operations
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {Object} colors - Current color values
     * @param {number} deltaTime - Time since last frame in seconds
     */
    onBeforeRender(audioData, colors, deltaTime) {
        // Default: no-op
    }
    
    /**
     * Called after each render frame
     * Override to perform post-render operations
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {Object} colors - Current color values
     * @param {number} deltaTime - Time since last frame in seconds
     */
    onAfterRender(audioData, colors, deltaTime) {
        // Default: no-op
    }
    
    /**
     * Called to update shader-specific uniforms
     * Override to set plugin-specific uniforms
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {Object} colors - Current color values
     * @param {number} deltaTime - Time since last frame in seconds
     */
    onUpdateUniforms(audioData, colors, deltaTime) {
        // Default: no-op
    }
    
    /**
     * Called to update shader-specific textures
     * Override to update plugin-specific textures
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {number} deltaTime - Time since last frame in seconds
     */
    onUpdateTextures(audioData, deltaTime) {
        // Default: no-op
    }
    
    /**
     * Get smoothing state object for this plugin
     * Override to return plugin-specific smoothing state
     * @returns {Object|null} Smoothing state object or null
     */
    getSmoothingState() {
        return null;
    }
    
    /**
     * Update smoothing calculations
     * Override to perform plugin-specific smoothing
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {number} deltaTime - Time since last frame in seconds
     */
    updateSmoothing(audioData, deltaTime) {
        // Default: no-op
    }
}

