// Phosphor Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig, AudioReactivityConfig } from '../../types/index.js';
import { BezierPresets } from '../../types/audio-reactivity-presets.js';

const phosphorConfig: ShaderConfig = {
    name: 'phosphor',
    displayName: 'Phosphor',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/phosphor-fragment.glsl',
    
    parameters: {
        // ============================================
        // COLOR SYSTEM
        // ============================================
        enableColorSystem: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Color System (off = original colors)'
        },
        // Reacts to: 10 frequency bands (uFreq1-uFreq10)
        // Visual effect: Modulates color mapping thresholds based on frequency content
        enableColorFrequency: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Frequency-Based Colors'
        },
        
        // ============================================
        // STATIC CONFIGURATION
        // ============================================
        // Sphere and Distance Field
        sphereRadius: {
            type: 'float',
            default: 1.9,
            min: 1.0,
            max: 10.0,
            step: 0.1,
            label: 'Sphere Radius (base)'
        },
        
        // ============================================
        // AUDIO REACTIVE EFFECTS
        // ============================================
        // Animation Speed Reactivity
        // Reacts to: Overall volume (loudness of entire signal)
        // Visual effect: Speeds up or slows down the animation time based on overall loudness
        enableAnimationSpeed: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Animation Speed Reactivity'
        },
        animationSpeedStrength: {
            type: 'float',
            default: 0.5,
            min: 0.0,
            max: 5.0,
            step: 0.1,
            label: 'Animation Speed Strength',
            audioReactive: {
                source: 'bass',
                attackNote: 1.0 / 4.0,
                releaseNote: 1.0 / 1.0,
                startValue: 0.5,      // Silent = 0.3
                targetValue: 1.8,     // Loud = 0.3 + (0.3 * 5.0)
                curve: BezierPresets.easeOut  // Slow start, fast finish
            } as AudioReactivityConfig
        },
        
        // Vector Field Speed Reactivity
        // Reacts to: Mid frequencies
        // Visual effect: Vector field rotation speed increases with mid frequency loudness
        enableVectorFieldSpeed: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Speed Reactivity'
        },
        vectorFieldSpeedStrength: {
            type: 'float',
            default: 0.1,
            min: 0.0,
            max: 5.0,
            step: 0.1,
            label: 'Vector Field Speed Strength',
            audioReactive: {
                source: 'volume',
                attackNote: 1.0 / 4.0,
                releaseNote: 1.0 / 4.0,
                startValue: 0.1,      // Base speed (always applied, continuous forward progression)
                targetValue: 0.3,     // Maximum speed (base + audio boost)
                curve: BezierPresets.linear,
                mode: 'speed'         // Continuous forward progression mode
            } as AudioReactivityConfig
        },
        
        // Sphere Radius Reactivity
        // Reacts to: Bass frequencies
        // Visual effect: Sphere radius pulses with bass, creating larger structures on bass hits
        enableSphereRadius: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Sphere Radius Reactivity'
        },
        sphereRadiusStrength: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 5.0,
            step: 0.1,
            label: 'Sphere Radius Strength',
            audioReactive: {
                source: 'volume',
                attackNote: 1.0 / 4.0,
                releaseNote: 1.0 / 1.0,
                startValue: 0.0,      // Silent = 0.26
                targetValue: 8.0,     // Loud = 0.26 + (0.14 * 5.0)
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Vector Field Complexity Reactivity
        // Reacts to: Beat intensity
        // Visual effect: Complexity decreases with beat intensity (inverted - quieter = more complex)
        enableVectorFieldComplexity: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Complexity Reactivity'
        },
        vectorFieldComplexityStrength: {
            type: 'float',
            default: 15.0,
            min: 1.0,
            max: 20.0,
            step: 1.0,
            label: 'Vector Field Complexity (max layers, decreases with beats)',
            audioReactive: {
                source: 'volume',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 4.0,
                startValue: 15.0,      // Silent = 20.0 (high detail)
                targetValue: 30.0,     // Loud = 20.0 - (0.5 * (20.0 - 1.0)) = 10.5
                curve: BezierPresets.easeIn  // Fast start, slow finish
            } as AudioReactivityConfig
        },
        
        // Glow Intensity Reactivity
        // Reacts to: Treble frequencies
        // Visual effect: Glow intensity increases with treble loudness
        enableGlowIntensity: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Glow Intensity Reactivity'
        },
        glowIntensityStrength: {
            type: 'float',
            default: 0.2,
            min: 0.0,
            max: 5.0,
            step: 0.1,
            label: 'Glow Intensity Strength',
            audioReactive: {
                source: 'treble',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 16.0,
                startValue: 0.2,       // Silent = 0.2
                targetValue: 1.4,      // Loud = 0.2 + (0.2 * 5.0)
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Brightness Reactivity
        // Reacts to: Treble frequencies
        // Visual effect: Brightness increases with treble loudness (separate attack/release controls)
        enableBrightness: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Brightness Reactivity'
        },
        brightnessStrength: {
            type: 'float',
            default: 0.15,
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Brightness Strength',
            audioReactive: {
                source: 'treble',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 1.0,
                startValue: 0.15,       // Silent = 0.0
                targetValue: 3.0,      // Loud = 0.0 + (0.1 * 3.0)
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Raymarch Steps Reactivity
        // Reacts to: Overall volume
        // Visual effect: Steps decrease with volume (inverted - quieter = more steps for detail)
        enableRaymarchSteps: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Raymarch Steps Reactivity'
        },
        raymarchStepsStrength: {
            type: 'float',
            default: 50.0,
            min: 20.0,
            max: 200.0,
            step: 5.0,
            label: 'Raymarch Steps (max steps, decreases with volume)',
            audioReactive: {
                source: 'volume',
                attackNote: 1.0 / 4.0,
                releaseNote: 1.0 / 1.0,
                startValue: 50.0,     // Silent = 100 steps (high detail)
                targetValue: 260.0,     // Loud = 100 - (0.8 * (100 - 20)) = 36, but let's use 40 for cleaner value
                curve: {
                    x1: 0.2, y1: 0,    // Fast start
                    x2: 0.4, y2: 1     // Slow finish
                }
            } as AudioReactivityConfig
        },
        
        // ============================================
        // DISTORTION SHAPE CONTROLS
        // ============================================
        // Vector Field Frequency X Reactivity
        // Reacts to: Bass frequencies
        // Visual effect: Modulates horizontal distortion pattern frequency
        enableVectorFieldFrequencyX: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Frequency X Reactivity'
        },
        vectorFieldFrequencyX: {
            type: 'float',
            default: 4.0,
            min: 0.0,
            max: 20.0,
            step: 0.1,
            label: 'Vector Field Frequency X (horizontal pattern)',
            audioReactive: {
                source: 'bass',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 2.0,
                startValue: 4.0,       // Silent = base frequency
                targetValue: 4.1,      // Loud = higher frequency (more detail)
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Vector Field Frequency Y Reactivity
        // Reacts to: Mid frequencies
        // Visual effect: Modulates vertical distortion pattern frequency
        enableVectorFieldFrequencyY: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Frequency Y Reactivity'
        },
        vectorFieldFrequencyY: {
            type: 'float',
            default: 2.0,
            min: 0.0,
            max: 20.0,
            step: 0.1,
            label: 'Vector Field Frequency Y (vertical pattern)',
            audioReactive: {
                source: 'mid',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 2.0,
                startValue: 2.0,       // Silent = base frequency
                targetValue: 2.1,      // Loud = higher frequency (more detail)
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Vector Field Frequency Z Reactivity
        // Reacts to: Treble frequencies
        // Visual effect: Modulates depth/rotation distortion pattern frequency
        enableVectorFieldFrequencyZ: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Frequency Z Reactivity'
        },
        vectorFieldFrequencyZ: {
            type: 'float',
            default: 0.0,
            min: 0.0,
            max: 20.0,
            step: 0.1,
            label: 'Vector Field Frequency Z (depth/rotation pattern)',
            audioReactive: {
                source: 'treble',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 2.0,
                startValue: 0.0,       // Silent = base frequency
                targetValue: 0.1,      // Loud = higher frequency (more rotation)
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Vector Field Amplitude Reactivity
        // Reacts to: Overall volume
        // Visual effect: Modulates overall distortion strength
        enableVectorFieldAmplitude: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Amplitude Reactivity'
        },
        vectorFieldAmplitude: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 5.0,
            step: 0.1,
            label: 'Vector Field Amplitude (distortion strength)',
            audioReactive: {
                source: 'volume',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 4.0,
                startValue: 1.0,       // Silent = base amplitude
                targetValue: 3.0,      // Loud = stronger distortion
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Vector Field Radial Strength Reactivity
        // Reacts to: Bass frequencies
        // Visual effect: Modulates radial variation in distortion pattern
        enableVectorFieldRadialStrength: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Radial Strength Reactivity'
        },
        vectorFieldRadialStrength: {
            type: 'float',
            default: 8.0,
            min: 0.0,
            max: 20.0,
            step: 0.1,
            label: 'Vector Field Radial Strength (radial variation)',
            audioReactive: {
                source: 'bass',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 4.0,
                startValue: 8.0,       // Silent = base radial strength
                targetValue: 15.0,     // Loud = stronger radial variation
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Vector Field Harmonic Amplitude Reactivity
        // Reacts to: Mid frequencies
        // Visual effect: Modulates amplitude of harmonic distortion layers
        enableVectorFieldHarmonicAmplitude: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Harmonic Amplitude Reactivity'
        },
        vectorFieldHarmonicAmplitude: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 3.0,
            step: 0.1,
            label: 'Vector Field Harmonic Amplitude (harmonic layer strength)',
            audioReactive: {
                source: 'mid',
                attackNote: 1.0 / 4.0,
                releaseNote: 1.0 / 1.0,
                startValue: 0.8,       // Silent = base harmonic amplitude
                targetValue: 2.5,      // Loud = stronger harmonics
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        },
        
        // Vector Field Distance Contribution Reactivity
        // Reacts to: Treble frequencies
        // Visual effect: Modulates how much distortion affects the distance field
        enableVectorFieldDistanceContribution: {
            type: 'float',
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: 'Enable Vector Field Distance Contribution Reactivity'
        },
        vectorFieldDistanceContribution: {
            type: 'float',
            default: 0.01,
            min: 0.0,
            max: 0.2,
            step: 0.01,
            label: 'Vector Field Distance Contribution (shape impact)',
            audioReactive: {
                source: 'treble',
                attackNote: 1.0 / 16.0,
                releaseNote: 1.0 / 4.0,
                startValue: 0.03,      // Silent = base contribution
                targetValue: 0.045,     // Loud = stronger shape impact
                curve: BezierPresets.easeOut
            } as AudioReactivityConfig
        }
    },
    
    uniformMapping: sharedUniformMapping
};

export default phosphorConfig;

