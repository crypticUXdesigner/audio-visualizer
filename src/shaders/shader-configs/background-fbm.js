// Background FBM Shader Configuration
// Configuration for the fBm noise pattern background shader

export default {
    name: 'background-fbm',
    displayName: 'FBM Noise Background',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/background-fragment.glsl',
    
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
        steps: { 
            type: 'float', 
            default: 5, 
            min: 2, 
            max: 10, 
            step: 0.5,
            label: 'Steps'
        },
        targetFPS: {
            type: 'float',
            default: 60,
            min: 15,
            max: 60,
            step: 1,
            label: 'Target FPS'
        },
        rippleSpeed: {
            type: 'float',
            default: 0.3,
            min: 0.1,
            max: 2,
            step: 0.05,
            label: 'Ripple Speed'
        },
        rippleWidth: {
            type: 'float',
            default: 0.1,
            min: 0.02,
            max: 0.5,
            step: 0.01,
            label: 'Ripple Width'
        },
        rippleMinRadius: {
            type: 'float',
            default: 0.15,
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Ripple Min Radius'
        },
        rippleMaxRadius: {
            type: 'float',
            default: 3,
            min: 0.1,
            max: 3,
            step: 0.1,
            label: 'Ripple Max Radius'
        },
        rippleIntensityThreshold: {
            type: 'float',
            default: 0.75,
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Ripple Threshold'
        },
        rippleIntensity: {
            type: 'float',
            default: 0.25,
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Ripple Intensity'
        }
    },
    
    // Color configuration (can be overridden)
    colorConfig: {
        baseHue: '#41eee5',
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
        interpolationCurve: [0.5, 0.2, 0.6, 0.7]
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
        uFreq8: (data) => 0, // Not used in current implementation
        uFreq9: (data) => 0, // Not used in current implementation
        uFreq10: (data) => 0, // Not used in current implementation
        
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
    },
    
    // Custom initialization hook (optional)
    onInit: (shaderInstance) => {
        // Can add custom initialization logic here if needed
    },
    
    // Custom render hook (optional)
    onRender: (shaderInstance, audioData) => {
        // Can add custom render logic here if needed
    }
};

