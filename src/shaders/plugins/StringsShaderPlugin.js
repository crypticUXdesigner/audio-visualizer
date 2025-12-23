// StringsShaderPlugin - Plugin for strings shader
// Handles frequency texture updates, tempo-based smoothing, and shader-specific uniforms

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';
import { FrequencyTextureCalculator } from '../utils/FrequencyTextureCalculator.js';
import { UniformUpdateHelper } from '../utils/UniformUpdateHelper.js';

export class StringsShaderPlugin extends BaseShaderPlugin {
    constructor(shaderInstance, config) {
        super(shaderInstance, config);
        
        // Smoothing state for strings shader
        this.smoothing = {
            smoothedLeftBands: null,
            smoothedRightBands: null,
            smoothedHeightLeftBands: null,
            smoothedHeightRightBands: null,
            smoothedNoiseAudioLevel: 0.0,
            smoothedContrastAudioLevel: 0.0
        };
        
        // Frequency textures
        this.frequencyTextures = {
            leftRight: null,
            height: null
        };
        
        this._measuredBands = 24;
        
        // Initialize uniform update helper (will be set in onInit after shaderInstance is ready)
        this.uniformHelper = null;
    }
    
    onInit() {
        // Initialize uniform update helper
        this.uniformHelper = new UniformUpdateHelper(
            this.shaderInstance.gl,
            this.shaderInstance.uniformLocations,
            this.shaderInstance._lastUniformValues
        );
        // Apply adaptive numBands for strings shader on mobile devices
        if (this.shaderInstance.parameters.numBands !== undefined) {
            this.shaderInstance.parameters.numBands = this.shaderInstance.getAdaptiveNumBands(
                this.shaderInstance.parameters.numBands
            );
        }
    }
    
    getSmoothingState() {
        return this.smoothing;
    }
    
