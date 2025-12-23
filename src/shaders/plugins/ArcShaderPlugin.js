// ArcShaderPlugin - Plugin for arc shader
// Handles frequency texture updates for arc visualization

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';
import { FrequencyTextureCalculator } from '../utils/FrequencyTextureCalculator.js';
import { UniformUpdateHelper } from '../utils/UniformUpdateHelper.js';

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
        
        // Calculate configurable bands using shared utility
        const bandData = FrequencyTextureCalculator.calculateBands(
            audioData,
            measuredBands,
            this.shaderInstance._audioAnalyzer
        );
        
        if (!bandData) {
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
        
        // Create texture data using shared utility
        const leftRightData = FrequencyTextureCalculator.createTextureData(
            this.smoothing.smoothedLeftBands,
            this.smoothing.smoothedRightBands
        );
        
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
        if (!this.uniformHelper) return;
        
        const params = this.shaderInstance.parameters;
        const helper = this.uniformHelper;
        
        // Set arc parameters
        helper.updateFloat('uBaseRadius', params.baseRadius, 0.3);
        helper.updateFloat('uMaxRadiusOffset', params.maxRadiusOffset, 0.2);
        helper.updateFloat('uCenterX', params.centerX, 0.5);
        helper.updateFloat('uCenterY', params.centerY, 0.5);
        helper.updateFloat('uColorTransitionWidth', params.colorTransitionWidth, 0.003);
    }
}

