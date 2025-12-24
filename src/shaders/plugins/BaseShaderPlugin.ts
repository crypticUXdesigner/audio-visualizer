// BaseShaderPlugin - Abstract base class for shader-specific plugins
// Provides hooks for shader-specific initialization, rendering, and uniform updates

import type { ExtendedAudioData, ShaderConfig, ParameterValue } from '../../types/index.js';
import type { ShaderInstance } from '../ShaderInstance.js';
import type { UniformManager } from '../managers/UniformManager.js';
import type { ColorMap } from '../../types/index.js';

export class BaseShaderPlugin {
    shaderInstance: ShaderInstance;
    config: ShaderConfig;
    
    /**
     * @param shaderInstance - Reference to the ShaderInstance
     * @param config - Shader configuration object
     */
    constructor(shaderInstance: ShaderInstance, config: ShaderConfig) {
        this.shaderInstance = shaderInstance;
        this.config = config;
    }
    
    /**
     * Called after shader initialization
     * Override to perform plugin-specific setup
     */
    onInit(): void {
        // Default: no-op
    }
    
    /**
     * Called when shader is destroyed
     * Override to clean up plugin-specific resources
     */
    onDestroy(): void {
        // Default: no-op
    }
    
    /**
     * Called before each render frame
     * Override to perform pre-render operations
     * @param audioData - Audio data from AudioAnalyzer
     * @param colors - Current color values
     * @param deltaTime - Time since last frame in seconds
     */
    onBeforeRender(_audioData: ExtendedAudioData | null, _colors: ColorMap | null, _deltaTime: number): void {
        // Default: no-op
    }
    
    /**
     * Called after each render frame
     * Override to perform post-render operations
     * @param audioData - Audio data from AudioAnalyzer
     * @param colors - Current color values
     * @param deltaTime - Time since last frame in seconds
     */
    onAfterRender(_audioData: ExtendedAudioData | null, _colors: ColorMap | null, _deltaTime: number): void {
        // Default: no-op
    }
    
    /**
     * Called to update shader-specific uniforms
     * Override to set plugin-specific uniforms
     * @param audioData - Audio data from AudioAnalyzer
     * @param colors - Current color values
     * @param deltaTime - Time since last frame in seconds
     */
    onUpdateUniforms(_audioData: ExtendedAudioData | null, _colors: ColorMap | null, _deltaTime: number): void {
        // Default: no-op
    }
    
    /**
     * Called to update shader-specific textures
     * Override to update plugin-specific textures
     * @param audioData - Audio data from AudioAnalyzer
     * @param deltaTime - Time since last frame in seconds
     */
    onUpdateTextures(_audioData: ExtendedAudioData | null, _deltaTime: number): void {
        // Default: no-op
    }
    
    /**
     * Get smoothing state object for this plugin
     * Override to return plugin-specific smoothing state
     * @returns Smoothing state object or null
     */
    getSmoothingState(): Record<string, unknown> | null {
        return null;
    }
    
    /**
     * Update smoothing calculations
     * Override to perform plugin-specific smoothing
     * @param audioData - Audio data from AudioAnalyzer
     * @param deltaTime - Time since last frame in seconds
     */
    updateSmoothing(_audioData: ExtendedAudioData | null, _deltaTime: number): void {
        // Default: no-op
    }
    
    /**
     * Update shader-specific parameter uniforms
     * Override to handle plugin-specific parameters
     * @param parameters - Current parameter values
     * @param config - Shader config
     * @param uniformManager - Uniform manager instance
     */
    onUpdateParameterUniforms(_parameters: Record<string, ParameterValue>, _config: ShaderConfig, _uniformManager: UniformManager): void {
        // Default: no-op
    }
    
    /**
     * Called when canvas is resized
     * Override to handle resize-specific logic
     * @param width - New canvas width
     * @param height - New canvas height
     */
    onResize(_width: number, _height: number): void {
        // Default: no-op
    }
    
    /**
     * Called when a shader parameter changes
     * Override to react to parameter changes
     * @param name - Parameter name
     * @param oldValue - Previous parameter value
     * @param newValue - New parameter value
     */
    onParameterChange(_name: string, _oldValue: ParameterValue, _newValue: ParameterValue): void {
        // Default: no-op
    }
}

