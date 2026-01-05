// Raymarch Shader Configuration
// Procedural 3D raymarching shader with audio reactivity

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig, AudioReactivityConfig } from '../../types/index.js';

const raymarchConfig: ShaderConfig = {
    name: 'raymarch',
    displayName: 'Raymarch',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/raymarch-fragment.glsl',
    
    parameters: {
        // Color System
        enableColorSystem: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Color System (off = original orange/yellow tint)'
        },
        // Reacts to: 10 frequency bands (uFreq1-uFreq10)
        // Visual effect: Modulates color mapping thresholds based on frequency content, making colors shift based on which frequencies are active
        enableColorFrequency: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Frequency-Based Colors'
        },
        
        // Time Modulation
        // Reacts to: Overall volume (loudness of entire signal)
        // Visual effect: Speeds up or slows down the animation time based on overall loudness
        baseAnimationSpeed: {
            type: 'float',
            default: 2.0,
            min: 0.0,
            max: 5.0,
            step: 0.1,
            label: 'Base Animation Speed'
        },
        enableTimeModulation: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Time Modulation'
        },
        timeModulationStrength: {
            type: 'float',
            default: 0.1,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            label: 'Time Modulation Strength',
            audioReactive: {
                source: 'volume',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 4.0,
                strength: 1.0
            } as AudioReactivityConfig
        },
        
        // Fractal Intensity
        // Reacts to: Bass frequencies
        // Visual effect: Increases or decreases the deformation strength of the fractal shape (more bass = stronger warping)
        enableFractalIntensity: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Fractal Intensity'
        },
        fractalIntensityStrength: {
            type: 'float',
            default: 0.7,
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Fractal Intensity Strength',
            audioReactive: {
                source: 'bass',
                attackNote: 1.0 / 128.0,
                releaseNote: 1.0 / 16.0,
                strength: 1.0
            } as AudioReactivityConfig
        },
        
        // Raymarch Steps
        // Reacts to: Overall volume (with invert option)
        // Visual effect: More steps = more geometric detail and increased brightness (more iterations accumulate more color)
        enableRaymarchSteps: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Raymarch Step Reactivity'
        },
        raymarchBaseSteps: {
            type: 'float',
            default: 40.0,
            min: 20.0,
            max: 200.0,
            step: 5.0,
            label: 'Base Raymarch Steps'
        },
        raymarchAudioSteps: {
            type: 'float',
            default: 150.0,
            min: 0.0,
            max: 100.0,
            step: 5.0,
            label: 'Audio Raymarch Steps',
            audioReactive: {
                source: 'volume',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 2.0,
                strength: 1.0
            } as AudioReactivityConfig
        },
        raymarchInvertReactivity: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Invert Detail Reactivity (louder = less detail)'
        },
        
        // Fractal Layers
        // Reacts to: Treble frequencies
        // Visual effect: More layers = more complex fractal detail and finer structure (adds more iteration layers to the fractal deformation)
        enableFractalLayers: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Fractal Layer Modulation'
        },
        fractalLayerModulation: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 1.0,
            step: 0.1,
            label: 'Fractal Layer Modulation',
            audioReactive: {
                source: 'treble',
                attackNote: 1.0 / 64.0,
                releaseNote: 1.0 / 8.0,
                strength: 1.0
            } as AudioReactivityConfig
        },
        
        // Depth Response
        // Reacts to: Bass frequencies
        // Visual effect: Stronger audio response near the camera (closer parts of the fractal deform more with bass, creating depth-based variation)
        enableDepthResponse: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Depth Audio Response'
        },
        depthAudioResponse: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.1,
            label: 'Depth Audio Response',
            audioReactive: {
                source: 'bass',
                attackNote: 1.0 / 128.0,
                releaseNote: 1.0 / 4.0,
                strength: 1.0
            } as AudioReactivityConfig
        },
        
        // Multi-Frequency
        // Reacts to: Bass frequencies
        // Visual effect: Modulates the oscillation frequency of the fractal deformation (more bass = faster/more dramatic oscillations)
        enableMultiFrequency: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Multi-Frequency Control'
        },
        multiFrequencyStrength: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Multi-Frequency Strength (affects oscillation modulation)',
            audioReactive: {
                source: 'bass',
                attackNote: 1.0 / 32.0,
                releaseNote: 1.0 / 32.0,
                strength: 1.0
            } as AudioReactivityConfig
        },
        
        // Test parameter using new advanced triggers
        testFrequencySpread: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: 'Test Frequency Spread Reactivity',
            audioReactive: {
                source: 'frequencySpread',
                strength: 1.0
            } as AudioReactivityConfig
        }
    },
    
    uniformMapping: sharedUniformMapping
};

export default raymarchConfig;

