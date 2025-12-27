// Refraction Sampling Module
// Complex grid-based noise sampling with blur and pixelization
// Extracted from refraction-fragment.glsl for better code organization

#ifndef REFRACTION_SAMPLING_GLSL
#define REFRACTION_SAMPLING_GLSL

#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/beat-detection.glsl"
#include "source/refraction-pixelization.glsl"

// FBM constants for noise generation
// Note: FBM_OCTAVES is now adaptive via uniform uFbmOctaves
#define FBM_LACUNARITY  1.35
#define FBM_GAIN        0.65
#define FBM_SCALE       1.25

// Blur constants
#define BASE_BLUR_RADIUS 0.01  // Base blur radius as fraction of screen (1%)
#define MIN_BLUR_RADIUS 0.05   // Minimum blur radius (0.5% of screen)
#define BLUR_WEIGHT 0.5        // Weight for blur samples

// Distance-based strength constants
#define DISTANCE_STRENGTH_MIN 0.3    // Minimum distance-based strength (center)
#define DISTANCE_STRENGTH_MAX 1.0    // Maximum distance-based strength (edge)
#define DISTANCE_STRENGTH_RANGE 0.7  // Range for distance-based strength interpolation

// Refraction-specific beat detection constant
#define BEAT_GRID_BOOST 6.0          // Grid size boost when beat detected

/**
 * Check for recent bass or mid beats and return grid boost amount
 * Returns BEAT_GRID_BOOST if recent beat detected, 0.0 otherwise
 */
float getBeatGridBoost() {
    return hasAnyBeat() ? BEAT_GRID_BOOST : 0.0;
}

/**
 * Sample noise with refraction distortion
 * Applies blur and offset at two grid levels
 * Each cell acts like a separate pane of glass viewing the noise from a different angle
 * 
 * @param uv - UV coordinates in centered space: x in [-aspectRatio/2, aspectRatio/2], y in [-0.5, 0.5]
 * @param aspectRatio - Screen aspect ratio
 * @param t - Time value for noise animation
 * @returns Sampled noise value (0.0 to 1.0)
 */
