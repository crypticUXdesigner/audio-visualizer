// Color Generation Utilities
// OKLCH-based color palette generation using cubic bezier interpolation
// Note: Color conversion functions are imported from ColorConverter.ts

import { 
    hexToRgb, 
    hslToRgb, 
    rgbToHex, 
    normalizeColor, 
    rgbToOklch, 
    oklchToRgb, 
    interpolateHue 
} from './ColorConverter.js';

// ============================================
// CUBIC BEZIER INTERPOLATION
// ============================================

/**
 * Evaluates a cubic bezier point at parameter t
 * @param {number} t - Parameter in range [0, 1]
 * @param {number} p0 - Start point
 * @param {number} p1 - First control point
 * @param {number} p2 - Second control point
 * @param {number} p3 - End point
 * @returns {number} Interpolated value
 */
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Evaluates a cubic bezier curve at parameter t
 * @param {number} t - Parameter in range [0, 1]
 * @param {number[]} curve - Cubic bezier control points [x1, y1, x2, y2]
 * @returns {number} Interpolated value
 */
function cubicBezier(t: number, curve: [number, number, number, number]): number {
    const [x1, y1, x2, y2] = curve;
    
    // Use binary search to find t that gives us the desired x
    // Since we're using it as an easing function, we want y given x = t
    let low = 0;
    let high = 1;
    let mid = 0.5;
    
    // Binary search for t that gives x ≈ t
    for (let i = 0; i < 20; i++) {
        mid = (low + high) / 2;
        const x = bezierPoint(mid, 0, x1, x2, 1);
        if (Math.abs(x - t) < 0.0001) break;
        if (x < t) {
            low = mid;
        } else {
            high = mid;
        }
    }
    
    return bezierPoint(mid!, 0, y1, y2, 1);
}

// ============================================
// COLOR GENERATION FROM OKLCH CONFIG
// ============================================

/**
 * Calculate threshold values from a bezier curve
 * @param {number[]} curve - Bezier curve [x1, y1, x2, y2]
 * @param {number} numColors - Number of colors (e.g., 10)
 * @returns {number[]} Array of threshold values in descending order
 */
export function calculateThresholds(curve: [number, number, number, number], numColors: number = 10): number[] {
    const thresholds = [];
    
    // Sample the bezier curve at numColors points
    for (let i = 0; i < numColors; i++) {
        const t = i / (numColors - 1); // 0.0 to 1.0
        const easedValue = cubicBezier(t, curve);
        thresholds.push(easedValue);
    }
    
    // Reverse array (brightest color gets highest threshold)
    // thresholds[0] = color1 (brightest), thresholds[9] = color10 (darkest)
    thresholds.reverse();
    
    return thresholds;
}

/**
 * Generates 10 colors from OKLCH-based configuration
 * @param {Object} colorConfig - Color configuration object
 * @param {string} colorConfig.baseHue - Base color (hex)
 * @param {Object} colorConfig.darkest - Darkest color config {lightness, chroma, hueOffset, hue}
 * @param {Object} colorConfig.brightest - Brightest color config {lightness, chroma, hueOffset, hue}
 * @param {Object} colorConfig.interpolationCurve - Object with {lightness, chroma, hue} bezier curves
 * @param {number[]} colorConfig.interpolationCurve.lightness - Lightness bezier curve [x1, y1, x2, y2]
 * @param {number[]} colorConfig.interpolationCurve.chroma - Chroma bezier curve [x1, y1, x2, y2]
 * @param {number[]} colorConfig.interpolationCurve.hue - Hue bezier curve [x1, y1, x2, y2]
 * @returns {Object} Object with color1 through color10 as RGB arrays [0-1]
 */
export function generateColorsFromOklch(colorConfig: {
    baseHue: string;
    darkest: { lightness: number; chroma: number; hueOffset?: number; hue?: number };
    brightest: { lightness: number; chroma: number; hueOffset?: number; hue?: number };
    interpolationCurve: { lightness: [number, number, number, number]; chroma: [number, number, number, number]; hue: [number, number, number, number] };
}): Record<string, [number, number, number]> {
    const { baseHue, darkest, brightest, interpolationCurve } = colorConfig;
    
    // Extract separate curves for each component
    const lightnessCurve = interpolationCurve.lightness;
    const chromaCurve = interpolationCurve.chroma;
    const hueCurve = interpolationCurve.hue;
    
    // Calculate darkest and brightest hues
    // If direct hue values are provided, use them; otherwise calculate from baseHue + hueOffset
    let darkestHue, brightestHue;
    
    if (darkest.hue !== undefined) {
        // Direct hue value provided (0-360)
        darkestHue = ((darkest.hue % 360) + 360) % 360;
    } else {
        // Calculate from baseHue + hueOffset (backward compatibility)
        const baseRgb = hexToRgb(baseHue);
        const [, , baseH] = rgbToOklch(baseRgb);
        darkestHue = interpolateHue(baseH, baseH + (darkest.hueOffset || 0), 1.0);
    }
    
    if (brightest.hue !== undefined) {
        // Direct hue value provided (0-360)
        brightestHue = ((brightest.hue % 360) + 360) % 360;
    } else {
        // Calculate from baseHue + hueOffset (backward compatibility)
        const baseRgb = hexToRgb(baseHue);
        const [, , baseH] = rgbToOklch(baseRgb);
        brightestHue = interpolateHue(baseH, baseH + (brightest.hueOffset || 0), 1.0);
    }
    
    // Generate 10 colors (0 = darkest, 9 = brightest)
    const colors = {};
    
    for (let i = 0; i < 10; i++) {
        const t = i / 9; // 0 to 1
        
        // Apply cubic bezier easing separately for each component
        const tEasedL = cubicBezier(t, lightnessCurve);
        const tEasedC = cubicBezier(t, chromaCurve);
        const tEasedH = cubicBezier(t, hueCurve);
        
        // Interpolate in OKLCH space
        const L = darkest.lightness + (brightest.lightness - darkest.lightness) * tEasedL;
        const C = darkest.chroma + (brightest.chroma - darkest.chroma) * tEasedC;
        const H = interpolateHue(darkestHue, brightestHue, tEasedH);
        
        // Convert back to RGB
        const oklch: [number, number, number] = [L, C, H];
        const rgb = oklchToRgb(oklch);
        
        // Store as color1 (brightest) through color10 (darkest)
        // Reverse order: i=0 is darkest (color10), i=9 is brightest (color1)
        const colorKey = `color${10 - i}`;
        (colors as Record<string, [number, number, number]>)[colorKey] = rgb;
    }
    
    return colors;
}

