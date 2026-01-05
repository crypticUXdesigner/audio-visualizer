// Tempo-Relative Smoothing Configuration
// Centralized configuration for tempo-relative attack/release smoothing
// These settings control how audio-reactive animations respond to tempo
// All values are musical note fractions (relative to BPM)

import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';

interface SmoothingConfig {
    attackNote: number;
    releaseNote: number;
    attackTimeFallback: number;
    releaseTimeFallback: number;
}

export const TempoSmoothingConfig: Record<string, SmoothingConfig> = {
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
    },
    
    // Feed value smoothing (volume-based brightness for refraction)
    feed: {
        attackNote: 1.0 / 128.0,    // 64th note - fast attack
        releaseNote: 1.0 / 16.0,    // 8th note - moderate release
        attackTimeFallback: 10.0,  // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    
    // Cell brightness animation intensity (refraction)
    cellBrightnessIntensity: {
        attackNote: 1.0 / 32.0,   // 128th note - very fast attack
        releaseNote: 1.0 / 16.0,    // Half note - slow release
        attackTimeFallback: 5.0,   // milliseconds fallback
        releaseTimeFallback: 200.0 // milliseconds fallback
    },
    
    // Ripple brightness boost (refraction)
    rippleBrightness: {
        attackNote: 1.0 / 128.0,   // 128th note - very fast attack
        releaseNote: 1.0 / 4.0,    // Quarter note - moderate release
        attackTimeFallback: 5.0,   // milliseconds fallback
        releaseTimeFallback: 150.0 // milliseconds fallback
    },
    
    // FBM zoom animation (refraction)
    fbmZoom: {
        attackNote: 1.0 / 32.0,    // 64th note - fast attack
        releaseNote: 1.0 / 16.0,    // 8th note - moderate release
        attackTimeFallback: 10.0,  // milliseconds fallback
        releaseTimeFallback: 100.0  // milliseconds fallback
    },
    
    // String animation smoothing (swing amplitude and pulse intensity)
    strings: {
        attackNote: 1.0 / 64.0,   // 64th note - fast attack for responsive feel
        releaseNote: 1.0 / 8.0,   // 8th note - moderate release for smooth decay
        attackTimeFallback: 10.0,  // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    
    // Noise brightness smoothing (background noise audio reactivity)
    noiseBrightness: {
        attackNote: 1.0 / 128.0,   // 128th note - very fast attack
        releaseNote: 1.0 / 16.0,   // 8th note - moderate release
        attackTimeFallback: 5.0,   // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    
    // Contrast audio reactivity smoothing
    contrast: {
        attackNote: 1.0 / 128.0,   // 128th note - very fast attack
        releaseNote: 1.0 / 16.0,    // 8th note - moderate release
        attackTimeFallback: 5.0,   // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    
    // Arc shader smoothing (radius animation)
    arc: {
        attackNote: 1.0 / 128.0,   // 128th note - very fast attack
        releaseNote: 1.0 / 16.0,   // 16th note - moderate release
        attackTimeFallback: 10.0,  // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    
    // Raymarch shader smoothing configurations
    raymarchTimeModulation: {
        attackNote: 1.0 / 64.0,    // 64th note - fast attack
        releaseNote: 1.0 / 8.0,    // 8th note - moderate release
        attackTimeFallback: 10.0,  // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    raymarchFractalIntensity: {
        attackNote: 1.0 / 128.0,   // 128th note - very fast attack
        releaseNote: 1.0 / 16.0,   // 16th note - moderate release
        attackTimeFallback: 5.0,   // milliseconds fallback
        releaseTimeFallback: 100.0 // milliseconds fallback
    },
    raymarchSteps: {
        attackNote: 1.0 / 32.0,    // 32nd note - fast attack
        releaseNote: 1.0 / 4.0,     // Quarter note - slow release (smooth detail transitions)
        attackTimeFallback: 20.0,   // milliseconds fallback
        releaseTimeFallback: 150.0  // milliseconds fallback
    },
    raymarchFractalLayers: {
        attackNote: 1.0 / 64.0,     // 64th note - fast attack
        releaseNote: 1.0 / 8.0,     // 8th note - moderate release
        attackTimeFallback: 10.0,   // milliseconds fallback
        releaseTimeFallback: 100.0  // milliseconds fallback
    },
    raymarchDepthResponse: {
        attackNote: 1.0 / 128.0,    // 128th note - very fast attack
        releaseNote: 1.0 / 16.0,    // 16th note - moderate release
        attackTimeFallback: 5.0,    // milliseconds fallback
        releaseTimeFallback: 100.0  // milliseconds fallback
    },
    raymarchMultiFrequency: {
        attackNote: 1.0 / 64.0,     // 64th note - fast attack
        releaseNote: 1.0 / 8.0,      // 8th note - moderate release
        attackTimeFallback: 10.0,   // milliseconds fallback
        releaseTimeFallback: 100.0   // milliseconds fallback
    }
};

// Track last logged BPM to avoid spam (log once per BPM value)
let lastLoggedBPM: number | null = null;

// Cache for tempo calculations (noteFraction_bpm -> timeConstant)
// Cache size limited to prevent memory growth
const tempoCache = new Map<string, number>();
const MAX_TEMPO_CACHE_SIZE = 50;

/**
 * Generate cache key for tempo calculation
 */
function getTempoCacheKey(noteFraction: number, bpm: number): string {
    // Round to 4 decimal places to group similar values
    return `${noteFraction.toFixed(4)}_${bpm.toFixed(1)}`;
}

/**
 * Calculate tempo-relative smoothing time constant from musical note fraction (cached)
 * @param noteFraction - Musical note fraction (e.g., 1/32 for 32nd note)
 * @param bpm - Beats per minute
 * @param fallbackTimeMs - Fallback time in milliseconds when BPM is unavailable
 * @returns Time constant in seconds
 */
export function getTempoRelativeTimeConstant(noteFraction: number, bpm: number, fallbackTimeMs: number): number {
    if (bpm > 0) {
        // Check cache first
        const cacheKey = getTempoCacheKey(noteFraction, bpm);
        const cached = tempoCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        
        // Calculate time in seconds from musical note fraction
        // Formula: time = (noteFraction * 60 / BPM) seconds
        const timeConstant = (noteFraction * 60.0) / bpm;
        
        // Cache result
        tempoCache.set(cacheKey, timeConstant);
        
        // Limit cache size (remove oldest entries)
        if (tempoCache.size > MAX_TEMPO_CACHE_SIZE) {
            const firstKey = tempoCache.keys().next().value;
            tempoCache.delete(firstKey);
        }
        
        // Log when BPM is used (only once per BPM value to avoid spam)
        if (lastLoggedBPM !== bpm) {
            const noteName = getNoteName(noteFraction);
            ShaderLogger.debug(`[TempoSmoothing] Using BPM ${bpm} for ${noteName} (${(timeConstant * 1000).toFixed(2)}ms)`);
            lastLoggedBPM = bpm;
        }
        
        return timeConstant;
    } else {
        // Fallback to fixed time when BPM is not available (no logging, no cache needed)
        return fallbackTimeMs / 1000.0;
    }
}

/**
 * Get human-readable note name from fraction
 * @param noteFraction - Musical note fraction
 * @returns Note name
 */
function getNoteName(noteFraction: number): string {
    const noteNames: Record<string, string> = {
        '1.0': 'whole note',
        '0.5': 'half note',
        '0.25': 'quarter note',
        '0.125': 'eighth note',
        '0.0625': 'sixteenth note',
        '0.03125': 'thirty-second note',
        '0.015625': 'sixty-fourth note',
        '0.0078125': 'hundred-twenty-eighth note'
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
 * @param currentValue - Current smoothed value
 * @param targetValue - Target value to smooth towards
 * @param deltaTime - Time since last update (seconds)
 * @param attackTimeConstant - Attack time constant (seconds)
 * @param releaseTimeConstant - Release time constant (seconds)
 * @returns New smoothed value
 */
export function applyTempoRelativeSmoothing(
    currentValue: number,
    targetValue: number,
    deltaTime: number,
    attackTimeConstant: number,
    releaseTimeConstant: number
): number {
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

