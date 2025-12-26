// Arc Shader Configuration
// Stereo frequency visualizer with half-circle arcs (left and right channels)

import { createNoteParameter, createMinMaxParameters } from './parameter-helpers.js';
import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const arcConfig: ShaderConfig = {
    name: 'arc',
    displayName: 'Arc',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/arc-fragment.glsl',
    
    // Default parameters
    parameters: {
        measuredBands: {
            type: 'int',
            default: 32,
            min: 16,
            max: 64,
            step: 1,
            label: 'Measured Bands'
        },
        numBands: {
            type: 'int',
            default: 128,
            min: 32,
            max: 256,
            step: 1,
            label: 'Number of Visual Bands'
        },
        excludeTopBands: {
            type: 'int',
            default: 0,
            min: 0,
            max: 200,
            step: 1,
            label: 'Exclude Top Bands (removes highest 0-200 frequency bands from visualization)'
        },
        topArcMargin: {
            type: 'float',
            default: 0.000001,
            min: 0.0,
            max: 0.3,
            step: 0.01,
            label: 'Top Arc Margin (fraction of arc height to leave empty at top, 0 = no margin)'
        },
        baseRadius: {
            type: 'float',
            default: 0.2,
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
            default: 1.2,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Mask Border Noise Multiplier (intensity before color mapping)'
        },
        arcBorderWidth: {
            type: 'float',
            default: 0.001,
            min: 0.0,
            max: 0.02,
            step: 0.001,
            label: 'Arc Border Width (thickness of border around arc outline)'
        },
        arcBorderNoiseSpeed: {
            type: 'float',
            default: 0.35,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Arc Border Noise Speed (animation speed multiplier)'
        },
        arcBorderInnerFeathering: {
            type: 'float',
            default: 0.03,
            min: 0.0,
            max: 0.01,
            step: 0.001,
            label: 'Arc Border Inner Feathering (soft edge on inner side)'
        },
        arcBorderOuterFeathering: {
            type: 'float',
            default: 0.03,
            min: 0.0,
            max: 0.01,
            step: 0.001,
            label: 'Arc Border Outer Feathering (soft edge on outer side)'
        },
        arcBorderNoiseMultiplier: {
            type: 'float',
            default: 1.2,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Arc Border Noise Multiplier (intensity before color mapping)'
        },
        borderNoiseBlur: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Border Noise Blur (0 = no blur, 1 = full blur)'
        },
        distortionStrength: {
            type: 'float',
            default: 1.2,
            min: 0.0,
            max: 5.0,
            step: 0.1,
            label: 'Distortion Strength (0 = off, 1 = default, >1 = stronger)'
        },
        distortionSize: {
            type: 'float',
            default: 0.6,
            min: 0.1,
            max: 3.0,
            step: 0.1,
            label: 'Distortion Size (0.1 = small, 1.0 = full screen, >1 = extends beyond)'
        },
        distortionFalloff: {
            type: 'float',
            default: 2.0,
            min: 0.5,
            max: 6.0,
            step: 0.1,
            label: 'Distortion Falloff (1.0 = linear, 2.0 = smooth, 4.0 = sharp)'
        },
        distortionPerspectiveStrength: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Distortion Perspective Strength (0 = no scaling, 1 = default, >1 = stronger)'
        },
        distortionEasing: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Distortion Easing (0 = linear, 1 = smooth, 2 = exponential)'
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
        contrastAudioReleaseNote: createNoteParameter('contrastAudioReleaseNote', 1.0 / 2.0, 'Contrast Audio Release (1/128 = fast, 1/2 = slow)'),
        contrastMaskEnabled: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Contrast Mask Enabled (0 = off, 1 = on)'
        },
        contrastMaskStartDistance: {
            type: 'float',
            default: 0.05,
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: 'Contrast Mask Start Distance (distance from arc to start contrast fade)'
        },
        contrastMaskFeathering: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: 'Contrast Mask Feathering (smoothness of contrast transition)'
        },
        ditherMinThreshold: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Dither Min Threshold (brightness level to start dithering)'
        },
        ditherMinStrength: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Dither Min Strength (strength at threshold)'
        },
        ditherMaxStrength: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Dither Max Strength (strength at full brightness)'
        },
        ditherSize: {
            type: 'float',
            default: 24.0,
            min: 1.0,
            max: 200.0,
            step: 1.0,
            label: 'Dither Size (pattern scale, higher = finer pattern)'
        },
        backgroundEnabled: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Enabled (0 = off, 1 = on)'
        },
        backgroundIntensity: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Intensity (base opacity)'
        },
        backgroundBassThreshold: {
            type: 'float',
            default: 0.35,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Bass Threshold (bass level to start showing background)'
        },
        backgroundBassSensitivity: {
            type: 'float',
            default: 5.0,
            min: 0.5,
            max: 5.0,
            step: 0.1,
            label: 'Background Bass Sensitivity (how reactive to bass, higher = more sensitive)'
        },
        backgroundNoiseScale: {
            type: 'float',
            default: 1.35,
            min: 0.1,
            max: 3.0,
            step: 0.1,
            label: 'Background Noise Scale (larger = finer detail)'
        },
        backgroundNoiseSpeed: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Noise Speed (animation speed multiplier)'
        },
        backgroundDistortionStrength: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Distortion Strength (UV warping based on bass)'
        },
        backgroundFrequencyReactivity: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Frequency Reactivity (how much frequency texture affects background)'
        },
        backgroundStereoPan: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Stereo Pan (how much stereo affects background position)'
        },
        backgroundBlur: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Blur (smoothness of color transitions, 0 = sharp, 1 = very smooth)'
        },
        backgroundDitherEnabled: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Dither Enabled (0 = off, 1 = on)'
        },
        backgroundDitherMinThreshold: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Dither Min Threshold (brightness level to start dithering)'
        },
        backgroundDitherMinStrength: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Dither Min Strength (strength at threshold)'
        },
        backgroundDitherMaxStrength: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Dither Max Strength (strength at full brightness)'
        },
        backgroundDitherSize: {
            type: 'float',
            default: 50,
            min: 1.0,
            max: 200.0,
            step: 1.0,
            label: 'Background Dither Size (pattern scale, higher = finer pattern)'
        },
        backgroundDitherBassReactivity: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Dither Bass Reactivity (how much bass affects dither strength, 0 = off, 1 = full)'
        },
        backgroundFadeEnabled: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Background Fade Enabled (0 = off, 1 = on)'
        },
        backgroundFadeStartDistance: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: 'Background Fade Start Distance (distance from max arc radius to start fading)'
        },
        backgroundFadeFeathering: {
            type: 'float',
            default: 0.15,
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: 'Background Fade Feathering (distance over which fade occurs)'
        },
        centerSphereEnabled: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Center Sphere Enabled (0 = off, 1 = on)'
        },
        centerSphereBaseRadius: {
            type: 'float',
            default: 0.035,
            min: 0.0,
            max: 0.1,
            step: 0.001,
            label: 'Center Sphere Base Radius (minimum size)'
        },
        centerSphereMaxRadius: {
            type: 'float',
            default: 0.13,
            min: 0.05,
            max: 0.3,
            step: 0.01,
            label: 'Center Sphere Max Radius (maximum expansion)'
        },
        centerSphereSizeThreshold: {
            type: 'float',
            default: 0.2,
            min: 0.0,
            max: 0.8,
            step: 0.01,
            label: 'Center Sphere Size Threshold (volume level to start appearing)'
        },
        centerSphereBassWeight: {
            type: 'float',
            default: 0.05,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Bass Weight (0 = volume, 1 = bass)'
        },
        centerSphereCoreSize: {
            type: 'float',
            default: 0.9,
            min: 0.3,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Core Size (core radius as fraction of sphere)'
        },
        centerSphereGlowSize: {
            type: 'float',
            default: 1.0,
            min: 1.0,
            max: 3.0,
            step: 0.1,
            label: 'Center Sphere Glow Size (glow radius as multiple of sphere)'
        },
        centerSphereGlowIntensity: {
            type: 'float',
            default: 0.35,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Glow Intensity'
        },
        centerSphereGlowFalloff: {
            type: 'float',
            default: 1.0,
            min: 1.0,
            max: 8.0,
            step: 0.5,
            label: 'Center Sphere Glow Falloff (higher = sharper edge)'
        },
        centerSphereBaseBrightness: {
            type: 'float',
            default: 0.15,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Base Brightness'
        },
        centerSphereBrightnessRange: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Brightness Range (additional brightness from audio)'
        },
        centerSphereNoiseEnabled: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Center Sphere Noise Enabled (adds subtle animation)'
        },
        centerSphereNoiseScale: {
            type: 'float',
            default: 8.0,
            min: 1.0,
            max: 20.0,
            step: 0.5,
            label: 'Center Sphere Noise Scale'
        },
        centerSphereNoiseSpeed: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Center Sphere Noise Speed'
        },
        centerSphereNoiseAmount: {
            type: 'float',
            default: 0.85,
            min: 0.0,
            max: 0.5,
            step: 0.05,
            label: 'Center Sphere Noise Amount (variation intensity)'
        },
        centerSphere3DEnabled: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Center Sphere 3D Shading Enabled'
        },
        centerSphere3DStrength: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere 3D Shading Strength'
        },
        centerSphereBrightnessAttackNote: createNoteParameter(
            'centerSphereBrightnessAttackNote', 
            1.0 / 4.0,
            'Center Sphere Brightness Attack (1/256 = very fast, 1/4 = slow)'
        ),
        centerSphereBrightnessReleaseNote: createNoteParameter(
            'centerSphereBrightnessReleaseNote', 
            1.0 / 1.0,
            'Center Sphere Brightness Release (1/128 = fast, 1/2 = slow)'
        ),
        centerSphereSizeVolumeAttackNote: createNoteParameter(
            'centerSphereSizeVolumeAttackNote', 
            1.0 / 4.0,
            'Center Sphere Size Volume Attack (1/256 = very fast, 1/4 = slow)'
        ),
        centerSphereSizeVolumeReleaseNote: createNoteParameter(
            'centerSphereSizeVolumeReleaseNote', 
            1.0 / 2.0,
            'Center Sphere Size Volume Release (1/128 = fast, 1/2 = slow)'
        ),
        centerSphereSizeBassAttackNote: createNoteParameter(
            'centerSphereSizeBassAttackNote', 
            1.0 / 32.0,
            'Center Sphere Size Bass Attack (1/256 = very fast, 1/4 = slow)'
        ),
        centerSphereSizeBassReleaseNote: createNoteParameter(
            'centerSphereSizeBassReleaseNote', 
            1.0 / 16.0,
            'Center Sphere Size Bass Release (1/128 = fast, 1/2 = slow)'
        ),
        centerSphereBassSizeMultiplier: {
            type: 'float',
            default: 0.1,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Bass Size Multiplier (how much bass adds to size, 0 = off)'
        },
        centerSphereBrightnessMidThreshold: {
            type: 'float',
            default: 0.15,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Brightness Mid Threshold (mid level for "fairly bright" stage)'
        },
        centerSphereBrightnessFullThreshold: {
            type: 'float',
            default: 0.9,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Brightness Full Threshold (mid level for full brightness)'
        },
        centerSphereBrightnessCompression: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Center Sphere Brightness Compression (0 = no compression, 1 = max compression - less reactive to big changes, more nuanced to small changes)'
        },
        centerSphereBrightnessMultiplier: {
            type: 'float',
            default: 1.5,
            min: 0.5,
            max: 3.0,
            step: 0.1,
            label: 'Center Sphere Brightness Multiplier (1.0 = normal, >1.0 = brighter than palette, max 3.0)'
        },
        centerSphereBrightnessMultiplierRange: {
            type: 'float',
            default: 2.0,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Center Sphere Brightness Multiplier Range (additional multiplier from audio, 0 = off)'
        },
        centerSphereHueShift: {
            type: 'float',
            default: 30.0,
            min: -180.0,
            max: 180.0,
            step: 1.0,
            label: 'Center Sphere Hue Shift Base (degrees, -180 to 180)'
        },
        centerSphereHueShiftRange: {
            type: 'float',
            default: 60.0,
            min: 0.0,
            max: 180.0,
            step: 5.0,
            label: 'Center Sphere Hue Shift Range (additional shift from audio in degrees, 0 = off)'
        }
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

