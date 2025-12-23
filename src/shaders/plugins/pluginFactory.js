// Plugin Factory - Creates shader plugins based on shader name or config

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { StringsShaderPlugin } from './StringsShaderPlugin.js';
import { ArcShaderPlugin } from './ArcShaderPlugin.js';
import { RefractionShaderPlugin } from './RefractionShaderPlugin.js';
import { HeightmapShaderPlugin } from './HeightmapShaderPlugin.js';
import { ShaderError, ErrorCodes } from '../utils/ShaderErrors.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';

/**
 * Create a shader plugin for the given shader instance
 * @param {ShaderInstance} shaderInstance - The shader instance
 * @param {Object} config - Shader configuration
 * @param {Object} [options] - Factory options
 * @param {boolean} [options.throwOnUnknown=false] - If true, throw error for unknown shaders
 * @param {boolean} [options.fallbackToBase=true] - If true, fallback to BaseShaderPlugin for unknown shaders
 * @returns {BaseShaderPlugin|null} Plugin instance or null if not found and fallback disabled
 * @throws {ShaderError} If throwOnUnknown is true and shader is unknown
 */
export function createShaderPlugin(shaderInstance, config, options = {}) {
    const { throwOnUnknown = false, fallbackToBase = true } = options;
    
    // Check if config specifies a plugin class directly
    if (config.plugin) {
        if (typeof config.plugin === 'function') {
            return new config.plugin(shaderInstance, config);
        }
        // Invalid plugin type
        const error = new ShaderError(
            `Plugin must be a function/class, got ${typeof config.plugin}`,
            ErrorCodes.INVALID_CONFIG,
            { pluginType: typeof config.plugin }
        );
        if (throwOnUnknown) {
            throw error;
        }
        ShaderLogger.warn(error.message + '. Auto-detecting from shader name.');
    }
    
    // Auto-detect plugin based on shader name
    const shaderName = config.name;
    
    switch (shaderName) {
        case 'strings':
            return new StringsShaderPlugin(shaderInstance, config);
        case 'arc':
            return new ArcShaderPlugin(shaderInstance, config);
        case 'refraction':
            return new RefractionShaderPlugin(shaderInstance, config);
        case 'heightmap':
            return new HeightmapShaderPlugin(shaderInstance, config);
        default:
            if (throwOnUnknown) {
                throw new ShaderError(
                    `No plugin found for shader "${shaderName}"`,
                    ErrorCodes.INVALID_CONFIG,
                    { shaderName }
                );
            }
            if (fallbackToBase) {
                ShaderLogger.warn(`No plugin found for shader "${shaderName}", using BaseShaderPlugin`);
                return new BaseShaderPlugin(shaderInstance, config);
            }
            return null;
    }
}

