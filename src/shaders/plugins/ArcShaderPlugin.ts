// ArcShaderPlugin - Plugin for arc shader
// Handles frequency texture updates for arc visualization

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';
import { FrequencyTextureCalculator } from '../utils/FrequencyTextureCalculator.js';
import { UniformUpdateHelper } from '../utils/UniformUpdateHelper.js';
import type { ExtendedAudioData } from '../../types/index.js';
import type { ShaderConfig } from '../../types/index.js';
import type { ShaderInstance } from '../ShaderInstance.js';
import type { AudioAnalyzer } from '../../core/audio/AudioAnalyzer.js';
import type { ColorMap } from '../../types/index.js';
import type { ParameterValue } from '../../types/shader.js';

interface SmoothingState extends Record<string, unknown> {
    smoothedLeftBands: Float32Array | null;
    smoothedRightBands: Float32Array | null;
    smoothedMaskRadius: number;
    smoothedContrastAudioLevel: number;
    smoothedSphereBrightness: number;
    smoothedSphereSizeVolume: number;
    smoothedSphereSizeBass: number;
    smoothedSphereBrightnessMultiplier: number;
    smoothedSphereHueShift: number;
}

interface FrequencyTextures {
    leftRight: WebGLTexture | null;
}

export class ArcShaderPlugin extends BaseShaderPlugin {
    smoothing: SmoothingState;
    frequencyTextures: FrequencyTextures;
    _measuredBands: number;
    uniformHelper: UniformUpdateHelper | null;
    // OPTIMIZATION: Track last parameter values to avoid unnecessary uniform updates (Phase 3.1)
    private _lastParams: Partial<Record<string, ParameterValue>> = {};
    
    constructor(shaderInstance: ShaderInstance, config: ShaderConfig) {
        super(shaderInstance, config);
        
        // Smoothing state for arc shader
        this.smoothing = {
            smoothedLeftBands: null,
            smoothedRightBands: null,
            smoothedMaskRadius: 0.0,
            smoothedContrastAudioLevel: 0.0,
            smoothedSphereBrightness: 0.0,
            smoothedSphereSizeVolume: 0.0,
            smoothedSphereSizeBass: 0.0,
            smoothedSphereBrightnessMultiplier: 1.0,
            smoothedSphereHueShift: 0.0
        };
        
        // Frequency texture
        this.frequencyTextures = {
            leftRight: null
        };
        
        this._measuredBands = 24;
        
        // Initialize uniform update helper (will be set in onInit after shaderInstance is ready)
        this.uniformHelper = null;
    }
    
    onInit(): void {
        // Initialize uniform update helper
        this.uniformHelper = new UniformUpdateHelper(
            this.shaderInstance.gl!,
            this.shaderInstance.uniformLocations,
            this.shaderInstance._lastUniformValues
        );
    }
    
    getSmoothingState(): SmoothingState | null {
        return this.smoothing;
    }
    
    /**
     * Update frequency textures for arc shader
     */
    onUpdateTextures(audioData: ExtendedAudioData | null, deltaTime: number): void {
        if (!audioData || !audioData.audioContext) return;
        if (!this.shaderInstance || !this.shaderInstance.gl) return;
        
        const gl = this.shaderInstance.gl;
        
        // Get measured bands from config
        const measuredBands = (this.shaderInstance.parameters.measuredBands !== undefined 
            ? this.shaderInstance.parameters.measuredBands 
            : (this._measuredBands || 24)) as number;
        this._measuredBands = measuredBands;
        
        // Initialize smoothed band arrays if needed
        if (!this.smoothing.smoothedLeftBands || 
            this.smoothing.smoothedLeftBands.length !== measuredBands) {
            this.smoothing.smoothedLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedRightBands = new Float32Array(measuredBands);
        }
        
        // Calculate configurable bands using shared utility
        const bandData = FrequencyTextureCalculator.calculateBands(
            audioData,
            measuredBands,
            this.shaderInstance.renderLoop.getAudioAnalyzer()
        );
        
        if (!bandData) {
            return;
        }
        
        // Get attack/release note values from config
        const arcAttackNote = (this.shaderInstance.parameters.arcAttackNote !== undefined
            ? this.shaderInstance.parameters.arcAttackNote
            : TempoSmoothingConfig.arc.attackNote) as number;
        const arcReleaseNote = (this.shaderInstance.parameters.arcReleaseNote !== undefined
            ? this.shaderInstance.parameters.arcReleaseNote
            : TempoSmoothingConfig.arc.releaseNote) as number;
        
        // Calculate tempo-relative time constants
        const bpm = audioData.estimatedBPM || 0;
        const attackTimeConstant = getTempoRelativeTimeConstant(
            arcAttackNote,
            bpm,
            TempoSmoothingConfig.arc.attackTimeFallback
        );
        const releaseTimeConstant = getTempoRelativeTimeConstant(
            arcReleaseNote,
            bpm,
            TempoSmoothingConfig.arc.releaseTimeFallback
        );
        
        // Apply smoothing to each band
        for (let i = 0; i < measuredBands; i++) {
            // Smooth left channel
            this.smoothing.smoothedLeftBands![i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedLeftBands![i],
                bandData.leftBands[i],
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
            );
            
            // Smooth right channel
            this.smoothing.smoothedRightBands![i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedRightBands![i],
                bandData.rightBands[i],
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
            );
        }
        
        // Create texture data using shared utility
        const leftRightData = FrequencyTextureCalculator.createTextureData(
            this.smoothing.smoothedLeftBands!,
            this.smoothing.smoothedRightBands!
        );
        
        // Create or update texture using texture manager
        const textureManager = this.shaderInstance?.textureManager;
        if (textureManager && this.shaderInstance?.uniformLocations) {
            const result = textureManager.createFrequencyTexture(
                leftRightData, 
                measuredBands,
                'arc_leftRight'
            );
            this.frequencyTextures.leftRight = result.texture;
            
            // Bind texture to its allocated unit and set uniform
            const unit = textureManager.bindTextureByKey(result.texture, 'arc_leftRight');
            if (this.shaderInstance.uniformLocations.uFrequencyTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uFrequencyTexture, unit);
            }
        }
        
