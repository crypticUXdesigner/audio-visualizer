// Strings Shader Configuration
// Guitar string visualizer with standing wave animation and frequency level bars

export default {
    name: 'strings',
    displayName: 'draft: Strings',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/strings-fragment.glsl',
    
    // Default parameters
    parameters: {
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
            min: 32,
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
        waveNote: {
            type: 'float',
            default: 1.0 / 16.0,   // Quarter note - moderate swing
            min: 1.0 / 128.0,      // 128th note (fastest) = 0.0078125
            max: 1.0 / 1.0,        // Whole note (slowest) = 1.0
            step: 1.0 / 128.0,     // 128th note steps
            label: 'Swing Note (1/128 = fast, 1/1 = slow)'
        },
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
        stringSwingAttackNote: {
            type: 'float',
            default: 1.0 / 32.0,  // 64th note
            min: 1.0 / 256.0,     // 256th note (very fast)
            max: 1.0 / 4.0,       // Quarter note (slow)
            step: 1.0 / 256.0,
            label: 'String Swing Attack (1/256 = very fast, 1/4 = slow)'
        },
        stringSwingReleaseNote: {
            type: 'float',
            default: 1.0 / 32.0,   // 8th note
            min: 1.0 / 128.0,      // 128th note (very fast)
            max: 1.0 / 2.0,        // Half note (slow)
            step: 1.0 / 256.0,
            label: 'String Swing Release (1/128 = fast, 1/2 = slow)'
        },
        stringHeightAttackNote: {
            type: 'float',
            default: 1.0 / 128.0,  // 64th note
            min: 1.0 / 256.0,     // 256th note (very fast)
            max: 1.0 / 4.0,       // Quarter note (slow)
            step: 1.0 / 256.0,
            label: 'String Height Attack (1/256 = very fast, 1/4 = slow)'
        },
        stringHeightReleaseNote: {
            type: 'float',
            default: 1.0 / 4.0,   // 16th note
            min: 1.0 / 128.0,      // 128th note (very fast)
            max: 1.0 / 2.0,        // Half note (slow)
            step: 1.0 / 256.0,
            label: 'String Height Release (1/128 = fast, 1/2 = slow)'
        },
        noiseAudioAttackNote: {
            type: 'float',
            default: 1.0 / 128.0,  // 128th note
            min: 1.0 / 256.0,      // 256th note (very fast)
            max: 1.0 / 4.0,       // Quarter note (slow)
            step: 1.0 / 256.0,
            label: 'Noise Audio Attack (1/256 = very fast, 1/4 = slow)'
        },
        noiseAudioReleaseNote: {
            type: 'float',
            default: 1.0 / 1.0,   // 16th note
            min: 1.0 / 128.0,      // 128th note (very fast)
            max: 1.0 / 2.0,        // Half note (slow)
            step: 1.0 / 256.0,
            label: 'Noise Audio Release (1/128 = fast, 1/2 = slow)'
        },
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
        showBars: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Show Frequency Bars (0 = off, 1 = on)'
        },
        showStrings: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Show Strings (0 = off, 1 = on)'
        },
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
        bandHeightCurveX1: {
            type: 'float',
            default: 0.75,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Band Height Curve X1'
        },
        bandHeightCurveY1: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Band Height Curve Y1'
        },
        bandHeightCurveX2: {
            type: 'float',
            default: 0.8,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Band Height Curve X2'
        },
        bandHeightCurveY2: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Band Height Curve Y2'
        },
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
        backgroundNoiseIntensity: {
            type: 'float',
            default: 0.05,
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
        backgroundNoiseBrightnessCurveX1: {
            type: 'float',
            default: 0.4,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Noise Brightness Curve X1'
        },
        backgroundNoiseBrightnessCurveY1: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Noise Brightness Curve Y1'
        },
        backgroundNoiseBrightnessCurveX2: {
            type: 'float',
            default: 0.7,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Noise Brightness Curve X2'
        },
        backgroundNoiseBrightnessCurveY2: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Noise Brightness Curve Y2'
        },
        backgroundNoiseBrightnessMin: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Noise Brightness Min (at quiet audio)'
        },
        backgroundNoiseBrightnessMax: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 2.0,
            step: 0.05,
            label: 'Noise Brightness Max (at loud audio)'
        },
        backgroundNoiseBlurStrength: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Background Noise Blur Strength (0 = off, higher = more blur)'
        },
        backgroundNoisePixelizeLevels: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 32.0,
            step: 1.0,
            label: 'Background Noise Pixelize Levels (0 = off, >0 = quantization steps)'
        },
        ditherStrength: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 10.0,
            step: 0.5,
            label: 'Background Dither Strength (0 = off, higher = more dithering)'
        },
        colorTransitionWidth: {
            type: 'float',
            default: 0.003,
            min: 0.0,
            max: 0.1,
            step: 0.001,
            label: 'Color Transition Width (smoothstep blend between colors)'
        },
        barAlphaMin: {
            type: 'float',
            default: 0.1,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Bar Alpha Min (at low volume)'
        },
        barAlphaMax: {
            type: 'float',
            default: 0.8,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Bar Alpha Max (at high volume)'
        },
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
            default: 75.0,
            min: 1.0,
            max: 20.0,
            step: 0.5,
            label: 'Mask Noise Scale (frequency of noise pattern)'
        },
        maskNoiseSpeed: {
            type: 'float',
            default: 1.5,
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
            default: 0.24,
            min: 0.0,
            max: 0.2,
            step: 0.01,
            label: 'Mask Expansion (normalized - how much larger than visualization)'
        },
        maskFeathering: {
            type: 'float',
            default: 0.24,
            min: 0.0,
            max: 0.1,
            step: 0.001,
            label: 'Mask Feathering (edge softness)'
        },
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
        
        // Frequency band uniforms (for compatibility)
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

