// Validation Macros and Functions
// Consolidated validation logic for preventing NaN/infinity issues
//
// This module provides validation functions to prevent NaN and infinity values
// from causing visual artifacts or crashes. All validation functions:
// - Check for NaN using the property that NaN != NaN
// - Clamp values to valid ranges
// - Provide sensible fallback values
//
// Dependencies: none
// Used by: background.glsl, post-processing.glsl

#define VALIDATE_FLOAT(x, fallback) \
    ((x != x) ? fallback : clamp(x, 0.0, 1.0))

#define VALIDATE_FLOAT_RANGE(x, minVal, maxVal, fallback) \
    ((x != x) ? fallback : clamp(x, minVal, maxVal))

#define VALIDATE_VEC3(v, fallback) \
    ((v.r != v.r || v.g != v.g || v.b != v.b) ? fallback : v)

// Validate and clamp audio level
float validateAudioLevel(float audioLevel) {
    if (audioLevel != audioLevel) {
        return 0.0; // Fallback to quiet
    }
    return clamp(audioLevel, 0.0, 1.0);
}

// Validate brightness factor
float validateBrightnessFactor(float brightnessFactor) {
    if (brightnessFactor != brightnessFactor) {
        return 0.0; // Fallback to minimum brightness
    }
    return clamp(brightnessFactor, 0.0, 1.0);
}

// Validate brightness value
float validateBrightness(float brightness, float minVal, float maxVal) {
    if (brightness != brightness) {
        return 1.0; // Fallback to no change
    }
    return clamp(brightness, minVal, maxVal);
}

