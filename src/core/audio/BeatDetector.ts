// Beat Detector Module
// Handles beat detection across multiple frequency bands with ripple tracking

import { RIPPLE_CONFIG, AUDIO_THRESHOLDS } from '../../config/constants.js';
import type { RippleManager } from './RippleManager.js';
import type { VolumeAnalyzer } from './VolumeAnalyzer.js';

interface BeatState {
    beatTime: number;
    beatIntensity: number;
    lastBeatTime: number;
    estimatedBPM: number;
    metadataBPM: number;
    
    // Multi-frequency beat detection
    beatTimeBass: number;
    beatTimeMid: number;
    beatTimeTreble: number;
    beatIntensityBass: number;
    beatIntensityMid: number;
    beatIntensityTreble: number;
    beatStereoBass: number;
    beatStereoMid: number;
    beatStereoTreble: number;
    lastBeatTimeBass: number;
    lastBeatTimeMid: number;
    lastBeatTimeTreble: number;
    
    // Previous values for dynamic change detection
    previousBass: number;
    previousMid: number;
    previousTreble: number;
}

export class BeatDetector {
    private state: BeatState;
    private rippleManager: RippleManager | null;
    private volumeAnalyzer: VolumeAnalyzer | null;
    private dynamicChangeThreshold: number;
    private bassThreshold: number;
    private midThreshold: number;
    private trebleThreshold: number;
    
    constructor() {
        this.state = {
            beatTime: 0,
            beatIntensity: 0,
            lastBeatTime: 0,
            estimatedBPM: 0,
            metadataBPM: 0,
            beatTimeBass: 0,
            beatTimeMid: 0,
            beatTimeTreble: 0,
            beatIntensityBass: 0,
            beatIntensityMid: 0,
            beatIntensityTreble: 0,
            beatStereoBass: 0,
            beatStereoMid: 0,
            beatStereoTreble: 0,
            lastBeatTimeBass: 0,
            lastBeatTimeMid: 0,
            lastBeatTimeTreble: 0,
            previousBass: 0,
            previousMid: 0,
            previousTreble: 0
        };
        
        this.rippleManager = null;
        this.volumeAnalyzer = null;
        this.dynamicChangeThreshold = AUDIO_THRESHOLDS.DYNAMIC_CHANGE;
        this.bassThreshold = AUDIO_THRESHOLDS.BASS;
        this.midThreshold = AUDIO_THRESHOLDS.MID;
        this.trebleThreshold = AUDIO_THRESHOLDS.TREBLE;
    }
    
    setRippleManager(rippleManager: RippleManager | null): void {
        this.rippleManager = rippleManager;
    }
    
    setVolumeAnalyzer(volumeAnalyzer: VolumeAnalyzer | null): void {
        this.volumeAnalyzer = volumeAnalyzer;
    }
    
    setMetadataBPM(bpm: number): void {
        if (typeof bpm === 'number' && bpm > 0 && bpm <= 300) {
            this.state.metadataBPM = bpm;
            this.state.estimatedBPM = bpm;  // Use metadata BPM as initial estimate
        } else {
            this.state.metadataBPM = 0;
        }
    }
    
    getMetadataBPM(): number {
        return this.state.metadataBPM;
    }
    
    getEstimatedBPM(): number {
        return this.state.estimatedBPM;
    }
    
    getState(): BeatState {
        return { ...this.state };
    }
    
