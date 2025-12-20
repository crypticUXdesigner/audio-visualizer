// Beat Detection Module
// Handles beat detection logic, BPM estimation, and peak detection

export class BeatDetector {
    constructor(audioAnalyzer) {
        this.audioAnalyzer = audioAnalyzer;
        
        // Beat detection state
        this.beatTime = 0;        // Time since last beat (in seconds)
        this.beatIntensity = 0;   // Intensity of last beat (0-1)
        this.lastBeatTime = 0;    // Timestamp of last beat (milliseconds)
        this.estimatedBPM = 0;    // Estimated beats per minute
        this.metadataBPM = 0;     // BPM from file metadata or API (takes precedence)
        
        // Multi-frequency beat detection
        this.beatTimeBass = 0;
        this.beatTimeMid = 0;
        this.beatTimeTreble = 0;
        this.beatIntensityBass = 0;
        this.beatIntensityMid = 0;
        this.beatIntensityTreble = 0;
        this.beatStereoBass = 0;    // Stereo position when bass beat was detected (fixed)
        this.beatStereoMid = 0;     // Stereo position when mid beat was detected (fixed)
        this.beatStereoTreble = 0;  // Stereo position when treble beat was detected (fixed)
        this.lastBeatTimeBass = 0;
        this.lastBeatTimeMid = 0;
        this.lastBeatTimeTreble = 0;
        
        // Dynamic change detection
        this.previousBass = 0;
        this.previousMid = 0;
        this.previousTreble = 0;
        this.dynamicChangeThreshold = 0.07; // Minimum change required to trigger ripple
        
        // Configurable thresholds per frequency band for ripple triggering
        this.bassThreshold = 0.08;   // Minimum threshold for bass to trigger ripple
        this.midThreshold = 0.05;    // Minimum threshold for mid to trigger ripple
        this.trebleThreshold = 0.05; // Minimum threshold for treble to trigger ripple
        
        // New ripples created this frame
        this.newRipples = [];
    }
    
    setMetadataBPM(bpm) {
        this.metadataBPM = bpm;
        if (bpm > 0) {
            this.estimatedBPM = bpm;
        }
    }
    
