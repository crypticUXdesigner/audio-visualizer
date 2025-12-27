// Band Utility Functions
// Helper functions for band calculations and sampling
//
// This module provides utilities for:
// - Sampling frequency and height data from textures
// - Calculating band positions on screen (split-screen mapping)
// - Determining which band a UV coordinate belongs to
// - Shared calculations for bar width and string area center
//
// Dependencies: common/constants.glsl
// Used by: bars.glsl, strings.glsl, background.glsl

#include "common/constants.glsl"

// Bar width as percentage of band width (shared constant)
#define BAR_WIDTH_FACTOR 0.8

// Calculate normalized bar width based on number of bands
// Returns bar width in normalized UV space (0.0-1.0)
float calculateBarWidthNormalized(int numBands) {
    float halfScreenBands = float(numBands) * 0.5;
    return (0.5 / halfScreenBands) * BAR_WIDTH_FACTOR;
}

// Calculate the center Y coordinate of the string area
// Returns center Y in normalized UV space (0.0-1.0)
float calculateStringAreaCenterY() {
    return (uStringTop + uStringBottom) * 0.5;
}

// Sample frequency level for a specific band
float sampleBandFrequencyLevel(int band, bool isLeftSide, sampler2D frequencyTexture) {
    // Texture width = measuredBands, visual bands = uNumBands
    // Map visual band index to texture coordinate
    float numBandsFloat = float(uNumBands);
    float measuredBandsFloat = uMeasuredBands;
    float bandIndex = float(band);
    
    // Calculate texture X coordinate: map visual band [0, uNumBands-1] to texture [0, measuredBands-1]
    // If they're equal, direct mapping. If different, scale proportionally.
    float textureX;
    if (numBandsFloat == measuredBandsFloat) {
        // Direct mapping when counts match
        textureX = (bandIndex + 0.5) / measuredBandsFloat;
    } else {
        // Scale visual band index to measured band space
        float normalizedBand = bandIndex / max(numBandsFloat - 1.0, 1.0);
        float measuredBandIndex = normalizedBand * (measuredBandsFloat - 1.0);
        textureX = (measuredBandIndex + 0.5) / measuredBandsFloat;
    }
    
    vec2 texCoord = vec2(textureX, 0.5);
    vec4 freqData = texture2D(frequencyTexture, texCoord);
    return isLeftSide ? freqData.r : freqData.a;
}

// Sample height level for a specific band
float sampleBandHeightLevel(int band, bool isLeftSide, sampler2D heightTexture) {
    // Same logic as above
    float numBandsFloat = float(uNumBands);
    float measuredBandsFloat = uMeasuredBands;
    float bandIndex = float(band);
    
    float textureX;
    if (numBandsFloat == measuredBandsFloat) {
        textureX = (bandIndex + 0.5) / measuredBandsFloat;
    } else {
        float normalizedBand = bandIndex / max(numBandsFloat - 1.0, 1.0);
        float measuredBandIndex = normalizedBand * (measuredBandsFloat - 1.0);
        textureX = (measuredBandIndex + 0.5) / measuredBandsFloat;
    }
    
    vec2 texCoord = vec2(textureX, 0.5);
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

