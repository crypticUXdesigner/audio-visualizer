// Color Generation and Conversion Utilities
// OKLCH-based color generation and conversion functions

/**
 * Converts a hex color string to RGB array [0.0-1.0]
 * Supports formats: "#RGB", "#RRGGBB", "RGB", "RRGGBB"
 * @param {string} hex - Hex color string
 * @returns {number[]} RGB array with values 0.0-1.0
 */
export function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Handle 3-digit hex (e.g., "FFF" -> "FFFFFF")
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    // Validate length
    if (hex.length !== 6) {
        console.warn(`Invalid hex color: ${hex}, defaulting to white`);
        return [1.0, 1.0, 1.0];
    }
    
    // Parse RGB components
    const r = parseInt(hex.substring(0, 2), 16) / 255.0;
    const g = parseInt(hex.substring(2, 4), 16) / 255.0;
    const b = parseInt(hex.substring(4, 6), 16) / 255.0;
    
    return [r, g, b];
}

/**
 * Converts HSL to RGB (0-1)
 * @param {number} h - Hue in degrees [0, 360)
 * @param {number} s - Saturation [0, 1]
 * @param {number} l - Lightness [0, 1]
 * @returns {number[]} RGB array [r, g, b] in range [0, 1]
 */
export function hslToRgb(h, s, l) {
    h = h / 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    
    if (h < 1/6) {
        r = c; g = x; b = 0;
    } else if (h < 2/6) {
        r = x; g = c; b = 0;
    } else if (h < 3/6) {
        r = 0; g = c; b = x;
    } else if (h < 4/6) {
        r = 0; g = x; b = c;
    } else if (h < 5/6) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }
    
    return [r + m, g + m, b + m];
}

/**
 * Converts RGB array [0.0-1.0] to hex color string
 * @param {number[]|null|undefined} rgb - RGB array with values 0.0-1.0
 * @returns {string} Hex color string (e.g., "#RRGGBB")
 */
export function rgbToHex(rgb) {
    if (!rgb || !Array.isArray(rgb) || rgb.length !== 3) {
        // Return white as fallback
        return '#ffffff';
    }
    const [r, g, b] = rgb;
    const rInt = Math.round(Math.max(0, Math.min(255, r * 255)));
    const gInt = Math.round(Math.max(0, Math.min(255, g * 255)));
    const bInt = Math.round(Math.max(0, Math.min(255, b * 255)));
    return `#${rInt.toString(16).padStart(2, '0')}${gInt.toString(16).padStart(2, '0')}${bInt.toString(16).padStart(2, '0')}`;
}

/**
 * Converts a color value (hex string or RGB array) to RGB array [0.0-1.0]
 * @param {string|number[]|null|undefined} color - Hex string or RGB array
 * @returns {number[]} RGB array with values 0.0-1.0
 */
export function normalizeColor(color) {
    if (color === null || color === undefined) {
        // Silently return white for null/undefined (colors may not be initialized yet)
        return [1.0, 1.0, 1.0];
    }
    
    if (typeof color === 'string') {
        return hexToRgb(color);
    } else if (Array.isArray(color) && color.length === 3) {
        // Already RGB array, return as-is
        return [...color];
    } else {
        console.warn(`Invalid color format: ${color}, defaulting to white`);
        return [1.0, 1.0, 1.0];
    }
}

// ============================================
// OKLCH COLOR CONVERSION UTILITIES
// ============================================

/**
 * Converts linear RGB (0-1) to OKLab
 * @param {number[]} rgb - Linear RGB array [r, g, b] in range [0, 1]
 * @returns {number[]} OKLab array [L, a, b]
 */
function linearRgbToOklab(rgb) {
    const [r, g, b] = rgb;
    
    // Convert linear RGB to OKLab
    // Using the standard OKLab transformation matrix
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    
    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);
    
    return [
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    ];
}

/**
 * Converts OKLab to linear RGB (0-1)
 * @param {number[]} lab - OKLab array [L, a, b]
 * @returns {number[]} Linear RGB array [r, g, b] in range [0, 1]
 */
