// ArcShaderPlugin - Plugin for arc shader
// Handles frequency texture updates for arc visualization

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

export class ArcShaderPlugin extends BaseShaderPlugin {
    constructor(shaderInstance, config) {
        super(shaderInstance, config);
        
        // Smoothing state for arc shader
        this.smoothing = {
            smoothedLeftBands: null,
            smoothedRightBands: null
        };
        
        // Frequency texture
        this.frequencyTextures = {
            leftRight: null
        };
        
        this._measuredBands = 24;
    }
    
    getSmoothingState() {
        return this.smoothing;
    }
    
    /**
     * Update frequency textures for arc shader
     */
    onUpdateTextures(audioData, deltaTime) {
        if (!audioData || !audioData.audioContext) return;
        
        const gl = this.shaderInstance.gl;
        if (!gl) return;
        
        // Get measured bands from config
        const measuredBands = this.shaderInstance.parameters.measuredBands !== undefined 
            ? this.shaderInstance.parameters.measuredBands 
            : (this._measuredBands || 24);
        this._measuredBands = measuredBands;
        
        // Initialize smoothed band arrays if needed
        if (!this.smoothing.smoothedLeftBands || 
            this.smoothing.smoothedLeftBands.length !== measuredBands) {
            this.smoothing.smoothedLeftBands = new Float32Array(measuredBands);
            this.smoothing.smoothedRightBands = new Float32Array(measuredBands);
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
        
        // Get attack/release note values from config
        const arcAttackNote = this.shaderInstance.parameters.arcAttackNote !== undefined
            ? this.shaderInstance.parameters.arcAttackNote
            : TempoSmoothingConfig.arc.attackNote;
        const arcReleaseNote = this.shaderInstance.parameters.arcReleaseNote !== undefined
            ? this.shaderInstance.parameters.arcReleaseNote
            : TempoSmoothingConfig.arc.releaseNote;
        
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
            this.smoothing.smoothedLeftBands[i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedLeftBands[i],
                bandData.leftBands[i],
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
            );
            
            // Smooth right channel
            this.smoothing.smoothedRightBands[i] = applyTempoRelativeSmoothing(
                this.smoothing.smoothedRightBands[i],
                bandData.rightBands[i],
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
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
                'arc_leftRight'
            );
            
            // Set texture uniform
            textureManager.bindTexture(this.frequencyTextures.leftRight, 0);
            if (this.shaderInstance.uniformLocations.uFrequencyTexture) {
                gl.uniform1i(this.shaderInstance.uniformLocations.uFrequencyTexture, 0);
            }
        }
        
        // Set measured bands uniform
        if (this.shaderInstance.uniformLocations.uMeasuredBands) {
            gl.uniform1f(this.shaderInstance.uniformLocations.uMeasuredBands, measuredBands);
        }
        
        // Set visual bands uniform
        const visualBands = this.shaderInstance.parameters.numBands || 64;
        if (this.shaderInstance.uniformLocations.uNumBands) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uNumBands, visualBands);
        }
    }
    
    /**
     * Update shader-specific uniforms
     */
    onUpdateUniforms(audioData, colors, deltaTime) {
        const gl = this.shaderInstance.gl;
        if (!gl) return;
        
        const params = this.shaderInstance.parameters;
        const locations = this.shaderInstance.uniformLocations;
        const lastValues = this.shaderInstance._lastUniformValues;
        
        // Set arc parameters
        if (locations.uBaseRadius) {
            const val = params.baseRadius !== undefined ? params.baseRadius : 0.3;
            if (lastValues.uBaseRadius !== val) {
                gl.uniform1f(locations.uBaseRadius, val);
                lastValues.uBaseRadius = val;
            }
        }
        if (locations.uMaxRadiusOffset) {
            const val = params.maxRadiusOffset !== undefined ? params.maxRadiusOffset : 0.2;
            if (lastValues.uMaxRadiusOffset !== val) {
                gl.uniform1f(locations.uMaxRadiusOffset, val);
                lastValues.uMaxRadiusOffset = val;
            }
        }
        if (locations.uCenterX) {
            const val = params.centerX !== undefined ? params.centerX : 0.5;
            if (lastValues.uCenterX !== val) {
                gl.uniform1f(locations.uCenterX, val);
                lastValues.uCenterX = val;
            }
        }
        if (locations.uCenterY) {
            const val = params.centerY !== undefined ? params.centerY : 0.5;
            if (lastValues.uCenterY !== val) {
                gl.uniform1f(locations.uCenterY, val);
                lastValues.uCenterY = val;
            }
        }
        if (locations.uColorTransitionWidth) {
            const val = params.colorTransitionWidth !== undefined ? params.colorTransitionWidth : 0.003;
            if (lastValues.uColorTransitionWidth !== val) {
                gl.uniform1f(locations.uColorTransitionWidth, val);
                lastValues.uColorTransitionWidth = val;
            }
        }
    }
}