        // Set measured bands uniform
        if (this.shaderInstance.uniformLocations.uMeasuredBands) {
            gl.uniform1f(this.shaderInstance.uniformLocations.uMeasuredBands, measuredBands);
        }
        
        // Set visual bands uniform
        const visualBands = (this.shaderInstance.parameters.numBands || 64) as number;
        if (this.shaderInstance.uniformLocations.uNumBands) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uNumBands, visualBands);
        }
    }
    
    /**
     * Update shader-specific uniforms
     */
    onUpdateUniforms(audioData: ExtendedAudioData | null, _colors: ColorMap | null, deltaTime: number): void {
        if (!this.uniformHelper) return;
        
        const params = this.shaderInstance.parameters;
        const helper = this.uniformHelper;
        
        // OPTIMIZATION: Only update uniforms when values change (Phase 3.1)
        // ========================================================================
        // Arc Parameters
        // ========================================================================
        if (this._lastParams.baseRadius !== params.baseRadius) {
            helper.updateFloat('uBaseRadius', params.baseRadius as number | undefined, 0.3);
            this._lastParams.baseRadius = params.baseRadius;
        }
        if (this._lastParams.maxRadiusOffset !== params.maxRadiusOffset) {
            helper.updateFloat('uMaxRadiusOffset', params.maxRadiusOffset as number | undefined, 0.2);
            this._lastParams.maxRadiusOffset = params.maxRadiusOffset;
        }
        if (this._lastParams.centerX !== params.centerX) {
            helper.updateFloat('uCenterX', params.centerX as number | undefined, 0.5);
            this._lastParams.centerX = params.centerX;
        }
        if (this._lastParams.centerY !== params.centerY) {
            helper.updateFloat('uCenterY', params.centerY as number | undefined, 0.5);
            this._lastParams.centerY = params.centerY;
        }
        // ========================================================================
        // Color Parameters
        // ========================================================================
        if (this._lastParams.colorTransitionWidth !== params.colorTransitionWidth) {
            helper.updateFloat('uColorTransitionWidth', params.colorTransitionWidth as number | undefined, 0.003);
            this._lastParams.colorTransitionWidth = params.colorTransitionWidth;
        }
        if (this._lastParams.arcColorTransitionWidth !== params.arcColorTransitionWidth) {
            helper.updateFloat('uArcColorTransitionWidth', params.arcColorTransitionWidth as number | undefined, 0.01);
            this._lastParams.arcColorTransitionWidth = params.arcColorTransitionWidth;
        }
        if (this._lastParams.colorSmoothing !== params.colorSmoothing) {
            helper.updateFloat('uColorSmoothing', params.colorSmoothing as number | undefined, 1.0);
            this._lastParams.colorSmoothing = params.colorSmoothing;
        }
        if (this._lastParams.colorSmoothingRadius !== params.colorSmoothingRadius) {
            helper.updateFloat('uColorSmoothingRadius', params.colorSmoothingRadius as number | undefined, 2.0);
            this._lastParams.colorSmoothingRadius = params.colorSmoothingRadius;
        }
        if (this._lastParams.cornerRoundSize !== params.cornerRoundSize) {
            helper.updateFloat('uCornerRoundSize', params.cornerRoundSize as number | undefined, 0.25);
            this._lastParams.cornerRoundSize = params.cornerRoundSize;
        }
        if (this._lastParams.maskBorderWidth !== params.maskBorderWidth) {
            helper.updateFloat('uMaskBorderWidth', params.maskBorderWidth as number | undefined, 0.005);
            this._lastParams.maskBorderWidth = params.maskBorderWidth;
        }
        if (this._lastParams.maskBorderNoiseSpeed !== params.maskBorderNoiseSpeed) {
            helper.updateFloat('uMaskBorderNoiseSpeed', params.maskBorderNoiseSpeed as number | undefined, 0.1);
            this._lastParams.maskBorderNoiseSpeed = params.maskBorderNoiseSpeed;
        }
        if (this._lastParams.maskBorderInnerFeathering !== params.maskBorderInnerFeathering) {
            helper.updateFloat('uMaskBorderInnerFeathering', params.maskBorderInnerFeathering as number | undefined, 0.002);
            this._lastParams.maskBorderInnerFeathering = params.maskBorderInnerFeathering;
        }
        if (this._lastParams.maskBorderOuterFeathering !== params.maskBorderOuterFeathering) {
            helper.updateFloat('uMaskBorderOuterFeathering', params.maskBorderOuterFeathering as number | undefined, 0.002);
            this._lastParams.maskBorderOuterFeathering = params.maskBorderOuterFeathering;
        }
        if (this._lastParams.maskBorderNoiseMultiplier !== params.maskBorderNoiseMultiplier) {
            helper.updateFloat('uMaskBorderNoiseMultiplier', params.maskBorderNoiseMultiplier as number | undefined, 1.0);
            this._lastParams.maskBorderNoiseMultiplier = params.maskBorderNoiseMultiplier;
        }
        if (this._lastParams.arcBorderWidth !== params.arcBorderWidth) {
            helper.updateFloat('uArcBorderWidth', params.arcBorderWidth as number | undefined, 0.01);
            this._lastParams.arcBorderWidth = params.arcBorderWidth;
        }
        if (this._lastParams.arcBorderNoiseSpeed !== params.arcBorderNoiseSpeed) {
            helper.updateFloat('uArcBorderNoiseSpeed', params.arcBorderNoiseSpeed as number | undefined, 0.5);
            this._lastParams.arcBorderNoiseSpeed = params.arcBorderNoiseSpeed;
        }
        if (this._lastParams.arcBorderInnerFeathering !== params.arcBorderInnerFeathering) {
            helper.updateFloat('uArcBorderInnerFeathering', params.arcBorderInnerFeathering as number | undefined, 0.002);
            this._lastParams.arcBorderInnerFeathering = params.arcBorderInnerFeathering;
        }
        if (this._lastParams.arcBorderOuterFeathering !== params.arcBorderOuterFeathering) {
            helper.updateFloat('uArcBorderOuterFeathering', params.arcBorderOuterFeathering as number | undefined, 0.002);
            this._lastParams.arcBorderOuterFeathering = params.arcBorderOuterFeathering;
        }
        if (this._lastParams.arcBorderNoiseMultiplier !== params.arcBorderNoiseMultiplier) {
            helper.updateFloat('uArcBorderNoiseMultiplier', params.arcBorderNoiseMultiplier as number | undefined, 1.0);
            this._lastParams.arcBorderNoiseMultiplier = params.arcBorderNoiseMultiplier;
        }
        if (this._lastParams.borderNoiseBlur !== params.borderNoiseBlur) {
            helper.updateFloat('uBorderNoiseBlur', params.borderNoiseBlur as number | undefined, 0.0);
            this._lastParams.borderNoiseBlur = params.borderNoiseBlur;
        }
        
        // ========================================================================
        // Distortion Parameters
        // ========================================================================
        if (this._lastParams.distortionStrength !== params.distortionStrength) {
            helper.updateFloat('uDistortionStrength', params.distortionStrength as number | undefined, 0.0);
            this._lastParams.distortionStrength = params.distortionStrength;
        }
        if (this._lastParams.distortionSize !== params.distortionSize) {
            helper.updateFloat('uDistortionSize', params.distortionSize as number | undefined, 1.2);
            this._lastParams.distortionSize = params.distortionSize;
        }
        if (this._lastParams.distortionFalloff !== params.distortionFalloff) {
            helper.updateFloat('uDistortionFalloff', params.distortionFalloff as number | undefined, 2.0);
            this._lastParams.distortionFalloff = params.distortionFalloff;
        }
        if (this._lastParams.distortionPerspectiveStrength !== params.distortionPerspectiveStrength) {
            helper.updateFloat('uDistortionPerspectiveStrength', params.distortionPerspectiveStrength as number | undefined, 1.0);
            this._lastParams.distortionPerspectiveStrength = params.distortionPerspectiveStrength;
        }
        if (this._lastParams.distortionEasing !== params.distortionEasing) {
            helper.updateFloat('uDistortionEasing', params.distortionEasing as number | undefined, 1.0);
            this._lastParams.distortionEasing = params.distortionEasing;
        }
        
        
        // ========================================================================
        // Dynamic Parameters (Audio-Reactive)
        // ========================================================================
        // Calculate dynamic mask radius based on bass triggers
        const baseMaskRadius = (params.maskRadius as number | undefined) || 0.0;
        const maxMaskRadius = (params.maxMaskRadius as number | undefined) || 0.15;
        
        if (audioData && maxMaskRadius > baseMaskRadius) {
            // Get attack/release note values from config
            const maskAttackNote = (params.maskAttackNote !== undefined
                ? params.maskAttackNote
                : 1.0 / 64.0) as number;
            const maskReleaseNote = (params.maskReleaseNote !== undefined
                ? params.maskReleaseNote
                : 1.0 / 8.0) as number;
            
            // Calculate tempo-relative time constants
            const bpm = audioData.estimatedBPM || 0;
            const attackTimeConstant = getTempoRelativeTimeConstant(
                maskAttackNote,
                bpm,
                10.0 // milliseconds fallback
            );
            const releaseTimeConstant = getTempoRelativeTimeConstant(
                maskReleaseNote,
                bpm,
                100.0 // milliseconds fallback
            );
            
            // Use peakBass for more dramatic response to beats, fallback to bass
            const bassIntensity = audioData.peakBass || audioData.bass || 0.0;
            
            // Calculate target mask radius: base + (bass * expansion range)
            const expansionRange = maxMaskRadius - baseMaskRadius;
            const targetMaskRadius = baseMaskRadius + bassIntensity * expansionRange;
            
            // Apply tempo-relative smoothing
            this.smoothing.smoothedMaskRadius = applyTempoRelativeSmoothing(
                this.smoothing.smoothedMaskRadius,
                targetMaskRadius,
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
            );
            
            helper.updateFloat('uMaskRadius', this.smoothing.smoothedMaskRadius, baseMaskRadius);
        } else {
            // No audio or no expansion: use base mask radius
            helper.updateFloat('uMaskRadius', baseMaskRadius, 0.0);
            this.smoothing.smoothedMaskRadius = baseMaskRadius;
        }
        
        // ========================================================================
        // Contrast Parameters
        // ========================================================================
        if (this._lastParams.contrast !== params.contrast) {
            helper.updateFloat('uContrast', params.contrast as number | undefined, 1.0);
            this._lastParams.contrast = params.contrast;
        }
        if (this._lastParams.contrastAudioReactive !== params.contrastAudioReactive) {
            helper.updateFloat('uContrastAudioReactive', params.contrastAudioReactive as number | undefined, 0.0);
            this._lastParams.contrastAudioReactive = params.contrastAudioReactive;
        }
        if (this._lastParams.contrastMin !== params.contrastMin) {
            helper.updateFloat('uContrastMin', params.contrastMin as number | undefined, 1.0);
            this._lastParams.contrastMin = params.contrastMin;
        }
        if (this._lastParams.contrastMax !== params.contrastMax) {
            helper.updateFloat('uContrastMax', params.contrastMax as number | undefined, 1.35);
            this._lastParams.contrastMax = params.contrastMax;
        }
        if (this._lastParams.contrastMaskEnabled !== params.contrastMaskEnabled) {
            helper.updateFloat('uContrastMaskEnabled', params.contrastMaskEnabled as number | undefined, 1.0);
            this._lastParams.contrastMaskEnabled = params.contrastMaskEnabled;
        }
        if (this._lastParams.contrastMaskStartDistance !== params.contrastMaskStartDistance) {
            helper.updateFloat('uContrastMaskStartDistance', params.contrastMaskStartDistance as number | undefined, 0.0);
            this._lastParams.contrastMaskStartDistance = params.contrastMaskStartDistance;
        }
        if (this._lastParams.contrastMaskFeathering !== params.contrastMaskFeathering) {
            helper.updateFloat('uContrastMaskFeathering', params.contrastMaskFeathering as number | undefined, 0.2);
            this._lastParams.contrastMaskFeathering = params.contrastMaskFeathering;
        }
        
        // ========================================================================
        // Dither Parameters
        // ========================================================================
        if (this._lastParams.ditherMinThreshold !== params.ditherMinThreshold) {
            helper.updateFloat('uDitherMinThreshold', params.ditherMinThreshold as number | undefined, 0.5);
            this._lastParams.ditherMinThreshold = params.ditherMinThreshold;
        }
        if (this._lastParams.ditherMinStrength !== params.ditherMinStrength) {
            helper.updateFloat('uDitherMinStrength', params.ditherMinStrength as number | undefined, 0.5);
            this._lastParams.ditherMinStrength = params.ditherMinStrength;
        }
        if (this._lastParams.ditherMaxStrength !== params.ditherMaxStrength) {
            helper.updateFloat('uDitherMaxStrength', params.ditherMaxStrength as number | undefined, 1.0);
            this._lastParams.ditherMaxStrength = params.ditherMaxStrength;
        }
        if (this._lastParams.ditherSize !== params.ditherSize) {
            helper.updateFloat('uDitherSize', params.ditherSize as number | undefined, 50.0);
            this._lastParams.ditherSize = params.ditherSize;
        }
        
        // ========================================================================
        // Background Parameters
        // ========================================================================
        if (this._lastParams.backgroundEnabled !== params.backgroundEnabled) {
            helper.updateFloat('uBackgroundEnabled', params.backgroundEnabled as number | undefined, 1.0);
            this._lastParams.backgroundEnabled = params.backgroundEnabled;
        }
        if (this._lastParams.backgroundIntensity !== params.backgroundIntensity) {
            helper.updateFloat('uBackgroundIntensity', params.backgroundIntensity as number | undefined, 0.3);
            this._lastParams.backgroundIntensity = params.backgroundIntensity;
        }
        if (this._lastParams.backgroundBassThreshold !== params.backgroundBassThreshold) {
            helper.updateFloat('uBackgroundBassThreshold', params.backgroundBassThreshold as number | undefined, 0.3);
            this._lastParams.backgroundBassThreshold = params.backgroundBassThreshold;
        }
        if (this._lastParams.backgroundBassSensitivity !== params.backgroundBassSensitivity) {
            helper.updateFloat('uBackgroundBassSensitivity', params.backgroundBassSensitivity as number | undefined, 2.0);
            this._lastParams.backgroundBassSensitivity = params.backgroundBassSensitivity;
        }
        if (this._lastParams.backgroundNoiseScale !== params.backgroundNoiseScale) {
            helper.updateFloat('uBackgroundNoiseScale', params.backgroundNoiseScale as number | undefined, 0.8);
            this._lastParams.backgroundNoiseScale = params.backgroundNoiseScale;
        }
        if (this._lastParams.backgroundNoiseSpeed !== params.backgroundNoiseSpeed) {
            helper.updateFloat('uBackgroundNoiseSpeed', params.backgroundNoiseSpeed as number | undefined, 0.3);
            this._lastParams.backgroundNoiseSpeed = params.backgroundNoiseSpeed;
        }
        if (this._lastParams.backgroundDistortionStrength !== params.backgroundDistortionStrength) {
            helper.updateFloat('uBackgroundDistortionStrength', params.backgroundDistortionStrength as number | undefined, 0.15);
            this._lastParams.backgroundDistortionStrength = params.backgroundDistortionStrength;
        }
        if (this._lastParams.backgroundFrequencyReactivity !== params.backgroundFrequencyReactivity) {
            helper.updateFloat('uBackgroundFrequencyReactivity', params.backgroundFrequencyReactivity as number | undefined, 0.5);
            this._lastParams.backgroundFrequencyReactivity = params.backgroundFrequencyReactivity;
        }
        if (this._lastParams.backgroundStereoPan !== params.backgroundStereoPan) {
            helper.updateFloat('uBackgroundStereoPan', params.backgroundStereoPan as number | undefined, 0.3);
            this._lastParams.backgroundStereoPan = params.backgroundStereoPan;
        }
        if (this._lastParams.backgroundBlur !== params.backgroundBlur) {
            helper.updateFloat('uBackgroundBlur', params.backgroundBlur as number | undefined, 0.5);
            this._lastParams.backgroundBlur = params.backgroundBlur;
        }
        if (this._lastParams.backgroundDitherEnabled !== params.backgroundDitherEnabled) {
            helper.updateFloat('uBackgroundDitherEnabled', params.backgroundDitherEnabled as number | undefined, 1.0);
            this._lastParams.backgroundDitherEnabled = params.backgroundDitherEnabled;
        }
        if (this._lastParams.backgroundDitherMinThreshold !== params.backgroundDitherMinThreshold) {
            helper.updateFloat('uBackgroundDitherMinThreshold', params.backgroundDitherMinThreshold as number | undefined, 0.3);
            this._lastParams.backgroundDitherMinThreshold = params.backgroundDitherMinThreshold;
        }
        if (this._lastParams.backgroundDitherMinStrength !== params.backgroundDitherMinStrength) {
            helper.updateFloat('uBackgroundDitherMinStrength', params.backgroundDitherMinStrength as number | undefined, 0.0);
            this._lastParams.backgroundDitherMinStrength = params.backgroundDitherMinStrength;
        }
        if (this._lastParams.backgroundDitherMaxStrength !== params.backgroundDitherMaxStrength) {
            helper.updateFloat('uBackgroundDitherMaxStrength', params.backgroundDitherMaxStrength as number | undefined, 1.0);
            this._lastParams.backgroundDitherMaxStrength = params.backgroundDitherMaxStrength;
        }
        if (this._lastParams.backgroundDitherSize !== params.backgroundDitherSize) {
            helper.updateFloat('uBackgroundDitherSize', params.backgroundDitherSize as number | undefined, 24.0);
            this._lastParams.backgroundDitherSize = params.backgroundDitherSize;
        }
        if (this._lastParams.backgroundDitherBassReactivity !== params.backgroundDitherBassReactivity) {
            helper.updateFloat('uBackgroundDitherBassReactivity', params.backgroundDitherBassReactivity as number | undefined, 1.0);
            this._lastParams.backgroundDitherBassReactivity = params.backgroundDitherBassReactivity;
        }
        if (this._lastParams.backgroundFadeEnabled !== params.backgroundFadeEnabled) {
            helper.updateFloat('uBackgroundFadeEnabled', params.backgroundFadeEnabled as number | undefined, 1.0);
            this._lastParams.backgroundFadeEnabled = params.backgroundFadeEnabled;
        }
        if (this._lastParams.backgroundFadeStartDistance !== params.backgroundFadeStartDistance) {
            helper.updateFloat('uBackgroundFadeStartDistance', params.backgroundFadeStartDistance as number | undefined, 0.0);
            this._lastParams.backgroundFadeStartDistance = params.backgroundFadeStartDistance;
        }
        if (this._lastParams.backgroundFadeFeathering !== params.backgroundFadeFeathering) {
            helper.updateFloat('uBackgroundFadeFeathering', params.backgroundFadeFeathering as number | undefined, 0.15);
            this._lastParams.backgroundFadeFeathering = params.backgroundFadeFeathering;
        }
        
        // ========================================================================
        // Center Sphere Parameters
        // ========================================================================
        if (this._lastParams.centerSphereEnabled !== params.centerSphereEnabled) {
            helper.updateFloat('uCenterSphereEnabled', params.centerSphereEnabled as number | undefined, 1.0);
            this._lastParams.centerSphereEnabled = params.centerSphereEnabled;
        }
        if (this._lastParams.centerSphereBaseRadius !== params.centerSphereBaseRadius) {
            helper.updateFloat('uCenterSphereBaseRadius', params.centerSphereBaseRadius as number | undefined, 0.01);
            this._lastParams.centerSphereBaseRadius = params.centerSphereBaseRadius;
        }
        if (this._lastParams.centerSphereMaxRadius !== params.centerSphereMaxRadius) {
            helper.updateFloat('uCenterSphereMaxRadius', params.centerSphereMaxRadius as number | undefined, 0.15);
            this._lastParams.centerSphereMaxRadius = params.centerSphereMaxRadius;
        }
        if (this._lastParams.centerSphereSizeThreshold !== params.centerSphereSizeThreshold) {
            helper.updateFloat('uCenterSphereSizeThreshold', params.centerSphereSizeThreshold as number | undefined, 0.2);
            this._lastParams.centerSphereSizeThreshold = params.centerSphereSizeThreshold;
        }
        if (this._lastParams.centerSphereBassWeight !== params.centerSphereBassWeight) {
            helper.updateFloat('uCenterSphereBassWeight', params.centerSphereBassWeight as number | undefined, 0.7);
            this._lastParams.centerSphereBassWeight = params.centerSphereBassWeight;
        }
        if (this._lastParams.centerSphereCoreSize !== params.centerSphereCoreSize) {
            helper.updateFloat('uCenterSphereCoreSize', params.centerSphereCoreSize as number | undefined, 0.6);
            this._lastParams.centerSphereCoreSize = params.centerSphereCoreSize;
        }
        if (this._lastParams.centerSphereGlowSize !== params.centerSphereGlowSize) {
            helper.updateFloat('uCenterSphereGlowSize', params.centerSphereGlowSize as number | undefined, 1.5);
            this._lastParams.centerSphereGlowSize = params.centerSphereGlowSize;
        }
        if (this._lastParams.centerSphereGlowIntensity !== params.centerSphereGlowIntensity) {
            helper.updateFloat('uCenterSphereGlowIntensity', params.centerSphereGlowIntensity as number | undefined, 0.5);
            this._lastParams.centerSphereGlowIntensity = params.centerSphereGlowIntensity;
        }
        if (this._lastParams.centerSphereGlowFalloff !== params.centerSphereGlowFalloff) {
            helper.updateFloat('uCenterSphereGlowFalloff', params.centerSphereGlowFalloff as number | undefined, 3.0);
            this._lastParams.centerSphereGlowFalloff = params.centerSphereGlowFalloff;
        }
        if (this._lastParams.centerSphereBaseBrightness !== params.centerSphereBaseBrightness) {
            helper.updateFloat('uCenterSphereBaseBrightness', params.centerSphereBaseBrightness as number | undefined, 0.3);
            this._lastParams.centerSphereBaseBrightness = params.centerSphereBaseBrightness;
        }
        if (this._lastParams.centerSphereBrightnessRange !== params.centerSphereBrightnessRange) {
            helper.updateFloat('uCenterSphereBrightnessRange', params.centerSphereBrightnessRange as number | undefined, 0.7);
            this._lastParams.centerSphereBrightnessRange = params.centerSphereBrightnessRange;
        }
        if (this._lastParams.centerSphereNoiseEnabled !== params.centerSphereNoiseEnabled) {
            helper.updateFloat('uCenterSphereNoiseEnabled', params.centerSphereNoiseEnabled as number | undefined, 0.0);
            this._lastParams.centerSphereNoiseEnabled = params.centerSphereNoiseEnabled;
        }
        if (this._lastParams.centerSphereNoiseScale !== params.centerSphereNoiseScale) {
            helper.updateFloat('uCenterSphereNoiseScale', params.centerSphereNoiseScale as number | undefined, 5.0);
            this._lastParams.centerSphereNoiseScale = params.centerSphereNoiseScale;
        }
        if (this._lastParams.centerSphereNoiseSpeed !== params.centerSphereNoiseSpeed) {
            helper.updateFloat('uCenterSphereNoiseSpeed', params.centerSphereNoiseSpeed as number | undefined, 0.5);
            this._lastParams.centerSphereNoiseSpeed = params.centerSphereNoiseSpeed;
        }
        if (this._lastParams.centerSphereNoiseAmount !== params.centerSphereNoiseAmount) {
            helper.updateFloat('uCenterSphereNoiseAmount', params.centerSphereNoiseAmount as number | undefined, 0.1);
            this._lastParams.centerSphereNoiseAmount = params.centerSphereNoiseAmount;
        }
        if (this._lastParams.centerSphere3DEnabled !== params.centerSphere3DEnabled) {
            helper.updateFloat('uCenterSphere3DEnabled', params.centerSphere3DEnabled as number | undefined, 1.0);
            this._lastParams.centerSphere3DEnabled = params.centerSphere3DEnabled;
        }
        if (this._lastParams.centerSphere3DStrength !== params.centerSphere3DStrength) {
            helper.updateFloat('uCenterSphere3DStrength', params.centerSphere3DStrength as number | undefined, 0.3);
            this._lastParams.centerSphere3DStrength = params.centerSphere3DStrength;
        }
        
        // Smooth sphere brightness (voice-reactive: uses uMid)
        if (audioData) {
            const rawTargetBrightness = audioData.mid || 0.0;
            
            // Apply compression curve: compress large changes, expand small changes
            const compression = (params.centerSphereBrightnessCompression !== undefined
                ? params.centerSphereBrightnessCompression : 0.5) as number;
            
            let targetBrightness = rawTargetBrightness;
            if (compression > 0.001) {
                // Calculate delta (rate of change) from current smoothed value
                const currentValue = this.smoothing.smoothedSphereBrightness;
                const delta = rawTargetBrightness - currentValue;
                const absDelta = Math.abs(delta);
                
                // Apply compression curve to delta:
                // - Small deltas: expand (more nuanced response to gradual changes)
                // - Large deltas: compress (less reactive to big jumps)
                // Use inverse power curve: compressedDelta = sign(delta) * pow(absDelta, 1.0 / (1.0 + compression))
                // When compression = 0: pow(absDelta, 1.0) = linear (no change)
                // When compression = 1: pow(absDelta, 0.5) = square root (expands small, compresses large)
                // Higher compression: more expansion of small values, more compression of large values
                const power = 1.0 / (1.0 + compression);
                const compressedAbsDelta = Math.pow(absDelta, power);
                const compressedDelta = delta >= 0 ? compressedAbsDelta : -compressedAbsDelta;
                
                // Apply compressed delta to current value
                targetBrightness = currentValue + compressedDelta;
                targetBrightness = Math.max(0, Math.min(1, targetBrightness));
            }
            
            const brightnessAttackNote = (params.centerSphereBrightnessAttackNote !== undefined
                ? params.centerSphereBrightnessAttackNote
                : 1.0 / 64.0) as number;
            const brightnessReleaseNote = (params.centerSphereBrightnessReleaseNote !== undefined
                ? params.centerSphereBrightnessReleaseNote
                : 1.0 / 2.0) as number;
            
            const bpm = audioData.estimatedBPM || 0;
            const brightnessAttackTime = getTempoRelativeTimeConstant(
                brightnessAttackNote,
                bpm,
                10.0 // milliseconds fallback
            );
            const brightnessReleaseTime = getTempoRelativeTimeConstant(
                brightnessReleaseNote,
                bpm,
                200.0 // milliseconds fallback (slow release)
            );
            
            this.smoothing.smoothedSphereBrightness = applyTempoRelativeSmoothing(
                this.smoothing.smoothedSphereBrightness,
                targetBrightness,
                deltaTime,
                brightnessAttackTime,
                brightnessReleaseTime
            );
            
            helper.updateFloat('uSmoothedSphereBrightness', this.smoothing.smoothedSphereBrightness, 0.0);
            
            // Smooth brightness multiplier (same signal and attack/release as brightness)
            const brightnessMultiplierBase = (params.centerSphereBrightnessMultiplier !== undefined
                ? params.centerSphereBrightnessMultiplier : 1.0) as number;
            const brightnessMultiplierRange = (params.centerSphereBrightnessMultiplierRange !== undefined
                ? params.centerSphereBrightnessMultiplierRange : 1.0) as number;
            
            // Use same smoothed brightness value to drive multiplier
            const targetBrightnessMultiplier = brightnessMultiplierBase + this.smoothing.smoothedSphereBrightness * brightnessMultiplierRange;
            
            // Apply same attack/release smoothing as brightness
            this.smoothing.smoothedSphereBrightnessMultiplier = applyTempoRelativeSmoothing(
                this.smoothing.smoothedSphereBrightnessMultiplier,
                targetBrightnessMultiplier,
                deltaTime,
                brightnessAttackTime,
                brightnessReleaseTime
            );
            
            helper.updateFloat('uSmoothedSphereBrightnessMultiplier', this.smoothing.smoothedSphereBrightnessMultiplier, brightnessMultiplierBase);
            
            // Smooth hue shift (same signal and attack/release as brightness)
            const hueShiftBase = (params.centerSphereHueShift !== undefined
                ? params.centerSphereHueShift : 0.0) as number;
            const hueShiftRange = (params.centerSphereHueShiftRange !== undefined
                ? params.centerSphereHueShiftRange : 60.0) as number;
            
            // Use same smoothed brightness value to drive hue shift
            // Map brightness (0-1) to hue shift range (-range/2 to +range/2)
            const targetHueShift = hueShiftBase + (this.smoothing.smoothedSphereBrightness - 0.5) * hueShiftRange;
            
            // Apply same attack/release smoothing as brightness
            this.smoothing.smoothedSphereHueShift = applyTempoRelativeSmoothing(
                this.smoothing.smoothedSphereHueShift,
                targetHueShift,
                deltaTime,
                brightnessAttackTime,
                brightnessReleaseTime
            );
            
            helper.updateFloat('uSmoothedSphereHueShift', this.smoothing.smoothedSphereHueShift, hueShiftBase);
        } else {
            this.smoothing.smoothedSphereBrightness = 0.0;
            helper.updateFloat('uSmoothedSphereBrightness', 0.0, 0.0);
            
            const brightnessMultiplierBase = (params.centerSphereBrightnessMultiplier !== undefined
                ? params.centerSphereBrightnessMultiplier : 1.0) as number;
            this.smoothing.smoothedSphereBrightnessMultiplier = brightnessMultiplierBase;
            helper.updateFloat('uSmoothedSphereBrightnessMultiplier', brightnessMultiplierBase, 1.0);
            
            const hueShiftBase = (params.centerSphereHueShift !== undefined
                ? params.centerSphereHueShift : 0.0) as number;
            this.smoothing.smoothedSphereHueShift = hueShiftBase;
            helper.updateFloat('uSmoothedSphereHueShift', hueShiftBase, 0.0);
        }
        
        // Smooth sphere size from volume
        if (audioData) {
            const targetSizeVolume = audioData.volume || 0.0;
            
            const sizeVolumeAttackNote = (params.centerSphereSizeVolumeAttackNote !== undefined
                ? params.centerSphereSizeVolumeAttackNote
                : 1.0 / 32.0) as number;
            const sizeVolumeReleaseNote = (params.centerSphereSizeVolumeReleaseNote !== undefined
                ? params.centerSphereSizeVolumeReleaseNote
                : 1.0 / 4.0) as number;
            
            const bpm = audioData.estimatedBPM || 0;
            const sizeVolumeAttackTime = getTempoRelativeTimeConstant(
                sizeVolumeAttackNote,
                bpm,
                20.0 // milliseconds fallback
            );
            const sizeVolumeReleaseTime = getTempoRelativeTimeConstant(
                sizeVolumeReleaseNote,
                bpm,
                150.0 // milliseconds fallback
            );
            
            this.smoothing.smoothedSphereSizeVolume = applyTempoRelativeSmoothing(
                this.smoothing.smoothedSphereSizeVolume,
                targetSizeVolume,
                deltaTime,
                sizeVolumeAttackTime,
                sizeVolumeReleaseTime
            );
            
            helper.updateFloat('uSmoothedSphereSizeVolume', this.smoothing.smoothedSphereSizeVolume, 0.0);
        } else {
            this.smoothing.smoothedSphereSizeVolume = 0.0;
            helper.updateFloat('uSmoothedSphereSizeVolume', 0.0, 0.0);
        }
        
        // Smooth sphere size from bass (subtle boost)
        if (audioData) {
            const targetSizeBass = audioData.bass || 0.0;
            
            const sizeBassAttackNote = (params.centerSphereSizeBassAttackNote !== undefined
                ? params.centerSphereSizeBassAttackNote
                : 1.0 / 32.0) as number;
            const sizeBassReleaseNote = (params.centerSphereSizeBassReleaseNote !== undefined
                ? params.centerSphereSizeBassReleaseNote
                : 1.0 / 4.0) as number;
            
            const bpm = audioData.estimatedBPM || 0;
            const sizeBassAttackTime = getTempoRelativeTimeConstant(
                sizeBassAttackNote,
                bpm,
                20.0 // milliseconds fallback
            );
            const sizeBassReleaseTime = getTempoRelativeTimeConstant(
                sizeBassReleaseNote,
                bpm,
                150.0 // milliseconds fallback
            );
            
            this.smoothing.smoothedSphereSizeBass = applyTempoRelativeSmoothing(
                this.smoothing.smoothedSphereSizeBass,
                targetSizeBass,
                deltaTime,
                sizeBassAttackTime,
                sizeBassReleaseTime
            );
            
            helper.updateFloat('uSmoothedSphereSizeBass', this.smoothing.smoothedSphereSizeBass, 0.0);
        } else {
            this.smoothing.smoothedSphereSizeBass = 0.0;
            helper.updateFloat('uSmoothedSphereSizeBass', 0.0, 0.0);
        }
        
        // ========================================================================
        // Center Sphere Advanced Parameters
        // ========================================================================
        if (this._lastParams.centerSphereBassSizeMultiplier !== params.centerSphereBassSizeMultiplier) {
            helper.updateFloat('uCenterSphereBassSizeMultiplier', params.centerSphereBassSizeMultiplier as number | undefined, 0.2);
            this._lastParams.centerSphereBassSizeMultiplier = params.centerSphereBassSizeMultiplier;
        }
        if (this._lastParams.centerSphereBrightnessMidThreshold !== params.centerSphereBrightnessMidThreshold) {
            helper.updateFloat('uCenterSphereBrightnessMidThreshold', params.centerSphereBrightnessMidThreshold as number | undefined, 0.5);
            this._lastParams.centerSphereBrightnessMidThreshold = params.centerSphereBrightnessMidThreshold;
        }
        if (this._lastParams.centerSphereBrightnessFullThreshold !== params.centerSphereBrightnessFullThreshold) {
            helper.updateFloat('uCenterSphereBrightnessFullThreshold', params.centerSphereBrightnessFullThreshold as number | undefined, 0.8);
            this._lastParams.centerSphereBrightnessFullThreshold = params.centerSphereBrightnessFullThreshold;
        }
        if (this._lastParams.centerSphereBrightnessCompression !== params.centerSphereBrightnessCompression) {
            helper.updateFloat('uCenterSphereBrightnessCompression', params.centerSphereBrightnessCompression as number | undefined, 0.5);
            this._lastParams.centerSphereBrightnessCompression = params.centerSphereBrightnessCompression;
        }
        if (this._lastParams.centerSphereBrightnessMultiplier !== params.centerSphereBrightnessMultiplier) {
            helper.updateFloat('uCenterSphereBrightnessMultiplier', params.centerSphereBrightnessMultiplier as number | undefined, 1.0);
            this._lastParams.centerSphereBrightnessMultiplier = params.centerSphereBrightnessMultiplier;
        }
        if (this._lastParams.centerSphereBrightnessMultiplierRange !== params.centerSphereBrightnessMultiplierRange) {
            helper.updateFloat('uCenterSphereBrightnessMultiplierRange', params.centerSphereBrightnessMultiplierRange as number | undefined, 1.0);
            this._lastParams.centerSphereBrightnessMultiplierRange = params.centerSphereBrightnessMultiplierRange;
        }
        if (this._lastParams.centerSphereHueShift !== params.centerSphereHueShift) {
            helper.updateFloat('uCenterSphereHueShift', params.centerSphereHueShift as number | undefined, 0.0);
            this._lastParams.centerSphereHueShift = params.centerSphereHueShift;
        }
        if (this._lastParams.centerSphereHueShiftRange !== params.centerSphereHueShiftRange) {
            helper.updateFloat('uCenterSphereHueShiftRange', params.centerSphereHueShiftRange as number | undefined, 60.0);
            this._lastParams.centerSphereHueShiftRange = params.centerSphereHueShiftRange;
        }
        
        
        // ========================================================================
        // Audio Smoothing (Tempo-Relative)
        // ========================================================================
        // Smooth contrast audio level for contrast modulation
        const contrastAudioReactive = (params.contrastAudioReactive as number | undefined) || 0.0;
        if (contrastAudioReactive > 0.0 && audioData) {
            // Get audio source from config
            const contrastAudioSource = (params.contrastAudioSource !== undefined 
                ? params.contrastAudioSource : 1) as number;
            
            let targetContrastAudioLevel = 0.0;
            if (contrastAudioSource === 0) {
                targetContrastAudioLevel = audioData.volume || 0;
            } else if (contrastAudioSource === 1) {
                targetContrastAudioLevel = audioData.bass || 0;
            } else if (contrastAudioSource === 2) {
                targetContrastAudioLevel = audioData.mid || 0;
            } else if (contrastAudioSource === 3) {
                targetContrastAudioLevel = audioData.treble || 0;
            }
            targetContrastAudioLevel = Math.max(0, Math.min(1, targetContrastAudioLevel));
            
            // Get attack/release note values from config
            const contrastAttackNote = (params.contrastAudioAttackNote !== undefined
                ? params.contrastAudioAttackNote
                : TempoSmoothingConfig.contrast.attackNote) as number;
            const contrastReleaseNote = (params.contrastAudioReleaseNote !== undefined
                ? params.contrastAudioReleaseNote
                : TempoSmoothingConfig.contrast.releaseNote) as number;
            
            // Calculate tempo-relative time constants
            const bpm = audioData.estimatedBPM || 0;
            const attackTimeConstant = getTempoRelativeTimeConstant(
                contrastAttackNote,
                bpm,
                TempoSmoothingConfig.contrast.attackTimeFallback
            );
            const releaseTimeConstant = getTempoRelativeTimeConstant(
                contrastReleaseNote,
                bpm,
                TempoSmoothingConfig.contrast.releaseTimeFallback
            );
            
            // Apply tempo-relative smoothing
            this.smoothing.smoothedContrastAudioLevel = applyTempoRelativeSmoothing(
                this.smoothing.smoothedContrastAudioLevel,
                targetContrastAudioLevel,
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
            );
            
            // Validate and clamp
            if (!isFinite(this.smoothing.smoothedContrastAudioLevel)) {
                this.smoothing.smoothedContrastAudioLevel = 0.0;
            }
            this.smoothing.smoothedContrastAudioLevel = Math.max(0, Math.min(1, this.smoothing.smoothedContrastAudioLevel));
            
            helper.updateFloat('uSmoothedContrastAudioLevel', this.smoothing.smoothedContrastAudioLevel, 0.0);
        } else {
            // No audio reactivity: use zero level
            this.smoothing.smoothedContrastAudioLevel = 0.0;
            helper.updateFloat('uSmoothedContrastAudioLevel', 0.0, 0.0);
        }
    }
    
    /**
     * Clean up plugin resources
     */
    onDestroy(): void {
        this.smoothing.smoothedLeftBands = null;
        this.smoothing.smoothedRightBands = null;
        this.smoothing.smoothedMaskRadius = 0.0;
        this.smoothing.smoothedContrastAudioLevel = 0.0;
        this.smoothing.smoothedSphereBrightness = 0.0;
        this.smoothing.smoothedSphereSizeVolume = 0.0;
        this.smoothing.smoothedSphereSizeBass = 0.0;
        this.smoothing.smoothedSphereBrightnessMultiplier = 1.0;
        this.smoothing.smoothedSphereHueShift = 0.0;
        this.frequencyTextures.leftRight = null;
        this.uniformHelper = null;
    }
}

