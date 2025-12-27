// Refraction Cell Brightness Module
// Per-cell brightness variation with animation and ripple effects
// Extracted from refraction-fragment.glsl for better code organization

#ifndef REFRACTION_CELL_BRIGHTNESS_GLSL
#define REFRACTION_CELL_BRIGHTNESS_GLSL

#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/ripples.glsl"
#include "common/beat-detection.glsl"

// Animation constants
#define ANIMATION_MULTIPLIER 0.3     // Brightness animation multiplier
#define FREQ_VARIATION_RANGE 0.3     // Frequency variation range (30%)

// Brightness constants
#define RIPPLE_BRIGHTNESS_SCALE 0.02 // Scale for ripple brightness boost

// Phase multipliers for animation layers (magic numbers documented)
#define PHASE_MULTIPLIER_1 0.8976
#define PHASE_MULTIPLIER_2 0.5236
#define PHASE_MULTIPLIER_3 1.2566

// Animation layer weights
#define ANIM_LAYER_WEIGHT_1 0.1
#define ANIM_LAYER_WEIGHT_2 0.2
#define ANIM_LAYER_WEIGHT_3 0.3

// Hash scale for inner cell hash calculation
#define HASH_SCALE 100.0

// Saturation boost factor
#define SATURATION_BOOST_FACTOR 0.8

/**
 * Calculate static brightness variation for a cell
 * Each cell has unique brightness centered at 1.0 with configurable variation
 * 
 * @param outerCellId - Outer grid cell ID
 * @param brightnessVariation - Total variation range (e.g., 0.05 = ±2.5% = range 0.975 to 1.025)
 * @returns Static brightness value (0.0 to 1.0)
 */
float calculateStaticBrightness(vec2 outerCellId, float brightnessVariation) {
    return hash11(dot(outerCellId, vec2(12.9898, 78.233))) * brightnessVariation + (1.0 - brightnessVariation * 0.5);
}

/**
 * Calculate animated brightness using layered sine waves
 * Each cell has unique phase offsets and frequency variations for natural variation
 * Adaptive layers based on performance (1-3 layers)
 * 
 * @param outerCellId - Outer grid cell ID
 * @param musicalTime - Time in musical beats (time * BPM / 60)
 * @returns Animated brightness offset (-1.0 to 1.0, typically much smaller)
 */
float calculateAnimatedBrightness(vec2 outerCellId, float musicalTime) {
    // Base animation: simple sine waves with BPM-synced frequencies using musical time
    // Each cell has unique phase offsets and frequency variations for natural variation
    float baseAnimatedBrightness = 0.0;
    int animationLayers = uCellAnimationLayers > 0 ? uCellAnimationLayers : 3;
    
    // Layer 1 (always included)
    if (animationLayers >= 1) {
        float phase1 = (outerCellId.x * 7.0 + outerCellId.y * 13.0) * PHASE_MULTIPLIER_1;
        float freqHash1 = hash11(dot(outerCellId, vec2(17.0, 31.0)) + 0.1);
        float freqMult1 = 1.0 + (freqHash1 - 0.5) * FREQ_VARIATION_RANGE;
        float freq1 = (1.0 / max(uCellAnimNote1, 0.001)) * freqMult1;
        float anim1 = sin(musicalTime * freq1 + phase1) * ANIM_LAYER_WEIGHT_1;
        baseAnimatedBrightness += anim1;
    }
    
    // Layer 2 (optional)
    if (animationLayers >= 2) {
        float phase2 = (outerCellId.x * 11.0 + outerCellId.y * 17.0) * PHASE_MULTIPLIER_2;
        float freqHash2 = hash11(dot(outerCellId, vec2(23.0, 41.0)) + 0.2);
        float freqMult2 = 1.0 + (freqHash2 - 0.5) * FREQ_VARIATION_RANGE;
        float freq2 = (1.0 / max(uCellAnimNote2, 0.001)) * freqMult2;
        float anim2 = sin(musicalTime * freq2 + phase2) * ANIM_LAYER_WEIGHT_2;
        baseAnimatedBrightness += anim2;
    }
    
    // Layer 3 (optional)
    if (animationLayers >= 3) {
        float phase3 = (outerCellId.x * 3.0 + outerCellId.y * 19.0) * PHASE_MULTIPLIER_3;
        float freqHash3 = hash11(dot(outerCellId, vec2(29.0, 47.0)) + 0.3);
        float freqMult3 = 1.0 + (freqHash3 - 0.5) * FREQ_VARIATION_RANGE;
        float freq3 = (1.0 / max(uCellAnimNote3, 0.001)) * freqMult3;
        float anim3 = sin(musicalTime * freq3 + phase3) * ANIM_LAYER_WEIGHT_3;
        baseAnimatedBrightness += anim3;
    }
    
    // Increase multiplier to make animation visible
    // This gives ±24% brightness variation instead of ±6%, making the flickering clearly visible
    return baseAnimatedBrightness * ANIMATION_MULTIPLIER;
}

