// StringsShaderPlugin - Plugin for strings shader
// Handles frequency texture updates, tempo-based smoothing, and shader-specific uniforms

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

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
    }
    
    onInit() {
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
        
        const gl = this.shaderInstance.gl;
        if (!gl) return;
        
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
        
        // Calculate configurable bands
        let bandData;
        if (audioData.audioContext && audioData.frequencyData) {
            if (this.shaderInstance._audioAnalyzer && 
                typeof this.shaderInstance._audioAnalyzer.calculateConfigurableBands === 'function') {
                bandData = this.shaderInstance._audioAnalyzer.calculateConfigurableBands(measuredBands);
            } else if (audioData.leftFrequencyData && audioData.rightFrequencyData) {
                // Fallback: calculate directly
                const sampleRate = audioData.audioContext?.sampleRate || 44100;
                const nyquist = sampleRate / 2;
                const binSize = nyquist / audioData.frequencyData.length;
                const hzToBin = (hz) => Math.floor(hz / binSize);
                const getAverage = (data, start, end) => {
                    let sum = 0;
                    const count = Math.min(end, data.length - 1) - start + 1;
                    if (count <= 0) return 0;
                    for (let i = start; i <= end && i < data.length; i++) {
                        sum += data[i];
                    }
                    return sum / count / 255.0;
                };
                
                const minFreq = 20;
                const maxFreq = nyquist;
                const leftBands = new Float32Array(measuredBands);
                const rightBands = new Float32Array(measuredBands);
                
                for (let i = 0; i < measuredBands; i++) {
                    const t = i / (measuredBands - 1);
                    const freqStart = minFreq * Math.pow(maxFreq / minFreq, t);
                    const freqEnd = (i === measuredBands - 1) 
                        ? maxFreq 
                        : minFreq * Math.pow(maxFreq / minFreq, (i + 1) / (measuredBands - 1));
                    const binStart = hzToBin(freqStart);
                    const binEnd = Math.min(hzToBin(freqEnd), audioData.leftFrequencyData.length - 1);
                    leftBands[i] = getAverage(audioData.leftFrequencyData, binStart, binEnd);
                    rightBands[i] = getAverage(audioData.rightFrequencyData, binStart, binEnd);
                }
                
                bandData = { leftBands, rightBands, numBands: measuredBands };
            } else {
                return;
            }
        } else {
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
        
        // Create texture data: LUMINANCE = left, ALPHA = right (using smoothed values)
        const leftRightData = new Float32Array(measuredBands * 2);
        for (let i = 0; i < measuredBands; i++) {
            leftRightData[i * 2] = this.smoothing.smoothedLeftBands[i];
            leftRightData[i * 2 + 1] = this.smoothing.smoothedRightBands[i];
        }
        
        // Create or update texture using texture manager
        const textureManager = this.shaderInstance.textureManager;
        if (textureManager) {
            this.frequencyTextures.leftRight = textureManager.createFrequencyTexture(
                leftRightData, 
                measuredBands,
                'strings_leftRight'
            );
            
            // Set texture uniform
            textureManager.bindTexture(this.frequencyTextures.leftRight, 0);
            if (this.shaderInstance.uniformLocations.uFrequencyTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uFrequencyTexture, 0);
            }
            
            // Create separate texture for height
            const heightData = new Float32Array(measuredBands * 2);
            for (let i = 0; i < measuredBands; i++) {
                heightData[i * 2] = this.smoothing.smoothedHeightLeftBands[i];
                heightData[i * 2 + 1] = this.smoothing.smoothedHeightRightBands[i];
            }
            
            // Create or update height texture
            this.frequencyTextures.height = textureManager.createFrequencyTexture(
                heightData, 
                measuredBands,
                'strings_height'
            );
            
            // Set height texture uniform
            textureManager.bindTexture(this.frequencyTextures.height, 1);
            if (this.shaderInstance.uniformLocations.uHeightTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uHeightTexture, 1);
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
        const gl = this.shaderInstance.gl;
        if (!gl) return;
        
        // Set smoothed noise and contrast audio levels
        if (this.shaderInstance.uniformLocations.uSmoothedNoiseAudioLevel) {
            gl.uniform1f(
                this.shaderInstance.uniformLocations.uSmoothedNoiseAudioLevel,
                this.smoothing.smoothedNoiseAudioLevel
            );
        }
        if (this.shaderInstance.uniformLocations.uSmoothedContrastAudioLevel) {
            gl.uniform1f(
                this.shaderInstance.uniformLocations.uSmoothedContrastAudioLevel,
                this.smoothing.smoothedContrastAudioLevel
            );
        }
        
        // Set all string-specific parameter uniforms
        // (This is a large block - keeping it here for now, could be extracted to a helper)
        const params = this.shaderInstance.parameters;
        const locations = this.shaderInstance.uniformLocations;
        const lastValues = this.shaderInstance._lastUniformValues;
        
        // String parameters
        if (locations.uMinStringWidth) {
            const val = params.minStringWidth !== undefined ? params.minStringWidth : 1.0;
            if (lastValues.uMinStringWidth !== val) {
                gl.uniform1f(locations.uMinStringWidth, val);
                lastValues.uMinStringWidth = val;
            }
        }
        if (locations.uMaxStringWidth) {
            const val = params.maxStringWidth !== undefined ? params.maxStringWidth : 5.0;
            if (lastValues.uMaxStringWidth !== val) {
                gl.uniform1f(locations.uMaxStringWidth, val);
                lastValues.uMaxStringWidth = val;
            }
        }
        if (locations.uMaxAmplitude) {
            const val = params.maxAmplitude || 0.05;
            if (lastValues.uMaxAmplitude !== val) {
                gl.uniform1f(locations.uMaxAmplitude, val);
                lastValues.uMaxAmplitude = val;
            }
        }
        if (locations.uWaveNote) {
            const val = params.waveNote !== undefined ? params.waveNote : (1.0 / 4.0);
            if (lastValues.uWaveNote !== val) {
                gl.uniform1f(locations.uWaveNote, val);
                lastValues.uWaveNote = val;
            }
        }
        if (locations.uStringTop) {
            const val = params.stringTop !== undefined ? params.stringTop : 1.0;
            if (lastValues.uStringTop !== val) {
                gl.uniform1f(locations.uStringTop, val);
                lastValues.uStringTop = val;
            }
        }
        if (locations.uStringBottom) {
            const val = params.stringBottom !== undefined ? params.stringBottom : 0.0;
            if (lastValues.uStringBottom !== val) {
                gl.uniform1f(locations.uStringBottom, val);
                lastValues.uStringBottom = val;
            }
        }
        if (locations.uPaddingLeft) {
            const val = params.paddingLeft || 0.05;
            if (lastValues.uPaddingLeft !== val) {
                gl.uniform1f(locations.uPaddingLeft, val);
                lastValues.uPaddingLeft = val;
            }
        }
        if (locations.uPaddingRight) {
            const val = params.paddingRight || 0.05;
            if (lastValues.uPaddingRight !== val) {
                gl.uniform1f(locations.uPaddingRight, val);
                lastValues.uPaddingRight = val;
            }
        }
        if (locations.uStringEndFadeMinAlpha) {
            const val = params.stringEndFadeMinAlpha !== undefined ? params.stringEndFadeMinAlpha : 0.035;
            if (lastValues.uStringEndFadeMinAlpha !== val) {
                gl.uniform1f(locations.uStringEndFadeMinAlpha, val);
                lastValues.uStringEndFadeMinAlpha = val;
            }
        }
        if (locations.uMaxHeight) {
            const val = params.maxHeight !== undefined ? params.maxHeight : 1.0;
            if (lastValues.uMaxHeight !== val) {
                gl.uniform1f(locations.uMaxHeight, val);
                lastValues.uMaxHeight = val;
            }
        }
        if (locations.uWaveCycles) {
            const val = params.waveCycles !== undefined ? params.waveCycles : 1.0;
            if (lastValues.uWaveCycles !== val) {
                gl.uniform1f(locations.uWaveCycles, val);
                lastValues.uWaveCycles = val;
            }
        }
        if (locations.uShowBars) {
            const val = params.showBars !== undefined ? (params.showBars ? 1.0 : 0.0) : 1.0;
            if (lastValues.uShowBars !== val) {
                gl.uniform1f(locations.uShowBars, val);
                lastValues.uShowBars = val;
            }
        }
        if (locations.uShowStrings) {
            const val = params.showStrings !== undefined ? (params.showStrings ? 1.0 : 0.0) : 1.0;
            if (lastValues.uShowStrings !== val) {
                gl.uniform1f(locations.uShowStrings, val);
                lastValues.uShowStrings = val;
            }
        }
        if (locations.uWaveAmplitude) {
            const val = params.waveAmplitude !== undefined ? params.waveAmplitude : 0.1;
            if (lastValues.uWaveAmplitude !== val) {
                gl.uniform1f(locations.uWaveAmplitude, val);
                lastValues.uWaveAmplitude = val;
            }
        }
        if (locations.uMaxStrings) {
            const val = params.maxStrings !== undefined ? params.maxStrings : 3;
            if (lastValues.uMaxStrings !== val) {
                gl.uniform1i(locations.uMaxStrings, val);
                lastValues.uMaxStrings = val;
            }
        }
        if (locations.uThreshold2Strings) {
            const val = params.threshold2Strings !== undefined ? params.threshold2Strings : 0.3;
            if (lastValues.uThreshold2Strings !== val) {
                gl.uniform1f(locations.uThreshold2Strings, val);
                lastValues.uThreshold2Strings = val;
            }
        }
        if (locations.uThreshold3Strings) {
            const val = params.threshold3Strings !== undefined ? params.threshold3Strings : 0.7;
            if (lastValues.uThreshold3Strings !== val) {
                gl.uniform1f(locations.uThreshold3Strings, val);
                lastValues.uThreshold3Strings = val;
            }
        }
        
        // Band bar height parameters
        if (locations.uBandMinHeight) {
            const val = params.bandMinHeight !== undefined ? params.bandMinHeight : 0.07;
            if (lastValues.uBandMinHeight !== val) {
                gl.uniform1f(locations.uBandMinHeight, val);
                lastValues.uBandMinHeight = val;
            }
        }
        if (locations.uBandMaxHeight) {
            const val = params.bandMaxHeight !== undefined ? params.bandMaxHeight : 1.0;
            if (lastValues.uBandMaxHeight !== val) {
                gl.uniform1f(locations.uBandMaxHeight, val);
                lastValues.uBandMaxHeight = val;
            }
        }
        if (locations.uBandHeightCurveX1) {
            const val = params.bandHeightCurveX1 !== undefined ? params.bandHeightCurveX1 : 0.75;
            if (lastValues.uBandHeightCurveX1 !== val) {
                gl.uniform1f(locations.uBandHeightCurveX1, val);
                lastValues.uBandHeightCurveX1 = val;
            }
        }
        if (locations.uBandHeightCurveY1) {
            const val = params.bandHeightCurveY1 !== undefined ? params.bandHeightCurveY1 : 0.0;
            if (lastValues.uBandHeightCurveY1 !== val) {
                gl.uniform1f(locations.uBandHeightCurveY1, val);
                lastValues.uBandHeightCurveY1 = val;
            }
        }
        if (locations.uBandHeightCurveX2) {
            const val = params.bandHeightCurveX2 !== undefined ? params.bandHeightCurveX2 : 0.8;
            if (lastValues.uBandHeightCurveX2 !== val) {
                gl.uniform1f(locations.uBandHeightCurveX2, val);
                lastValues.uBandHeightCurveX2 = val;
            }
        }
        if (locations.uBandHeightCurveY2) {
            const val = params.bandHeightCurveY2 !== undefined ? params.bandHeightCurveY2 : 1.0;
            if (lastValues.uBandHeightCurveY2 !== val) {
                gl.uniform1f(locations.uBandHeightCurveY2, val);
                lastValues.uBandHeightCurveY2 = val;
            }
        }
        if (locations.uStringHeightMultiplier) {
            const val = params.stringHeightMultiplier !== undefined ? params.stringHeightMultiplier : 1.5;
            if (lastValues.uStringHeightMultiplier !== val) {
                gl.uniform1f(locations.uStringHeightMultiplier, val);
                lastValues.uStringHeightMultiplier = val;
            }
        }
        
        // Background noise parameters
        if (locations.uBackgroundNoiseScale) {
            const val = params.backgroundNoiseScale !== undefined ? params.backgroundNoiseScale : 1.9;
            if (lastValues.uBackgroundNoiseScale !== val) {
                gl.uniform1f(locations.uBackgroundNoiseScale, val);
                lastValues.uBackgroundNoiseScale = val;
            }
        }
        if (locations.uBackgroundNoiseIntensity) {
            const val = params.backgroundNoiseIntensity !== undefined ? params.backgroundNoiseIntensity : 0.15;
            if (lastValues.uBackgroundNoiseIntensity !== val) {
                gl.uniform1f(locations.uBackgroundNoiseIntensity, val);
                lastValues.uBackgroundNoiseIntensity = val;
            }
        }
        if (locations.uBackgroundNoiseAudioReactive) {
            const val = params.backgroundNoiseAudioReactive !== undefined ? params.backgroundNoiseAudioReactive : 1.0;
            if (lastValues.uBackgroundNoiseAudioReactive !== val) {
                gl.uniform1f(locations.uBackgroundNoiseAudioReactive, val);
                lastValues.uBackgroundNoiseAudioReactive = val;
            }
        }
        if (locations.uBackgroundNoiseAudioSource) {
            const val = params.backgroundNoiseAudioSource !== undefined ? params.backgroundNoiseAudioSource : 1;
            if (lastValues.uBackgroundNoiseAudioSource !== val) {
                gl.uniform1i(locations.uBackgroundNoiseAudioSource, val);
                lastValues.uBackgroundNoiseAudioSource = val;
            }
        }
        if (locations.uBackgroundNoiseBrightnessCurveX1) {
            const val = params.backgroundNoiseBrightnessCurveX1 !== undefined ? params.backgroundNoiseBrightnessCurveX1 : 0.4;
            if (lastValues.uBackgroundNoiseBrightnessCurveX1 !== val) {
                gl.uniform1f(locations.uBackgroundNoiseBrightnessCurveX1, val);
                lastValues.uBackgroundNoiseBrightnessCurveX1 = val;
            }
        }
        if (locations.uBackgroundNoiseBrightnessCurveY1) {
            const val = params.backgroundNoiseBrightnessCurveY1 !== undefined ? params.backgroundNoiseBrightnessCurveY1 : 1.0;
            if (lastValues.uBackgroundNoiseBrightnessCurveY1 !== val) {
                gl.uniform1f(locations.uBackgroundNoiseBrightnessCurveY1, val);
                lastValues.uBackgroundNoiseBrightnessCurveY1 = val;
            }
        }
        if (locations.uBackgroundNoiseBrightnessCurveX2) {
            const val = params.backgroundNoiseBrightnessCurveX2 !== undefined ? params.backgroundNoiseBrightnessCurveX2 : 0.7;
            if (lastValues.uBackgroundNoiseBrightnessCurveX2 !== val) {
                gl.uniform1f(locations.uBackgroundNoiseBrightnessCurveX2, val);
                lastValues.uBackgroundNoiseBrightnessCurveX2 = val;
            }
        }
        if (locations.uBackgroundNoiseBrightnessCurveY2) {
            const val = params.backgroundNoiseBrightnessCurveY2 !== undefined ? params.backgroundNoiseBrightnessCurveY2 : 0.6;
            if (lastValues.uBackgroundNoiseBrightnessCurveY2 !== val) {
                gl.uniform1f(locations.uBackgroundNoiseBrightnessCurveY2, val);
                lastValues.uBackgroundNoiseBrightnessCurveY2 = val;
            }
        }
        if (locations.uBackgroundNoiseBrightnessMin) {
            const val = params.backgroundNoiseBrightnessMin !== undefined ? params.backgroundNoiseBrightnessMin : 0.65;
            if (lastValues.uBackgroundNoiseBrightnessMin !== val) {
                gl.uniform1f(locations.uBackgroundNoiseBrightnessMin, val);
                lastValues.uBackgroundNoiseBrightnessMin = val;
            }
        }
        if (locations.uBackgroundNoiseBrightnessMax) {
            const val = params.backgroundNoiseBrightnessMax !== undefined ? params.backgroundNoiseBrightnessMax : 0.95;
            if (lastValues.uBackgroundNoiseBrightnessMax !== val) {
                gl.uniform1f(locations.uBackgroundNoiseBrightnessMax, val);
                lastValues.uBackgroundNoiseBrightnessMax = val;
            }
        }
        if (locations.uBackgroundNoiseTimeSpeed) {
            const val = params.backgroundNoiseTimeSpeed !== undefined ? params.backgroundNoiseTimeSpeed : 0.1;
            if (lastValues.uBackgroundNoiseTimeSpeed !== val) {
                gl.uniform1f(locations.uBackgroundNoiseTimeSpeed, val);
                lastValues.uBackgroundNoiseTimeSpeed = val;
            }
        }
        if (locations.uBackgroundNoiseTimeOffset) {
            const val = params.backgroundNoiseTimeOffset !== undefined ? params.backgroundNoiseTimeOffset : 105.0;
            if (lastValues.uBackgroundNoiseTimeOffset !== val) {
                gl.uniform1f(locations.uBackgroundNoiseTimeOffset, val);
                lastValues.uBackgroundNoiseTimeOffset = val;
            }
        }
        if (locations.uColorTransitionWidth) {
            const val = params.colorTransitionWidth !== undefined ? params.colorTransitionWidth : 1.0;
            if (lastValues.uColorTransitionWidth !== val) {
                gl.uniform1f(locations.uColorTransitionWidth, val);
                lastValues.uColorTransitionWidth = val;
            }
        }
        if (locations.uBarAlphaMin) {
            const val = params.barAlphaMin !== undefined ? params.barAlphaMin : 0.0;
            if (lastValues.uBarAlphaMin !== val) {
                gl.uniform1f(locations.uBarAlphaMin, val);
                lastValues.uBarAlphaMin = val;
            }
        }
        if (locations.uBarAlphaMax) {
            const val = params.barAlphaMax !== undefined ? params.barAlphaMax : 0.85;
            if (lastValues.uBarAlphaMax !== val) {
                gl.uniform1f(locations.uBarAlphaMax, val);
                lastValues.uBarAlphaMax = val;
            }
        }
        if (locations.uBandWidthThreshold) {
            const val = params.bandWidthThreshold !== undefined ? params.bandWidthThreshold : 0.3;
            if (lastValues.uBandWidthThreshold !== val) {
                gl.uniform1f(locations.uBandWidthThreshold, val);
                lastValues.uBandWidthThreshold = val;
            }
        }
        if (locations.uBandWidthMinMultiplier) {
            const val = params.bandWidthMinMultiplier !== undefined ? params.bandWidthMinMultiplier : 0.9;
            if (lastValues.uBandWidthMinMultiplier !== val) {
                gl.uniform1f(locations.uBandWidthMinMultiplier, val);
                lastValues.uBandWidthMinMultiplier = val;
            }
        }
        if (locations.uBandWidthMaxMultiplier) {
            const val = params.bandWidthMaxMultiplier !== undefined ? params.bandWidthMaxMultiplier : 1.35;
            if (lastValues.uBandWidthMaxMultiplier !== val) {
                gl.uniform1f(locations.uBandWidthMaxMultiplier, val);
                lastValues.uBandWidthMaxMultiplier = val;
            }
        }
        if (locations.uContrast) {
            const val = params.contrast !== undefined ? params.contrast : 1.0;
            if (lastValues.uContrast !== val) {
                gl.uniform1f(locations.uContrast, val);
                lastValues.uContrast = val;
            }
        }
        if (locations.uContrastAudioReactive) {
            const val = params.contrastAudioReactive !== undefined ? params.contrastAudioReactive : 1.0;
            if (lastValues.uContrastAudioReactive !== val) {
                gl.uniform1f(locations.uContrastAudioReactive, val);
                lastValues.uContrastAudioReactive = val;
            }
        }
        if (locations.uContrastAudioSource) {
            const val = params.contrastAudioSource !== undefined ? params.contrastAudioSource : 1;
            if (lastValues.uContrastAudioSource !== val) {
                gl.uniform1i(locations.uContrastAudioSource, val);
                lastValues.uContrastAudioSource = val;
            }
        }
        if (locations.uContrastMin) {
            const val = params.contrastMin !== undefined ? params.contrastMin : 1.0;
            if (lastValues.uContrastMin !== val) {
                gl.uniform1f(locations.uContrastMin, val);
                lastValues.uContrastMin = val;
            }
        }
        if (locations.uContrastMax) {
            const val = params.contrastMax !== undefined ? params.contrastMax : 1.35;
            if (lastValues.uContrastMax !== val) {
                gl.uniform1f(locations.uContrastMax, val);
                lastValues.uContrastMax = val;
            }
        }
        if (locations.uGlowIntensity) {
            const val = params.glowIntensity !== undefined ? params.glowIntensity : 5.0;
            if (lastValues.uGlowIntensity !== val) {
                gl.uniform1f(locations.uGlowIntensity, val);
                lastValues.uGlowIntensity = val;
            }
        }
        if (locations.uGlowRadius) {
            const val = params.glowRadius !== undefined ? params.glowRadius : 5.0;
            if (lastValues.uGlowRadius !== val) {
                gl.uniform1f(locations.uGlowRadius, val);
                lastValues.uGlowRadius = val;
            }
        }
        if (locations.uMaskExpansion) {
            const val = params.maskExpansion !== undefined ? params.maskExpansion : 0.18;
            if (lastValues.uMaskExpansion !== val) {
                gl.uniform1f(locations.uMaskExpansion, val);
                lastValues.uMaskExpansion = val;
            }
        }
        if (locations.uMaskCutoutIntensity) {
            const val = params.maskCutoutIntensity !== undefined ? params.maskCutoutIntensity : 1.0;
            if (lastValues.uMaskCutoutIntensity !== val) {
                gl.uniform1f(locations.uMaskCutoutIntensity, val);
                lastValues.uMaskCutoutIntensity = val;
            }
        }
        if (locations.uMaskFeathering) {
            const val = params.maskFeathering !== undefined ? params.maskFeathering : 0.12;
            if (lastValues.uMaskFeathering !== val) {
                gl.uniform1f(locations.uMaskFeathering, val);
                lastValues.uMaskFeathering = val;
            }
        }
        if (locations.uMaskNoiseStrength) {
            const val = params.maskNoiseStrength !== undefined ? params.maskNoiseStrength : 0.0;
            if (lastValues.uMaskNoiseStrength !== val) {
                gl.uniform1f(locations.uMaskNoiseStrength, val);
                lastValues.uMaskNoiseStrength = val;
            }
        }
        if (locations.uMaskNoiseScale) {
            const val = params.maskNoiseScale !== undefined ? params.maskNoiseScale : 0.0;
            if (lastValues.uMaskNoiseScale !== val) {
                gl.uniform1f(locations.uMaskNoiseScale, val);
                lastValues.uMaskNoiseScale = val;
            }
        }
        if (locations.uMaskNoiseSpeed) {
            const val = params.maskNoiseSpeed !== undefined ? params.maskNoiseSpeed : 0.0;
            if (lastValues.uMaskNoiseSpeed !== val) {
                gl.uniform1f(locations.uMaskNoiseSpeed, val);
                lastValues.uMaskNoiseSpeed = val;
            }
        }
        if (locations.uMaskAlphaCurveX1) {
            const val = params.maskAlphaCurveX1 !== undefined ? params.maskAlphaCurveX1 : 0.0;
            if (lastValues.uMaskAlphaCurveX1 !== val) {
                gl.uniform1f(locations.uMaskAlphaCurveX1, val);
                lastValues.uMaskAlphaCurveX1 = val;
            }
        }
        if (locations.uMaskAlphaCurveY1) {
            const val = params.maskAlphaCurveY1 !== undefined ? params.maskAlphaCurveY1 : 1.0;
            if (lastValues.uMaskAlphaCurveY1 !== val) {
                gl.uniform1f(locations.uMaskAlphaCurveY1, val);
                lastValues.uMaskAlphaCurveY1 = val;
            }
        }
        if (locations.uMaskAlphaCurveX2) {
            const val = params.maskAlphaCurveX2 !== undefined ? params.maskAlphaCurveX2 : 0.0;
            if (lastValues.uMaskAlphaCurveX2 !== val) {
                gl.uniform1f(locations.uMaskAlphaCurveX2, val);
                lastValues.uMaskAlphaCurveX2 = val;
            }
        }
        if (locations.uMaskAlphaCurveY2) {
            const val = params.maskAlphaCurveY2 !== undefined ? params.maskAlphaCurveY2 : 1.0;
            if (lastValues.uMaskAlphaCurveY2 !== val) {
                gl.uniform1f(locations.uMaskAlphaCurveY2, val);
                lastValues.uMaskAlphaCurveY2 = val;
            }
        }
        
        // Glitch effect parameters
        if (locations.uGlitchColumnCount) {
            const val = params.glitchColumnCount !== undefined ? params.glitchColumnCount : 2.0;
            if (lastValues.uGlitchColumnCount !== val) {
                gl.uniform1f(locations.uGlitchColumnCount, val);
                lastValues.uGlitchColumnCount = val;
            }
        }
        if (locations.uGlitchRandomSeed) {
            const val = params.glitchRandomSeed !== undefined ? params.glitchRandomSeed : 0.0;
            if (lastValues.uGlitchRandomSeed !== val) {
                gl.uniform1f(locations.uGlitchRandomSeed, val);
                lastValues.uGlitchRandomSeed = val;
            }
        }
        if (locations.uGlitchFlipProbability) {
            const val = params.glitchFlipProbability !== undefined ? params.glitchFlipProbability : 0.3;
            if (lastValues.uGlitchFlipProbability !== val) {
                gl.uniform1f(locations.uGlitchFlipProbability, val);
                lastValues.uGlitchFlipProbability = val;
            }
        }
        if (locations.uGlitchIntensity) {
            const val = params.glitchIntensity !== undefined ? params.glitchIntensity : 1.0;
            if (lastValues.uGlitchIntensity !== val) {
                gl.uniform1f(locations.uGlitchIntensity, val);
                lastValues.uGlitchIntensity = val;
            }
        }
        if (locations.uGlitchBlurAmount) {
            const val = params.glitchBlurAmount !== undefined ? params.glitchBlurAmount : 0.0;
            if (lastValues.uGlitchBlurAmount !== val) {
                gl.uniform1f(locations.uGlitchBlurAmount, val);
                lastValues.uGlitchBlurAmount = val;
            }
        }
        if (locations.uGlitchPixelSize) {
            const val = params.glitchPixelSize !== undefined ? params.glitchPixelSize : 24.0;
            if (lastValues.uGlitchPixelSize !== val) {
                gl.uniform1f(locations.uGlitchPixelSize, val);
                lastValues.uGlitchPixelSize = val;
            }
        }
    }
}
