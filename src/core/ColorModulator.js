// Color Modulator Module
// Applies dynamic color modifications based on audio frequency analysis

import { hexToRgb, rgbToOklch, interpolateHue } from './ColorGenerator.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../config/tempo-smoothing-config.js';

/**
 * Deep clones an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Deep cloned object
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

/**
 * Color Modulator Class
 * Applies frequency-based hue shifts to color configurations
 */
export class ColorModulator {
    constructor(baseColorConfig) {
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
    calculateBaseHues() {
        const baseRgb = hexToRgb(this.baseConfig.baseHue);
        const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
        
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
    setBaseConfig(newBaseConfig) {
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
    update(audioData) {
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
            const darkestHue = ((this.baseDarkestHue + this.smoothedHueShift) % 360 + 360) % 360;
            const brightestHue = ((this.baseBrightestHue + this.smoothedHueShift) % 360 + 360) % 360;
            
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
    getModifiedConfig() {
        return this.modifiedConfig;
    }
    
    /**
     * Enable or disable color modulation
     * @param {boolean} enabled - Whether modulation is enabled
     */
    setEnabled(enabled) {
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
    setMaxHueShift(degrees) {
        this.maxHueShift = Math.max(0, Math.min(180, degrees)); // Clamp to 0-180
    }
    
    /**
     * Set smoothing factor (deprecated - now using tempo-relative smoothing)
     * Kept for backward compatibility but no longer used
     * @param {number} factor - Smoothing factor (ignored)
     */
    setSmoothingFactor(factor) {
        // No-op: tempo-relative smoothing is now used instead
        console.warn('ColorModulator.setSmoothingFactor() is deprecated. Tempo-relative smoothing is now used automatically.');
    }
    
    /**
     * Get current hue shift value
     * @returns {number} Current smoothed hue shift in degrees
     */
    getCurrentHueShift() {
        return this.smoothedHueShift;
    }
}

