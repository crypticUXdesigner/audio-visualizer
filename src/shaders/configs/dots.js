// Dots Grid Shader Configuration
// Dense grid of dots with frequency-based colors and ripple distortions

export default {
    name: 'dots',
    displayName: 'Dots Grid',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/dots-fragment.glsl',
    
    // Default parameters
    parameters: {
        dotSpacing: { 
            type: 'float', 
            default: 24.0,  // Pixels between dots (10-20px range)
            min: 8.0, 
            max: 30.0, 
            step: 1.0,
            label: 'Dot Spacing'
        },
        dotSize: {
            type: 'float',
            default: 0.2,   // Size of dots (0.0-1.0, relative to spacing)
            min: 0.2,
            max: 0.8,
            step: 0.05,
            label: 'Dot Size'
        },
        pulsationStrength: {
            type: 'float',
            default: 0.0,  // How much dots pulse with frequency (0.0-0.5)
            min: 0.0,
            max: 0.5,
            step: 0.05,
            label: 'Pulsation Strength'
        },
        rippleDistortionStrength: {
            type: 'float',
            default: 2.5,   // How much ripples distort the grid (0.0-1.0)
            min: 0.0,
            max: 1.0,
            step: 0.1,
            label: 'Ripple Distortion'
        },
        enableCenterPositionOffset: {
            type: 'float',
            default: 1.0,  // Enabled by default
            min: 0.0,
            max: 1.0,
            step: 1.0,  // Binary: 0 or 1
            label: 'Enable Center Position Offset'
        },
        enableUVOffset: {
            type: 'float',
            default: 0.0,  // Disabled by default for testing
            min: 0.0,
            max: 1.0,
            step: 1.0,  // Binary: 0 or 1
            label: 'Enable UV Offset'
        },
        movementStrength: {
            type: 'float',
            default: 0.05,  // Multiplier for dot center position movement
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Movement Strength'
        },
        uvOffsetStrength: {
            type: 'float',
            default: 1.0,  // Multiplier for UV sampling offset
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'UV Offset Strength'
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
    
    // Uniform mapping (same as heightmap - reuse audio data)
    uniformMapping: {
        uBass: (data) => data?.bass || 0,
        uMid: (data) => data?.mid || 0,
        uTreble: (data) => data?.treble || 0,
        uVolume: (data) => data?.volume || 0,
        
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
        
        uBassStereo: (data) => data?.bassStereo || 0,
        uMidStereo: (data) => data?.midStereo || 0,
        uTrebleStereo: (data) => data?.trebleStereo || 0,
        
        uSmoothedBass: (data) => data?.smoothedBass || 0,
        uSmoothedMid: (data) => data?.smoothedMid || 0,
        uSmoothedTreble: (data) => data?.smoothedTreble || 0,
        uPeakBass: (data) => data?.peakBass || 0,
        uBeatTime: (data) => data?.beatTime || 0,
        uBeatIntensity: (data) => data?.beatIntensity || 0,
        uBPM: (data) => data?.estimatedBPM || 0,
        
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

