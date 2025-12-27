// StringsShaderPlugin - Plugin for strings shader
// Handles frequency texture updates, tempo-based smoothing, and shader-specific uniforms

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';
import { FrequencyTextureCalculator } from '../utils/FrequencyTextureCalculator.js';
import { UniformUpdateHelper } from '../utils/UniformUpdateHelper.js';
import type { ExtendedAudioData } from '../../types/index.js';
import type { ShaderConfig } from '../../types/index.js';
import type { ShaderInstance } from '../ShaderInstance.js';
import type { AudioAnalyzer } from '../../core/audio/AudioAnalyzer.js';
import type { ColorMap } from '../../types/index.js';

interface SmoothingState extends Record<string, unknown> {
    smoothedLeftBands: Float32Array | null;
    smoothedRightBands: Float32Array | null;
    smoothedHeightLeftBands: Float32Array | null;
    smoothedHeightRightBands: Float32Array | null;
    smoothedNoiseAudioLevel: number;
    smoothedContrastAudioLevel: number;
}

interface FrequencyTextures {
    leftRight: WebGLTexture | null;
    height: WebGLTexture | null;
}

export class StringsShaderPlugin extends BaseShaderPlugin {
    smoothing: SmoothingState;
    frequencyTextures: FrequencyTextures;
    _measuredBands: number;
    uniformHelper: UniformUpdateHelper | null;
    
