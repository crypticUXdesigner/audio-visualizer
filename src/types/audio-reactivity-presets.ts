// Audio Reactivity Bezier Curve Presets
// Common easing patterns for audio reactivity

import type { CubicBezierCurve } from './audio-reactivity.js';

/**
 * Preset curves for common easing patterns
 */
export const BezierPresets = {
    linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
    easeOut: { x1: 0.6, y1: 0, x2: 0.8, y2: 1 },      // Slow start, fast finish
    easeIn: { x1: 0.2, y1: 0, x2: 0.4, y2: 1 },       // Fast start, slow finish
    easeInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }   // Smooth both ends
} as const satisfies Record<string, CubicBezierCurve>;

