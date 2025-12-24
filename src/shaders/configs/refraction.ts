// Refraction Shader Configuration
// Based on heightmap with noise, color, and ripples, plus refraction distortion effect

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const refractionConfig: ShaderConfig = {
    name: 'refraction',
    displayName: 'Refraction',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/refraction-fragment.glsl',
    
    // Default parameters
    parameters: {
        outerGridSize: { 
            type: 'float', 
            default: 15.0, 
            min: 2.0, 
            max: 16.0, 
            step: 1.0,
            label: 'Outer Grid Size'
        },
        innerGridSize: {
            type: 'float',
            default: 3.0,
            min: 2.0,
            max: 16.0,
            step: 1.0,
            label: 'Inner Grid Size'
        },
        blurStrength: {
            type: 'float',
            default: 18.0,  // Reduced blur to allow pixelization to be visible
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Blur Strength'
        },
        offsetStrength: {
            type: 'float',
            default: 0.15,  // Large offset for clearly visible cell boundaries
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Offset Strength'
        },
        pixelizeLevels: {
            type: 'float',
            default: 4.0,  // Default to 32 levels for visible pixelization
            min: 0.0,
            max: 32.0,
            step: 1.0,
            label: 'Pixelize Levels'
        },
        cellBrightnessVariation: {
            type: 'float',
            default: 0.005,  // Default 5% variation (range: 0.975 to 1.025)
            min: 0.0,
            max: 0.2,
            step: 0.01,
            label: 'Cell Brightness Variation'
        },
        cellAnimNote1: {
            type: 'float',
            default: 4.0,  // 1/4 bar (quarter note) - 1 cycle per beat
            min: 0.0625,    // 1/16 bar minimum
            max: 4.0,       // 4 bars maximum
            step: 0.0625,   // 1/16 bar steps
            label: 'Animation Layer 1 (bar fraction)'
        },
        cellAnimNote2: {
            type: 'float',
            default: 2.0, // 1/8 bar (eighth note) - 2 cycles per beat
            min: 0.0625,
            max: 4.0,
            step: 0.0625,
            label: 'Animation Layer 2 (bar fraction)'
        },
        cellAnimNote3: {
            type: 'float',
            default: 1.0,   // 1/2 bar (half note) - 0.5 cycles per beat
            min: 0.0625,
            max: 4.0,
            step: 0.0625,
            label: 'Animation Layer 3 (bar fraction)'
        },
        distortionStrength: {
            type: 'float',
            default: 2.5,  // Multiplier for distortion strength
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Distortion Strength'
        },
        distortionSize: {
            type: 'float',
            default: 1.2,  // Size/radius of distortion (1.0 = full screen)
            min: 0.1,
            max: 2.0,
            step: 0.1,
            label: 'Distortion Size'
        },
        distortionFalloff: {
            type: 'float',
            default: 2.0,  // Easing curve (1.0 = linear, 2.0 = smooth, 4.0 = sharp)
            min: 0.5,
            max: 6.0,
            step: 0.1,
            label: 'Distortion Falloff'
        },
        distortionPerspectiveStrength: {
            type: 'float',
            default: 2.0,  // Strength of center perspective scaling (0.0 = no scaling, 1.0 = default)
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Perspective Strength'
        },
        distortionEasing: {
            type: 'float',
            default: 2.0,  // Easing type (0.0 = linear, 1.0 = smooth, 2.0 = exponential)
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Bass Easing'
        }
    },
    
    // Color configuration (reuse from heightmap)
    colorConfig: {
        baseHue: '#18191f',
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
        thresholdCurve: [0.2, 0.2, 1.0, 0.7]
    },
    
    // Uniform mapping (same as heightmap - reuse audio data)
    uniformMapping: sharedUniformMapping
};

export default refractionConfig;

