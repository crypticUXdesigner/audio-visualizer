// Post-Processing Effects
// Glitch, pixelization, and other visual effects

#include "common/constants.glsl"

// Glitch effect function - applies randomized column reordering and flipping
vec2 applyGlitchDistortion(vec2 uv, float time) {
    if (uGlitchIntensity <= 0.0) {
        return uv; // No glitch
    }
    
    // Calculate which source column this pixel belongs to
    float sourceColumnIndex = floor(uv.x * uGlitchColumnCount);
    int sourceColumn = int(clamp(sourceColumnIndex, 0.0, uGlitchColumnCount - 1.0));
    
    // Calculate position within the source column (0.0 to 1.0)
    float positionInColumn = fract(uv.x * uGlitchColumnCount);
    
    // Use hash function to get a randomized destination column index
    // Different seed values produce different randomizations
    float orderHash = hash11(float(sourceColumn) + uGlitchRandomSeed);
    float destColumnIndex = floor(orderHash * uGlitchColumnCount);
    destColumnIndex = clamp(destColumnIndex, 0.0, uGlitchColumnCount - 1.0);
    
    // Use hash function to determine if column should be flipped
    // Use different seed offset to get independent random values
    float flipHash = hash11(float(sourceColumn) + uGlitchRandomSeed + 100.0);
    
    // Apply horizontal flip if hash value is below probability threshold
    float flippedX = positionInColumn;
    if (flipHash < uGlitchFlipProbability) {
        flippedX = 1.0 - positionInColumn;
    }
    
    // Calculate new X position: map to the destination column's position
    float newX = (destColumnIndex + flippedX) / uGlitchColumnCount;
    
    // Apply vertical flip if hash value (from different seed) is below probability
    float verticalFlipHash = hash11(float(sourceColumn) + uGlitchRandomSeed + 200.0);
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

