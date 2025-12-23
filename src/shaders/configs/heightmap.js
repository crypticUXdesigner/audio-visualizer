// Heightmap Shader Configuration
// Configuration for the fBm noise pattern heightmap shader

import { sharedUniformMapping } from './shared-uniform-mapping.js';

export default {
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
    
    // Color configuration (can be overridden)
    colorConfig: {
        baseHue: '#18191f', // Gray-40 for seamless transition from background
        darkest: {
            lightness: 0.09,
            chroma: 0.08,
            hueOffset: -60
        },
        brightest: {
            lightness: 0.97,
            chroma: 0.2,
            hueOffset: 60
        },
        interpolationCurve: {
            lightness: [0.3, 0.0, 1.0, 0.7],
            chroma: [0.0, 0.25, 1.0, 0.75],
            hue: [0.0, 0.25, 1.0, 0.75]
        },
        // Threshold distribution curve - controls how feed space is allocated to colors
        thresholdCurve: [0.2, 0.2, 1.0, 0.7]
    },
    
    // Uniform mapping (how audio data maps to shader uniforms)
    uniformMapping: sharedUniformMapping,
    
    // Custom initialization hook (optional)
    onInit: (shaderInstance) => {
        // Can add custom initialization logic here if needed
    },
    
    // Custom render hook (optional)
    onRender: (shaderInstance, audioData) => {
        // Can add custom render logic here if needed
    }
};

