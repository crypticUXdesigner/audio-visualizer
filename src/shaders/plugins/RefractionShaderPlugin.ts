// RefractionShaderPlugin - Plugin for refraction shader
// Handles tempo-based smoothing for volume scale and FBM zoom

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';
import { ShaderConstants } from '../config/ShaderConstants.js';
import { UniformUpdateHelper } from '../utils/UniformUpdateHelper.js';
import type { ExtendedAudioData, ShaderConfig, ParameterValue } from '../../types/index.js';
import type { ShaderInstance } from '../ShaderInstance.js';
import type { UniformManager } from '../managers/UniformManager.js';
import type { ColorMap } from '../../types/index.js';

interface SmoothingState extends Record<string, unknown> {
    smoothedVolumeScale: number;
    smoothedFbmZoom: number;
}

export class RefractionShaderPlugin extends BaseShaderPlugin {
    smoothing: SmoothingState;
    uniformHelper: UniformUpdateHelper | null;
    
    constructor(shaderInstance: ShaderInstance, config: ShaderConfig) {
        super(shaderInstance, config);
        
        // Smoothing state for refraction shader
        this.smoothing = {
            smoothedVolumeScale: 0.3,
            smoothedFbmZoom: 1.0
        };
        
        // Uniform update helper (will be initialized in onInit)
        this.uniformHelper = null;
    }
    
    onInit(): void {
        // Initialize uniform update helper
        if (this.shaderInstance.gl && this.shaderInstance.uniformLocations) {
            this.uniformHelper = new UniformUpdateHelper(
                this.shaderInstance.gl,
                this.shaderInstance.uniformLocations,
                this.shaderInstance._lastUniformValues || {}
            );
        }
    }
    
    getSmoothingState(): SmoothingState | null {
        return this.smoothing;
    }
    
    /**
     * Update tempo-based smoothing for refraction shader
     */
    updateSmoothing(audioData: ExtendedAudioData | null, deltaTime: number): void {
        if (!audioData) return;
        
        const bpm = audioData.estimatedBPM || 0;
        
        // Smooth volume scale (0.3 + volume * 0.7)
        const targetVolumeScale = 0.3 + (audioData.volume || 0) * 0.7;
        const feedConfig = TempoSmoothingConfig.feed;
        const feedAttackTime = getTempoRelativeTimeConstant(
            feedConfig.attackNote,
            bpm,
            feedConfig.attackTimeFallback
        );
        const feedReleaseTime = getTempoRelativeTimeConstant(
            feedConfig.releaseNote,
            bpm,
            feedConfig.releaseTimeFallback
        );
        this.smoothing.smoothedVolumeScale = applyTempoRelativeSmoothing(
            this.smoothing.smoothedVolumeScale,
            targetVolumeScale,
            deltaTime,
            feedAttackTime,
            feedReleaseTime
        );
        
        // Smooth FBM zoom factor (1.0 = normal, maxZoom = zoomed out)
        // Calculate target zoom based on recent beats with intensity-based scaling
        const maxZoom = ShaderConstants.refraction.maxZoom; // Maximum zoom factor (zoomed out)
        const zoomConfig = ShaderConstants.refraction;
        
        // Check for recent bass or mid beats and get their intensities
        let maxBeatIntensity = 0.0;
        const bassBeatAge = audioData.beatTimeBass || 999.0;
        const midBeatAge = audioData.beatTimeMid || 999.0;
        
        // Check bass beat (primary trigger)
        if (bassBeatAge < 0.3 && audioData.beatIntensityBass > zoomConfig.zoomIntensityThreshold) {
            maxBeatIntensity = Math.max(maxBeatIntensity, audioData.beatIntensityBass);
        }
        
        // Check mid beat (secondary trigger)
        if (midBeatAge < 0.3 && audioData.beatIntensityMid > zoomConfig.zoomIntensityThreshold) {
            maxBeatIntensity = Math.max(maxBeatIntensity, audioData.beatIntensityMid);
        }
        
        // Scale zoom from 1.0 (no beat) to maxZoom (strong beat) based on intensity
        // Intensity is threshold-1.0, so map it to 0.0-1.0 range, then scale to zoom range
        const intensityFactor = maxBeatIntensity > 0.0 
            ? (maxBeatIntensity - zoomConfig.zoomIntensityThreshold) / zoomConfig.zoomIntensityRange  // Map threshold-1.0 to 0.0-1.0
            : 0.0;
        const targetZoom = 1.0 + (maxZoom - 1.0) * intensityFactor;
        
        const tempoZoomConfig = TempoSmoothingConfig.fbmZoom;
        const zoomAttackTime = getTempoRelativeTimeConstant(
            tempoZoomConfig.attackNote,
            bpm,
            tempoZoomConfig.attackTimeFallback
        );
        const zoomReleaseTime = getTempoRelativeTimeConstant(
            tempoZoomConfig.releaseNote,
            bpm,
            tempoZoomConfig.releaseTimeFallback
        );
        this.smoothing.smoothedFbmZoom = applyTempoRelativeSmoothing(
            this.smoothing.smoothedFbmZoom,
            targetZoom,
            deltaTime,
            zoomAttackTime,
            zoomReleaseTime
        );
    }
    
