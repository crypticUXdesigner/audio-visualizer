// Tempo-Relative Smoothing Configuration
// Centralized configuration for tempo-relative attack/release smoothing
// These settings control how audio-reactive animations respond to tempo
// All values are musical note fractions (relative to BPM)

export const TempoSmoothingConfig = {
    // Volume smoothing (brightness control)
    volume: {
        attackNote: 1.0 / 128.0,   // 64th note - very fast attack
        releaseNote: 1.0 / 16.0,    // 8th note - moderate release
        attackTimeFallback: 5.0,   // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    
    // Frequency band smoothing (color mapping)
    frequencyBands: {
        attackNote: 1.0 / 128.0,   // 128th note - very fast attack
        releaseNote: 1.0 / 2.0,   // 16th note - moderate release
        attackTimeFallback: 2.0, // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    
    // Color modulator hue shifts (color temperature)
    colorModulation: {
        attackNote: 1.0 / 32.0,   // 16th note - moderate attack
        releaseNote: 1.0 / 4.0,    // Half note - slow release
        attackTimeFallback: 20.0,  // milliseconds fallback
        releaseTimeFallback: 200.0 // milliseconds fallback
    },
    
    // Time offset smoothing (pattern morphing)
    timeOffset: {
        attackNote: 1.0 / 128.0,    // 32nd note - fast attack
        releaseNote: 1.0 / 4.0,    // Quarter note - moderate release
        attackTimeFallback: 10.0,  // milliseconds fallback
        releaseTimeFallback: 150.0 // milliseconds fallback
    }
};

// Track last logged BPM to avoid spam (log once per BPM value)
let lastLoggedBPM = null;

/**
 * Calculate tempo-relative smoothing time constant from musical note fraction
 * @param {number} noteFraction - Musical note fraction (e.g., 1/32 for 32nd note)
 * @param {number} bpm - Beats per minute
 * @param {number} fallbackTimeMs - Fallback time in milliseconds when BPM is unavailable
 * @returns {number} Time constant in seconds
 */
export function getTempoRelativeTimeConstant(noteFraction, bpm, fallbackTimeMs) {
    if (bpm > 0) {
        // Calculate time in seconds from musical note fraction
        // Formula: time = (noteFraction * 60 / BPM) seconds
        const timeConstant = (noteFraction * 60.0) / bpm;
        
        // Log when BPM is used (only once per BPM value to avoid spam)
        if (lastLoggedBPM !== bpm && typeof console !== 'undefined' && console.log) {
            const noteName = getNoteName(noteFraction);
            console.log(`[TempoSmoothing] Using BPM ${bpm} for ${noteName} (${(timeConstant * 1000).toFixed(2)}ms)`);
            lastLoggedBPM = bpm;
        }
        
        return timeConstant;
    } else {
        // Fallback to fixed time when BPM is not available (no logging)
        return fallbackTimeMs / 1000.0;
    }
}

/**
 * Get human-readable note name from fraction
 * @param {number} noteFraction - Musical note fraction
 * @returns {string} Note name
 */
function getNoteName(noteFraction) {
    const noteNames = {
        1.0: 'whole note',
        0.5: 'half note',
        0.25: 'quarter note',
        0.125: 'eighth note',
        0.0625: 'sixteenth note',
        0.03125: 'thirty-second note',
        0.015625: 'sixty-fourth note',
        0.0078125: 'hundred-twenty-eighth note'
    };
    
    // Find closest match
    for (const [fraction, name] of Object.entries(noteNames)) {
        if (Math.abs(noteFraction - parseFloat(fraction)) < 0.0001) {
            return name;
        }
    }
    
    // Fallback to fraction representation
    return `1/${Math.round(1 / noteFraction)} note`;
}

/**
 * Apply tempo-relative asymmetric smoothing (attack/release)
 * Uses exponential decay formula: factor = exp(-deltaTime / timeConstant)
 * @param {number} currentValue - Current smoothed value
 * @param {number} targetValue - Target value to smooth towards
 * @param {number} deltaTime - Time since last update (seconds)
 * @param {number} attackTimeConstant - Attack time constant (seconds)
 * @param {number} releaseTimeConstant - Release time constant (seconds)
 * @returns {number} New smoothed value
 */
export function applyTempoRelativeSmoothing(
    currentValue,
    targetValue,
    deltaTime,
    attackTimeConstant,
    releaseTimeConstant
) {
    if (targetValue > currentValue) {
        // Value increased: fast attack
        const attackFactor = Math.exp(-deltaTime / attackTimeConstant);
        return currentValue * attackFactor + targetValue * (1.0 - attackFactor);
    } else {
        // Value decreased: slow release
        const releaseFactor = Math.exp(-deltaTime / releaseTimeConstant);
        return currentValue * releaseFactor + targetValue * (1.0 - releaseFactor);
    }
}

