// Arc Sphere Module
// Audio-reactive center sphere rendering
// Extracted from arc-fragment.glsl for better code organization

#ifndef ARC_SPHERE_GLSL
#define ARC_SPHERE_GLSL

#include "common/uniforms.glsl"
#include "common/color-mapping.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"

// Performance constants
#define EARLY_EXIT_THRESHOLD 0.001

// Apply hue shift to RGB color
// hueShift is in degrees (-180 to 180)
vec3 applyHueShift(vec3 rgb, float hueShift) {
    if (abs(hueShift) < 0.001) {
        return rgb;
    }
    
    // Convert RGB to HSV
    float maxVal = max(max(rgb.r, rgb.g), rgb.b);
    float minVal = min(min(rgb.r, rgb.g), rgb.b);
    float delta = maxVal - minVal;
    
    float hue = 0.0;
    if (delta > 0.001) {
        if (maxVal == rgb.r) {
            hue = mod(((rgb.g - rgb.b) / delta) * 60.0 + 360.0, 360.0);
        } else if (maxVal == rgb.g) {
            hue = ((rgb.b - rgb.r) / delta + 2.0) * 60.0;
        } else {
            hue = ((rgb.r - rgb.g) / delta + 4.0) * 60.0;
        }
    }
    
    float saturation = (maxVal > 0.001) ? (delta / maxVal) : 0.0;
    float value = maxVal;
    
    // Apply hue shift
    hue = mod(hue + hueShift + 360.0, 360.0);
    
    // Convert back to RGB
    float c = value * saturation;
    float x = c * (1.0 - abs(mod(hue / 60.0, 2.0) - 1.0));
    float m = value - c;
    
    vec3 rgbOut;
    if (hue < 60.0) {
        rgbOut = vec3(c, x, 0.0);
    } else if (hue < 120.0) {
        rgbOut = vec3(x, c, 0.0);
    } else if (hue < 180.0) {
        rgbOut = vec3(0.0, c, x);
    } else if (hue < 240.0) {
        rgbOut = vec3(0.0, x, c);
    } else if (hue < 300.0) {
        rgbOut = vec3(x, 0.0, c);
    } else {
        rgbOut = vec3(c, 0.0, x);
    }
    
    return rgbOut + vec3(m);
}

