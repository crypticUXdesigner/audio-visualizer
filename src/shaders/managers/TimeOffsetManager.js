// TimeOffsetManager - Manages time offset accumulation and smoothing
// Handles volume-based time offset with hysteresis and tempo-relative smoothing

import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

export class TimeOffsetManager {
    constructor(config = {}) {
        // Configuration with defaults
        this.timeOffset = 0.0;
        this.smoothedTimeOffset = 0.0;
        this.baseTimeOffsetAccumulationRate = config.accumulationRate ?? 0.5;
        this.baseTimeOffsetDecayRate = config.decayRate ?? 0.3;
        this.maxTimeOffset = config.maxTimeOffset ?? 5.0;
        this.timeOffsetAccumulateThreshold = config.accumulateThreshold ?? 0.12;
        this.timeOffsetDecayThreshold = config.decayThreshold ?? 0.08;
        this.timeOffsetCubicBezier = config.cubicBezier ?? {
            x1: 0.9, y1: 0.0, x2: 0.8, y2: 1.0
        };
        
        // External controls (injected dependency)
        this.loudnessControls = config.loudnessControls ?? null;
    }
    
    /**
     * Set loudness controls (for dependency injection)
     * @param {Object} controls - Controls object with loudnessAnimationEnabled and loudnessThreshold
     */
    setLoudnessControls(controls) {
        this.loudnessControls = controls;
    }
    
    /**
     * Cubic-bezier solver: finds t (0-1) for a given x using binary search
     * @param {number} x - Input value (0-1)
     * @param {number} x1 - First control point X
     * @param {number} y1 - First control point Y
     * @param {number} x2 - Second control point X
     * @param {number} y2 - Second control point Y
     * @returns {number} t value (0-1)
     */
    cubicBezierSolve(x, x1, y1, x2, y2) {
        // Cubic bezier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        // For x-coordinate: we need to find t such that Bx(t) = x
        // P₀ = (0,0), P₁ = (x1,y1), P₂ = (x2,y2), P₃ = (1,1)
        
        // Binary search for t
        let t0 = 0;
        let t1 = 1;
        const epsilon = 0.0001;
        const maxIterations = 20;
        
        for (let i = 0; i < maxIterations; i++) {
            const t = (t0 + t1) / 2;
            
            // Calculate x-coordinate at t
            const cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
            
            if (Math.abs(cx - x) < epsilon) {
                // Calculate y-coordinate at t
                const cy = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
                return cy;
            }
            
            if (cx < x) {
                t0 = t;
            } else {
                t1 = t;
            }
        }
        
        // Fallback: calculate y at final t
        const t = (t0 + t1) / 2;
        const cy = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
        return cy;
    }
    
    /**
     * Calculate easing factor for time offset accumulation using cubic-bezier
     * Maps trigger signal strength (volume) to accumulation rate multiplier
     * Strong signals → more accumulation (eased), weak signals → less accumulation (with nuance)
     * @param {number} volume - Trigger signal strength (0-1)
     * @returns {number} Easing factor (0-1) that multiplies accumulation rate
     */
    getTimeOffsetEasingFactor(volume) {
        // Clamp volume to 0-1 range
        const clampedVolume = Math.max(0, Math.min(1, volume));
        
        // Use cubic-bezier to map volume (0-1) to easing factor (0-1)
        // The volume is the input x, we get back the y value (easing factor)
        const easingFactor = this.cubicBezierSolve(
            clampedVolume,
            this.timeOffsetCubicBezier.x1,
            this.timeOffsetCubicBezier.y1,
            this.timeOffsetCubicBezier.x2,
            this.timeOffsetCubicBezier.y2
        );
        
        // Return the easing factor directly (0-1)
        // This will be multiplied by the accumulation rate
        return easingFactor;
    }
    
    /**
     * Update time offset based on audio data
     * @param {Object} audioData - Audio data with volume and estimatedBPM
     * @param {number} deltaTime - Time since last update in seconds
     */
    update(audioData, deltaTime) {
        if (!audioData || audioData.volume === undefined) {
            // No audio data: continue smoothing (will decay if loudness animation enabled)
            this.updateSmoothing(null, deltaTime);
            return;
        }
        
        const volume = audioData.volume || 0;
        const loudnessAnimationEnabled = this.loudnessControls?.loudnessAnimationEnabled ?? true;
        
        if (loudnessAnimationEnabled) {
            // Use hysteresis to prevent rapid switching between accumulation and decay
            // If timeOffset is already accumulated, use lower threshold to start decaying
            // If timeOffset is near zero, use higher threshold to start accumulating
            const hysteresisThreshold = this.timeOffset > 0.01 
                ? this.timeOffsetDecayThreshold  // If already accumulated, use lower threshold to decay
                : this.timeOffsetAccumulateThreshold;  // If at zero, use higher threshold to accumulate
            
            if (volume > hysteresisThreshold) {
                // Accumulate time offset with easing based on trigger signal strength
                // Strong signals → more accumulation (eased), weak signals → less accumulation (with nuance)
                // The easing curve maps volume (0-1) to accumulation multiplier (0-1)
                const easingFactor = this.getTimeOffsetEasingFactor(volume);
                const accumulation = volume * this.baseTimeOffsetAccumulationRate * deltaTime * easingFactor;
                this.timeOffset = Math.min(this.timeOffset + accumulation, this.maxTimeOffset);
            } else {
                // Decay time offset proportionally (slows down as it approaches zero)
                const decayAmount = this.timeOffset * this.baseTimeOffsetDecayRate * deltaTime;
                this.timeOffset = Math.max(0, this.timeOffset - decayAmount);
            }
        } else {
            // Loudness animation disabled: force decay to 0 (proportional)
            const decayAmount = this.timeOffset * this.baseTimeOffsetDecayRate * deltaTime;
            this.timeOffset = Math.max(0, this.timeOffset - decayAmount);
        }
        
        // Apply tempo-relative smoothing
        this.updateSmoothing(audioData, deltaTime);
    }
    
    /**
     * Update tempo-relative smoothing
     * @param {Object} audioData - Audio data with estimatedBPM (can be null)
     * @param {number} deltaTime - Time since last update in seconds
     */
    updateSmoothing(audioData, deltaTime) {
        const bpm = audioData?.estimatedBPM || 0;
        const timeOffsetConfig = TempoSmoothingConfig.timeOffset;
        const attackTimeConstant = getTempoRelativeTimeConstant(
            timeOffsetConfig.attackNote,
            bpm,
            timeOffsetConfig.attackTimeFallback
        );
        const releaseTimeConstant = getTempoRelativeTimeConstant(
            timeOffsetConfig.releaseNote,
            bpm,
            timeOffsetConfig.releaseTimeFallback
        );
        
        this.smoothedTimeOffset = applyTempoRelativeSmoothing(
            this.smoothedTimeOffset,
            this.timeOffset,
            deltaTime,
            attackTimeConstant,
            releaseTimeConstant
        );
    }
    
    /**
     * Get current smoothed time offset
     * @returns {number} Smoothed time offset value
     */
    getSmoothedOffset() {
        return this.smoothedTimeOffset;
    }
    
    /**
     * Reset time offset to zero
     */
    reset() {
        this.timeOffset = 0.0;
        this.smoothedTimeOffset = 0.0;
    }
}

