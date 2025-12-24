// Color Modulator Module
// Applies dynamic color modifications based on audio frequency analysis

import { hexToRgb, rgbToOklch, interpolateHue } from './ColorConverter.js';
import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';
import { deepClone } from '../../utils/clone.js';
import type { ColorConfig, ExtendedAudioData } from '../../types/index.js';

/**
 * Color Modulator Class
 * Applies frequency-based hue shifts to color configurations
 */
export class ColorModulator {
    baseConfig: ColorConfig;
    modifiedConfig: ColorConfig;
    smoothedHueShift: number = 0;
    lastHueShift: number = 0;
    lastUpdateTime: number | null = null;
    enabled: boolean = true;
    maxHueShift: number = 45;
    minAudioThreshold: number = 0.5;
    changeThreshold: number = 1.0;
    baseDarkestHue: number | null = null;
    baseBrightestHue: number | null = null;
    
    constructor(baseColorConfig: ColorConfig) {
        // Store deep clone of base config (never modify original)
        this.baseConfig = deepClone(baseColorConfig);
        this.modifiedConfig = deepClone(baseColorConfig);
        
        // State for smoothing
        this.smoothedHueShift = 0;
        this.lastHueShift = 0;
        this.lastUpdateTime = null;  // Track frame time for deltaTime calculation
        
        // Configuration
        this.enabled = true;
        this.maxHueShift = 45; // Maximum degrees to shift (±45°)
        this.minAudioThreshold = 0.5; // Minimum audio level to apply shift
        this.changeThreshold = 1.0; // Only regenerate if shift changes by this much (degrees)
        
        // Calculate base hues from config (if using hueOffset)
        this.baseDarkestHue = null;
        this.baseBrightestHue = null;
        this.calculateBaseHues();
    }
    
    /**
     * Calculate base hues from config (handles both hue and hueOffset)
     */
    calculateBaseHues(): void {
        const baseRgb = hexToRgb(this.baseConfig.baseHue);
        const [, , baseH] = rgbToOklch(baseRgb);
        
        // Calculate darkest hue
        if (this.baseConfig.darkest.hue !== undefined) {
            this.baseDarkestHue = ((this.baseConfig.darkest.hue % 360) + 360) % 360;
        } else {
            const hueOffset = this.baseConfig.darkest.hueOffset || 0;
            this.baseDarkestHue = interpolateHue(baseH, baseH + hueOffset, 1.0);
        }
        
        // Calculate brightest hue
        if (this.baseConfig.brightest.hue !== undefined) {
            this.baseBrightestHue = ((this.baseConfig.brightest.hue % 360) + 360) % 360;
        } else {
            const hueOffset = this.baseConfig.brightest.hueOffset || 0;
            this.baseBrightestHue = interpolateHue(baseH, baseH + hueOffset, 1.0);
        }
    }
    
    /**
     * Update base color config (called when preset changes)
     * @param {Object} newBaseConfig - New base color configuration
     */
    setBaseConfig(newBaseConfig: ColorConfig): void {
        this.baseConfig = deepClone(newBaseConfig);
        this.modifiedConfig = deepClone(newBaseConfig);
        this.calculateBaseHues();
        // Reset smoothing to avoid jarring transitions
        this.smoothedHueShift = 0;
        this.lastHueShift = 0;
        this.lastUpdateTime = null;  // Reset time tracking
    }
    
