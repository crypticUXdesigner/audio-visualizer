// Smoothing Processor Module
// Handles tempo-relative smoothing for frequency bands and main bands

import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

interface FrequencyBands {
    freq1: number;
    freq2: number;
    freq3: number;
    freq4: number;
    freq5: number;
    freq6: number;
    freq7: number;
    freq8: number;
    freq9: number;
    freq10: number;
}

export class SmoothingProcessor {
    estimatedBPM: number = 0;
    
    // Smoothed main frequency bands
    smoothedBass: number = 0;
    smoothedMid: number = 0;
    smoothedTreble: number = 0;
    
    // Smoothed frequency bands for color mapping
    smoothedFreq1: number = 0;
    smoothedFreq2: number = 0;
    smoothedFreq3: number = 0;
    smoothedFreq4: number = 0;
    smoothedFreq5: number = 0;
    smoothedFreq6: number = 0;
    smoothedFreq7: number = 0;
    smoothedFreq8: number = 0;
    smoothedFreq9: number = 0;
    smoothedFreq10: number = 0;
    
    constructor(estimatedBPM: number = 0) {
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
     * @param bpm - Beats per minute
     */
    setBPM(bpm: number): void {
        this.estimatedBPM = bpm || 0;
    }
    
    /**
     * Smooth main frequency bands (bass, mid, treble)
     * @param bass - Current bass value
     * @param mid - Current mid value
     * @param treble - Current treble value
     * @param deltaTime - Time since last update (seconds)
     * @returns Object with smoothedBass, smoothedMid, smoothedTreble
     */
    smoothMainBands(bass: number, mid: number, treble: number, deltaTime: number): {
        smoothedBass: number;
        smoothedMid: number;
        smoothedTreble: number;
    } {
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
     * @param bands - Object with freq1 through freq10 values
     * @param deltaTime - Time since last update (seconds)
     * @returns Object with smoothedFreq1 through smoothedFreq10
     */
    smoothFrequencyBands(bands: FrequencyBands, deltaTime: number): {
        smoothedFreq1: number;
        smoothedFreq2: number;
        smoothedFreq3: number;
        smoothedFreq4: number;
        smoothedFreq5: number;
        smoothedFreq6: number;
        smoothedFreq7: number;
        smoothedFreq8: number;
        smoothedFreq9: number;
        smoothedFreq10: number;
    } {
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
    reset(): void {
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

