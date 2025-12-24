// Post-Processing Effects
// Contrast adjustment and glow effects

#include "common/constants.glsl"
#include "strings/math-utils.glsl"
#include "strings/validation.glsl"

// Apply post-processing effects (contrast and glow)
vec3 applyPostProcessing(vec3 finalColor) {
    vec3 processedColor = finalColor;
    
    // Calculate audio-reactive contrast
    float contrastValue = uContrast;
    
    // Apply audio reactivity to contrast (similar to background noise)
    if (uContrastAudioReactive > EPSILON) {
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
    float glowIntensityValue = max(uGlowIntensity, 0.0); // Ensure non-negative
    if (glowIntensityValue > EPSILON) {
        // Calculate brightness using luminance
        float brightness = dot(processedColor, vec3(0.299, 0.587, 0.114));
        
        // Create glow for bright areas - more aggressive threshold
        float glowThreshold = 0.15; // Lower threshold for more glow
        if (brightness > glowThreshold) {
            // Smooth falloff from threshold to full brightness
            float glowAmount = smoothstep(glowThreshold, 0.8, brightness);
            
            // Multiply glow amount by intensity for control
            glowAmount *= glowIntensityValue;
            
            // Add glow by brightening and slightly desaturating (bloom effect)
            vec3 brightColor = processedColor * (1.0 + glowAmount * 0.8);
            
            // Blend between original and brightened color based on glow amount
            processedColor = mix(processedColor, brightColor, glowAmount * 0.6);
            
            // Also add a subtle additive glow for extra brightness
            vec3 additiveGlow = processedColor * glowAmount * 0.4;
            processedColor += additiveGlow;
        }
    }
    
    // Clamp final color to valid range
    processedColor = clamp(processedColor, 0.0, 1.0);
    
    return processedColor;
}