    /**
     * Update color modulation based on audio data
     * @param {Object} audioData - Audio analysis data from AudioAnalyzer
     * @returns {Object} Modified color configuration with hue shifts applied
     */
    update(audioData: ExtendedAudioData): ColorConfig {
        if (!this.enabled || !audioData) {
            return this.baseConfig;
        }
        
        // Calculate frame time (deltaTime) for time-based smoothing
        const currentTime = performance.now();
        const deltaTime = this.lastUpdateTime !== null 
            ? (currentTime - this.lastUpdateTime) / 1000.0  // Convert ms to seconds
            : 0.016;  // Default to ~60fps (16.67ms) on first frame
        this.lastUpdateTime = currentTime;
        
        // Calculate frequency balance
        const bassWeight = audioData.bass || 0;
        const trebleWeight = audioData.treble || 0;
        const totalWeight = bassWeight + trebleWeight;
        
        // Get BPM from audio data (fallback to 0 if not available)
        const bpm = audioData.estimatedBPM || 0;
        
        // Calculate target hue shift
        let targetHueShift = 0.0;
        
        // Check if audio is above minimum threshold
        if (totalWeight >= this.minAudioThreshold) {
            // Calculate balance: -1 = all bass (warmer), +1 = all treble (cooler)
            const balance = (trebleWeight - bassWeight) / totalWeight;
            
            // Calculate raw hue shift
            // Positive balance (treble) = shift toward cooler (blue/cyan) = positive hue shift
            // Negative balance (bass) = shift toward warmer (red/orange) = negative hue shift
            targetHueShift = balance * this.maxHueShift;
        }
        
        // Apply tempo-relative asymmetric smoothing to hue shift
        const colorConfig = TempoSmoothingConfig.colorModulation;
        const attackTimeConstant = getTempoRelativeTimeConstant(
            colorConfig.attackNote,
            bpm,
            colorConfig.attackTimeFallback
        );
        const releaseTimeConstant = getTempoRelativeTimeConstant(
            colorConfig.releaseNote,
            bpm,
            colorConfig.releaseTimeFallback
        );
        this.smoothedHueShift = applyTempoRelativeSmoothing(
            this.smoothedHueShift,
            targetHueShift,
            deltaTime,
            attackTimeConstant,
            releaseTimeConstant
        );
        
        // Check if shift has changed significantly (performance optimization)
        const shiftDelta = Math.abs(this.smoothedHueShift - this.lastHueShift);
        const shouldUpdate = shiftDelta > this.changeThreshold;
        
        if (shouldUpdate || this.lastHueShift === 0) {
            // Apply hue shift to both darkest and brightest
            const darkestHue = ((this.baseDarkestHue! + this.smoothedHueShift) % 360 + 360) % 360;
            const brightestHue = ((this.baseBrightestHue! + this.smoothedHueShift) % 360 + 360) % 360;
            
            // Update modified config
            this.modifiedConfig.darkest.hue = darkestHue;
            this.modifiedConfig.brightest.hue = brightestHue;
            
            // Remove hueOffset if it exists (we're using direct hue now)
            if (this.modifiedConfig.darkest.hueOffset !== undefined) {
                delete this.modifiedConfig.darkest.hueOffset;
            }
            if (this.modifiedConfig.brightest.hueOffset !== undefined) {
                delete this.modifiedConfig.brightest.hueOffset;
            }
            
            this.lastHueShift = this.smoothedHueShift;
        }
        
        return this.modifiedConfig;
    }
    
    /**
     * Get current modified config (without updating)
     * @returns {Object} Current modified color configuration
     */
    getModifiedConfig(): ColorConfig {
        return this.modifiedConfig;
    }
    
    /**
     * Enable or disable color modulation
     * @param {boolean} enabled - Whether modulation is enabled
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            // Reset to base config
            this.modifiedConfig = deepClone(this.baseConfig);
            this.smoothedHueShift = 0;
            this.lastHueShift = 0;
            this.lastUpdateTime = null;  // Reset time tracking
        }
    }
    
    /**
     * Set maximum hue shift in degrees
     * @param {number} degrees - Maximum hue shift (±degrees)
     */
    setMaxHueShift(degrees: number): void {
        this.maxHueShift = Math.max(0, Math.min(180, degrees)); // Clamp to 0-180
    }
    
    /**
     * Get current hue shift value
     * @returns {number} Current smoothed hue shift in degrees
     */
    getCurrentHueShift(): number {
        return this.smoothedHueShift;
    }
}

