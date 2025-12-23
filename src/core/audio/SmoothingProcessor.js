// Smoothing Processor Module
// Handles tempo-relative smoothing for frequency bands and main bands

import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

export class SmoothingProcessor {
    constructor(estimatedBPM = 0) {
        this.estimatedBPM = estimatedBPM;
        
        // Smoothed main frequency bands
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedTreble = 0;
        
        // Smoothed frequency bands for color mapping
        this.smoothedFreq1 = 0;
        this.smoothedFreq2 = 0;
        this.smoothedFreq3 = 0;
        this.smoothedFreq4 = 0;
        this.smoothedFreq5 = 0;
        this.smoothedFreq6 = 0;
        this.smoothedFreq7 = 0;
        this.smoothedFreq8 = 0;
        this.smoothedFreq9 = 0;
        this.smoothedFreq10 = 0;
    }
    
    /**
     * Set estimated BPM for tempo-relative smoothing
     * @param {number} bpm - Beats per minute
     */
    setBPM(bpm) {
        this.estimatedBPM = bpm || 0;
    }
    
    /**
     * Smooth main frequency bands (bass, mid, treble)
     * @param {number} bass - Current bass value
     * @param {number} mid - Current mid value
     * @param {number} treble - Current treble value
     * @param {number} deltaTime - Time since last update (seconds)
     * @returns {Object} Object with smoothedBass, smoothedMid, smoothedTreble
     */
    smoothMainBands(bass, mid, treble, deltaTime) {
        const freqConfig = TempoSmoothingConfig.frequencyBands;
        const freqAttackTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.attackNote,
            this.estimatedBPM,
            freqConfig.attackTimeFallback
        );
        const freqReleaseTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.releaseNote,
            this.estimatedBPM,
            freqConfig.releaseTimeFallback
        );
        
        // Smooth main frequency bands
        this.smoothedBass = applyTempoRelativeSmoothing(
            this.smoothedBass,
            bass,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedMid = applyTempoRelativeSmoothing(
            this.smoothedMid,
            mid,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedTreble = applyTempoRelativeSmoothing(
            this.smoothedTreble,
            treble,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        
        return {
            smoothedBass: this.smoothedBass,
            smoothedMid: this.smoothedMid,
            smoothedTreble: this.smoothedTreble
        };
    }
    
    /**
     * Smooth frequency bands for color mapping (freq1-freq10)
     * @param {Object} bands - Object with freq1 through freq10 values
     * @param {number} deltaTime - Time since last update (seconds)
     * @returns {Object} Object with smoothedFreq1 through smoothedFreq10
     */
    smoothFrequencyBands(bands, deltaTime) {
        const freqConfig = TempoSmoothingConfig.frequencyBands;
        const freqAttackTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.attackNote,
            this.estimatedBPM,
            freqConfig.attackTimeFallback
        );
        const freqReleaseTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.releaseNote,
            this.estimatedBPM,
            freqConfig.releaseTimeFallback
        );
        
        // Smooth frequency bands for color mapping
        this.smoothedFreq1 = applyTempoRelativeSmoothing(
            this.smoothedFreq1,
            bands.freq1,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq2 = applyTempoRelativeSmoothing(
            this.smoothedFreq2,
            bands.freq2,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq3 = applyTempoRelativeSmoothing(
            this.smoothedFreq3,
            bands.freq3,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq4 = applyTempoRelativeSmoothing(
            this.smoothedFreq4,
            bands.freq4,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq5 = applyTempoRelativeSmoothing(
            this.smoothedFreq5,
            bands.freq5,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq6 = applyTempoRelativeSmoothing(
            this.smoothedFreq6,
            bands.freq6,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq7 = applyTempoRelativeSmoothing(
            this.smoothedFreq7,
            bands.freq7,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq8 = applyTempoRelativeSmoothing(
            this.smoothedFreq8,
            bands.freq8,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq9 = applyTempoRelativeSmoothing(
            this.smoothedFreq9,
            bands.freq9,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq10 = applyTempoRelativeSmoothing(
            this.smoothedFreq10,
            bands.freq10,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        
        return {
            smoothedFreq1: this.smoothedFreq1,
            smoothedFreq2: this.smoothedFreq2,
            smoothedFreq3: this.smoothedFreq3,
            smoothedFreq4: this.smoothedFreq4,
            smoothedFreq5: this.smoothedFreq5,
            smoothedFreq6: this.smoothedFreq6,
            smoothedFreq7: this.smoothedFreq7,
            smoothedFreq8: this.smoothedFreq8,
            smoothedFreq9: this.smoothedFreq9,
            smoothedFreq10: this.smoothedFreq10
        };
    }
    
    /**
     * Reset all smoothed values
     */
    reset() {
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedTreble = 0;
        this.smoothedFreq1 = 0;
        this.smoothedFreq2 = 0;
        this.smoothedFreq3 = 0;
        this.smoothedFreq4 = 0;
        this.smoothedFreq5 = 0;
        this.smoothedFreq6 = 0;
        this.smoothedFreq7 = 0;
        this.smoothedFreq8 = 0;
        this.smoothedFreq9 = 0;
        this.smoothedFreq10 = 0;
    }
}