    /**
     * Update shader-specific uniforms
     */
    onUpdateUniforms(_audioData: ExtendedAudioData | null, _colors: ColorMap | null, _deltaTime: number): void {
        const gl = this.shaderInstance.gl;
        if (!gl || !this.shaderInstance.uniformLocations) return;
        
        // Set smoothed uniforms
        if (this.shaderInstance.uniformLocations.uSmoothedVolumeScale) {
            gl.uniform1f(
                this.shaderInstance.uniformLocations.uSmoothedVolumeScale,
                this.smoothing.smoothedVolumeScale
            );
        }
        if (this.shaderInstance.uniformLocations.uSmoothedFbmZoom) {
            gl.uniform1f(
                this.shaderInstance.uniformLocations.uSmoothedFbmZoom,
                this.smoothing.smoothedFbmZoom
            );
        }
        
        // Performance-based adaptive quality adjustments
        const qualityLevel = this.shaderInstance.performanceMonitor?.qualityLevel ?? 1.0;
        
        // Adjust fBm octaves based on quality (6 = full quality, 3 = minimum)
        const octaves = Math.max(3, Math.floor(6 * qualityLevel));
        if (this.shaderInstance.uniformLocations.uFbmOctaves) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uFbmOctaves, octaves);
        }
        
        // Adjust blur sample count based on quality
        let blurSamples = 5; // Full blur (4 samples + center)
        if (qualityLevel < 0.6) {
            blurSamples = 1; // No blur
        } else if (qualityLevel < 0.8) {
            blurSamples = 2; // Horizontal only (2 samples + center)
        }
        if (this.shaderInstance.uniformLocations.uBlurSampleCount) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uBlurSampleCount, blurSamples);
        }
        
        // Adjust cell animation layers based on quality
        const animationLayers = qualityLevel < 0.6 ? 1 : (qualityLevel < 0.8 ? 2 : 3);
        if (this.shaderInstance.uniformLocations.uCellAnimationLayers) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uCellAnimationLayers, animationLayers);
        }
    }
    
    /**
     * Update refraction shader-specific parameter uniforms
     */
    onUpdateParameterUniforms(parameters: Record<string, ParameterValue>, config: ShaderConfig, uniformManager: UniformManager): void {
        if (!this.uniformHelper) {
            // Fallback to manual updates if helper not initialized
            const gl = this.shaderInstance.gl;
            if (!gl) return;
            const locations = uniformManager.locations;
            const lastValues = uniformManager.lastValues;
            
            const refractionParams = [
                { name: 'uOuterGridSize', param: 'outerGridSize', default: 15.0 },
                { name: 'uInnerGridSize', param: 'innerGridSize', default: 3.0 },
                { name: 'uBlurStrength', param: 'blurStrength', default: 18.0 },
                { name: 'uOffsetStrength', param: 'offsetStrength', default: 0.2 },
                { name: 'uPixelizeLevels', param: 'pixelizeLevels', default: 4.0 },
                { name: 'uCellBrightnessVariation', param: 'cellBrightnessVariation', default: 0.025 },
                { name: 'uCellAnimNote1', param: 'cellAnimNote1', default: 4.0 },
                { name: 'uCellAnimNote2', param: 'cellAnimNote2', default: 2.0 },
                { name: 'uCellAnimNote3', param: 'cellAnimNote3', default: 1.0 },
                { name: 'uDistortionStrength', param: 'distortionStrength', default: 1.0 },
                { name: 'uDistortionSize', param: 'distortionSize', default: 1.0 },
                { name: 'uDistortionFalloff', param: 'distortionFalloff', default: 2.0 },
                { name: 'uDistortionPerspectiveStrength', param: 'distortionPerspectiveStrength', default: 1.0 },
                { name: 'uDistortionEasing', param: 'distortionEasing', default: 1.0 }
            ];
            
            refractionParams.forEach(({ name, param, default: defaultValue }) => {
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
            return;
        }
        
        // Use helper for cleaner code
        const refractionParams = [
            { name: 'uOuterGridSize', param: 'outerGridSize', default: 15.0, type: 'float' as const },
            { name: 'uInnerGridSize', param: 'innerGridSize', default: 3.0, type: 'float' as const },
            { name: 'uBlurStrength', param: 'blurStrength', default: 18.0, type: 'float' as const },
            { name: 'uOffsetStrength', param: 'offsetStrength', default: 0.2, type: 'float' as const },
            { name: 'uPixelizeLevels', param: 'pixelizeLevels', default: 4.0, type: 'float' as const },
            { name: 'uCellBrightnessVariation', param: 'cellBrightnessVariation', default: 0.025, type: 'float' as const },
            { name: 'uCellAnimNote1', param: 'cellAnimNote1', default: 4.0, type: 'float' as const },
            { name: 'uCellAnimNote2', param: 'cellAnimNote2', default: 2.0, type: 'float' as const },
            { name: 'uCellAnimNote3', param: 'cellAnimNote3', default: 1.0, type: 'float' as const },
            { name: 'uDistortionStrength', param: 'distortionStrength', default: 1.0, type: 'float' as const },
            { name: 'uDistortionSize', param: 'distortionSize', default: 1.0, type: 'float' as const },
            { name: 'uDistortionFalloff', param: 'distortionFalloff', default: 2.0, type: 'float' as const },
            { name: 'uDistortionPerspectiveStrength', param: 'distortionPerspectiveStrength', default: 1.0, type: 'float' as const },
            { name: 'uDistortionEasing', param: 'distortionEasing', default: 1.0, type: 'float' as const }
        ];
        
        // updateFromParamDefs accepts ShaderConfig which has compatible structure
        this.uniformHelper.updateFromParamDefs(refractionParams, parameters, config);
    }
}

