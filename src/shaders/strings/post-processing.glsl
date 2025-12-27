// Post-Processing Effects
// Contrast adjustment and glow effects
//
// This module applies post-processing effects to the final rendered image:
// - Audio-reactive contrast adjustment
// - Glow/bloom effect for bright areas
//
// Glow Algorithm:
// Calculates luminance of each pixel. For bright pixels (above threshold),
// applies a bloom effect by:
// 1. Brightening the color based on brightness level
// 2. Blending between original and brightened color
// 3. Adding a subtle additive glow for extra brightness
// This creates a bloom-like effect that makes bright areas glow.
//
// Dependencies: common/constants.glsl, strings/math-utils.glsl, strings/validation.glsl
// Used by: strings-fragment.glsl

#include "common/constants.glsl"
#include "strings/math-utils.glsl"
#include "strings/validation.glsl"

// Glow effect constants
#define GLOW_THRESHOLD 0.15              // Lower threshold for more glow (brightness level)
#define GLOW_BRIGHTNESS_MULTIPLIER 0.8   // Multiplier for brightening bright areas
#define GLOW_BLEND_FACTOR 0.6            // Blend factor between original and brightened color
#define GLOW_ADDITIVE_FACTOR 0.4         // Additive glow factor for extra brightness
#define GLOW_FALLOFF_END 0.8             // End point for smoothstep falloff

// Apply post-processing effects (contrast and glow)
vec3 applyPostProcessing(vec3 finalColor) {
    vec3 processedColor = finalColor;
    
    // Calculate audio-reactive contrast
    float contrastValue = uContrast;
    
    // Apply audio reactivity to contrast (similar to background noise)
    // Skip audio-reactive contrast on mobile for performance
    if (uContrastAudioReactive > EPSILON && uQualityLevel >= 0.7) {
        // Use pre-smoothed audio level (with attack/release timing applied in JavaScript)
        float audioLevel = validateAudioLevel(uSmoothedContrastAudioLevel);
        
        // Use the same cubic bezier curve as background noise for consistency
        float audioFactor = cubicBezierEase(
            audioLevel,
            uBackgroundNoiseBrightnessCurveX1,
            uBackgroundNoiseBrightnessCurveY1,
            uBackgroundNoiseBrightnessCurveX2,
            uBackgroundNoiseBrightnessCurveY2
        );
        
        // Map audio factor to contrast range (min at quiet, max at loud)
        float audioContrast = mix(uContrastMin, uContrastMax, audioFactor);
        
        // Mix between base contrast and audio-reactive contrast based on reactivity amount
        contrastValue = mix(contrastValue, audioContrast, uContrastAudioReactive);
    }
    
    // Apply contrast adjustment
    // Formula: (color - 0.5) * contrast + 0.5
    // Safety check: if contrast is 0.0 or invalid, default to 1.0 (no change)
    contrastValue = (contrastValue > EPSILON) ? contrastValue : 1.0;
    if (abs(contrastValue - 1.0) > EPSILON) {
        processedColor = (processedColor - 0.5) * contrastValue + 0.5;
    }
    
    // Apply glow effect (bloom-like effect that brightens bright areas)
    // Disable glow on mobile/low-end devices for performance
    float glowIntensityValue = max(uGlowIntensity, 0.0); // Ensure non-negative
    if (glowIntensityValue > EPSILON && uQualityLevel >= 0.7) {
        // Calculate brightness using luminance
        float brightness = dot(processedColor, vec3(0.299, 0.587, 0.114));
        
        // Create glow for bright areas - more aggressive threshold
        if (brightness > GLOW_THRESHOLD) {
            // Smooth falloff from threshold to full brightness
            float glowAmount = smoothstep(GLOW_THRESHOLD, GLOW_FALLOFF_END, brightness);
            
            // Multiply glow amount by intensity for control
            glowAmount *= glowIntensityValue;
            
            // Add glow by brightening and slightly desaturating (bloom effect)
            vec3 brightColor = processedColor * (1.0 + glowAmount * GLOW_BRIGHTNESS_MULTIPLIER);
            
            // Blend between original and brightened color based on glow amount
            processedColor = mix(processedColor, brightColor, glowAmount * GLOW_BLEND_FACTOR);
            
            // Also add a subtle additive glow for extra brightness
            vec3 additiveGlow = processedColor * glowAmount * GLOW_ADDITIVE_FACTOR;
            processedColor += additiveGlow;
        }
    }
    
    // Clamp final color to valid range
    processedColor = clamp(processedColor, 0.0, 1.0);
    
    return processedColor;
}

