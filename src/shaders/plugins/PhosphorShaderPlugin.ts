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
    
    /**
     * Check if running on mobile device
     * @returns true if mobile device detected
     */
    private isMobile(): boolean {
        if (typeof window === 'undefined') return false;
        return window.innerWidth < 768;
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
        let qualityLevel = this.shaderInstance.performanceMonitor?.qualityLevel ?? 1.0;
        
        // Apply mobile-specific quality reduction
        // On mobile, be more aggressive with quality scaling for better stability
        const isMobile = this.isMobile();
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
        
        // Scale raymarch steps based on quality
        // Audio-reactive system can set values from 20-260 (or 30 default)
        // We scale the range: 20 (low quality) to 200 (high quality)
        if (locations.uRaymarchStepsStrength && uniformManager) {
            const currentValue = uniformManager.lastValues['uRaymarchStepsStrength'] as number | undefined;
            
            if (currentValue !== undefined) {
                // Store for next frame
                this.lastRaymarchSteps = currentValue;
                
                // Calculate quality-scaled value
                // Range: min 20, max 200 at full quality (desktop) or 100 (mobile - more conservative)
                const minSteps = 20.0;
                const maxStepsDesktop = 200.0;
                const maxStepsMobile = 100.0; // Lower max on mobile for better stability
                const maxStepsAtQuality = isMobile
                    ? 20.0 + (maxStepsMobile - 20.0) * qualityLevel
                    : 20.0 + (maxStepsDesktop - 20.0) * qualityLevel;
                
                // Scale the current value proportionally to quality
                // If current value is in range 20-260, scale it to 20-maxStepsAtQuality
                const originalMin = 20.0;
                const originalMax = 260.0;
                const normalizedValue = Math.max(0, Math.min(1, (currentValue - originalMin) / (originalMax - originalMin)));
                const qualityScaledValue = originalMin + normalizedValue * (maxStepsAtQuality - originalMin);
                
                gl.uniform1f(locations.uRaymarchStepsStrength, Math.floor(qualityScaledValue));
                uniformManager.lastValues['uRaymarchStepsStrength'] = qualityScaledValue;
            } else if (this.lastRaymarchSteps !== null) {
                // Fallback: use last known value and scale it
                const minSteps = 20.0;
                const maxStepsDesktop = 200.0;
                const maxStepsMobile = 100.0;
                const maxStepsAtQuality = isMobile
                    ? 20.0 + (maxStepsMobile - 20.0) * qualityLevel
                    : 20.0 + (maxStepsDesktop - 20.0) * qualityLevel;
                const originalMin = 20.0;
                const originalMax = 260.0;
                const normalizedValue = Math.max(0, Math.min(1, (this.lastRaymarchSteps - originalMin) / (originalMax - originalMin)));
                const qualityScaledValue = originalMin + normalizedValue * (maxStepsAtQuality - originalMin);
                
                gl.uniform1f(locations.uRaymarchStepsStrength, Math.floor(qualityScaledValue));
                if (uniformManager) {
                    uniformManager.lastValues['uRaymarchStepsStrength'] = qualityScaledValue;
                }
            }
        }
        
        // Scale vector field complexity based on quality
        // Audio-reactive system can set values from 1-15 (clamped in shader)
        // We scale the range: 5 (low quality) to 15 (high quality)
        if (locations.uVectorFieldComplexityStrength && uniformManager) {
            const currentValue = uniformManager.lastValues['uVectorFieldComplexityStrength'] as number | undefined;
            
            if (currentValue !== undefined) {
                // Store for next frame
                this.lastComplexity = currentValue;
                
                // Calculate quality-scaled value
                // Range: min 5, max 15 at full quality (desktop) or 8 (mobile - more conservative)
                const minComplexity = 5.0;
                const maxComplexityDesktop = 15.0;
                const maxComplexityMobile = 8.0; // Lower max on mobile for better stability
                const maxComplexityAtQuality = isMobile
                    ? 5.0 + (maxComplexityMobile - 5.0) * qualityLevel
                    : 5.0 + (maxComplexityDesktop - 5.0) * qualityLevel;
                
                // Scale the current value proportionally to quality
                // If current value is in range 1-15, scale it to minComplexity-maxComplexityAtQuality
                const originalMin = 1.0;
                const originalMax = 15.0;
                const normalizedValue = Math.max(0, Math.min(1, (currentValue - originalMin) / (originalMax - originalMin)));
                const qualityScaledValue = minComplexity + normalizedValue * (maxComplexityAtQuality - minComplexity);
                
                gl.uniform1f(locations.uVectorFieldComplexityStrength, Math.floor(qualityScaledValue));
                uniformManager.lastValues['uVectorFieldComplexityStrength'] = qualityScaledValue;
            } else if (this.lastComplexity !== null) {
                // Fallback: use last known value and scale it
                const minComplexity = 5.0;
                const maxComplexityDesktop = 15.0;
                const maxComplexityMobile = 8.0;
                const maxComplexityAtQuality = isMobile
                    ? 5.0 + (maxComplexityMobile - 5.0) * qualityLevel
                    : 5.0 + (maxComplexityDesktop - 5.0) * qualityLevel;
                const originalMin = 1.0;
                const originalMax = 15.0;
                const normalizedValue = Math.max(0, Math.min(1, (this.lastComplexity - originalMin) / (originalMax - originalMin)));
                const qualityScaledValue = minComplexity + normalizedValue * (maxComplexityAtQuality - minComplexity);
                
                gl.uniform1f(locations.uVectorFieldComplexityStrength, Math.floor(qualityScaledValue));
                if (uniformManager) {
                    uniformManager.lastValues['uVectorFieldComplexityStrength'] = qualityScaledValue;
                }
            }
        }
        
        // Apply mobile brightness boost (1.35x multiplier)
        if (isMobile && locations.uBrightnessStrength && uniformManager) {
            const currentBrightness = uniformManager.lastValues['uBrightnessStrength'] as number | undefined;
            
            if (currentBrightness !== undefined) {
                // Apply 1.35x brightness multiplier on mobile
                const boostedBrightness = currentBrightness * 1.35;
                gl.uniform1f(locations.uBrightnessStrength, boostedBrightness);
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

