// Visual Effects
// Glitch, pixelization, and other visual effects
//
// This module provides visual effects that can be applied to the shader:
// - Glitch distortion: Randomized column reordering and flipping
// - Pixelization: Quantizes UV coordinates to create pixelated effect
//
// Glitch Algorithm:
// Divides the screen into columns. For each column:
// 1. Uses hash function to determine destination column (randomized reordering)
// 2. Uses hash function to determine if column should be flipped horizontally
// 3. Uses hash function to determine if column should be flipped vertically
// Different hash seed offsets ensure independent randomization for each effect.
//
// Dependencies: common/constants.glsl
// Used by: background.glsl

#include "common/constants.glsl"

// Glitch effect hash seed offsets (to generate independent random values)
#define GLITCH_FLIP_HASH_OFFSET 100.0
#define GLITCH_VERTICAL_FLIP_HASH_OFFSET 200.0

// Glitch effect function - applies randomized column reordering and flipping
vec2 applyGlitchDistortion(vec2 uv, float time) {
    // Disable glitch on low-end devices for performance
    if (uGlitchIntensity <= 0.0 || uQualityLevel < 0.6) {
        return uv; // No glitch
    }
    
    // Reduce column count on mobile for performance
    float effectiveColumnCount = uQualityLevel < 0.7 
        ? max(4.0, uGlitchColumnCount * 0.5)  // Fewer columns on mobile
        : uGlitchColumnCount;
    
    // Calculate which source column this pixel belongs to
    float sourceColumnIndex = floor(uv.x * effectiveColumnCount);
    int sourceColumn = int(clamp(sourceColumnIndex, 0.0, effectiveColumnCount - 1.0));
    
    // Calculate position within the source column (0.0 to 1.0)
    float positionInColumn = fract(uv.x * uGlitchColumnCount);
    
    // Use hash function to get a randomized destination column index
    // Different seed values produce different randomizations
    float orderHash = hash11(float(sourceColumn) + uGlitchRandomSeed);
    float destColumnIndex = floor(orderHash * effectiveColumnCount);
    destColumnIndex = clamp(destColumnIndex, 0.0, effectiveColumnCount - 1.0);
    
    // Use hash function to determine if column should be flipped
    // Use different seed offset to get independent random values
    float flipHash = hash11(float(sourceColumn) + uGlitchRandomSeed + GLITCH_FLIP_HASH_OFFSET);
    
    // Apply horizontal flip if hash value is below probability threshold
    float flippedX = positionInColumn;
    if (flipHash < uGlitchFlipProbability) {
        flippedX = 1.0 - positionInColumn;
    }
    
    // Calculate new X position: map to the destination column's position
    float newX = (destColumnIndex + flippedX) / effectiveColumnCount;
    
    // Apply vertical flip if hash value (from different seed) is below probability
    float verticalFlipHash = hash11(float(sourceColumn) + uGlitchRandomSeed + GLITCH_VERTICAL_FLIP_HASH_OFFSET);
    float newY = uv.y;
    if (verticalFlipHash < uGlitchFlipProbability) {
        newY = 1.0 - uv.y;
    }
    
    // Mix between original and transformed based on intensity
    vec2 distortedUV = uv;
    distortedUV.x = mix(uv.x, newX, uGlitchIntensity);
    distortedUV.y = mix(uv.y, newY, uGlitchIntensity);
    
    return distortedUV;
}

// Pixelization effect
vec2 applyPixelization(vec2 uv) {
    if (uGlitchPixelSize <= 0.0) {
        return uv;
    }
    
    // Quantize UV coordinates
    float pixelSize = uGlitchPixelSize / min(uResolution.x, uResolution.y);
    vec2 pixelizedUV = floor(uv / pixelSize) * pixelSize;
    return pixelizedUV;
}

