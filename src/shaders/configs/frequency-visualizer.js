// Frequency Visualizer Shader Configuration
// Classic frequency visualizer with configurable bands and multi-layer rendering

export default {
    name: 'frequency-visualizer',
    displayName: 'draft: Frequency Visualizer',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/frequency-visualizer-fragment.glsl',
    
    // Default parameters
    parameters: {
        numBands: {
            type: 'int',
            default: 320,
            min: 16,
            max: 1024,
            step: 1,
            label: 'Number of Visual Bands'
        },
        maxHeight: {
            type: 'float',
            default: 0.4,
            min: 0.1,
            max: 0.5,
            step: 0.05,
            label: 'Max Height'
        },
        layer1HeightMultiplier: {
            type: 'float',
            default: 1.2,
            min: 1.0,
            max: 1.5,
            step: 0.05,
            label: 'Background Far Height'
        },
        layer2HeightMultiplier: {
            type: 'float',
            default: 1.1,
            min: 1.0,
            max: 1.5,
            step: 0.05,
            label: 'Background Near Height'
        },
        layer3HeightMultiplier: {
            type: 'float',
            default: 1.0,
            min: 0.8,
            max: 1.2,
            step: 0.05,
            label: 'Foreground Height'
        },
        layer1Opacity: {
            type: 'float',
            default: 0.4,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Background Far Opacity'
        },
        layer2Opacity: {
            type: 'float',
            default: 0.6,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Background Near Opacity'
        },
        layer3Opacity: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Foreground Opacity'
        },
        barWidth: {
            type: 'float',
            default: 0.8,
            min: 0.1,
            max: 1.0,
            step: 0.05,
            label: 'Bar Width'
        }
    },
    
    // Color configuration (can reuse or customize)
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

