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
import type { Colors } from '../../types/webgl.js';

interface SmoothingState extends Record<string, unknown> {
    smoothedLeftBands: Float32Array | null;
    smoothedRightBands: Float32Array | null;
}

interface FrequencyTextures {
    leftRight: WebGLTexture | null;
}

export class ArcShaderPlugin extends BaseShaderPlugin {
    smoothing: SmoothingState;
    frequencyTextures: FrequencyTextures;
    _measuredBands: number;
    uniformHelper: UniformUpdateHelper | null;
    
    constructor(shaderInstance: ShaderInstance, config: ShaderConfig) {
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
    onUpdateUniforms(_audioData: ExtendedAudioData | null, _colors: Colors | null, _deltaTime: number): void {
        if (!this.uniformHelper) return;
        
        const params = this.shaderInstance.parameters;
        const helper = this.uniformHelper;
        
        // Set arc parameters
        helper.updateFloat('uBaseRadius', params.baseRadius as number | undefined, 0.3);
        helper.updateFloat('uMaxRadiusOffset', params.maxRadiusOffset as number | undefined, 0.2);
        helper.updateFloat('uCenterX', params.centerX as number | undefined, 0.5);
        helper.updateFloat('uCenterY', params.centerY as number | undefined, 0.5);
        helper.updateFloat('uColorTransitionWidth', params.colorTransitionWidth as number | undefined, 0.003);
    }
    
    /**
     * Clean up plugin resources
     */
    onDestroy(): void {
        this.smoothing.smoothedLeftBands = null;
        this.smoothing.smoothedRightBands = null;
        this.frequencyTextures.leftRight = null;
        this.uniformHelper = null;
    }
}

