// OKLCH Color Space Conversion Functions
// Perceptually uniform color space for accurate color adjustments
// Based on OKLab color space with polar coordinates (L, C, H)

// ============================================
// sRGB to Linear RGB Conversion
// ============================================

// Convert sRGB (0-1) to linear RGB (0-1)
vec3 srgbToLinear(vec3 rgb) {
    vec3 result;
    result.r = (rgb.r <= 0.04045) ? rgb.r / 12.92 : pow((rgb.r + 0.055) / 1.055, 2.4);
    result.g = (rgb.g <= 0.04045) ? rgb.g / 12.92 : pow((rgb.g + 0.055) / 1.055, 2.4);
    result.b = (rgb.b <= 0.04045) ? rgb.b / 12.92 : pow((rgb.b + 0.055) / 1.055, 2.4);
    return result;
}

// Convert linear RGB (0-1) to sRGB (0-1)
vec3 linearToSrgb(vec3 rgb) {
    vec3 result;
    result.r = (rgb.r <= 0.0031308) ? 12.92 * rgb.r : 1.055 * pow(rgb.r, 1.0 / 2.4) - 0.055;
    result.g = (rgb.g <= 0.0031308) ? 12.92 * rgb.g : 1.055 * pow(rgb.g, 1.0 / 2.4) - 0.055;
    result.b = (rgb.b <= 0.0031308) ? 12.92 * rgb.b : 1.055 * pow(rgb.b, 1.0 / 2.4) - 0.055;
    return result;
}

// ============================================
// Linear RGB to OKLab Conversion
// ============================================

// Convert linear RGB (0-1) to OKLab
// Returns vec3(L, a, b) where L in [0, 1], a and b in [-0.4, 0.4]
vec3 linearRgbToOklab(vec3 rgb) {
    float r = rgb.r;
    float g = rgb.g;
    float b = rgb.b;
    
    // Convert linear RGB to LMS (long, medium, short wavelength)
    float l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    float m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    float s = 0.0883024619 * r + 0.2817186376 * g + 0.6299787005 * b;
    
    // Apply cube root (non-linearity)
    float l_ = pow(max(l, 0.0), 1.0 / 3.0);
    float m_ = pow(max(m, 0.0), 1.0 / 3.0);
    float s_ = pow(max(s, 0.0), 1.0 / 3.0);
    
    // Convert LMS to OKLab
    float L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    float a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    float b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    
    return vec3(L, a, b_);
}

// Convert OKLab to linear RGB (0-1)
vec3 oklabToLinearRgb(vec3 lab) {
    float L = lab.x;
    float a = lab.y;
    float b = lab.z;
    
    // Convert OKLab to LMS
    float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    
    // Apply cube (inverse of cube root)
    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;
    
    // Convert LMS to linear RGB
    float r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    float g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    float b_ = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    
    return vec3(r, g, b_);
}

// ============================================
// OKLab to OKLCH Conversion
// ============================================

// Convert OKLab to OKLCH
// Returns vec3(L, C, H) where L in [0, 1], C in [0, ~0.4], H in [0, 360)
vec3 oklabToOklch(vec3 lab) {
    float L = lab.x;
    float a = lab.y;
    float b = lab.z;
    
    // Calculate chroma (distance from neutral axis)
    float C = sqrt(a * a + b * b);
    
    // Calculate hue (angle in degrees)
    float H = atan(b, a) * (180.0 / 3.141592653589793);
    if (H < 0.0) {
        H += 360.0;
    }
    
    return vec3(L, C, H);
}

// Convert OKLCH to OKLab
vec3 oklchToOklab(vec3 oklch) {
    float L = oklch.x;
    float C = oklch.y;
    float H = oklch.z;
    
    // Convert hue from degrees to radians
    float H_rad = H * (3.141592653589793 / 180.0);
    
    // Convert polar to cartesian
    float a = C * cos(H_rad);
    float b = C * sin(H_rad);
    
    return vec3(L, a, b);
}

// ============================================
// Full Pipeline: RGB ↔ OKLCH
// ============================================

// Convert RGB (sRGB, 0-1) to OKLCH
// Returns vec3(L, C, H) where L in [0, 1], C in [0, ~0.4], H in [0, 360)
vec3 rgbToOklch(vec3 rgb) {
    vec3 linearRgb = srgbToLinear(rgb);
    vec3 lab = linearRgbToOklab(linearRgb);
    return oklabToOklch(lab);
}

// Convert OKLCH to RGB (sRGB, 0-1)
// Clamps result to valid RGB range [0, 1]
vec3 oklchToRgb(vec3 oklch) {
    vec3 lab = oklchToOklab(oklch);
    vec3 linearRgb = oklabToLinearRgb(lab);
    vec3 srgb = linearToSrgb(linearRgb);
    return clamp(srgb, 0.0, 1.0);
}

