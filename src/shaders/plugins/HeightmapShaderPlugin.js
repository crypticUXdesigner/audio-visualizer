// HeightmapShaderPlugin - Plugin for heightmap shader
// Minimal plugin - heightmap shader doesn't require special handling

import { BaseShaderPlugin } from './BaseShaderPlugin.js';

export class HeightmapShaderPlugin extends BaseShaderPlugin {
    constructor(shaderInstance, config) {
        super(shaderInstance, config);
    }
    
    // Heightmap shader doesn't need any special initialization or updates
    // All functionality is handled by the base ShaderInstance class
}

