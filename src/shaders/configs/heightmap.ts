// Heightmap Shader Configuration
// Configuration for the fBm noise pattern heightmap shader

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const heightmapConfig: ShaderConfig = {
    name: 'heightmap',
    displayName: 'Heightmap',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/heightmap-fragment.glsl',
    
    // Default parameters (experiment with these)
    parameters: {
        pixelSize: { 
            type: 'float', 
            default: 0.5, 
            min: 0.5, 
            max: 5, 
            step: 0.5,
            label: 'Pixel Size'
        },
        ditherStrength: {
            type: 'float',
            default: 3.0,
            min: 0,
            max: 5,
            step: 0.1,
            label: 'Dither Strength'
        },
        transitionWidth: {
            type: 'float',
            default: 0.003,
            min: 0.005,
            max: 0.1,
            step: 0.005,
            label: 'Transition Smoothness'
        }
    },
    
    // Uniform mapping (how audio data maps to shader uniforms)
    uniformMapping: sharedUniformMapping
};

export default heightmapConfig;