// Render glowing center sphere
// OPTIMIZATION Phase 2.2: Accept pre-calculated thresholds to avoid redundant calculation
vec3 renderCenterSphere(
    vec2 uv,
    vec2 center,
    float aspectRatio,
    float viewportScale,
    float dprScale,
    float time,
    float threshold1, float threshold2, float threshold3, float threshold4, float threshold5,
    float threshold6, float threshold7, float threshold8, float threshold9, float threshold10
) {
    // Early exit if sphere is disabled
    if (uCenterSphereEnabled < 0.5) {
        return vec3(0.0);
    }
    
    // Calculate distance from center in aspect-corrected space
    vec2 toCenter = uv - center;
    vec2 toCenterAspectCorrected = vec2(toCenter.x * aspectRatio, toCenter.y);
    vec2 toCenterScaled = toCenterAspectCorrected * viewportScale;
    float distFromCenter = length(toCenterScaled);
    
    // Audio-reactive size: use smoothed volume for base size + smoothed bass for subtle boost
    float baseSphereRadius = uCenterSphereBaseRadius * viewportScale;
    float volumeSize = uSmoothedSphereSizeVolume;
    float bassSize = uSmoothedSphereSizeBass * uCenterSphereBassSizeMultiplier;
    float combinedSize = volumeSize + bassSize; // Combined additively
    float audioSize = baseSphereRadius + combinedSize * uCenterSphereMaxRadius * viewportScale;
    
    // Apply size threshold: sphere only appears above minimum volume
    float sizeThreshold = uCenterSphereSizeThreshold;
    float sizeFactor = smoothstep(sizeThreshold, sizeThreshold + 0.1, combinedSize);
    float sphereRadius = baseSphereRadius + (audioSize - baseSphereRadius) * sizeFactor;
    
    // Core sphere: bright center with smooth falloff
    float coreRadius = sphereRadius * uCenterSphereCoreSize;
    float coreDist = distFromCenter / coreRadius;
    float coreFactor = 1.0 - smoothstep(0.0, 1.0, coreDist);
    
    // Glow halo: extends beyond core with exponential falloff
    float glowRadius = sphereRadius * uCenterSphereGlowSize;
    float glowDist = distFromCenter / glowRadius;
    float glowFactor = exp(-glowDist * glowDist * uCenterSphereGlowFalloff);
    
    // Audio-reactive brightness: two-stage curve (fast to fairly bright, slow to full)
    // Uses voice frequencies (uMid) via smoothed brightness
    float baseBrightness = uCenterSphereBaseBrightness;
    float smoothedMid = uSmoothedSphereBrightness;
    float midThreshold = uCenterSphereBrightnessMidThreshold;
    float fullThreshold = uCenterSphereBrightnessFullThreshold;
    
    float brightnessStage1 = 0.0;
    float brightnessStage2 = 0.0;
    
    if (smoothedMid <= midThreshold) {
        // Stage 1: Fast attack to "fairly bright" (0.0 to midThreshold maps to 0.0 to 0.7 brightness)
        brightnessStage1 = (smoothedMid / midThreshold) * 0.7;
        brightnessStage2 = 0.0;
    } else {
        // Stage 2: Slow release to full brightness (midThreshold to fullThreshold maps to 0.7 to 1.0)
        float stage2Range = fullThreshold - midThreshold;
        if (stage2Range > 0.001) {
            float stage2Progress = (smoothedMid - midThreshold) / stage2Range;
            brightnessStage1 = 0.7; // Already at "fairly bright"
            brightnessStage2 = stage2Progress * 0.3; // Additional 0.3 to reach 1.0
        } else {
            brightnessStage1 = 0.7;
            brightnessStage2 = 0.0;
        }
    }
    
    float totalBrightness = brightnessStage1 + brightnessStage2;
    float brightnessPulse = baseBrightness + totalBrightness * uCenterSphereBrightnessRange;
    
    // Optional: subtle animation/noise for visual interest
    float animationFactor = 1.0;
    if (uCenterSphereNoiseEnabled > 0.5) {
        vec2 noiseUV = toCenterScaled * uCenterSphereNoiseScale;
        float noiseTime = time * uCenterSphereNoiseSpeed;
        float noise = fbm2_standard(noiseUV, noiseTime, 1.0, 3, 2.0, 0.5);
        animationFactor = 1.0 + (noise - 0.5) * uCenterSphereNoiseAmount;
    }
    
    // Optional: 3D-like shading (subtle gradient from center)
    float shadingFactor = 1.0;
    if (uCenterSphere3DEnabled > 0.5) {
        // Create a subtle gradient: brighter at center, darker at edges
        float normalizedDist = clamp(distFromCenter / sphereRadius, 0.0, 1.0);
        shadingFactor = 1.0 - normalizedDist * uCenterSphere3DStrength;
    }
    
    // Combine core and glow
    float sphereFactor = max(coreFactor, glowFactor * uCenterSphereGlowIntensity);
    sphereFactor *= brightnessPulse * animationFactor * shadingFactor;
    sphereFactor = clamp(sphereFactor, 0.0, 1.0);
    
    // Early exit if sphere factor is too small (performance optimization)
    if (sphereFactor < EARLY_EXIT_THRESHOLD) {
        return vec3(0.0);
    }
    
    // Map to color using existing color system
    // Use combined size (volume + bass) for color mapping to match sphere size
    float colorInput = combinedSize;
    colorInput = applySoftCompression(colorInput, 0.7, 0.3);
    
    // OPTIMIZATION Phase 2.2: Use pre-calculated thresholds instead of recalculating
    // Thresholds are passed as parameters (calculated once in main())
    
    // Map audio level to color
    vec3 sphereColor = mapNoiseToColorSmooth(
        colorInput,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uArcColorTransitionWidth
    );
    
    // Apply brightness multiplier (can exceed 1.0 for super-bright effect)
    sphereColor *= uSmoothedSphereBrightnessMultiplier;
    
    // Apply hue shift
    sphereColor = applyHueShift(sphereColor, uSmoothedSphereHueShift);
    
    // Apply sphere factor (fade from center)
    return sphereColor * sphereFactor;
}

#endif

