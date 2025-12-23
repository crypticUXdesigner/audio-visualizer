// Plugin Factory - Creates shader plugins based on shader name or config

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { StringsShaderPlugin } from './StringsShaderPlugin.js';
import { ArcShaderPlugin } from './ArcShaderPlugin.js';
import { RefractionShaderPlugin } from './RefractionShaderPlugin.js';
import { HeightmapShaderPlugin } from './HeightmapShaderPlugin.js';

/**
 * Create a shader plugin for the given shader instance
 * @param {ShaderInstance} shaderInstance - The shader instance
 * @param {Object} config - Shader configuration
 * @returns {BaseShaderPlugin} Plugin instance
 */
export function createShaderPlugin(shaderInstance, config) {
    // Check if config specifies a plugin class directly
    if (config.plugin) {
        if (typeof config.plugin === 'function') {
            return new config.plugin(shaderInstance, config);
        }
        // If it's a string, try to resolve it
        console.warn(`Plugin specified as string "${config.plugin}" - not yet supported`);
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
            // Default to base plugin for unknown shaders
            console.warn(`No plugin found for shader "${shaderName}", using BaseShaderPlugin`);
            return new BaseShaderPlugin(shaderInstance, config);
    }
}

