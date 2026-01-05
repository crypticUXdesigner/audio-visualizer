// Raymarch Shader Plugin
// Handles parameter uniforms and audio smoothing for raymarch shader

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import type { ShaderConfig, ExtendedAudioData } from '../../types/index.js';
import type { ParameterValue } from '../../types/shader.js';
import { UniformManager } from '../managers/UniformManager.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

interface SmoothingState extends Record<string, unknown> {
    smoothedTimeModulation?: number;
    smoothedFractalIntensity?: number;
    smoothedRaymarchSteps?: number;
    smoothedFractalLayers?: number;
    smoothedDepthResponse?: number;
    smoothedMultiFrequency?: number;
}

export class RaymarchShaderPlugin extends BaseShaderPlugin {
    smoothing: SmoothingState;
    
    constructor(shaderInstance: unknown, config: ShaderConfig) {
        super(shaderInstance, config);
        this.smoothing = {};
    }
    
    /**
     * Initialize smoothing state
     */
    onInit(): void {
        this.smoothing = {
            smoothedTimeModulation: 0.0,
            smoothedFractalIntensity: 0.0,
            smoothedRaymarchSteps: 0.0,
            smoothedFractalLayers: 0.0,
            smoothedDepthResponse: 0.0,
            smoothedMultiFrequency: 0.0
        };
    }
    
