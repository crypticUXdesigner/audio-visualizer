// Arc Shader Configuration
// Stereo frequency visualizer with half-circle arcs (left and right channels)

export default {
    name: 'arc',
    displayName: 'draft: Arc',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/arc-fragment.glsl',
    
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
            default: 64,
            min: 32,
            max: 256,
            step: 1,
            label: 'Number of Visual Bands'
        },
        baseRadius: {
            type: 'float',
            default: 0.3,
            min: 0.1,
            max: 0.5,
            step: 0.01,
            label: 'Base Radius'
        },
        maxRadiusOffset: {
            type: 'float',
            default: 0.2,
            min: 0.05,
            max: 0.4,
            step: 0.01,
            label: 'Max Radius Offset'
        },
        arcAttackNote: {
            type: 'float',
            default: 1.0 / 128.0,  // 128th note - very fast attack
            min: 1.0 / 256.0,      // 256th note (very fast) = 0.00390625
            max: 1.0 / 4.0,        // Quarter note (slow) = 0.25
            step: 1.0 / 256.0,     // 256th note steps
            label: 'Arc Attack (1/256 = very fast, 1/4 = slow)'
        },
        arcReleaseNote: {
            type: 'float',
            default: 1.0 / 16.0,   // 16th note - moderate release
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
            default: 0.5,
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

