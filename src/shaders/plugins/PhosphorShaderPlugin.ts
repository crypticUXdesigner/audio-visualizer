// Phosphor Shader Plugin
// Handles parameter uniform updates for phosphor shader
// Implements adaptive quality system for mobile performance

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import type { ShaderConfig, ParameterValue } from '../../types/index.js';
import type { UniformManager } from '../managers/UniformManager.js';

export class PhosphorShaderPlugin extends BaseShaderPlugin {
    // Track last audio-reactive values to apply quality scaling
    private lastRaymarchSteps: number | null = null;
    private lastComplexity: number | null = null;
    
    // Cache mobile detection (only check once, window size rarely changes)
    private cachedIsMobile: boolean | null = null;
    
    // Cache last quality level and scaled values to avoid recalculation
    private lastQualityLevel: number | null = null;
    private lastScaledRaymarchSteps: number | null = null;
    private lastScaledComplexity: number | null = null;
    
    // Track last boosted brightness to prevent flickering on mobile
    private lastBoostedBrightness: number | null = null;
    
    /**
     * Check if running on mobile device (cached)
     * @returns true if mobile device detected
     */
    private isMobile(): boolean {
        if (this.cachedIsMobile === null) {
            if (typeof window === 'undefined') {
                this.cachedIsMobile = false;
            } else {
                this.cachedIsMobile = window.innerWidth < 768;
            }
        }
        return this.cachedIsMobile;
    }
    
