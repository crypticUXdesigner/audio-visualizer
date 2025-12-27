// Refraction Distortion Module
// Bass-reactive radial distortion and perspective scaling
// Extracted from refraction-fragment.glsl for better code organization

#ifndef REFRACTION_DISTORTION_GLSL
#define REFRACTION_DISTORTION_GLSL

#include "common/uniforms.glsl"
#include "common/audio.glsl"

// Distortion constants
#define DISTORTION_MAX_STRENGTH 0.15  // Maximum distortion strength (15% of screen)

/**
 * Apply easing curve to bass intensity for smoother or more dramatic response
 * 
 * @param bassValue - Bass intensity value (0.0 to 1.0)
 * @param easingType - Easing type: 0.0 = linear, 1.0 = smooth (smoothstep), 2.0 = exponential
 * @returns Eased bass value (0.0 to 1.0)
 */
float applyBassEasing(float bassValue, float easingType) {
    float clampedBass = clamp(bassValue, 0.0, 1.0);
    
    if (easingType < 0.5) {
        // Linear: no easing
        return clampedBass;
    } else if (easingType < 1.5) {
        // Smooth: smoothstep curve (ease in/out)
        return smoothstep(0.0, 1.0, clampedBass);
    } else {
        // Exponential: power curve (ease in)
        // Map 1.5-2.0 to power range 2.0-4.0
        float power = 2.0 + (easingType - 1.5) * 4.0; // 2.0 to 4.0
        return pow(clampedBass, power);
    }
}

/**
 * Apply radial pincushion distortion (like looking into a sphere)
 * Strongest at edges, weakest at center
 * Center appears to recede while staying flat
 * Reacts to bass intensity
 * 
 * @param uv - UV coordinates in centered space
 * @param aspectRatio - Screen aspect ratio
 * @param bassIntensity - Bass intensity value (0.0 to 1.0)
 * @returns Distorted UV coordinates
 */
vec2 applyBassDistortion(vec2 uv, float aspectRatio, float bassIntensity) {
    // Convert to centered coordinates
    vec2 centeredUV = uv;
    
    // Calculate distance from center
    vec2 centerToUV = centeredUV;
    float distFromCenter = length(centerToUV);
    
    // Normalize distance (0 = center, 1 = edge of screen)
    // Use aspect ratio to get proper distance in screen space
    float maxDist = length(vec2(aspectRatio * 0.5, 0.5));
    float normalizedDist = distFromCenter / maxDist;
    
    // Apply size control: uDistortionSize controls how far the effect extends
    // 0.0 = center only, 1.0 = full screen, >1.0 = extends beyond screen
    // Clamp to prevent division by zero
    float distortionSize = max(0.01, uDistortionSize);
    float sizeAdjustedDist = clamp(normalizedDist / distortionSize, 0.0, 1.0);
    
    // INVERTED falloff curve: strong at edges (1.0), weak at center (0.0)
    // This creates the "looking into sphere" effect
    // uDistortionFalloff controls the easing: 1.0 = linear, 2.0 = smooth, 4.0 = very sharp
    float falloffPower = max(0.1, uDistortionFalloff);
    float falloff = pow(sizeAdjustedDist, falloffPower); // Inverted: use dist directly instead of (1.0 - dist)
    falloff = clamp(falloff, 0.0, 1.0);
    
    // Calculate distortion strength based on bass with easing
    // Apply easing curve to bass intensity for smoother or more dramatic response
    float rawBassStrength = uSmoothedBass * bassIntensity;
    float easedBassStrength = applyBassEasing(rawBassStrength, uDistortionEasing);
    
    // Calculate distortion amount with eased bass
    float distortionAmount = easedBassStrength * DISTORTION_MAX_STRENGTH * falloff * uDistortionStrength;
    
    // REVERSE direction: pull inward toward center (negative direction)
    // This creates pincushion effect (edges pulled in)
    vec2 direction = normalize(centerToUV);
    vec2 distortion = direction * -distortionAmount; // Negative = pull inward
    
    // Add perspective scaling: scale center down to make it appear to recede
    // Stronger scaling at center, weaker at edges
    // uDistortionPerspectiveStrength controls the strength (replaces hardcoded 0.3)
    float centerFalloff = 1.0 - sizeAdjustedDist; // Inverse: strong at center, weak at edges
    float perspectiveScale = 1.0 - (easedBassStrength * DISTORTION_MAX_STRENGTH * centerFalloff * uDistortionStrength * uDistortionPerspectiveStrength);
    perspectiveScale = clamp(perspectiveScale, 0.7, 1.0); // Limit scaling to prevent too much zoom
    
    // Apply both distortion and perspective scaling
    vec2 distortedUV = (uv + distortion) * perspectiveScale;
    
    return distortedUV;
}

#endif

