// Volume Analyzer Module
// Handles volume calculation, peak detection, and volume smoothing

import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

export class VolumeAnalyzer {
    volume: number = 0;
    peakVolume: number = 0;
    smoothedVolume: number = 0.0;
    
    // Peak detection (decay over time)
    peakBass: number = 0;
    peakMid: number = 0;
    peakTreble: number = 0;
    peakDecay: number = 0.92; // Decay factor for peaks
    
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
     * @param timeData - Time domain audio data (0-255)
     * @returns RMS volume (0.0 to 1.0)
     */
    getRMS(timeData: Uint8Array): number {
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
            const normalized = (timeData[i] - 128) / 128.0;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / timeData.length);
    }
    
    /**
     * Calculate peak volume (maximum absolute value) from time domain data
     * @param timeData - Time domain audio data (0-255)
     * @returns Peak volume (0.0 to 1.0)
     */
    getPeakVolume(timeData: Uint8Array): number {
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
            const normalized = Math.abs((timeData[i] - 128) / 128.0);
            peak = Math.max(peak, normalized);
        }
        return peak; // Returns 0-1 range
    }
    
    /**
     * Update volume calculations from time domain data
     * @param timeData - Time domain audio data
     */
    calculateVolume(timeData: Uint8Array): void {
        this.volume = this.getRMS(timeData);
        this.peakVolume = this.getPeakVolume(timeData);
    }
    
    /**
     * Apply tempo-relative smoothing to volume
     * @param deltaTime - Time since last update (seconds)
     * @param estimatedBPM - Estimated BPM for tempo-relative smoothing
     */
    smoothVolume(deltaTime: number, estimatedBPM: number): void {
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
     * @param bass - Current bass value
     * @param mid - Current mid value
     * @param treble - Current treble value
     */
    updatePeaks(bass: number, mid: number, treble: number): void {
        this.peakBass = Math.max(this.peakBass * this.peakDecay, bass);
        this.peakMid = Math.max(this.peakMid * this.peakDecay, mid);
        this.peakTreble = Math.max(this.peakTreble * this.peakDecay, treble);
    }
    
    /**
     * Get current peak values
     * @returns Object with peakBass, peakMid, peakTreble
     */
    getPeaks(): { peakBass: number; peakMid: number; peakTreble: number } {
        return {
            peakBass: this.peakBass,
            peakMid: this.peakMid,
            peakTreble: this.peakTreble
        };
    }
    
    /**
     * Reset all volume state
     */
    reset(): void {
        this.volume = 0;
        this.peakVolume = 0;
        this.smoothedVolume = 0.0;
        this.peakBass = 0;
        this.peakMid = 0;
        this.peakTreble = 0;
    }
}

