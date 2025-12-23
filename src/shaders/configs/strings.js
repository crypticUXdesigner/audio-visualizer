// Strings Shader Configuration
// Guitar string visualizer with standing wave animation and frequency level bars

import { createNoteParameter, createCurveParameters, createMinMaxParameters, createToggleParameter } from './parameter-helpers.js';

export default {
    name: 'strings',
    displayName: 'draft: Strings',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/strings-fragment.glsl',
    
    // Default parameters
    // Organized by functional groups with clear section comments
    // Note: Structure is flat for UI compatibility, but logically grouped
    parameters: {
        // ============================================
        // CORE VISUALIZATION SETTINGS
        // ============================================
        measuredBands: {
            type: 'int',
            default: 24,
            min: 16,
            max: 64,
            step: 1,
            label: 'Measured Bands'
        },
        numBands: {
            type: 'int',
            default: 24,
            min: 8,
            max: 256,
            step: 1,
            label: 'Number of Visual Bands'
        },
        minStringWidth: {
            type: 'float',
            default: 1.0,
            min: 0.5,
            max: 5.0,
            step: 0.5,
            label: 'Min String Width (pixels)'
        },
        maxStringWidth: {
            type: 'float',
            default: 3.0,
            min: 1.0,
            max: 15.0,
            step: 0.5,
            label: 'Max String Width (pixels)'
        },
        maxStrings: {
            type: 'int',
            default: 3,
            min: 1,
            max: 3,
            step: 1,
            label: 'Max Strings Per Band'
        },
        threshold2Strings: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Threshold for 2 Strings (0.0-1.0)'
        },
        threshold3Strings: {
            type: 'float',
            default: 0.7,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Threshold for 3 Strings (0.0-1.0)'
        },
        maxAmplitude: {
            type: 'float',
            default: 0.05,
            min: 0.01,
            max: 0.2,
            step: 0.01,
            label: 'Max Swing Amplitude'
        },
        waveNote: createNoteParameter('waveNote', 1.0 / 16.0, 'Swing Note (1/128 = fast, 1/1 = slow)'),
        stringTop: {
            type: 'float',
            default: 1.0,
            min: 0.5,
            max: 1.0,
            step: 0.05,
            label: 'String Top Position'
        },
        stringBottom: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 0.5,
            step: 0.05,
            label: 'String Bottom Position'
        },
        paddingLeft: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: 'Left Padding'
        },
        paddingRight: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: 'Right Padding'
        },
        // ============================================
        // ANIMATION TIMING (Musical Note Durations)
        // ============================================
        stringSwingAttackNote: createNoteParameter('stringSwingAttackNote', 1.0 / 32.0, 'String Swing Attack (1/256 = very fast, 1/4 = slow)'),
        stringSwingReleaseNote: createNoteParameter('stringSwingReleaseNote', 1.0 / 32.0, 'String Swing Release (1/128 = fast, 1/2 = slow)'),
        stringHeightAttackNote: createNoteParameter('stringHeightAttackNote', 1.0 / 128.0, 'String Height Attack (1/256 = very fast, 1/4 = slow)'),
        stringHeightReleaseNote: createNoteParameter('stringHeightReleaseNote', 1.0 / 4.0, 'String Height Release (1/128 = fast, 1/2 = slow)'),
        noiseAudioAttackNote: createNoteParameter('noiseAudioAttackNote', 1.0 / 128.0, 'Noise Audio Attack (1/256 = very fast, 1/4 = slow)'),
        noiseAudioReleaseNote: createNoteParameter('noiseAudioReleaseNote', 1.0 / 2.0, 'Noise Audio Release (1/128 = fast, 1/2 = slow)'),
        stringEndFadeMinAlpha: {
            type: 'float',
            default: 0.035,  // 10% minimum alpha
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'String End Fade Min Alpha (0.0 = fully fade, 1.0 = no fade)'
        },
        maxHeight: {
            type: 'float',
            default: 1.0,
            min: 0.1,
            max: 1.0,
            step: 0.05,
            label: 'Max Height Scale'
        },
        waveCycles: {
            type: 'float',
            default: 1.0,
            min: 1.0,
            max: 10.0,
            step: 0.5,
            label: 'Wave Cycles (number of peaks along string)'
        },
        ...createToggleParameter('showBars', true, 'Show Frequency Bars'),
        ...createToggleParameter('showStrings', true, 'Show Strings'),
        waveAmplitude: {
            type: 'float',
            default: 0.1,
            min: 0.1,
            max: 5.0,
            step: 0.1,
            label: 'Wave Amplitude Multiplier'
        },
        bandMinHeight: {
            type: 'float',
            default: 0.07,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Band Min Height (0.0-1.0)'
        },
        bandMaxHeight: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Band Max Height (0.0-1.0)'
        },
        // ============================================
        // CURVE PARAMETERS (Cubic Bezier Easing)
        // ============================================
        ...createCurveParameters('bandHeightCurve', 0.75, 0.0, 0.8, 1.0, 'Band Height Curve'),
        stringHeightMultiplier: {
            type: 'float',
            default: 1.5,
            min: 1.0,
            max: 2.0,
            step: 0.05,
            label: 'String Height Multiplier (relative to bars)'
        },
        backgroundNoiseScale: {
            type: 'float',
            default: 1.9,
            min: 0.1,
            max: 5.0,
            step: 0.1,
            label: 'Background Noise Scale'
        },
        backgroundNoiseTimeSpeed: {
            type: 'float',
            default: 0.1,
            min: 0.01,
            max: 1.0,
            step: 0.01,
            label: 'Background Noise Time Speed'
        },
        backgroundNoiseTimeOffset: {
            type: 'float',
            default: 105.0,
            min: 0.0,
            max: 1000.0,
            step: 1.0,
            label: 'Background Noise Time Offset'
        },
        backgroundNoiseIntensity: {
            type: 'float',
            default: 0.15,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Background Noise Intensity'
        },
        backgroundNoiseAudioReactive: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Background Noise Audio Reactivity (0 = off, 1 = full)'
        },
        backgroundNoiseAudioSource: {
            type: 'int',
            default: 1,
            min: 0,
            max: 3,
            step: 1,
            label: 'Audio Source (0=Volume, 1=Bass, 2=Mid, 3=Treble)'
        },
        ...createCurveParameters('backgroundNoiseBrightnessCurve', 0.4, 1.0, 0.7, 0.6, 'Noise Brightness Curve'),
        backgroundNoiseBrightnessMin: {
            type: 'float',
            default: 0.65,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Noise Brightness Min (at quiet audio)'
        },
        backgroundNoiseBrightnessMax: {
            type: 'float',
            default: 0.95,
            min: 0.0,
            max: 2.0,
            step: 0.05,
            label: 'Noise Brightness Max (at loud audio)'
        },
        colorTransitionWidth: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 0.1,
            step: 0.001,
            label: 'Color Transition Width (smoothstep blend between colors)'
        },
        // ============================================
        // MIN/MAX PARAMETER PAIRS
        // ============================================
        ...createMinMaxParameters('barAlpha', 0.0, 0.85, 0.0, 1.0, 0.01, 'Bar Alpha'),
        maskNoiseStrength: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 0.1,
            step: 0.005,
            label: 'Mask Noise Strength (0 = off, adds animated noise to mask edges)'
        },
        maskNoiseScale: {
            type: 'float',
            default: 0.0,
            min: 1.0,
            max: 20.0,
            step: 0.5,
            label: 'Mask Noise Scale (frequency of noise pattern)'
        },
        maskNoiseSpeed: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Mask Noise Speed (animation speed)'
        },
        maskCutoutIntensity: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Mask Cutout Intensity (1.0 = full cutout, 0.0 = no effect)'
        },
        maskExpansion: {
            type: 'float',
            default: 0.18,
            min: 0.0,
            max: 0.2,
            step: 0.01,
            label: 'Mask Expansion (normalized - how much larger than visualization)'
        },
        maskFeathering: {
            type: 'float',
            default: 0.12,
            min: 0.0,
            max: 0.1,
            step: 0.001,
            label: 'Mask Feathering (edge softness)'
        },
        ...createCurveParameters('maskAlphaCurve', 0.0, 1.0, 0.0, 1.0, 'Mask Alpha Curve (volume to alpha interpolation)'),
        bandWidthThreshold: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Band Width Threshold (volume below this has minimal width change)'
        },
        bandWidthMinMultiplier: {
            type: 'float',
            default: 0.9,
            min: 0.5,
            max: 1.0,
            step: 0.05,
            label: 'Band Width Min Multiplier (at low volume, below threshold)'
        },
        bandWidthMaxMultiplier: {
            type: 'float',
            default: 1.35,
            min: 1.0,
            max: 3.0,
            step: 0.1,
            label: 'Band Width Max Multiplier (at high volume, above threshold)'
        },
        // ============================================
        // POST-PROCESSING EFFECTS
        // ============================================
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
        ...createMinMaxParameters('contrast', 1.0, 1.35, 0.5, 2.5, 0.1, 'Contrast'),
        contrastAudioAttackNote: createNoteParameter('contrastAudioAttackNote', 1.0 / 128.0, 'Contrast Audio Attack (1/256 = very fast, 1/4 = slow)'),
        contrastAudioReleaseNote: createNoteParameter('contrastAudioReleaseNote', 1.0 / 4.0, 'Contrast Audio Release (1/128 = fast, 1/2 = slow)'),
        glowIntensity: {
            type: 'float',
            default: 5.0,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Glow Intensity (0 = off, higher = more glow)'
        },
        glowRadius: {
            type: 'float',
            default: 5.0,
            min: 0.5,
            max: 10.0,
            step: 0.5,
            label: 'Glow Radius (pixels)'
        },
        // ============================================
        // GLITCH EFFECT PARAMETERS
        // ============================================
        glitchColumnCount: {
            type: 'float',
            default: 2.0,
            min: 2.0,
            max: 64.0,
            step: 1.0,
            label: 'Glitch Column Count'
        },
        glitchRandomSeed: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1000.0,
            step: 1.0,
            label: 'Glitch Random Seed (change to re-randomize order/flips)'
        },
        glitchFlipProbability: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Glitch Flip Probability (0 = no flips, 1 = all flip)'
        },
        glitchIntensity: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Glitch Intensity (0 = off)'
        },
        glitchBlurAmount: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Glitch Blur Amount'
        },
        glitchPixelSize: {
            type: 'float',
            default: 24.0,
            min: 0.0,
            max: 50.0,
            step: 1.0,
            label: 'Glitch Pixel Size (0 = off)'
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
    uniformMapping: {
        // Standard audio uniforms
        uBass: (data) => data?.bass || 0,
        uMid: (data) => data?.mid || 0,
        uTreble: (data) => data?.treble || 0,
        uVolume: (data) => data?.volume || 0,
        
        // Frequency band uniforms
        uFreq1: (data) => data?.smoothedFreq1 || 0,
        uFreq2: (data) => data?.smoothedFreq2 || 0,
        uFreq3: (data) => data?.smoothedFreq3 || 0,
        uFreq4: (data) => data?.smoothedFreq4 || 0,
        uFreq5: (data) => data?.smoothedFreq5 || 0,
        uFreq6: (data) => data?.smoothedFreq6 || 0,
        uFreq7: (data) => data?.smoothedFreq7 || 0,
        uFreq8: (data) => data?.smoothedFreq8 || 0,
        uFreq9: (data) => data?.smoothedFreq9 || 0,
        uFreq10: (data) => data?.smoothedFreq10 || 0,
        
        // Stereo uniforms
        uBassStereo: (data) => data?.bassStereo || 0,
        uMidStereo: (data) => data?.midStereo || 0,
        uTrebleStereo: (data) => data?.trebleStereo || 0,
        
        // Temporal and beat uniforms
        uSmoothedBass: (data) => data?.smoothedBass || 0,
        uSmoothedMid: (data) => data?.smoothedMid || 0,
        uSmoothedTreble: (data) => data?.smoothedTreble || 0,
        uPeakBass: (data) => data?.peakBass || 0,
        uBeatTime: (data) => data?.beatTime || 0,
        uBeatIntensity: (data) => data?.beatIntensity || 0,
        uBPM: (data) => data?.estimatedBPM || 0,
        
        // Multi-frequency beat uniforms
        uBeatTimeBass: (data) => data?.beatTimeBass || 0,
        uBeatTimeMid: (data) => data?.beatTimeMid || 0,
        uBeatTimeTreble: (data) => data?.beatTimeTreble || 0,
        uBeatIntensityBass: (data) => data?.beatIntensityBass || 0,
        uBeatIntensityMid: (data) => data?.beatIntensityMid || 0,
        uBeatIntensityTreble: (data) => data?.beatIntensityTreble || 0,
        uBeatStereoBass: (data) => data?.beatStereoBass || 0,
        uBeatStereoMid: (data) => data?.beatStereoMid || 0,
        uBeatStereoTreble: (data) => data?.beatStereoTreble || 0
    }
};