    /**
     * Update performance-based adaptive uniforms
     * Adjusts raymarch steps and complexity based on device performance
     * This is called after audio-reactive updates, so we scale the audio-reactive values by quality
     */
    onUpdateUniforms(_audioData: unknown, _colors: unknown, _deltaTime: number): void {
        const gl = this.shaderInstance.gl;
        if (!gl || !this.shaderInstance.uniformLocations) return;
        
        // Get quality level from performance monitor (0.5 = low quality, 1.0 = full quality)
        const currentQualityLevel = this.shaderInstance.performanceMonitor?.qualityLevel ?? 1.0;
        
        // Apply mobile-specific quality reduction
        // On mobile, be more aggressive with quality scaling for better stability
        const isMobile = this.isMobile();
        let qualityLevel = currentQualityLevel;
        if (isMobile) {
            // On mobile, cap quality at 0.6 (60%) for better stability
            // This ensures we don't push mobile GPUs too hard
            qualityLevel = Math.min(qualityLevel, 0.6);
            
            // Also apply additional reduction for very low quality levels
            if (qualityLevel < 0.55) {
                qualityLevel = qualityLevel * 0.9; // Extra 10% reduction when struggling
            }
        }
        
        // Get current values from uniform manager (set by audio-reactive system)
        const uniformManager = this.shaderInstance.uniformManager;
        const locations = this.shaderInstance.uniformLocations;
        
        // Constants for raymarch steps scaling (extracted to avoid recalculation)
        const RAYMARCH_MIN = 20.0;
        const RAYMARCH_MAX_DESKTOP = 200.0;
        const RAYMARCH_MAX_MOBILE = 100.0;
        const RAYMARCH_ORIGINAL_MIN = 20.0;
        const RAYMARCH_ORIGINAL_MAX = 260.0;
        
        // Scale raymarch steps based on quality
        // Audio-reactive system can set values from 20-260 (or 30 default)
        // We scale the range: 20 (low quality) to 200 (high quality)
        if (locations.uRaymarchStepsStrength && uniformManager) {
            const currentValue = uniformManager.lastValues['uRaymarchStepsStrength'] as number | undefined;
            
            // Check if we need to recalculate (value or quality changed)
            const needsRecalculation = currentValue !== undefined && 
                (currentValue !== this.lastRaymarchSteps || qualityLevel !== this.lastQualityLevel);
            
            if (needsRecalculation) {
                // Store for next frame
                this.lastRaymarchSteps = currentValue;
                this.lastQualityLevel = qualityLevel;
                
                // Calculate quality-scaled value
                const maxStepsAtQuality = isMobile
                    ? RAYMARCH_MIN + (RAYMARCH_MAX_MOBILE - RAYMARCH_MIN) * qualityLevel
                    : RAYMARCH_MIN + (RAYMARCH_MAX_DESKTOP - RAYMARCH_MIN) * qualityLevel;
                
                // Scale the current value proportionally to quality
                const normalizedValue = Math.max(0, Math.min(1, 
                    (currentValue - RAYMARCH_ORIGINAL_MIN) / (RAYMARCH_ORIGINAL_MAX - RAYMARCH_ORIGINAL_MIN)));
                const qualityScaledValue = RAYMARCH_ORIGINAL_MIN + normalizedValue * (maxStepsAtQuality - RAYMARCH_ORIGINAL_MIN);
                const flooredValue = Math.floor(qualityScaledValue);
                
                // Only update if value actually changed
                if (flooredValue !== this.lastScaledRaymarchSteps) {
                    gl.uniform1f(locations.uRaymarchStepsStrength, flooredValue);
                    uniformManager.lastValues['uRaymarchStepsStrength'] = qualityScaledValue;
                    this.lastScaledRaymarchSteps = flooredValue;
                }
            } else if (this.lastRaymarchSteps !== null && this.lastScaledRaymarchSteps !== null) {
                // Use cached value if nothing changed
                const flooredValue = this.lastScaledRaymarchSteps;
                const lastUniformValue = uniformManager.lastValues['uRaymarchStepsStrength'] as number | undefined;
                if (lastUniformValue === undefined || Math.floor(lastUniformValue) !== flooredValue) {
                    gl.uniform1f(locations.uRaymarchStepsStrength, flooredValue);
                    uniformManager.lastValues['uRaymarchStepsStrength'] = flooredValue;
                }
            }
        }
        
        // Constants for complexity scaling (extracted to avoid recalculation)
        const COMPLEXITY_MIN = 5.0;
        const COMPLEXITY_MAX_DESKTOP = 15.0;
        const COMPLEXITY_MAX_MOBILE = 8.0;
        const COMPLEXITY_ORIGINAL_MIN = 1.0;
        const COMPLEXITY_ORIGINAL_MAX = 15.0;
        
        // Scale vector field complexity based on quality
        // Audio-reactive system can set values from 1-15 (clamped in shader)
        // We scale the range: 5 (low quality) to 15 (high quality)
        if (locations.uVectorFieldComplexityStrength && uniformManager) {
            const currentValue = uniformManager.lastValues['uVectorFieldComplexityStrength'] as number | undefined;
            
            // Check if we need to recalculate (value or quality changed)
            const needsRecalculation = currentValue !== undefined && 
                (currentValue !== this.lastComplexity || qualityLevel !== this.lastQualityLevel);
            
            if (needsRecalculation) {
                // Store for next frame
                this.lastComplexity = currentValue;
                this.lastQualityLevel = qualityLevel;
                
                // Calculate quality-scaled value
                const maxComplexityAtQuality = isMobile
                    ? COMPLEXITY_MIN + (COMPLEXITY_MAX_MOBILE - COMPLEXITY_MIN) * qualityLevel
                    : COMPLEXITY_MIN + (COMPLEXITY_MAX_DESKTOP - COMPLEXITY_MIN) * qualityLevel;
                
                // Scale the current value proportionally to quality
                const normalizedValue = Math.max(0, Math.min(1, 
                    (currentValue - COMPLEXITY_ORIGINAL_MIN) / (COMPLEXITY_ORIGINAL_MAX - COMPLEXITY_ORIGINAL_MIN)));
                const qualityScaledValue = COMPLEXITY_MIN + normalizedValue * (maxComplexityAtQuality - COMPLEXITY_MIN);
                const flooredValue = Math.floor(qualityScaledValue);
                
                // Only update if value actually changed
                if (flooredValue !== this.lastScaledComplexity) {
                    gl.uniform1f(locations.uVectorFieldComplexityStrength, flooredValue);
                    uniformManager.lastValues['uVectorFieldComplexityStrength'] = qualityScaledValue;
                    this.lastScaledComplexity = flooredValue;
                }
            } else if (this.lastComplexity !== null && this.lastScaledComplexity !== null) {
                // Use cached value if nothing changed
                const flooredValue = this.lastScaledComplexity;
                const lastUniformValue = uniformManager.lastValues['uVectorFieldComplexityStrength'] as number | undefined;
                if (lastUniformValue === undefined || Math.floor(lastUniformValue) !== flooredValue) {
                    gl.uniform1f(locations.uVectorFieldComplexityStrength, flooredValue);
                    uniformManager.lastValues['uVectorFieldComplexityStrength'] = flooredValue;
                }
            }
        }
        
        // Apply mobile brightness boost (1.65x multiplier)
        // Only update when value changes significantly to prevent flickering
        if (isMobile && locations.uBrightnessStrength && uniformManager) {
            const currentBrightness = uniformManager.lastValues['uBrightnessStrength'] as number | undefined;
            
            if (currentBrightness !== undefined) {
                // Apply 1.65x brightness multiplier on mobile
                const boostedBrightness = currentBrightness * 1.65;
                
                // Only update uniform if value changed significantly (threshold: 0.01)
                // This prevents flickering from tiny treble frequency changes
                if (this.lastBoostedBrightness === null || 
                    Math.abs(boostedBrightness - this.lastBoostedBrightness) > 0.01) {
                    gl.uniform1f(locations.uBrightnessStrength, boostedBrightness);
                    this.lastBoostedBrightness = boostedBrightness;
                }
                // Don't update lastValues to avoid interfering with audio-reactive system
                // The audio-reactive system will set it again next frame, and we'll boost it again
            }
        }
    }
    