    /**
     * Update frequency textures for strings shader
     */
    onUpdateTextures(audioData, deltaTime) {
        if (!audioData || !audioData.audioContext) return;
        if (!this.shaderInstance || !this.shaderInstance.gl) return;
        
        const gl = this.shaderInstance.gl;
        
        // Get measured bands from config
        const measuredBands = this.shaderInstance.parameters.measuredBands !== undefined 
            ? this.shaderInstance.parameters.measuredBands 
            : (this._measuredBands || 32);
        this._measuredBands = measuredBands;
        
        // Initialize smoothed band arrays if needed
        if (!this.smoothing.smoothedLeftBands || 
            this.smoothing.smoothedLeftBands.length !== measuredBands) {
            this.smoothing.smoothedLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedRightBands = new Float32Array(measuredBands);
            this.smoothing.smoothedHeightLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedHeightRightBands = new Float32Array(measuredBands);
        }
        
        // Calculate configurable bands using shared utility
        const bandData = FrequencyTextureCalculator.calculateBands(
            audioData,
            measuredBands,
            this.shaderInstance._audioAnalyzer
        );
        
        if (!bandData) {
            return;
        }
        
        // Get attack/release note values for string swing
        const swingAttackNote = this.shaderInstance.parameters.stringSwingAttackNote !== undefined
            ? this.shaderInstance.parameters.stringSwingAttackNote
            : TempoSmoothingConfig.strings.attackNote;
        const swingReleaseNote = this.shaderInstance.parameters.stringSwingReleaseNote !== undefined
            ? this.shaderInstance.parameters.stringSwingReleaseNote
            : TempoSmoothingConfig.strings.releaseNote;
        
        // Get attack/release note values for string height
        const heightAttackNote = this.shaderInstance.parameters.stringHeightAttackNote !== undefined
            ? this.shaderInstance.parameters.stringHeightAttackNote
            : TempoSmoothingConfig.strings.attackNote;
        const heightReleaseNote = this.shaderInstance.parameters.stringHeightReleaseNote !== undefined
            ? this.shaderInstance.parameters.stringHeightReleaseNote
            : TempoSmoothingConfig.strings.releaseNote;
        
        // Calculate tempo-relative time constants
        const bpm = audioData.estimatedBPM || 0;
        const swingAttackTimeConstant = getTempoRelativeTimeConstant(
            swingAttackNote,
            bpm,
            TempoSmoothingConfig.strings.attackTimeFallback
        );
        const swingReleaseTimeConstant = getTempoRelativeTimeConstant(
            swingReleaseNote,
            bpm,
            TempoSmoothingConfig.strings.releaseTimeFallback
        );
        
        const heightAttackTimeConstant = getTempoRelativeTimeConstant(
            heightAttackNote,
            bpm,
            TempoSmoothingConfig.strings.attackTimeFallback
        );
        const heightReleaseTimeConstant = getTempoRelativeTimeConstant(
            heightReleaseNote,
            bpm,
            TempoSmoothingConfig.strings.releaseTimeFallback
        );
        
        // Apply smoothing to each band
        for (let i = 0; i < measuredBands; i++) {
            // Smooth left channel for swing
            this.smoothing.smoothedLeftBands[i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedLeftBands[i],
                bandData.leftBands[i],
                deltaTime,
                swingAttackTimeConstant,
                swingReleaseTimeConstant
            );
            
            // Smooth right channel for swing
            this.smoothing.smoothedRightBands[i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedRightBands[i],
                bandData.rightBands[i],
                deltaTime,
                swingAttackTimeConstant,
                swingReleaseTimeConstant
            );
            
            // Smooth left channel for height
            this.smoothing.smoothedHeightLeftBands[i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedHeightLeftBands[i],
                bandData.leftBands[i],
                deltaTime,
                heightAttackTimeConstant,
                heightReleaseTimeConstant
            );
            
            // Smooth right channel for height
            this.smoothing.smoothedHeightRightBands[i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedHeightRightBands[i],
                bandData.rightBands[i],
                deltaTime,
                heightAttackTimeConstant,
                heightReleaseTimeConstant
            );
        }
        
        // Create texture data using shared utility
        const leftRightData = FrequencyTextureCalculator.createTextureData(
            this.smoothing.smoothedLeftBands,
            this.smoothing.smoothedRightBands
        );
        
        // Create or update texture using texture manager
        const textureManager = this.shaderInstance?.textureManager;
        if (textureManager && this.shaderInstance?.uniformLocations) {
            const leftRightResult = textureManager.createFrequencyTexture(
                leftRightData, 
                measuredBands,
                'strings_leftRight'
            );
            this.frequencyTextures.leftRight = leftRightResult.texture;
            
            // Bind texture to its allocated unit and set uniform
            const leftRightUnit = textureManager.bindTextureByKey(leftRightResult.texture, 'strings_leftRight');
            if (this.shaderInstance.uniformLocations.uFrequencyTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uFrequencyTexture, leftRightUnit);
            }
            
            // Create separate texture for height using shared utility
            const heightData = FrequencyTextureCalculator.createTextureData(
                this.smoothing.smoothedHeightLeftBands,
                this.smoothing.smoothedHeightRightBands
            );
            
            // Create or update height texture
            const heightResult = textureManager.createFrequencyTexture(
                heightData, 
                measuredBands,
                'strings_height'
            );
            this.frequencyTextures.height = heightResult.texture;
            
            // Bind height texture to its allocated unit and set uniform
            const heightUnit = textureManager.bindTextureByKey(heightResult.texture, 'strings_height');
            if (this.shaderInstance.uniformLocations.uHeightTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uHeightTexture, heightUnit);
            }
        }
        
        // Set measured bands uniform
        if (this.shaderInstance.uniformLocations.uMeasuredBands) {
            gl.uniform1f(this.shaderInstance.uniformLocations.uMeasuredBands, measuredBands);
        }
        
        // Set visual bands uniform (use adaptive value for strings shader)
        let visualBands = this.shaderInstance.parameters.numBands || 64;
        if (this.shaderInstance.parameters.numBands !== undefined) {
            visualBands = this.shaderInstance.getAdaptiveNumBands(this.shaderInstance.parameters.numBands);
        }
        if (this.shaderInstance.uniformLocations.uNumBands) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uNumBands, visualBands);
        }
    }
    
    /**
     * Update tempo-based smoothing for noise brightness and contrast
     */
    updateSmoothing(audioData, deltaTime) {
        if (!audioData) return;
        
        const bpm = audioData.estimatedBPM || 0;
        
        // Smooth noise audio level for brightness modulation
        let targetAudioLevel = 0.0;
        const audioSource = this.shaderInstance.parameters.backgroundNoiseAudioSource !== undefined 
            ? this.shaderInstance.parameters.backgroundNoiseAudioSource : 0;
        
        if (audioSource === 0) {
            targetAudioLevel = audioData.volume || 0;
        } else if (audioSource === 1) {
            targetAudioLevel = audioData.bass || 0;
        } else if (audioSource === 2) {
            targetAudioLevel = audioData.mid || 0;
        } else if (audioSource === 3) {
            targetAudioLevel = audioData.treble || 0;
        }
        targetAudioLevel = Math.max(0, Math.min(1, targetAudioLevel));
        
        // Get attack/release from config parameters
        const noiseAttackNote = this.shaderInstance.parameters.noiseAudioAttackNote !== undefined
            ? this.shaderInstance.parameters.noiseAudioAttackNote
            : TempoSmoothingConfig.noiseBrightness.attackNote;
        const noiseReleaseNote = this.shaderInstance.parameters.noiseAudioReleaseNote !== undefined
            ? this.shaderInstance.parameters.noiseAudioReleaseNote
            : TempoSmoothingConfig.noiseBrightness.releaseNote;
        
        const attackTime = getTempoRelativeTimeConstant(
            noiseAttackNote,
            bpm,
            TempoSmoothingConfig.noiseBrightness.attackTimeFallback
        );
        const releaseTime = getTempoRelativeTimeConstant(
            noiseReleaseNote,
            bpm,
            TempoSmoothingConfig.noiseBrightness.releaseTimeFallback
        );
        
        this.smoothing.smoothedNoiseAudioLevel = applyTempoRelativeSmoothing(
            this.smoothing.smoothedNoiseAudioLevel,
            targetAudioLevel,
            deltaTime,
            attackTime,
            releaseTime
        );
        
        // Validate and clamp
        if (!isFinite(this.smoothing.smoothedNoiseAudioLevel)) {
            this.smoothing.smoothedNoiseAudioLevel = 0.0;
        }
        this.smoothing.smoothedNoiseAudioLevel = Math.max(0, Math.min(1, this.smoothing.smoothedNoiseAudioLevel));
        
        // Smooth contrast audio level for contrast modulation
        let targetContrastAudioLevel = 0.0;
        const contrastAudioSource = this.shaderInstance.parameters.contrastAudioSource !== undefined 
            ? this.shaderInstance.parameters.contrastAudioSource : 0;
        
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
        
        // Get attack/release from config parameters
        const contrastAttackNote = this.shaderInstance.parameters.contrastAudioAttackNote !== undefined
            ? this.shaderInstance.parameters.contrastAudioAttackNote
            : TempoSmoothingConfig.contrast.attackNote;
        const contrastReleaseNote = this.shaderInstance.parameters.contrastAudioReleaseNote !== undefined
            ? this.shaderInstance.parameters.contrastAudioReleaseNote
            : TempoSmoothingConfig.contrast.releaseNote;
        
        const contrastAttackTime = getTempoRelativeTimeConstant(
            contrastAttackNote,
            bpm,
            TempoSmoothingConfig.contrast.attackTimeFallback
        );
        const contrastReleaseTime = getTempoRelativeTimeConstant(
            contrastReleaseNote,
            bpm,
            TempoSmoothingConfig.contrast.releaseTimeFallback
        );
        
        this.smoothing.smoothedContrastAudioLevel = applyTempoRelativeSmoothing(
            this.smoothing.smoothedContrastAudioLevel,
            targetContrastAudioLevel,
            deltaTime,
            contrastAttackTime,
            contrastReleaseTime
        );
        
        // Validate and clamp
        if (!isFinite(this.smoothing.smoothedContrastAudioLevel)) {
            this.smoothing.smoothedContrastAudioLevel = 0.0;
        }
        this.smoothing.smoothedContrastAudioLevel = Math.max(0, Math.min(1, this.smoothing.smoothedContrastAudioLevel));
    }
    
    /**
     * Update shader-specific uniforms
     */
    onUpdateUniforms(audioData, colors, deltaTime) {
        if (!this.uniformHelper) return;
        
        const params = this.shaderInstance.parameters;
        const helper = this.uniformHelper;
        
        // Set smoothed noise and contrast audio levels (always update - they change every frame)
        helper.updateFloat('uSmoothedNoiseAudioLevel', this.smoothing.smoothedNoiseAudioLevel);
        helper.updateFloat('uSmoothedContrastAudioLevel', this.smoothing.smoothedContrastAudioLevel);
        
        // String parameters
        helper.updateFloat('uMinStringWidth', params.minStringWidth, 1.0);
        helper.updateFloat('uMaxStringWidth', params.maxStringWidth, 5.0);
        helper.updateFloat('uMaxAmplitude', params.maxAmplitude, 0.05);
        helper.updateFloat('uWaveNote', params.waveNote, 1.0 / 4.0);
        helper.updateFloat('uStringTop', params.stringTop, 1.0);
        helper.updateFloat('uStringBottom', params.stringBottom, 0.0);
        helper.updateFloat('uPaddingLeft', params.paddingLeft, 0.05);
        helper.updateFloat('uPaddingRight', params.paddingRight, 0.05);
        helper.updateFloat('uStringEndFadeMinAlpha', params.stringEndFadeMinAlpha, 0.035);
        helper.updateFloat('uMaxHeight', params.maxHeight, 1.0);
        helper.updateFloat('uWaveCycles', params.waveCycles, 1.0);
        helper.updateBool('uShowBars', params.showBars, true);
        helper.updateBool('uShowStrings', params.showStrings, true);
        helper.updateFloat('uWaveAmplitude', params.waveAmplitude, 0.1);
        helper.updateInt('uMaxStrings', params.maxStrings, 3);
        helper.updateFloat('uThreshold2Strings', params.threshold2Strings, 0.3);
        helper.updateFloat('uThreshold3Strings', params.threshold3Strings, 0.7);
        
        // Band bar height parameters
        helper.updateFloat('uBandMinHeight', params.bandMinHeight, 0.07);
        helper.updateFloat('uBandMaxHeight', params.bandMaxHeight, 1.0);
        helper.updateFloat('uBandHeightCurveX1', params.bandHeightCurveX1, 0.75);
        helper.updateFloat('uBandHeightCurveY1', params.bandHeightCurveY1, 0.0);
        helper.updateFloat('uBandHeightCurveX2', params.bandHeightCurveX2, 0.8);
        helper.updateFloat('uBandHeightCurveY2', params.bandHeightCurveY2, 1.0);
        helper.updateFloat('uStringHeightMultiplier', params.stringHeightMultiplier, 1.5);
        
        // Background noise parameters
        helper.updateFloat('uBackgroundNoiseScale', params.backgroundNoiseScale, 1.9);
        helper.updateFloat('uBackgroundNoiseIntensity', params.backgroundNoiseIntensity, 0.15);
        helper.updateFloat('uBackgroundNoiseAudioReactive', params.backgroundNoiseAudioReactive, 1.0);
        helper.updateInt('uBackgroundNoiseAudioSource', params.backgroundNoiseAudioSource, 1);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveX1', params.backgroundNoiseBrightnessCurveX1, 0.4);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveY1', params.backgroundNoiseBrightnessCurveY1, 1.0);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveX2', params.backgroundNoiseBrightnessCurveX2, 0.7);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveY2', params.backgroundNoiseBrightnessCurveY2, 0.6);
        helper.updateFloat('uBackgroundNoiseBrightnessMin', params.backgroundNoiseBrightnessMin, 0.65);
        helper.updateFloat('uBackgroundNoiseBrightnessMax', params.backgroundNoiseBrightnessMax, 0.95);
        helper.updateFloat('uBackgroundNoiseTimeSpeed', params.backgroundNoiseTimeSpeed, 0.1);
        helper.updateFloat('uBackgroundNoiseTimeOffset', params.backgroundNoiseTimeOffset, 105.0);
        helper.updateFloat('uColorTransitionWidth', params.colorTransitionWidth, 1.0);
        helper.updateFloat('uBarAlphaMin', params.barAlphaMin, 0.0);
        helper.updateFloat('uBarAlphaMax', params.barAlphaMax, 0.85);
        helper.updateFloat('uBandWidthThreshold', params.bandWidthThreshold, 0.3);
        helper.updateFloat('uBandWidthMinMultiplier', params.bandWidthMinMultiplier, 0.9);
        helper.updateFloat('uBandWidthMaxMultiplier', params.bandWidthMaxMultiplier, 1.35);
        helper.updateFloat('uContrast', params.contrast, 1.0);
        helper.updateFloat('uContrastAudioReactive', params.contrastAudioReactive, 1.0);
        helper.updateInt('uContrastAudioSource', params.contrastAudioSource, 1);
        helper.updateFloat('uContrastMin', params.contrastMin, 1.0);
        helper.updateFloat('uContrastMax', params.contrastMax, 1.35);
        helper.updateFloat('uGlowIntensity', params.glowIntensity, 5.0);
        helper.updateFloat('uGlowRadius', params.glowRadius, 5.0);
        helper.updateFloat('uMaskExpansion', params.maskExpansion, 0.18);
        helper.updateFloat('uMaskCutoutIntensity', params.maskCutoutIntensity, 1.0);
        helper.updateFloat('uMaskFeathering', params.maskFeathering, 0.12);
        helper.updateFloat('uMaskNoiseStrength', params.maskNoiseStrength, 0.0);
        helper.updateFloat('uMaskNoiseScale', params.maskNoiseScale, 0.0);
        helper.updateFloat('uMaskNoiseSpeed', params.maskNoiseSpeed, 0.0);
        helper.updateFloat('uMaskAlphaCurveX1', params.maskAlphaCurveX1, 0.0);
        helper.updateFloat('uMaskAlphaCurveY1', params.maskAlphaCurveY1, 1.0);
        helper.updateFloat('uMaskAlphaCurveX2', params.maskAlphaCurveX2, 0.0);
        helper.updateFloat('uMaskAlphaCurveY2', params.maskAlphaCurveY2, 1.0);
        
        // Glitch effect parameters
        helper.updateFloat('uGlitchColumnCount', params.glitchColumnCount, 2.0);
        helper.updateFloat('uGlitchRandomSeed', params.glitchRandomSeed, 0.0);
        helper.updateFloat('uGlitchFlipProbability', params.glitchFlipProbability, 0.3);
        helper.updateFloat('uGlitchIntensity', params.glitchIntensity, 1.0);
        helper.updateFloat('uGlitchBlurAmount', params.glitchBlurAmount, 0.0);
        helper.updateFloat('uGlitchPixelSize', params.glitchPixelSize, 24.0);
    }
    
    /**
     * Clean up plugin resources
     */
    onDestroy() {
        // Clean up smoothing arrays
        this.smoothing.smoothedLeftBands = null;
        this.smoothing.smoothedRightBands = null;
        this.smoothing.smoothedHeightLeftBands = null;
        this.smoothing.smoothedHeightRightBands = null;
        
        // Clean up textures (handled by TextureManager, but clear references)
        this.frequencyTextures.leftRight = null;
        this.frequencyTextures.height = null;
        
        this.uniformHelper = null;
    }
}
