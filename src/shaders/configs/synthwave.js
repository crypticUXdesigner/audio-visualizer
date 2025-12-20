// Synthwave Shader Configuration
// Retro-futuristic 80s aesthetic with perspective grid and neon colors

export default {
    name: 'synthwave',
    displayName: 'draft: Synthwave',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/synthwave-fragment.glsl',
    
    // Default parameters
    parameters: {
        gridDensity: { 
            type: 'float', 
            default: 8.0, 
            min: 4.0, 
            max: 16.0, 
            step: 1.0,
            label: 'Grid Density'
        },
        perspectiveStrength: {
            type: 'float',
            default: 0.8,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Perspective Strength'
        },
        scanlineIntensity: {
            type: 'float',
            default: 0.3,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            label: 'Scanline Intensity'
        },
        glowIntensity: {
            type: 'float',
            default: 1.5,
            min: 0.5,
            max: 3.0,
            step: 0.1,
            label: 'Glow Intensity'
        },
        horizonPosition: {
            type: 'float',
            default: 0.6,
            min: 0.3,
            max: 0.9,
            step: 0.05,
            label: 'Horizon Position'
        }
    },
    
    // Synthwave color configuration (pink/cyan/purple neon palette)
    colorConfig: {
        baseHue: '#ff00ff', // Magenta base
        darkest: {
            lightness: 0.15,
            chroma: 0.25,
            hueOffset: -60 // Shift to purple
        },
        brightest: {
            lightness: 0.95,
            chroma: 0.35,
            hueOffset: 120 // Shift to cyan
        },
        interpolationCurve: {
            lightness: [0.2, 0.0, 0.8, 1.0], // Ease-in-out for smooth gradient
            chroma: [0.0, 0.3, 0.7, 0.7], // More saturated in middle
            hue: [0.0, 0.2, 0.8, 0.8] // Smooth hue transition
        },
        thresholdCurve: [0.1, 0.0, 1.0, 0.9] // More colors in bright range
    },
    
    // Uniform mapping (reuse audio data)
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


