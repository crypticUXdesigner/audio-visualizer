// Band Utility Functions
// Helper functions for band calculations and sampling

// Sample frequency level for a specific band
float sampleBandFrequencyLevel(int band, bool isLeftSide, sampler2D frequencyTexture) {
    float bandX = (float(band) + 0.5) / float(uNumBands);
    vec2 texCoord = vec2(bandX, 0.5);
    vec4 freqData = texture2D(frequencyTexture, texCoord);
    return isLeftSide ? freqData.r : freqData.a;
}

// Sample height level for a specific band
float sampleBandHeightLevel(int band, bool isLeftSide, sampler2D heightTexture) {
    float bandX = (float(band) + 0.5) / float(uNumBands);
    vec2 texCoord = vec2(bandX, 0.5);
    vec4 heightData = texture2D(heightTexture, texCoord);
    return isLeftSide ? heightData.r : heightData.a;
}

// Calculate band position on screen (X coordinate in normalized UV space)
// Left side: high to low frequency (reversed), Right side: low to high frequency (normal)
float calculateBandPosition(int band, bool isLeftSide) {
    float bandCenterIndex = float(band) + 0.5;
    if (isLeftSide) {
        // Left side: map band to left half (high to low)
        return 0.5 - bandCenterIndex / (2.0 * float(uNumBands - 1));
    } else {
        // Right side: map band to right half (low to high)
        return 0.5 + bandCenterIndex / (2.0 * float(uNumBands - 1));
    }
}

// Calculate which band a UV coordinate belongs to
// Returns band index and whether it's on the left side
void getBandFromUV(vec2 uv, out int band, out bool isLeftSide) {
    isLeftSide = uv.x < 0.5;
    
    if (isLeftSide) {
        // Left half: left channel, high to low frequency (reversed)
        float normalizedX = uv.x * 2.0; // Map 0.0-0.5 to 0.0-1.0
        float bandIndex = (1.0 - normalizedX) * (float(uNumBands) - 1.0);
        band = int(floor(bandIndex));
    } else {
        // Right half: right channel, low to high frequency (normal)
        float normalizedX = (uv.x - 0.5) * 2.0; // Map 0.5-1.0 to 0.0-1.0
        float bandIndex = normalizedX * (float(uNumBands) - 1.0);
        band = int(floor(bandIndex));
    }
    
    // Clamp band to valid range
    if (band < 0) band = 0;
    if (band >= uNumBands) band = uNumBands - 1;
}