    constructor(shaderInstance: ShaderInstance, config: ShaderConfig) {
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
    
    onInit(): void {
        // Initialize uniform update helper
        this.uniformHelper = new UniformUpdateHelper(
            this.shaderInstance.gl!,
            this.shaderInstance.uniformLocations,
            this.shaderInstance._lastUniformValues
        );
        // Apply adaptive numBands for strings shader on mobile devices
        if (this.shaderInstance.parameters.numBands !== undefined) {
            this.shaderInstance.parameters.numBands = this.shaderInstance.getAdaptiveNumBands(
                this.shaderInstance.parameters.numBands as number
            );
        }
        
        // Initialize textures with zero data to ensure they exist before first render
        // This prevents shader errors when sampling textures before audio data is available
        if (this.shaderInstance.gl && this.shaderInstance.textureManager && this.shaderInstance.uniformLocations) {
            const gl = this.shaderInstance.gl;
            const measuredBands = (this.shaderInstance.parameters.measuredBands !== undefined 
                ? this.shaderInstance.parameters.measuredBands 
                : (this._measuredBands || 24)) as number;
            this._measuredBands = measuredBands;
            
            // Initialize smoothed band arrays
            this.smoothing.smoothedLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedRightBands = new Float32Array(measuredBands);
            this.smoothing.smoothedHeightLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedHeightRightBands = new Float32Array(measuredBands);
            
            // Create zero-filled texture data
            const zeroData = new Float32Array(measuredBands * 2);
            const textureManager = this.shaderInstance.textureManager;
            
            // Create/update textures with zero data
            const leftRightResult = textureManager.createFrequencyTexture(zeroData, measuredBands, 'strings_leftRight');
            const heightResult = textureManager.createFrequencyTexture(zeroData, measuredBands, 'strings_height');
            
            // Store texture references
            this.frequencyTextures.leftRight = leftRightResult.texture;
            this.frequencyTextures.height = heightResult.texture;
            
            // Bind textures to their allocated units
            const leftRightUnit = textureManager.bindTextureByKey(leftRightResult.texture, 'strings_leftRight');
            const heightUnit = textureManager.bindTextureByKey(heightResult.texture, 'strings_height');
            
            // Set uniforms immediately
            gl.useProgram(this.shaderInstance.program!);
            if (this.shaderInstance.uniformLocations.uFrequencyTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uFrequencyTexture, leftRightUnit);
            }
            if (this.shaderInstance.uniformLocations.uHeightTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uHeightTexture, heightUnit);
            }
            
            // Set measured bands uniform
            if (this.shaderInstance.uniformLocations.uMeasuredBands) {
                gl.uniform1f(this.shaderInstance.uniformLocations.uMeasuredBands, measuredBands);
            }
            
            // Set visual bands uniform
            let visualBands = (this.shaderInstance.parameters.numBands || 24) as number;
            if (this.shaderInstance.parameters.numBands !== undefined) {
                visualBands = this.shaderInstance.getAdaptiveNumBands(this.shaderInstance.parameters.numBands as number);
            }
            if (this.shaderInstance.uniformLocations.uNumBands) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uNumBands, visualBands);
            }
        }
    }
    
    getSmoothingState(): SmoothingState | null {
        return this.smoothing;
    }
    
    /**
     * Update frequency textures for strings shader
     */
    onUpdateTextures(audioData: ExtendedAudioData | null, deltaTime: number): void {
        if (!this.shaderInstance || !this.shaderInstance.gl) return;
        
        const gl = this.shaderInstance.gl;
        
        // Get measured bands from config
        const measuredBands = (this.shaderInstance.parameters.measuredBands !== undefined 
            ? this.shaderInstance.parameters.measuredBands 
            : (this._measuredBands || 32)) as number;
        this._measuredBands = measuredBands;
        
        // Initialize smoothed band arrays if needed
        if (!this.smoothing.smoothedLeftBands || 
            this.smoothing.smoothedLeftBands.length !== measuredBands) {
            this.smoothing.smoothedLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedRightBands = new Float32Array(measuredBands);
            this.smoothing.smoothedHeightLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedHeightRightBands = new Float32Array(measuredBands);
        }
        
        // If no audio data, initialize textures with zeros to ensure they exist
        if (!audioData || !audioData.audioContext) {
            // Initialize arrays with zeros if not already initialized
            if (!this.smoothing.smoothedLeftBands || this.smoothing.smoothedLeftBands.length !== measuredBands) {
                this.smoothing.smoothedLeftBands = new Float32Array(measuredBands);
                this.smoothing.smoothedRightBands = new Float32Array(measuredBands);
                this.smoothing.smoothedHeightLeftBands = new Float32Array(measuredBands);
                this.smoothing.smoothedHeightRightBands = new Float32Array(measuredBands);
            }
            // Create zero-filled texture data
            const zeroData = new Float32Array(measuredBands * 2);
            const textureManager = this.shaderInstance?.textureManager;
            if (textureManager && this.shaderInstance?.uniformLocations) {
                // Create/update textures with zero data
                const leftRightResult = textureManager.createFrequencyTexture(zeroData, measuredBands, 'strings_leftRight');
                const heightResult = textureManager.createFrequencyTexture(zeroData, measuredBands, 'strings_height');
                
                // Bind textures
                const leftRightUnit = textureManager.bindTextureByKey(leftRightResult.texture, 'strings_leftRight');
                const heightUnit = textureManager.bindTextureByKey(heightResult.texture, 'strings_height');
                
                // Set uniforms
                if (this.shaderInstance.uniformLocations.uFrequencyTexture) {
                    gl.uniform1i(this.shaderInstance.uniformLocations.uFrequencyTexture, leftRightUnit);
                }
                if (this.shaderInstance.uniformLocations.uHeightTexture) {
                    gl.uniform1i(this.shaderInstance.uniformLocations.uHeightTexture, heightUnit);
                }
            }
            return;
        }
        
        // Calculate configurable bands using shared utility
        const bandData = FrequencyTextureCalculator.calculateBands(
            audioData,
            measuredBands,
            this.shaderInstance.renderLoop.getAudioAnalyzer()
        );
        
        // If no band data, initialize with zeros to ensure textures exist
        if (!bandData) {
            // Initialize arrays with zeros if not already initialized
            if (!this.smoothing.smoothedLeftBands || this.smoothing.smoothedLeftBands.length !== measuredBands) {
                this.smoothing.smoothedLeftBands = new Float32Array(measuredBands);
                this.smoothing.smoothedRightBands = new Float32Array(measuredBands);
                this.smoothing.smoothedHeightLeftBands = new Float32Array(measuredBands);
                this.smoothing.smoothedHeightRightBands = new Float32Array(measuredBands);
            }
            // Create zero-filled texture data
            const zeroData = new Float32Array(measuredBands * 2);
            const textureManager = this.shaderInstance?.textureManager;
            if (textureManager && this.shaderInstance?.uniformLocations) {
                // Create/update textures with zero data
                const leftRightResult = textureManager.createFrequencyTexture(zeroData, measuredBands, 'strings_leftRight');
                const heightResult = textureManager.createFrequencyTexture(zeroData, measuredBands, 'strings_height');
                
                // Bind textures
                const leftRightUnit = textureManager.bindTextureByKey(leftRightResult.texture, 'strings_leftRight');
                const heightUnit = textureManager.bindTextureByKey(heightResult.texture, 'strings_height');
                
                // Set uniforms
                if (this.shaderInstance.uniformLocations.uFrequencyTexture) {
                    gl.uniform1i(this.shaderInstance.uniformLocations.uFrequencyTexture, leftRightUnit);
                }
                if (this.shaderInstance.uniformLocations.uHeightTexture) {
                    gl.uniform1i(this.shaderInstance.uniformLocations.uHeightTexture, heightUnit);
                }
            }
            return;
        }
        
        // Get attack/release note values for string swing
        const swingAttackNote = (this.shaderInstance.parameters.stringSwingAttackNote !== undefined
            ? this.shaderInstance.parameters.stringSwingAttackNote
            : TempoSmoothingConfig.strings.attackNote) as number;
        const swingReleaseNote = (this.shaderInstance.parameters.stringSwingReleaseNote !== undefined
            ? this.shaderInstance.parameters.stringSwingReleaseNote
            : TempoSmoothingConfig.strings.releaseNote) as number;
        
        // Get attack/release note values for string height
        const heightAttackNote = (this.shaderInstance.parameters.stringHeightAttackNote !== undefined
            ? this.shaderInstance.parameters.stringHeightAttackNote
            : TempoSmoothingConfig.strings.attackNote) as number;
        const heightReleaseNote = (this.shaderInstance.parameters.stringHeightReleaseNote !== undefined
            ? this.shaderInstance.parameters.stringHeightReleaseNote
            : TempoSmoothingConfig.strings.releaseNote) as number;
        
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
            this.smoothing.smoothedLeftBands![i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedLeftBands![i],
                bandData.leftBands[i],
                deltaTime,
                swingAttackTimeConstant,
                swingReleaseTimeConstant
            );
            
            // Smooth right channel for swing
            this.smoothing.smoothedRightBands![i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedRightBands![i],
                bandData.rightBands[i],
                deltaTime,
                swingAttackTimeConstant,
                swingReleaseTimeConstant
            );
            
            // Smooth left channel for height
            this.smoothing.smoothedHeightLeftBands![i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedHeightLeftBands![i],
                bandData.leftBands[i],
                deltaTime,
                heightAttackTimeConstant,
                heightReleaseTimeConstant
            );
            
            // Smooth right channel for height
            this.smoothing.smoothedHeightRightBands![i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedHeightRightBands![i],
                bandData.rightBands[i],
                deltaTime,
                heightAttackTimeConstant,
                heightReleaseTimeConstant
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
                this.smoothing.smoothedHeightLeftBands!,
                this.smoothing.smoothedHeightRightBands!
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
        let visualBands = (this.shaderInstance.parameters.numBands || 64) as number;
        if (this.shaderInstance.parameters.numBands !== undefined) {
            visualBands = this.shaderInstance.getAdaptiveNumBands(this.shaderInstance.parameters.numBands as number);
        }
        if (this.shaderInstance.uniformLocations.uNumBands) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uNumBands, visualBands);
        }
    }
    
    /**
     * Update tempo-based smoothing for noise brightness and contrast
     * Applies tempo-relative smoothing to audio levels for noise brightness and contrast modulation
     * @param audioData - Audio data from AudioAnalyzer
     * @param deltaTime - Time since last frame in seconds
     */
    updateSmoothing(audioData: ExtendedAudioData | null, deltaTime: number): void {
        if (!audioData) return;
        
        const bpm = audioData.estimatedBPM || 0;
        
        // Smooth noise audio level for brightness modulation
        let targetAudioLevel = 0.0;
        const audioSource = (this.shaderInstance.parameters.backgroundNoiseAudioSource !== undefined 
            ? this.shaderInstance.parameters.backgroundNoiseAudioSource : 0) as number;
        
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
        const noiseAttackNote = (this.shaderInstance.parameters.noiseAudioAttackNote !== undefined
            ? this.shaderInstance.parameters.noiseAudioAttackNote
            : TempoSmoothingConfig.noiseBrightness.attackNote) as number;
        const noiseReleaseNote = (this.shaderInstance.parameters.noiseAudioReleaseNote !== undefined
            ? this.shaderInstance.parameters.noiseAudioReleaseNote
            : TempoSmoothingConfig.noiseBrightness.releaseNote) as number;
        
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
        const contrastAudioSource = (this.shaderInstance.parameters.contrastAudioSource !== undefined 
            ? this.shaderInstance.parameters.contrastAudioSource : 0) as number;
        
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
        const contrastAttackNote = (this.shaderInstance.parameters.contrastAudioAttackNote !== undefined
            ? this.shaderInstance.parameters.contrastAudioAttackNote
            : TempoSmoothingConfig.contrast.attackNote) as number;
        const contrastReleaseNote = (this.shaderInstance.parameters.contrastAudioReleaseNote !== undefined
            ? this.shaderInstance.parameters.contrastAudioReleaseNote
            : TempoSmoothingConfig.contrast.releaseNote) as number;
        
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
    onUpdateUniforms(_audioData: ExtendedAudioData | null, _colors: ColorMap | null, _deltaTime: number): void {
        if (!this.uniformHelper) return;
        
        const params = this.shaderInstance.parameters;
        const helper = this.uniformHelper;
        
        // Performance-based adaptive quality adjustments
        const qualityLevel = this.shaderInstance.performanceMonitor?.qualityLevel ?? 1.0;
        const gl = this.shaderInstance.gl;
        const locations = this.shaderInstance.uniformLocations;
        
        // Set quality level uniform for shader-side optimizations
        if (gl && locations?.uQualityLevel) {
            gl.uniform1f(locations.uQualityLevel, qualityLevel);
        }
        
        // Adjust background fBm octaves based on quality (7 = full quality, 3 = minimum)
        const backgroundOctaves = Math.max(3, Math.floor(7 * qualityLevel));
        if (gl && locations?.uBackgroundFbmOctaves) {
            gl.uniform1i(locations.uBackgroundFbmOctaves, backgroundOctaves);
        }
        
        // Adjust blur samples based on quality
        let blurSamples = 8; // Full 3×3 blur
        if (qualityLevel < 0.5) {
            blurSamples = 0; // No blur
        } else if (qualityLevel < 0.7) {
            blurSamples = 4; // 2×2 blur
        }
        if (gl && locations?.uBackgroundBlurSamples) {
            gl.uniform1i(locations.uBackgroundBlurSamples, blurSamples);
        }
        
        // Disable blur entirely on very low-end
        if (qualityLevel < 0.5 && gl && locations?.uGlitchBlurAmount) {
            gl.uniform1f(locations.uGlitchBlurAmount, 0.0);
        }
        
        // Reduce mask noise strength on mobile
        const maskNoiseScale = qualityLevel < 0.6 ? 0.3 : 1.0;
        const currentMaskNoise = (params.maskNoiseStrength as number | undefined) ?? 0.0;
        if (gl && locations?.uMaskNoiseStrengthMobile) {
            gl.uniform1f(locations.uMaskNoiseStrengthMobile, currentMaskNoise * maskNoiseScale);
        }
        
        // Reduce max strings on mobile
        const maxStrings = qualityLevel < 0.7 ? 2 : 3;
        if (gl && locations?.uMaxStringsMobile) {
            gl.uniform1i(locations.uMaxStringsMobile, maxStrings);
        }
        
        // Disable glow on mobile
        if (qualityLevel < 0.7 && gl && locations?.uGlowIntensity) {
            const currentGlow = (params.glowIntensity as number | undefined) ?? 0.0;
            if (currentGlow > 0.0) {
                gl.uniform1f(locations.uGlowIntensity, 0.0);
            }
        }
        
        // Reduce glitch columns on mobile
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        if (isMobile && qualityLevel < 0.7 && gl && locations?.uGlitchColumnCount) {
            const currentColumns = (params.glitchColumnCount as number | undefined) ?? 2.0;
            gl.uniform1f(locations.uGlitchColumnCount, Math.max(4, currentColumns * 0.5));
        }
        
        // Set smoothed noise and contrast audio levels (always update - they change every frame)
        helper.updateFloat('uSmoothedNoiseAudioLevel', this.smoothing.smoothedNoiseAudioLevel);
        helper.updateFloat('uSmoothedContrastAudioLevel', this.smoothing.smoothedContrastAudioLevel);
        
        // String parameters
        helper.updateFloat('uMinStringWidth', params.minStringWidth as number | undefined, 1.0);
        helper.updateFloat('uMaxStringWidth', params.maxStringWidth as number | undefined, 5.0);
        helper.updateFloat('uMaxAmplitude', params.maxAmplitude as number | undefined, 0.05);
        helper.updateFloat('uWaveNote', params.waveNote as number | undefined, 1.0 / 4.0);
        helper.updateFloat('uStringTop', params.stringTop as number | undefined, 1.0);
        helper.updateFloat('uStringBottom', params.stringBottom as number | undefined, 0.0);
        helper.updateFloat('uPaddingLeft', params.paddingLeft as number | undefined, 0.05);
        helper.updateFloat('uPaddingRight', params.paddingRight as number | undefined, 0.05);
        helper.updateFloat('uStringEndFadeMinAlpha', params.stringEndFadeMinAlpha as number | undefined, 0.035);
        helper.updateFloat('uMaxHeight', params.maxHeight as number | undefined, 1.0);
        helper.updateFloat('uWaveCycles', params.waveCycles as number | undefined, 1.0);
        helper.updateBool('uShowBars', params.showBars as boolean | undefined, true);
        helper.updateBool('uShowStrings', params.showStrings as boolean | undefined, true);
        helper.updateFloat('uWaveAmplitude', params.waveAmplitude as number | undefined, 0.1);
        helper.updateInt('uMaxStrings', params.maxStrings as number | undefined, 3);
        helper.updateFloat('uThreshold2Strings', params.threshold2Strings as number | undefined, 0.3);
        helper.updateFloat('uThreshold3Strings', params.threshold3Strings as number | undefined, 0.7);
        
        // Band bar height parameters
        helper.updateFloat('uBandMinHeight', params.bandMinHeight as number | undefined, 0.07);
        helper.updateFloat('uBandMaxHeight', params.bandMaxHeight as number | undefined, 1.0);
        helper.updateFloat('uBandHeightCurveX1', params.bandHeightCurveX1 as number | undefined, 0.75);
        helper.updateFloat('uBandHeightCurveY1', params.bandHeightCurveY1 as number | undefined, 0.0);
        helper.updateFloat('uBandHeightCurveX2', params.bandHeightCurveX2 as number | undefined, 0.8);
        helper.updateFloat('uBandHeightCurveY2', params.bandHeightCurveY2 as number | undefined, 1.0);
        helper.updateFloat('uStringHeightMultiplier', params.stringHeightMultiplier as number | undefined, 1.5);
        
        // Background noise parameters
        helper.updateFloat('uBackgroundNoiseScale', params.backgroundNoiseScale as number | undefined, 1.9);
        helper.updateFloat('uBackgroundNoiseIntensity', params.backgroundNoiseIntensity as number | undefined, 0.15);
        helper.updateFloat('uBackgroundNoiseAudioReactive', params.backgroundNoiseAudioReactive as number | undefined, 1.0);
        helper.updateInt('uBackgroundNoiseAudioSource', params.backgroundNoiseAudioSource as number | undefined, 1);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveX1', params.backgroundNoiseBrightnessCurveX1 as number | undefined, 0.4);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveY1', params.backgroundNoiseBrightnessCurveY1 as number | undefined, 1.0);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveX2', params.backgroundNoiseBrightnessCurveX2 as number | undefined, 0.7);
        helper.updateFloat('uBackgroundNoiseBrightnessCurveY2', params.backgroundNoiseBrightnessCurveY2 as number | undefined, 0.6);
        helper.updateFloat('uBackgroundNoiseBrightnessMin', params.backgroundNoiseBrightnessMin as number | undefined, 0.65);
        helper.updateFloat('uBackgroundNoiseBrightnessMax', params.backgroundNoiseBrightnessMax as number | undefined, 0.95);
        helper.updateFloat('uBackgroundNoiseTimeSpeed', params.backgroundNoiseTimeSpeed as number | undefined, 0.1);
        helper.updateFloat('uBackgroundNoiseTimeOffset', params.backgroundNoiseTimeOffset as number | undefined, 105.0);
        helper.updateFloat('uColorTransitionWidth', params.colorTransitionWidth as number | undefined, 1.0);
        helper.updateFloat('uBarAlphaMin', params.barAlphaMin as number | undefined, 0.0);
        helper.updateFloat('uBarAlphaMax', params.barAlphaMax as number | undefined, 0.85);
        helper.updateFloat('uBandWidthThreshold', params.bandWidthThreshold as number | undefined, 0.3);
        helper.updateFloat('uBandWidthMinMultiplier', params.bandWidthMinMultiplier as number | undefined, 0.9);
        helper.updateFloat('uBandWidthMaxMultiplier', params.bandWidthMaxMultiplier as number | undefined, 1.35);
        helper.updateFloat('uContrast', params.contrast as number | undefined, 1.0);
        helper.updateFloat('uContrastAudioReactive', params.contrastAudioReactive as number | undefined, 1.0);
        helper.updateInt('uContrastAudioSource', params.contrastAudioSource as number | undefined, 1);
        helper.updateFloat('uContrastMin', params.contrastMin as number | undefined, 1.0);
        helper.updateFloat('uContrastMax', params.contrastMax as number | undefined, 1.35);
        helper.updateFloat('uGlowIntensity', params.glowIntensity as number | undefined, 5.0);
        helper.updateFloat('uGlowRadius', params.glowRadius as number | undefined, 5.0);
        helper.updateFloat('uMaskExpansion', params.maskExpansion as number | undefined, 0.18);
        helper.updateFloat('uMaskCutoutIntensity', params.maskCutoutIntensity as number | undefined, 1.0);
        helper.updateFloat('uMaskFeathering', params.maskFeathering as number | undefined, 0.12);
        helper.updateFloat('uMaskNoiseStrength', params.maskNoiseStrength as number | undefined, 0.0);
        helper.updateFloat('uMaskNoiseScale', params.maskNoiseScale as number | undefined, 0.0);
        helper.updateFloat('uMaskNoiseSpeed', params.maskNoiseSpeed as number | undefined, 0.0);
        helper.updateFloat('uMaskAlphaCurveX1', params.maskAlphaCurveX1 as number | undefined, 0.0);
        helper.updateFloat('uMaskAlphaCurveY1', params.maskAlphaCurveY1 as number | undefined, 1.0);
        helper.updateFloat('uMaskAlphaCurveX2', params.maskAlphaCurveX2 as number | undefined, 0.0);
        helper.updateFloat('uMaskAlphaCurveY2', params.maskAlphaCurveY2 as number | undefined, 1.0);
        
        // Glitch effect parameters
        helper.updateFloat('uGlitchColumnCount', params.glitchColumnCount as number | undefined, 2.0);
        helper.updateFloat('uGlitchRandomSeed', params.glitchRandomSeed as number | undefined, 0.0);
        helper.updateFloat('uGlitchFlipProbability', params.glitchFlipProbability as number | undefined, 0.3);
        helper.updateFloat('uGlitchIntensity', params.glitchIntensity as number | undefined, 1.0);
        helper.updateFloat('uGlitchBlurAmount', params.glitchBlurAmount as number | undefined, 0.0);
        helper.updateFloat('uGlitchPixelSize', params.glitchPixelSize as number | undefined, 24.0);
    }
    
    /**
     * Clean up plugin resources
     */
    onDestroy(): void {
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