float sampleNoiseWithRefraction(vec2 uv, float aspectRatio, float t) {
    // Convert to [0,1] space for grid calculations
    vec2 normalizedUV = vec2(
        (uv.x / aspectRatio + 0.5),
        (uv.y + 0.5)
    );
    
    // Beat-triggered grid size change: use same beat detection as ripples
    float beatGridBoost = getBeatGridBoost();
    
    // Use tempo-smoothed FBM zoom factor (calculated in JavaScript with attack/release)
    // Smoothed value is always set in JavaScript, so use it directly
    // Fallback to 1.0 (no zoom) if uniform not available
    float fbmZoomFactor = (uSmoothedFbmZoom > 0.001 || uSmoothedFbmZoom < -0.001) ? uSmoothedFbmZoom : 1.0;
    
    // Calculate outer grid cell with beat boost
    float baseOuterGridSize = max(2.0, uOuterGridSize);
    float outerGridSize = baseOuterGridSize + beatGridBoost;
    vec2 outerCellSize = vec2(1.0) / outerGridSize;
    vec2 outerCellId = floor(normalizedUV / outerCellSize);
    vec2 outerCellUV = fract(normalizedUV / outerCellSize);
    
    // Generate random offset for outer cell (consistent per cell)
    vec2 outerHash = hash22(outerCellId);
    
    // Calculate inner grid cell (within outer cell) with beat boost
    // outerCellUV is already fract(normalizedUV / outerCellSize), so use it directly
    float baseInnerGridSize = max(2.0, uInnerGridSize);
    float innerGridSize = baseInnerGridSize + beatGridBoost;
    vec2 innerCellSize = outerCellSize / innerGridSize;
    vec2 innerCellId = floor(outerCellUV / innerCellSize);
    
    // Generate random offset for inner cell (consistent per sub-cell)
    // Each inner cell gets its own unique hash based on both outer and inner cell IDs
    vec2 innerHash = hash22(outerCellId * 100.0 + innerCellId);
    
    // Generate random offset for each cell - creates visible boundaries
    // Calculate distance from center to apply distance-based offset strength
    // Distance from center: 0.0 (center) to ~0.707 (corner)
    vec2 centerToUV = normalizedUV - vec2(0.5, 0.5);
    float distFromCenter = length(centerToUV);
    float maxDist = length(vec2(0.5, 0.5)); // Maximum distance (corner)
    float normalizedDist = distFromCenter / maxDist; // 0.0 (center) to 1.0 (corner)
    
    // Offset strength: weaker in center, stronger at edges
    // Smooth interpolation from center to edge
    float distanceBasedStrength = DISTANCE_STRENGTH_MIN + normalizedDist * DISTANCE_STRENGTH_RANGE;
    
    // Outer offset: scaled by outer cell size and distance from center
    vec2 outerOffset = (outerHash - 0.5) * 2.0 * uOffsetStrength * distanceBasedStrength;
    vec2 outerOffsetInUV = outerOffset * vec2(aspectRatio, 1.0) * outerCellSize * 2.0;
    
    // Inner offset: scaled by inner cell size and distance from center
    // This makes inner cell offsets visible and proportional to inner cell size
    vec2 innerOffset = (innerHash - 0.5) * 2.0 * uOffsetStrength * distanceBasedStrength;
    // Make inner offset more visible - scale it larger relative to inner cell size
    vec2 innerOffsetInUV = innerOffset * vec2(aspectRatio, 1.0) * innerCellSize * 4.0;
    
    // Combine offsets - both are now in centered UV space
    vec2 totalOffset = outerOffsetInUV + innerOffsetInUV;
    
    // Sample noise at offset position - each cell samples different part
    // Apply zoom factor to create zoom-out effect during beat animation
    vec2 sampleUV = (uv + totalOffset) * fbmZoomFactor;
    
    // Apply pixelization BEFORE blur so each sample is quantized first
    // This creates visible banding when blur averages the quantized samples
    // Use adaptive fBm octaves (default 6, reduced on mobile)
    int fbmOctaves = uFbmOctaves > 0 ? uFbmOctaves : 6;
    float sampleNoise = fbm2_standard(sampleUV, t, FBM_SCALE, fbmOctaves, FBM_LACUNARITY, FBM_GAIN);
    if (uPixelizeLevels > 0.0) {
        sampleNoise = pixelize(sampleNoise, uPixelizeLevels);
    }
    float noiseValue = sampleNoise;
    
    // Apply blur per-cell - creates frosted glass effect
    // Blur now averages already-quantized samples, creating visible banding
    // Skip blur entirely if strength is negligible (early exit optimization)
    if (uBlurStrength > 0.01 && uBlurSampleCount > 1) {
        // Blur radius should be independent of cell size for consistent frost effect
        // Use a fixed fraction of screen space (0.01 = 1% of screen) scaled by blur strength
        // This ensures frost effect is visible regardless of grid size
        float baseBlurRadius = BASE_BLUR_RADIUS; // Base blur radius as fraction of screen (1%)
        float blurRadius = baseBlurRadius * uBlurStrength;
        
        // Ensure minimum blur radius so frost effect is always visible even with small cells
        blurRadius = max(blurRadius, MIN_BLUR_RADIUS);
        
        vec2 blurOffset = vec2(blurRadius * aspectRatio, blurRadius);
        
        // Adaptive blur - pixelize each sample before averaging
        float weight = BLUR_WEIGHT; // Reduced weight to preserve cell boundaries
        float sampleCount = 1.0;
        
        // Always sample horizontal (most important) if blur is enabled
        if (uBlurSampleCount >= 2) {
            float sample1 = fbm2_standard(sampleUV + blurOffset, t, FBM_SCALE, fbmOctaves, FBM_LACUNARITY, FBM_GAIN);
            float sample2 = fbm2_standard(sampleUV - blurOffset, t, FBM_SCALE, fbmOctaves, FBM_LACUNARITY, FBM_GAIN);
            
            // Pixelize each sample if pixelization is enabled
            if (uPixelizeLevels > 0.0) {
                sample1 = pixelize(sample1, uPixelizeLevels);
                sample2 = pixelize(sample2, uPixelizeLevels);
            }
            
            noiseValue += sample1 * weight;
            noiseValue += sample2 * weight;
            sampleCount += 2.0;
        }
        
        // Optional diagonal samples (only if quality allows)
        if (uBlurSampleCount >= 5) {
            float sample3 = fbm2_standard(sampleUV + vec2(-blurOffset.y, blurOffset.x), t, FBM_SCALE, fbmOctaves, FBM_LACUNARITY, FBM_GAIN);
            float sample4 = fbm2_standard(sampleUV + vec2(blurOffset.y, -blurOffset.x), t, FBM_SCALE, fbmOctaves, FBM_LACUNARITY, FBM_GAIN);
            
            // Pixelize each sample if pixelization is enabled
            if (uPixelizeLevels > 0.0) {
                sample3 = pixelize(sample3, uPixelizeLevels);
                sample4 = pixelize(sample4, uPixelizeLevels);
            }
            
            noiseValue += sample3 * weight;
            noiseValue += sample4 * weight;
            sampleCount += 2.0;
        }
        
        // Average the quantized samples
        noiseValue /= (1.0 + (sampleCount - 1.0) * weight);
    }
    
    return noiseValue;
}

#endif