    /**
     * Update phosphor shader-specific parameter uniforms
     */
    onUpdateParameterUniforms(parameters: Record<string, ParameterValue>, config: ShaderConfig, uniformManager: UniformManager): void {
        const gl = this.shaderInstance.gl;
        if (!gl) return;
        const locations = uniformManager.locations;
        const lastValues = uniformManager.lastValues;
        
        // All phosphor parameters
        const phosphorParams = [
            // Static configuration
            { name: 'uSphereRadius', param: 'sphereRadius', default: 3.0 },
            
            // Audio reactive enable flags
            { name: 'uEnableAnimationSpeed', param: 'enableAnimationSpeed', default: 1.0 },
            { name: 'uEnableVectorFieldSpeed', param: 'enableVectorFieldSpeed', default: 1.0 },
            { name: 'uEnableSphereRadius', param: 'enableSphereRadius', default: 1.0 },
            { name: 'uEnableVectorFieldComplexity', param: 'enableVectorFieldComplexity', default: 1.0 },
            { name: 'uEnableGlowIntensity', param: 'enableGlowIntensity', default: 1.0 },
            { name: 'uEnableBrightness', param: 'enableBrightness', default: 1.0 },
            { name: 'uEnableRaymarchSteps', param: 'enableRaymarchSteps', default: 1.0 },
            
            // Distortion shape enable flags
            { name: 'uEnableVectorFieldFrequencyX', param: 'enableVectorFieldFrequencyX', default: 0.0 },
            { name: 'uEnableVectorFieldFrequencyY', param: 'enableVectorFieldFrequencyY', default: 0.0 },
            { name: 'uEnableVectorFieldFrequencyZ', param: 'enableVectorFieldFrequencyZ', default: 0.0 },
            { name: 'uEnableVectorFieldAmplitude', param: 'enableVectorFieldAmplitude', default: 0.0 },
            { name: 'uEnableVectorFieldRadialStrength', param: 'enableVectorFieldRadialStrength', default: 0.0 },
            { name: 'uEnableVectorFieldHarmonicAmplitude', param: 'enableVectorFieldHarmonicAmplitude', default: 0.0 },
            { name: 'uEnableVectorFieldDistanceContribution', param: 'enableVectorFieldDistanceContribution', default: 0.0 },
            
            // Color system
            { name: 'uEnableColorSystem', param: 'enableColorSystem', default: 1.0 },
            { name: 'uEnableColorFrequency', param: 'enableColorFrequency', default: 0.0 }
        ];
        
        phosphorParams.forEach(({ name, param, default: defaultValue }) => {
            if (locations[name]) {
                const paramConfig = config.parameters?.[param];
                const value = parameters[param] !== undefined 
                    ? parameters[param] 
                    : (paramConfig?.default ?? defaultValue);
                const numValue = typeof value === 'number' ? value : defaultValue;
                if (lastValues[name] !== numValue) {
                    gl.uniform1f(locations[name]!, numValue);
                    lastValues[name] = numValue;
                }
            }
        });
        
        // Initialize and update audio-reactive strength parameters with their base values
        // The audio-reactive system will update them when enabled, but we need to set initial values
        // and update them when parameters change (especially when audio-reactivity is disabled)
        const audioReactiveParams = [
            { name: 'uAnimationSpeedStrength', param: 'animationSpeedStrength', default: 0.3 },
            { name: 'uVectorFieldSpeedStrength', param: 'vectorFieldSpeedStrength', default: 0.3 },
            { name: 'uSphereRadiusStrength', param: 'sphereRadiusStrength', default: 0.26 },
            { name: 'uVectorFieldComplexityStrength', param: 'vectorFieldComplexityStrength', default: 20.0 },
            { name: 'uGlowIntensityStrength', param: 'glowIntensityStrength', default: 0.2 },
            { name: 'uBrightnessStrength', param: 'brightnessStrength', default: 1.0 },
            { name: 'uRaymarchStepsStrength', param: 'raymarchStepsStrength', default: 60.0 },
            
            // Distortion shape parameters
            { name: 'uVectorFieldFrequencyX', param: 'vectorFieldFrequencyX', default: 4.0 },
            { name: 'uVectorFieldFrequencyY', param: 'vectorFieldFrequencyY', default: 2.0 },
            { name: 'uVectorFieldFrequencyZ', param: 'vectorFieldFrequencyZ', default: 0.0 },
            { name: 'uVectorFieldAmplitude', param: 'vectorFieldAmplitude', default: 1.0 },
            { name: 'uVectorFieldRadialStrength', param: 'vectorFieldRadialStrength', default: 8.0 },
            { name: 'uVectorFieldHarmonicAmplitude', param: 'vectorFieldHarmonicAmplitude', default: 1.0 },
            { name: 'uVectorFieldDistanceContribution', param: 'vectorFieldDistanceContribution', default: 0.04 }
        ];
        
        audioReactiveParams.forEach(({ name, param, default: defaultValue }) => {
            if (locations[name]) {
                const paramConfig = config.parameters?.[param];
                const baseValue = (parameters[param] as number) ?? (paramConfig?.default ?? defaultValue);
                // Always update if value changed (audio-reactive system will override if enabled)
                if (lastValues[name] !== baseValue) {
                    gl.uniform1f(locations[name]!, baseValue);
                    lastValues[name] = baseValue;
                }
            }
        });
    }
}

