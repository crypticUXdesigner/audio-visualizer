// Audio Reactivity Type Definitions
// Defines types for configurable audio-reactive parameters

export type AudioSourceType = 
    | 'volume'
    | 'bass' 
    | 'mid'
    | 'treble'
    | 'freq1' | 'freq2' | 'freq3' | 'freq4' | 'freq5'
    | 'freq6' | 'freq7' | 'freq8' | 'freq9' | 'freq10'
    | 'freq1Raw' | 'freq2Raw' | 'freq3Raw' | 'freq4Raw' | 'freq5Raw'
    | 'freq6Raw' | 'freq7Raw' | 'freq8Raw' | 'freq9Raw' | 'freq10Raw'
    | 'smoothedBass' | 'smoothedMid' | 'smoothedTreble'
    | 'peakVolume' | 'peakBass' | 'peakMid' | 'peakTreble'
    | 'beatIntensity' | 'beatIntensityBass' | 'beatIntensityMid' | 'beatIntensityTreble'
    | 'bassStereo' | 'midStereo' | 'trebleStereo'
    | 'frequencySpread' | 'bassOnset' | 'midOnset' | 'trebleOnset'
    | 'lowBass' | 'midBass' | 'lowMid' | 'highMid' | 'presence'
    | 'beatPhase' | 'beatAnticipation'
    | 'energy' | 'highEnergy' | 'lowEnergy';

export type AudioReactivityMode = 'additive' | 'interpolation' | 'speed';

/**
 * Cubic bezier curve configuration for audio reactivity easing
 * Maps audio signal strength (0-1) to interpolation factor (0-1)
 * Default linear curve: {x1: 0, y1: 0, x2: 1, y2: 1}
 */
export interface CubicBezierCurve {
    x1: number;  // First control point X (0-1)
    y1: number;  // First control point Y (0-1)
    x2: number;  // Second control point X (0-1)
    y2: number;  // Second control point Y (0-1)
}

export interface AudioReactivityConfig {
    source: AudioSourceType;
    attackNote?: number;      // Optional: tempo-relative attack timing
    releaseNote?: number;     // Optional: tempo-relative release timing
    
    // NEW: Explicit start/target value system (preferred)
    startValue?: number;      // Value when audio is silent/disabled
    targetValue?: number;     // Value when audio is at maximum
    curve?: CubicBezierCurve; // Optional: cubic bezier curve for easing (default: linear)
    
    // LEGACY: Old system (maintained for backward compatibility)
    min?: number;             // Optional: minimum value mapping (for interpolation mode) or min value (for additive mode)
    max?: number;             // Optional: maximum value mapping (for interpolation mode) or max value (for additive mode)
    invert?: boolean;         // Optional: invert the reactivity
    strength?: number;        // Optional: strength multiplier (0-1)
    mode?: AudioReactivityMode; // Optional: 'additive' (default), 'interpolation', or 'speed' (continuous forward progression)
}