    /**
     * Detect beats for all frequency bands
     * @param {number} bass - Current bass value
     * @param {number} mid - Current mid value
     * @param {number} treble - Current treble value
     * @param {number} smoothedBass - Smoothed bass value
     * @param {number} smoothedMid - Smoothed mid value
     * @param {number} smoothedTreble - Smoothed treble value
     * @param {number} bassStereo - Bass stereo position
     * @param {number} midStereo - Mid stereo position
     * @param {number} trebleStereo - Treble stereo position
     * @param {number} peakBass - Peak bass value
     * @param {number} peakMid - Peak mid value
     * @param {number} peakTreble - Peak treble value
     * @param {number} currentTime - Current timestamp (milliseconds)
     */
    detect(bass, mid, treble, smoothedBass, smoothedMid, smoothedTreble, 
           bassStereo, midStereo, trebleStereo, peakBass, peakMid, peakTreble, currentTime) {
        this.newRipples = [];
        const minBeatInterval = 160; // Minimum 160ms between beats (300 BPM max)
        
        // Detect beats for each frequency band separately
        const bands = [
            { 
                value: bass, 
                smoothed: smoothedBass,
                stereo: bassStereo,
                peak: peakBass,
                beatTime: 'beatTimeBass',
                intensity: 'beatIntensityBass',
                stereoPos: 'beatStereoBass',
                lastTime: 'lastBeatTimeBass',
                minThreshold: this.bassThreshold,
                bandType: 'bass',
                previous: this.previousBass
            },
            { 
                value: mid, 
                smoothed: smoothedMid,
                stereo: midStereo,
                peak: peakMid,
                beatTime: 'beatTimeMid',
                intensity: 'beatIntensityMid',
                stereoPos: 'beatStereoMid',
                lastTime: 'lastBeatTimeMid',
                minThreshold: this.midThreshold,
                bandType: 'mid',
                previous: this.previousMid
            },
            { 
                value: treble, 
                smoothed: smoothedTreble,
                stereo: trebleStereo,
                peak: peakTreble,
                beatTime: 'beatTimeTreble',
                intensity: 'beatIntensityTreble',
                stereoPos: 'beatStereoTreble',
                lastTime: 'lastBeatTimeTreble',
                minThreshold: this.trebleThreshold,
                bandType: 'treble',
                previous: this.previousTreble
            }
        ];
        
        bands.forEach((band) => {
            // Use peak-based threshold instead of smoothed-based to detect beats
            // Peak decays over time, so when current value exceeds decaying peak, it's a beat
            const threshold = Math.max(band.peak * 0.85, band.minThreshold);
            
            // Update beat time (time since last beat in seconds)
            if (this[band.lastTime] > 0) {
                this[band.beatTime] = (currentTime - this[band.lastTime]) / 1000.0;
                // Cap at 2 seconds (fade out after 2s)
                if (this[band.beatTime] > 2.0) {
                    this[band.beatTime] = 0;
                    this[band.intensity] = 0;
                }
            } else {
                this[band.beatTime] = 0;
            }
            
            // Calculate dynamic change (how much the signal has increased)
            const dynamicChange = band.value - band.previous;
            
            // Check for new beat with dynamic change detection
            // Must pass: threshold check, minimum threshold, beat interval, AND significant dynamic change
            if (band.value > threshold && band.value > band.minThreshold && 
                (this[band.lastTime] === 0 || (currentTime - this[band.lastTime]) > minBeatInterval) &&
                dynamicChange > this.dynamicChangeThreshold) {
                // Beat detected! Capture stereo position at this moment (fixed for this ripple)
                this[band.lastTime] = currentTime;
                // Increase intensity calculation to make ripples more visible
                const intensity = Math.min(band.value * 1.5, 1.0);
                this[band.intensity] = intensity;
                this[band.stereoPos] = band.stereo; // Capture stereo position (won't change)
                this[band.beatTime] = 0; // Reset beat time
                
                // Add new ripple to tracking system (rate limiting handled inside)
                // Pass band type for vertical positioning: bass=lower, mid=center, treble=higher
                this.newRipples.push({
                    startTime: currentTime,
                    stereoPos: band.stereo,
                    intensity: intensity,
                    bandType: band.bandType
                });
            }
            
            // Update previous values for next frame
            if (band.bandType === 'bass') {
                this.previousBass = band.value;
            } else if (band.bandType === 'mid') {
                this.previousMid = band.value;
            } else if (band.bandType === 'treble') {
                this.previousTreble = band.value;
            }
        });
        
        // Keep existing BPM calculation (based on bass) for backward compatibility
        const bassThreshold = smoothedBass * 1.4;
        if (this.lastBeatTime > 0) {
            this.beatTime = (currentTime - this.lastBeatTime) / 1000.0;
            if (this.beatTime > 2.0) {
                this.beatTime = 0;
                this.beatIntensity = 0;
            }
        } else {
            this.beatTime = 0;
        }
        
        if (bass > bassThreshold && bass > 0.15 && 
            (this.lastBeatTime === 0 || (currentTime - this.lastBeatTime) > minBeatInterval)) {
            const previousBeatTime = this.lastBeatTime;
            this.lastBeatTime = currentTime;
            this.beatIntensity = Math.min(bass / 0.8, 1.0);
            this.beatTime = 0;
            
            // Calculate BPM estimate (only if metadata BPM is not available)
            // Metadata BPM takes precedence over detected BPM
            if (this.metadataBPM === 0 && previousBeatTime > 0) {
                const beatInterval = (currentTime - previousBeatTime) / 1000.0;
                if (beatInterval > 0.1 && beatInterval < 2.0) { // Reasonable range (30-600 BPM)
                    const instantBPM = 60.0 / beatInterval;
                    if (this.estimatedBPM === 0) {
                        this.estimatedBPM = instantBPM;
                    } else {
                        this.estimatedBPM = this.estimatedBPM * 0.7 + instantBPM * 0.3;
                    }
                }
            }
        }
    }
    
    /**
     * Get all beat detection results
     * @returns {Object} Object containing all beat detection state
     */
    getResults() {
        return {
            beatTime: this.beatTime,
            beatIntensity: this.beatIntensity,
            estimatedBPM: this.estimatedBPM,
            beatTimeBass: this.beatTimeBass,
            beatTimeMid: this.beatTimeMid,
            beatTimeTreble: this.beatTimeTreble,
            beatIntensityBass: this.beatIntensityBass,
            beatIntensityMid: this.beatIntensityMid,
            beatIntensityTreble: this.beatIntensityTreble,
            beatStereoBass: this.beatStereoBass,
            beatStereoMid: this.beatStereoMid,
            beatStereoTreble: this.beatStereoTreble,
            newRipples: this.newRipples
        };
    }
}