/**
 * Calculate ripple brightness contribution at cell center
 * Samples ripples at the center of the outer cell for consistent cell brightness
 * 
 * @param cellCenter - Center of the cell in centered UV space
 * @param aspectRatio - Screen aspect ratio
 * @returns Ripple brightness contribution (0.0 to 1.0+)
 */
float calculateRippleBrightness(vec2 cellCenter, float aspectRatio) {
    // Sample ripples at cell center for per-cell brightness variation
    // Optimized with early exit and distance culling for performance
    float cellRippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.5;
    float cellDefaultRippleWidth = uRippleWidth > 0.0 ? uRippleWidth : 0.1;
    float cellDefaultRippleMinRadius = uRippleMinRadius >= 0.0 ? uRippleMinRadius : 0.0;
    float cellDefaultRippleMaxRadius = uRippleMaxRadius > 0.0 ? uRippleMaxRadius : 1.5;
    float cellDefaultRippleIntensityMultiplier = uRippleIntensity >= 0.0 ? uRippleIntensity : 0.4;
    float cellStereoScale = aspectRatio * 0.5;
    int cellMaxRipplesInt = 16;
    int cellClampedRippleCount;
    if (uRippleCount < cellMaxRipplesInt) {
        cellClampedRippleCount = uRippleCount;
    } else {
        cellClampedRippleCount = cellMaxRipplesInt;
    }
    
    // Early exit: check if any ripples are active and have significant intensity
    bool hasActiveRipples = false;
    for (int j = 0; j < 16; j++) {
        if (j >= cellClampedRippleCount) break;
        if (uRippleActive[j] > 0.5 && uRippleIntensities[j] > 0.0) {
            hasActiveRipples = true;
            break;
        }
    }
    if (!hasActiveRipples) return 0.0; // Early exit if no active ripples
    
    float cellRippleBrightness = 0.0;
    for (int i = 0; i < 16; i++) {
        if (i >= cellClampedRippleCount) break;
        
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            vec2 rippleCenter = vec2(uRippleCenterX[i] * cellStereoScale, uRippleCenterY[i]);
            float rippleAge = uRippleTimes[i];
            float rippleIntensity = uRippleIntensities[i];
            
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : cellDefaultRippleWidth;
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : cellDefaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : cellDefaultRippleMaxRadius;
            
            // Distance-based culling: skip ripples too far from cell center
            float distToRipple = length(cellCenter - rippleCenter);
            if (distToRipple > rippleMaxRadius * 2.0) continue; // Skip distant ripples
            
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : cellDefaultRippleIntensityMultiplier;
            
            float ripple = createRipple(cellCenter, rippleCenter, rippleAge, rippleIntensity, cellRippleSpeed, rippleWidth, rippleMinRadius, rippleMaxRadius);
            cellRippleBrightness += ripple * rippleIntensityMultiplier;
        }
    }
    
    // Convert per-cell ripple value to brightness boost (reduced scale to prevent overpowering)
    return cellRippleBrightness * RIPPLE_BRIGHTNESS_SCALE;
}

/**
 * Preserve saturation when brightness changes to prevent washed out colors
 * 
 * @param color - Input color (will be modified)
 * @param cellBrightness - Brightness multiplier to apply
 */
