// Arc Shader Configuration
// Stereo frequency visualizer with half-circle arcs (left and right channels)

import { createNoteParameter, createMinMaxParameters } from './parameter-helpers.js';
import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const arcConfig: ShaderConfig = {
    name: 'arc',
    displayName: 'draft: Arc',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/arc-fragment.glsl',
    
    // Default parameters
    parameters: {
        measuredBands: {
            type: 'int',
            default: 64,
            min: 16,
            max: 64,
            step: 1,
            label: 'Measured Bands'
        },
        numBands: {
            type: 'int',
            default: 256,
            min: 32,
            max: 256,
            step: 1,
            label: 'Number of Visual Bands'
        },
        baseRadius: {
            type: 'float',
            default: 0.25,
            min: 0.1,
            max: 0.5,
            step: 0.01,
            label: 'Base Radius'
        },
        maxRadiusOffset: {
            type: 'float',
            default: 0.25,
            min: 0.05,
            max: 0.4,
            step: 0.01,
            label: 'Max Radius Offset'
        },
        arcAttackNote: {
            type: 'float',
            default: 1.0 / 64.0,  // 128th note - very fast attack
            min: 1.0 / 256.0,      // 256th note (very fast) = 0.00390625
            max: 1.0 / 4.0,        // Quarter note (slow) = 0.25
            step: 1.0 / 256.0,     // 256th note steps
            label: 'Arc Attack (1/256 = very fast, 1/4 = slow)'
        },
        arcReleaseNote: {
            type: 'float',
            default: 1.0 / 4.0,   // 16th note - moderate release
            min: 1.0 / 128.0,      // 128th note (very fast) = 0.0078125
            max: 1.0 / 2.0,        // Half note (slow) = 0.5
            step: 1.0 / 256.0,     // 256th note steps
            label: 'Arc Release (1/128 = fast, 1/2 = slow)'
        },
        centerX: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Center X Position'
        },
        centerY: {
            type: 'float',
            default: 0.55,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Center Y Position'
        },
        colorTransitionWidth: {
            type: 'float',
            default: 0.003,
            min: 0.0,
            max: 0.1,
            step: 0.001,
            label: 'Color Transition Width (smoothstep blend between colors)'
        },
        colorSmoothing: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Color Smoothing (blend colors from adjacent frequency bands)'
        },
        colorSmoothingRadius: {
            type: 'float',
            default: 3.0,
            min: 0.5,
            max: 5.0,
            step: 0.5,
            label: 'Color Smoothing Radius (number of bands to sample for smoothing)'
        },
        cornerRoundSize: {
            type: 'float',
            default: 0.25,
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: 'Corner Round Size (smoothing at bottom center where arcs meet)'
        },
        maskRadius: {
            type: 'float',
            default: 0.04,
            min: 0.0,
            max: 0.4,
            step: 0.01,
            label: 'Mask Radius (base center cutout, 0 = no mask)'
        },
        maxMaskRadius: {
            type: 'float',
            default: 0.12,
            min: 0.0,
            max: 0.4,
            step: 0.01,
            label: 'Max Mask Radius (maximum expansion on bass hits)'
        },
        maskAttackNote: {
            type: 'float',
            default: 1.0 / 64.0,   // 64th note - fast attack
            min: 1.0 / 256.0,      // 256th note (very fast) = 0.00390625
            max: 1.0 / 4.0,        // Quarter note (slow) = 0.25
            step: 1.0 / 256.0,     // 256th note steps
            label: 'Mask Attack (1/256 = very fast, 1/4 = slow)'
        },
        maskReleaseNote: {
            type: 'float',
            default: 1.0 / 8.0,   // 8th note - moderate release
            min: 1.0 / 128.0,      // 128th note (very fast) = 0.0078125
            max: 1.0 / 2.0,        // Half note (slow) = 0.5
            step: 1.0 / 256.0,     // 256th note steps
            label: 'Mask Release (1/128 = fast, 1/2 = slow)'
        },
        maskBorderWidth: {
            type: 'float',
            default: 0.001,
            min: 0.0,
            max: 0.02,
            step: 0.001,
            label: 'Mask Border Width (thickness of border around mask)'
        },
        maskBorderNoiseSpeed: {
            type: 'float',
            default: 0.5 ,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Mask Border Noise Speed (animation speed multiplier)'
        },
        maskBorderInnerFeathering: {
            type: 'float',
            default: 0.03,
            min: 0.0,
            max: 0.01,
            step: 0.0005,
            label: 'Mask Border Inner Feathering (soft edge on inner side)'
        },
        maskBorderOuterFeathering: {
            type: 'float',
            default: 0.1,
            min: 0.0,
            max: 0.01,
            step: 0.0005,
            label: 'Mask Border Outer Feathering (soft edge on outer side)'
        },
        maskBorderNoiseMultiplier: {
            type: 'float',
            default: 1.1,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Mask Border Noise Multiplier (intensity before color mapping)'
        },
        contrast: {
            type: 'float',
            default: 1.0,
            min: 0.5,
            max: 2.5,
            step: 0.1,
            label: 'Contrast Base (1.0 = normal, >1.0 = more contrast)'
        },
        contrastAudioReactive: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Contrast Audio Reactivity (0 = off, 1 = full)'
        },
        contrastAudioSource: {
            type: 'int',
            default: 1,
            min: 0,
            max: 3,
            step: 1,
            label: 'Contrast Audio Source (0=Volume, 1=Bass, 2=Mid, 3=Treble)'
        },
        ...createMinMaxParameters('contrast', 1.0, 1.25, 0.5, 2.5, 0.1, 'Contrast'),
        contrastAudioAttackNote: createNoteParameter('contrastAudioAttackNote', 1.0 / 32.0, 'Contrast Audio Attack (1/256 = very fast, 1/4 = slow)'),
        contrastAudioReleaseNote: createNoteParameter('contrastAudioReleaseNote', 1.0 / 2.0, 'Contrast Audio Release (1/128 = fast, 1/2 = slow)')
    },
    
    // Color configuration
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
    
    // Uniform mapping (how audio data maps to shader uniforms)
    uniformMapping: sharedUniformMapping
};

export default arcConfig;