    /**
     * Get smoothing state object for this plugin
     */
    getSmoothingState(): SmoothingState | null {
        return this.smoothing;
    }
    /**
     * Update raymarch shader-specific parameter uniforms
     */
    onUpdateParameterUniforms(parameters: Record<string, ParameterValue>, config: ShaderConfig, uniformManager: UniformManager): void {
        const gl = this.shaderInstance.gl;
        if (!gl) return;
        const locations = uniformManager.locations;
        const lastValues = uniformManager.lastValues;
        
        const raymarchParams = [
            // Enable flags
            { name: 'uEnableTimeModulation', param: 'enableTimeModulation', default: 0.0 },
            { name: 'uEnableFractalIntensity', param: 'enableFractalIntensity', default: 0.0 },
            { name: 'uEnableRaymarchSteps', param: 'enableRaymarchSteps', default: 0.0 },
            { name: 'uEnableFractalLayers', param: 'enableFractalLayers', default: 0.0 },
            { name: 'uEnableDepthResponse', param: 'enableDepthResponse', default: 0.0 },
            { name: 'uEnableMultiFrequency', param: 'enableMultiFrequency', default: 0.0 },
            { name: 'uEnableColorFrequency', param: 'enableColorFrequency', default: 0.0 },
            { name: 'uEnableColorSystem', param: 'enableColorSystem', default: 0.0 },
            // Strength parameters
            { name: 'uBaseAnimationSpeed', param: 'baseAnimationSpeed', default: 1.0 },
            { name: 'uTimeModulationStrength', param: 'timeModulationStrength', default: 0.3 },
            { name: 'uFractalIntensityStrength', param: 'fractalIntensityStrength', default: 2.0 },
            { name: 'uRaymarchBaseSteps', param: 'raymarchBaseSteps', default: 50.0 },
            { name: 'uRaymarchAudioSteps', param: 'raymarchAudioSteps', default: 50.0 },
            { name: 'uRaymarchInvertReactivity', param: 'raymarchInvertReactivity', default: 0.0 },
            { name: 'uFractalLayerModulation', param: 'fractalLayerModulation', default: 0.5 },
            { name: 'uDepthAudioResponse', param: 'depthAudioResponse', default: 0.5 }
        ];
        
        raymarchParams.forEach(({ name, param, default: defaultValue }) => {
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
    }
    
    /**
     * Update shader-specific uniforms with audio smoothing
     */
    onUpdateUniforms(audioData: ExtendedAudioData | null, _colors: unknown, deltaTime: number): void {
        if (!audioData) return;
        
        const gl = this.shaderInstance.gl;
        if (!gl) return;
        const locations = this.shaderInstance.uniformLocations;
        if (!locations) return;
        
        const params = this.shaderInstance.parameters;
        const bpm = audioData.estimatedBPM || 0;
        
        // Time Modulation Smoothing
        if (params.enableTimeModulation && (params.enableTimeModulation as number) > 0.5) {
            const attackNote = (params.timeModulationAttackNote !== undefined
                ? params.timeModulationAttackNote
                : TempoSmoothingConfig.raymarchTimeModulation.attackNote) as number;
            const releaseNote = (params.timeModulationReleaseNote !== undefined
                ? params.timeModulationReleaseNote
                : TempoSmoothingConfig.raymarchTimeModulation.releaseNote) as number;
            
            const attackTime = getTempoRelativeTimeConstant(
                attackNote,
                bpm,
                TempoSmoothingConfig.raymarchTimeModulation.attackTimeFallback
            );
            const releaseTime = getTempoRelativeTimeConstant(
                releaseNote,
                bpm,
                TempoSmoothingConfig.raymarchTimeModulation.releaseTimeFallback
            );
            
            const strength = (params.timeModulationStrength as number) || 0.0;
            const targetValue = audioData.volume * strength;
            
            this.smoothing.smoothedTimeModulation = applyTempoRelativeSmoothing(
                this.smoothing.smoothedTimeModulation || 0.0,
                targetValue,
                deltaTime,
                attackTime,
                releaseTime
            );
        }
        // Always set uniform (even if disabled, shader will check enable flag)
        if (locations.uSmoothedTimeModulation) {
            gl.uniform1f(locations.uSmoothedTimeModulation, this.smoothing.smoothedTimeModulation || 0.0);
        }
        
        // Fractal Intensity Smoothing
        if (params.enableFractalIntensity && (params.enableFractalIntensity as number) > 0.5) {
            const attackNote = (params.fractalIntensityAttackNote !== undefined
                ? params.fractalIntensityAttackNote
                : TempoSmoothingConfig.raymarchFractalIntensity.attackNote) as number;
            const releaseNote = (params.fractalIntensityReleaseNote !== undefined
                ? params.fractalIntensityReleaseNote
                : TempoSmoothingConfig.raymarchFractalIntensity.releaseNote) as number;
            
            const attackTime = getTempoRelativeTimeConstant(
                attackNote,
                bpm,
                TempoSmoothingConfig.raymarchFractalIntensity.attackTimeFallback
            );
            const releaseTime = getTempoRelativeTimeConstant(
                releaseNote,
                bpm,
                TempoSmoothingConfig.raymarchFractalIntensity.releaseTimeFallback
            );
            
            const strength = (params.fractalIntensityStrength as number) || 0.0;
            const targetValue = audioData.bass * strength;
            
            this.smoothing.smoothedFractalIntensity = applyTempoRelativeSmoothing(
                this.smoothing.smoothedFractalIntensity || 0.0,
                targetValue,
                deltaTime,
                attackTime,
                releaseTime
            );
        }
        // Always set uniform (even if disabled, shader will check enable flag)
        if (locations.uSmoothedFractalIntensity) {
            gl.uniform1f(locations.uSmoothedFractalIntensity, this.smoothing.smoothedFractalIntensity || 0.0);
        }
        
        // Raymarch Steps Smoothing
        if (params.enableRaymarchSteps && (params.enableRaymarchSteps as number) > 0.5) {
            const attackNote = (params.raymarchStepsAttackNote !== undefined
                ? params.raymarchStepsAttackNote
                : TempoSmoothingConfig.raymarchSteps.attackNote) as number;
            const releaseNote = (params.raymarchStepsReleaseNote !== undefined
                ? params.raymarchStepsReleaseNote
                : TempoSmoothingConfig.raymarchSteps.releaseNote) as number;
            
            const attackTime = getTempoRelativeTimeConstant(
                attackNote,
                bpm,
                TempoSmoothingConfig.raymarchSteps.attackTimeFallback
            );
            const releaseTime = getTempoRelativeTimeConstant(
                releaseNote,
                bpm,
                TempoSmoothingConfig.raymarchSteps.releaseTimeFallback
            );
            
            const audioSteps = (params.raymarchAudioSteps as number) || 0.0;
            const invert = (params.raymarchInvertReactivity as number) > 0.5;
            const volumeFactor = invert ? (1.0 - audioData.volume) : audioData.volume;
            const targetValue = audioSteps * volumeFactor;
            
            this.smoothing.smoothedRaymarchSteps = applyTempoRelativeSmoothing(
                this.smoothing.smoothedRaymarchSteps || 0.0,
                targetValue,
                deltaTime,
                attackTime,
                releaseTime
            );
        }
        // Always set uniform (even if disabled, shader will check enable flag)
        if (locations.uSmoothedRaymarchSteps) {
            gl.uniform1f(locations.uSmoothedRaymarchSteps, this.smoothing.smoothedRaymarchSteps || 0.0);
        }
        
        // Fractal Layers Smoothing
        if (params.enableFractalLayers && (params.enableFractalLayers as number) > 0.5) {
            const attackNote = (params.fractalLayersAttackNote !== undefined
                ? params.fractalLayersAttackNote
                : TempoSmoothingConfig.raymarchFractalLayers.attackNote) as number;
            const releaseNote = (params.fractalLayersReleaseNote !== undefined
                ? params.fractalLayersReleaseNote
                : TempoSmoothingConfig.raymarchFractalLayers.releaseNote) as number;
            
            const attackTime = getTempoRelativeTimeConstant(
                attackNote,
                bpm,
                TempoSmoothingConfig.raymarchFractalLayers.attackTimeFallback
            );
            const releaseTime = getTempoRelativeTimeConstant(
                releaseNote,
                bpm,
                TempoSmoothingConfig.raymarchFractalLayers.releaseTimeFallback
            );
            
            const strength = (params.fractalLayerModulation as number) || 0.0;
            const targetValue = audioData.treble * strength * 9.0; // Max 9 layers
            
            this.smoothing.smoothedFractalLayers = applyTempoRelativeSmoothing(
                this.smoothing.smoothedFractalLayers || 0.0,
                targetValue,
                deltaTime,
                attackTime,
                releaseTime
            );
        }
        // Always set uniform (even if disabled, shader will check enable flag)
        if (locations.uSmoothedFractalLayers) {
            gl.uniform1f(locations.uSmoothedFractalLayers, this.smoothing.smoothedFractalLayers || 0.0);
        }
        
        // Depth Response Smoothing
        if (params.enableDepthResponse && (params.enableDepthResponse as number) > 0.5) {
            const attackNote = (params.depthResponseAttackNote !== undefined
                ? params.depthResponseAttackNote
                : TempoSmoothingConfig.raymarchDepthResponse.attackNote) as number;
            const releaseNote = (params.depthResponseReleaseNote !== undefined
                ? params.depthResponseReleaseNote
                : TempoSmoothingConfig.raymarchDepthResponse.releaseNote) as number;
            
            const attackTime = getTempoRelativeTimeConstant(
                attackNote,
                bpm,
                TempoSmoothingConfig.raymarchDepthResponse.attackTimeFallback
            );
            const releaseTime = getTempoRelativeTimeConstant(
                releaseNote,
                bpm,
                TempoSmoothingConfig.raymarchDepthResponse.releaseTimeFallback
            );
            
            const strength = (params.depthAudioResponse as number) || 0.0;
            const targetValue = audioData.bass * strength;
            
            this.smoothing.smoothedDepthResponse = applyTempoRelativeSmoothing(
                this.smoothing.smoothedDepthResponse || 0.0,
                targetValue,
                deltaTime,
                attackTime,
                releaseTime
            );
        }
        // Always set uniform (even if disabled, shader will check enable flag)
        if (locations.uSmoothedDepthResponse) {
            gl.uniform1f(locations.uSmoothedDepthResponse, this.smoothing.smoothedDepthResponse || 0.0);
        }
        
        // Multi-Frequency Smoothing (reacts to bass)
        if (params.enableMultiFrequency && (params.enableMultiFrequency as number) > 0.5) {
            const attackNote = (params.multiFrequencyAttackNote !== undefined
                ? params.multiFrequencyAttackNote
                : TempoSmoothingConfig.raymarchMultiFrequency.attackNote) as number;
            const releaseNote = (params.multiFrequencyReleaseNote !== undefined
                ? params.multiFrequencyReleaseNote
                : TempoSmoothingConfig.raymarchMultiFrequency.releaseNote) as number;
            
            const attackTime = getTempoRelativeTimeConstant(
                attackNote,
                bpm,
                TempoSmoothingConfig.raymarchMultiFrequency.attackTimeFallback
            );
            const releaseTime = getTempoRelativeTimeConstant(
                releaseNote,
                bpm,
                TempoSmoothingConfig.raymarchMultiFrequency.releaseTimeFallback
            );
            
            // React to bass frequencies
            const strength = (params.multiFrequencyStrength as number) || 1.0;
            const targetValue = audioData.bass * strength;
            
            this.smoothing.smoothedMultiFrequency = applyTempoRelativeSmoothing(
                this.smoothing.smoothedMultiFrequency || 0.0,
                targetValue,
                deltaTime,
                attackTime,
                releaseTime
            );
        }
        // Always set uniform (even if disabled, shader will check enable flag)
        if (locations.uSmoothedMultiFrequency) {
            gl.uniform1f(locations.uSmoothedMultiFrequency, this.smoothing.smoothedMultiFrequency || 0.0);
        }
    }
}