    /**
     * Detect beats across all frequency bands
     * @param bass - Current bass value
     * @param mid - Current mid value
     * @param treble - Current treble value
     * @param smoothedBass - Smoothed bass value
     * @param smoothedMid - Smoothed mid value
     * @param smoothedTreble - Smoothed treble value
     * @param bassStereo - Bass stereo position
     * @param midStereo - Mid stereo position
     * @param trebleStereo - Treble stereo position
     */
    detect(
        bass: number,
        mid: number,
        treble: number,
        smoothedBass: number,
        smoothedMid: number,
        smoothedTreble: number,
        bassStereo: number,
        midStereo: number,
        trebleStereo: number
    ): void {
        const currentTime = Date.now();
        const minBeatInterval = 160; // Minimum 160ms between beats (300 BPM max)
        
        // Detect beats for each frequency band separately
        const bands = [
            { 
                value: bass, 
                smoothed: smoothedBass,
                stereo: bassStereo,
                beatTime: 'beatTimeBass' as const,
                intensity: 'beatIntensityBass' as const,
                stereoPos: 'beatStereoBass' as const,
                lastTime: 'lastBeatTimeBass' as const,
                minThreshold: this.bassThreshold,
                bandType: 'bass' as const
            },
            { 
                value: mid, 
                smoothed: smoothedMid,
                stereo: midStereo,
                beatTime: 'beatTimeMid' as const,
                intensity: 'beatIntensityMid' as const,
                stereoPos: 'beatStereoMid' as const,
                lastTime: 'lastBeatTimeMid' as const,
                minThreshold: this.midThreshold,
                bandType: 'mid' as const
            },
            { 
                value: treble, 
                smoothed: smoothedTreble,
                stereo: trebleStereo,
                beatTime: 'beatTimeTreble' as const,
                intensity: 'beatIntensityTreble' as const,
                stereoPos: 'beatStereoTreble' as const,
                lastTime: 'lastBeatTimeTreble' as const,
                minThreshold: this.trebleThreshold,
                bandType: 'treble' as const
            }
        ];
        
        bands.forEach((band) => {
            // Use peak-based threshold instead of smoothed-based to detect beats
            let peakValue = 0;
            if (band.beatTime === 'beatTimeBass') {
                peakValue = this.volumeAnalyzer?.peakBass || 0;
            } else if (band.beatTime === 'beatTimeMid') {
                peakValue = this.volumeAnalyzer?.peakMid || 0;
            } else if (band.beatTime === 'beatTimeTreble') {
                peakValue = this.volumeAnalyzer?.peakTreble || 0;
            }
            
            // Threshold: 85% of current peak value, or minimum threshold, whichever is higher
            const threshold = Math.max(peakValue * 0.85, band.minThreshold);
            
            // Update beat time (time since last beat in seconds)
            let lastTime = this.state[band.lastTime];
            let beatTime = this.state[band.beatTime];
            let beatIntensity = this.state[band.intensity];
            let beatStereo = this.state[band.stereoPos];
            
            if (lastTime > 0) {
                beatTime = (currentTime - lastTime) / 1000.0;
                if (beatTime > 2.0) {
                    beatTime = 0;
                    beatIntensity = 0;
                }
            } else {
                beatTime = 0;
            }
            
            // Get previous value for dynamic change detection
            let previousValue = 0;
            if (band.beatTime === 'beatTimeBass') {
                previousValue = this.state.previousBass;
            } else if (band.beatTime === 'beatTimeMid') {
                previousValue = this.state.previousMid;
            } else if (band.beatTime === 'beatTimeTreble') {
                previousValue = this.state.previousTreble;
            }
            
            // Calculate dynamic change (how much the signal has increased)
            const dynamicChange = band.value - previousValue;
            
            // Check for new beat with dynamic change detection
            if (band.value > threshold && band.value > band.minThreshold && 
                (lastTime === 0 || (currentTime - lastTime) > minBeatInterval) &&
                dynamicChange > this.dynamicChangeThreshold) {
                // Beat detected!
                const intensity = Math.min(band.value * 1.5, 1.0);
                beatIntensity = intensity;
                beatStereo = band.stereo;
                beatTime = 0;
                
                // Update state
                this.state[band.lastTime] = currentTime;
                this.state[band.beatTime] = beatTime;
                this.state[band.intensity] = beatIntensity;
                this.state[band.stereoPos] = beatStereo;
                
                // Add new ripple to tracking system
                if (this.rippleManager) {
                    this.rippleManager.addRipple(currentTime, band.stereo, intensity, band.bandType);
                }
            } else {
                // Update beat time properties even if no beat detected
                this.state[band.beatTime] = beatTime;
                this.state[band.intensity] = beatIntensity;
            }
            
            // Update previous values for next frame
            if (band.beatTime === 'beatTimeBass') {
                this.state.previousBass = band.value;
            } else if (band.beatTime === 'beatTimeMid') {
                this.state.previousMid = band.value;
            } else if (band.beatTime === 'beatTimeTreble') {
                this.state.previousTreble = band.value;
            }
        });
        
        // BPM calculation (based on bass beats) for overall beat tracking
        const bassThreshold = smoothedBass * 1.4;
        if (this.state.lastBeatTime > 0) {
            this.state.beatTime = (currentTime - this.state.lastBeatTime) / 1000.0;
            if (this.state.beatTime > 2.0) {
                this.state.beatTime = 0;
                this.state.beatIntensity = 0;
            }
        } else {
            this.state.beatTime = 0;
        }
        
        if (bass > bassThreshold && bass > 0.15 && 
            (this.state.lastBeatTime === 0 || (currentTime - this.state.lastBeatTime) > minBeatInterval)) {
            const previousBeatTime = this.state.lastBeatTime;
            this.state.lastBeatTime = currentTime;
            this.state.beatIntensity = Math.min(bass / 0.8, 1.0);
            this.state.beatTime = 0;
            
            // Calculate BPM estimate (only if metadata BPM is not available)
            if (this.state.metadataBPM === 0 && previousBeatTime > 0) {
                const beatInterval = (currentTime - previousBeatTime) / 1000.0;
                if (beatInterval > 0.1 && beatInterval < 2.0) {
                    const instantBPM = 60.0 / beatInterval;
                    if (this.state.estimatedBPM === 0) {
                        this.state.estimatedBPM = instantBPM;
                    } else {
                        this.state.estimatedBPM = this.state.estimatedBPM * 0.7 + instantBPM * 0.3;
                    }
                }
            }
        }
    }
}