function oklabToLinearRgb(lab) {
    const [L, a, b] = lab;
    
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    
    return [
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
}

/**
 * Converts sRGB (0-1) to linear RGB (0-1)
 * @param {number[]} rgb - sRGB array [r, g, b] in range [0, 1]
 * @returns {number[]} Linear RGB array [r, g, b] in range [0, 1]
 */
function srgbToLinear(rgb) {
    return rgb.map(c => {
        if (c <= 0.04045) {
            return c / 12.92;
        } else {
            return Math.pow((c + 0.055) / 1.055, 2.4);
        }
    });
}

/**
 * Converts linear RGB (0-1) to sRGB (0-1)
 * @param {number[]} rgb - Linear RGB array [r, g, b] in range [0, 1]
 * @returns {number[]} sRGB array [r, g, b] in range [0, 1]
 */
function linearToSrgb(rgb) {
    return rgb.map(c => {
        if (c <= 0.0031308) {
            return 12.92 * c;
        } else {
            return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
        }
    });
}

/**
 * Converts RGB (0-1) to OKLCH
 * @param {number[]} rgb - RGB array [r, g, b] in range [0, 1]
 * @returns {number[]} OKLCH array [L, C, H] where L in [0, 1], C in [0, ~0.4], H in [0, 360)
 */
export function rgbToOklch(rgb) {
    const linearRgb = srgbToLinear(rgb);
    const lab = linearRgbToOklab(linearRgb);
    const [L, a, b] = lab;
    
    const C = Math.sqrt(a * a + b * b);
    let H = Math.atan2(b, a) * (180 / Math.PI);
    if (H < 0) H += 360;
    
    return [L, C, H];
}

/**
 * Converts OKLCH to RGB (0-1)
 * @param {number[]} oklch - OKLCH array [L, C, H] where L in [0, 1], C in [0, ~0.4], H in [0, 360)
 * @returns {number[]} RGB array [r, g, b] in range [0, 1] (clamped)
 */
export function oklchToRgb(oklch) {
    const [L, C, H] = oklch;
    
    const H_rad = H * (Math.PI / 180);
    const a = C * Math.cos(H_rad);
    const b = C * Math.sin(H_rad);
    
    const lab = [L, a, b];
    const linearRgb = oklabToLinearRgb(lab);
    const srgb = linearToSrgb(linearRgb);
    
    // Clamp to valid RGB range
    return srgb.map(c => Math.max(0, Math.min(1, c)));
}

/**
 * Interpolates hue with proper wrapping (0-360 degrees)
 * Always interpolates in the positive (clockwise) direction
 * @param {number} h1 - Start hue in degrees [0, 360)
 * @param {number} h2 - End hue in degrees [0, 360)
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {number} Interpolated hue in degrees [0, 360)
 */
export function interpolateHue(h1, h2, t) {
    // Normalize hues to [0, 360) to handle any input values
    h1 = ((h1 % 360) + 360) % 360;
    h2 = ((h2 % 360) + 360) % 360;
    
    // Always go in positive (clockwise) direction
    // If h2 < h1, we need to go the long way around (add 360)
    let diff = h2 - h1;
    if (diff < 0) {
        diff += 360; // Go the long way around in positive direction
    }
    
    // Interpolate and wrap result to [0, 360)
    let result = h1 + diff * t;
    return ((result % 360) + 360) % 360;
}

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
function bezierPoint(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Evaluates a cubic bezier curve at parameter t
 * @param {number} t - Parameter in range [0, 1]
 * @param {number[]} curve - Cubic bezier control points [x1, y1, x2, y2]
 * @returns {number} Interpolated value
 */
function cubicBezier(t, curve) {
    const [x1, y1, x2, y2] = curve;
    
    // Use binary search to find t that gives us the desired x
    // Since we're using it as an easing function, we want y given x = t
    let low = 0;
    let high = 1;
    let mid;
    
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
    
    return bezierPoint(mid, 0, y1, y2, 1);
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
export function calculateThresholds(curve, numColors = 10) {
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
export function generateColorsFromOklch(colorConfig) {
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
        const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
        darkestHue = interpolateHue(baseH, baseH + (darkest.hueOffset || 0), 1.0);
    }
    
    if (brightest.hue !== undefined) {
        // Direct hue value provided (0-360)
        brightestHue = ((brightest.hue % 360) + 360) % 360;
    } else {
        // Calculate from baseHue + hueOffset (backward compatibility)
        const baseRgb = hexToRgb(baseHue);
        const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
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
        const oklch = [L, C, H];
        const rgb = oklchToRgb(oklch);
        
        // Store as color1 (brightest) through color10 (darkest)
        // Reverse order: i=0 is darkest (color10), i=9 is brightest (color1)
        const colorKey = `color${10 - i}`;
        colors[colorKey] = rgb;
    }
    
    return colors;
}

