// Volume Analyzer Module
// Handles volume calculation, peak detection, and volume smoothing

import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

export class VolumeAnalyzer {
    constructor() {
        // Volume state
        this.volume = 0;
        this.peakVolume = 0;
        this.smoothedVolume = 0.0;
        
        // Peak detection (decay over time)
        this.peakBass = 0;
        this.peakMid = 0;
        this.peakTreble = 0;
        this.peakDecay = 0.92; // Decay factor for peaks
    }
    
    /**
     * Calculate RMS (Root Mean Square) volume from time domain data
     * @param {Uint8Array} timeData - Time domain audio data (0-255)
     * @returns {number} RMS volume (0.0 to 1.0)
     */
    getRMS(timeData) {
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
            const normalized = (timeData[i] - 128) / 128.0;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / timeData.length);
    }
    
    /**
     * Calculate peak volume (maximum absolute value) from time domain data
     * @param {Uint8Array} timeData - Time domain audio data (0-255)
     * @returns {number} Peak volume (0.0 to 1.0)
     */
    getPeakVolume(timeData) {
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
            const normalized = Math.abs((timeData[i] - 128) / 128.0);
            peak = Math.max(peak, normalized);
        }
        return peak; // Returns 0-1 range
    }
    
    /**
     * Update volume calculations from time domain data
     * @param {Uint8Array} timeData - Time domain audio data
     */
    calculateVolume(timeData) {
        this.volume = this.getRMS(timeData);
        this.peakVolume = this.getPeakVolume(timeData);
    }
    
    /**
     * Apply tempo-relative smoothing to volume
     * @param {number} deltaTime - Time since last update (seconds)
     * @param {number} estimatedBPM - Estimated BPM for tempo-relative smoothing
     */
    smoothVolume(deltaTime, estimatedBPM) {
        const volumeConfig = TempoSmoothingConfig.volume;
        const attackTimeConstant = getTempoRelativeTimeConstant(
            volumeConfig.attackNote,
            estimatedBPM,
            volumeConfig.attackTimeFallback
        );
        const releaseTimeConstant = getTempoRelativeTimeConstant(
            volumeConfig.releaseNote,
            estimatedBPM,
            volumeConfig.releaseTimeFallback
        );
        
        this.smoothedVolume = applyTempoRelativeSmoothing(
            this.smoothedVolume,
            this.volume,
            deltaTime,
            attackTimeConstant,
            releaseTimeConstant
        );
    }
    
    /**
     * Update peak values with decay
     * @param {number} bass - Current bass value
     * @param {number} mid - Current mid value
     * @param {number} treble - Current treble value
     */
    updatePeaks(bass, mid, treble) {
        this.peakBass = Math.max(this.peakBass * this.peakDecay, bass);
        this.peakMid = Math.max(this.peakMid * this.peakDecay, mid);
        this.peakTreble = Math.max(this.peakTreble * this.peakDecay, treble);
    }
    
    /**
     * Get current peak values
     * @returns {Object} Object with peakBass, peakMid, peakTreble
     */
    getPeaks() {
        return {
            peakBass: this.peakBass,
            peakMid: this.peakMid,
            peakTreble: this.peakTreble
        };
    }
    
    /**
     * Reset all volume state
     */
    reset() {
        this.volume = 0;
        this.peakVolume = 0;
        this.smoothedVolume = 0.0;
        this.peakBass = 0;
        this.peakMid = 0;
        this.peakTreble = 0;
    }
}

