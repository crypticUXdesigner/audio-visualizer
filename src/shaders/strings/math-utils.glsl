// Mathematical Utility Functions
// Common mathematical operations used in strings shader

#include "common/constants.glsl"

#define CUBIC_BEZIER_MAX_ITERATIONS 10

// Calculate volume-based width factor with threshold curve
// Minimal change below threshold, subtle but noticeable above threshold
float getVolumeWidthFactor(float volume, float threshold, float minMult, float maxMult) {
    // Clamp inputs to valid ranges
    volume = clamp(volume, 0.0, 1.0);
    threshold = clamp(threshold, 0.0, 1.0);
    minMult = max(minMult, 0.1); // Ensure minimum multiplier is at least 0.1 to prevent zero width
    maxMult = max(maxMult, minMult); // Ensure max is at least min
    
    // Safety check: if threshold is too close to 0 or 1, use simpler calculation
    if (threshold < EPSILON) {
        // No threshold, just scale from 1.0 to maxMult
        return mix(1.0, maxMult, smoothstep(0.0, 1.0, volume));
    } else if (threshold > 0.999) {
        // Threshold is at max, just scale from 1.0 to minMult
        return mix(1.0, minMult, smoothstep(0.0, 1.0, volume));
    }
    
    if (volume < threshold) {
        // Below threshold: minimal change from 1.0 to minMult
        // Smooth transition from 1.0 (at volume 0) to minMult (at threshold)
        float normalized = volume / threshold;
        return mix(1.0, minMult, smoothstep(0.0, 1.0, normalized));
    } else {
        // Above threshold: subtle but noticeable change from minMult to maxMult
        float aboveThreshold = (volume - threshold) / (1.0 - threshold); // Normalize to 0-1 above threshold
        return mix(minMult, maxMult, smoothstep(0.0, 1.0, aboveThreshold));
    }
}

// Cubic bezier easing function for GLSL
// Maps input t (0-1) to eased output (0-1) using cubic bezier control points
float cubicBezierEase(float t, float x1, float y1, float x2, float y2) {
    // Binary search to find the t parameter that gives us x = input t
    float low = 0.0;
    float high = 1.0;
    float mid = 0.5;
    float epsilon = MIN_EPSILON;
    
    for (int i = 0; i < CUBIC_BEZIER_MAX_ITERATIONS; i++) {
        mid = (low + high) * 0.5;
        
        // Calculate x-coordinate at mid using cubic bezier formula
        // B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        // For x: P₀=0, P₁=x1, P₂=x2, P₃=1
        float cx = 3.0 * (1.0 - mid) * (1.0 - mid) * mid * x1 + 
                   3.0 * (1.0 - mid) * mid * mid * x2 + 
                   mid * mid * mid;
        
        if (abs(cx - t) < epsilon) break;
        if (cx < t) {
            low = mid;
        } else {
            high = mid;
        }
    }
    
    // Calculate y-coordinate at the found t
    float cy = 3.0 * (1.0 - mid) * (1.0 - mid) * mid * y1 + 
               3.0 * (1.0 - mid) * mid * mid * y2 + 
               mid * mid * mid;
    return cy;
}