void applySaturationPreservation(inout vec3 color, float cellBrightness) {
    float maxColor = max(max(color.r, color.g), color.b);
    float minColor = min(min(color.r, color.g), color.b);
    
    if (maxColor > 0.001) {
        // Calculate current saturation
        float currentSat = (maxColor - minColor) / maxColor;
        
        // Apply brightness change
        color *= cellBrightness;
        
        // Recalculate max after brightness change
        float newMaxColor = max(max(color.r, color.g), color.b);
        
        // Preserve saturation by boosting it when brightness increases
        if (newMaxColor > 0.001 && currentSat > 0.001) {
            float brightnessRatio = cellBrightness;
            if (brightnessRatio > 1.0) {
                // When brightness increases, boost saturation more aggressively
                float saturationBoost = 1.0 + (brightnessRatio - 1.0) * SATURATION_BOOST_FACTOR; // Boost by 80% of brightness increase
                float targetSat = min(currentSat * saturationBoost, 1.0);
                
                // Calculate new saturation after brightness change
                float newMinColor = min(min(color.r, color.g), color.b);
                float newSat = (newMaxColor - newMinColor) / newMaxColor;
                
                // Boost saturation toward target
                if (newSat > 0.001 && newSat < targetSat) {
                    vec3 gray = vec3(newMaxColor);
                    float satRatio = targetSat / newSat;
                    color = mix(gray, color, satRatio);
                }
            }
        }
    } else {
        // Apply brightness change for very dark colors
        color *= cellBrightness;
    }
}

/**
 * Calculate cell brightness with all components (static, animation, ripples)
 * 
 * @param normalizedUV - Normalized UV coordinates [0,1]
 * @param uv - UV coordinates in centered space
 * @param aspectRatio - Screen aspect ratio
 * @param outerGridSize - Outer grid size (with beat boost)
 * @param innerGridSize - Inner grid size (with beat boost)
 * @param beatGridBoost - Beat-triggered grid boost amount
 * @returns Cell brightness multiplier
 */
float calculateCellBrightness(
    vec2 normalizedUV,
    vec2 uv,
    float aspectRatio,
    float outerGridSize,
    float innerGridSize,
    float beatGridBoost
) {
    // Calculate grid cell IDs
    vec2 outerCellSize = vec2(1.0) / outerGridSize;
    vec2 outerCellId = floor(normalizedUV / outerCellSize);
    vec2 innerCellSize = outerCellSize / innerGridSize;
    vec2 outerCellUV = fract(normalizedUV / outerCellSize);
    vec2 innerCellId = floor(outerCellUV / innerCellSize);
    
    // Base static brightness variation - this is the foundation that should be preserved
    // Each cell has unique brightness centered at 1.0 with configurable variation
    // Variation is the total range (e.g., 0.05 = ±2.5% = range 0.975 to 1.025, 0.1 = ±5% = range 0.95 to 1.05)
    float brightnessVariation = uCellBrightnessVariation;
    float staticBrightness = calculateStaticBrightness(outerCellId, brightnessVariation);
    
    // Convert time to musical time (beats) - time in beats = time * BPM / 60
    // Fallback to regular time if BPM is not available
    float musicalTime = (uBPM > 0.0) ? (uTime * uBPM / 60.0) : uTime;
    
    // Calculate animated brightness
    float animatedBrightness = calculateAnimatedBrightness(outerCellId, musicalTime);
    
    // Calculate ripple contribution at cell center for consistent cell brightness
    // Use the center of the outer cell to sample ripple effect
    vec2 cellCenterUV = (outerCellId + 0.5) * outerCellSize;
    vec2 cellCenter = vec2(
        (cellCenterUV.x - 0.5) * aspectRatio,
        cellCenterUV.y - 0.5
    );
    
    float rippleBrightnessBoost = calculateRippleBrightness(cellCenter, aspectRatio);
    
    // Apply brightness changes: static brightness is the base, then add animation and ripples
    // Formula: base * (1 + animated_boost + ripple_boost) preserves relative differences
    return staticBrightness * (1.0 + animatedBrightness + rippleBrightnessBoost);
}

#endif

