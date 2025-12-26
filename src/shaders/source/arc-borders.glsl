// Arc Borders Module
// Shared border noise calculation and blur processing
// Extracted from arc-fragment.glsl for better code organization

#ifndef ARC_BORDERS_GLSL
#define ARC_BORDERS_GLSL

#include "common/uniforms.glsl"
#include "common/color-mapping.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"

// FBM parameters for border noise
#define FBM_OCTAVES     5
#define FBM_LACUNARITY  1.3
#define FBM_GAIN        0.3
#define FBM_SCALE       0.9

// Beat detection constants
#define BEAT_TIME_THRESHOLD 0.3
#define BEAT_INTENSITY_THRESHOLD 0.5
#define MAX_SPEED_BOOST 2.0

// Calculate BPM-based animation speed with beat boost
float calculateBorderAnimationSpeed(
    float borderNoiseSpeed,
    float bpm
) {
    // Calculate BPM-based animation speed with minimum fallback
    float minSpeed = 0.1;
    float bpmSpeed = (bpm > 0.0) ? (bpm / 120.0) : minSpeed;
    float baseAnimationSpeed = max(bpmSpeed, minSpeed);
    
    // Apply beat-based speed boost
    float beatSpeedBoost = 1.0;
    
    // Check for recent bass or mid beats
    bool hasBassBeat = (uBeatTimeBass < BEAT_TIME_THRESHOLD && uBeatIntensityBass > BEAT_INTENSITY_THRESHOLD);
    bool hasMidBeat = (uBeatTimeMid < BEAT_TIME_THRESHOLD && uBeatIntensityMid > BEAT_INTENSITY_THRESHOLD);
    
    if (hasBassBeat || hasMidBeat) {
        // Get maximum beat intensity
        float maxBeatIntensity = 0.0;
        if (hasBassBeat) {
            maxBeatIntensity = max(maxBeatIntensity, uBeatIntensityBass);
        }
        if (hasMidBeat) {
            maxBeatIntensity = max(maxBeatIntensity, uBeatIntensityMid);
        }
        
        // Map intensity (BEAT_INTENSITY_THRESHOLD to 1.0) to speed boost (1.0 to MAX_SPEED_BOOST)
        float intensityFactor = (maxBeatIntensity - BEAT_INTENSITY_THRESHOLD) / (1.0 - BEAT_INTENSITY_THRESHOLD);
        intensityFactor = clamp(intensityFactor, 0.0, 1.0);
        beatSpeedBoost = 1.0 + intensityFactor * (MAX_SPEED_BOOST - 1.0);
    }
    
    return baseAnimationSpeed * borderNoiseSpeed * beatSpeedBoost;
}

// Calculate border noise value at a position
float calculateBorderNoise(
    vec2 toPixelScaled,
    float dprScale,
    float animationSpeed,
    float time
) {
    // Use Cartesian coordinates scaled by reference radius to avoid distortion
    // Scale reference radius by DPR to maintain consistent noise detail
    float referenceRadius = 0.1 * dprScale;
    float noiseScale = 1.0 / referenceRadius;
    vec2 noiseUV = toPixelScaled * noiseScale;
    
    // Add time offset for animation
    // Scale time offset by DPR to maintain consistent animation speed
    float noiseTime = time * animationSpeed;
    vec2 timeOffset = vec2(noiseTime * 0.1 * dprScale, noiseTime * 0.15 * dprScale);
    noiseUV += timeOffset;
    
    // Calculate noise value
    return fbm2_standard(noiseUV, noiseTime, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
}

// Process noise value to feed (volume scale, stereo, compression, multiplier)
float processBorderNoiseToFeed(
    float noiseValue,
    vec2 toPixelScaled,
    float aspectRatio,
    float noiseMultiplier
) {
    // Apply volume scale
    float volumeScale = calculateVolumeScale(uVolume);
    float feed = noiseValue * volumeScale;
    
    // Calculate stereo brightness
    vec2 borderUV = toPixelScaled;
    float stereoBrightness = calculateStereoBrightness(
        borderUV, aspectRatio,
        uBassStereo, uMidStereo, uTrebleStereo,
        uBass, uMid, uTreble
    );
    feed *= stereoBrightness;
    
    // Soft compression for high values
    feed = applySoftCompression(feed, 0.7, 0.3);
    
    // Apply configurable multiplier
    feed = feed * noiseMultiplier;
    
    // Clamp to valid range
    feed = clamp(feed, 0.0, 1.0);
    
    return feed;
}

// Blur border noise value
float blurBorderNoise(
    float baseNoise,
    vec2 toPixelScaled,
    float dprScale,
    float animationSpeed,
    float time,
    float blurAmount
) {
    if (blurAmount <= 0.0) {
        return baseNoise;
    }
    
    float blurDistance = 0.1 * blurAmount * dprScale;
    float blurredNoise = baseNoise;
    float sampleCount = 1.0;
    
    // Blur noise values (cheaper than blurring colors)
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            if (i == 0 && j == 0) continue;
            if (i != 0 && j != 0) continue; // Cross pattern only
            
            // Calculate noise at offset position
            vec2 offsetToPixel = toPixelScaled;
            float referenceRadius = 0.1 * dprScale;
            float noiseScale = 1.0 / referenceRadius;
            vec2 noiseUV = offsetToPixel * noiseScale;
            
            float noiseTime = time * animationSpeed;
            vec2 timeOffset = vec2(noiseTime * 0.1 * dprScale, noiseTime * 0.15 * dprScale);
            noiseUV += timeOffset;
            
            vec2 offsetNoiseUV = noiseUV + vec2(float(i), float(j)) * blurDistance;
            float offsetNoise = fbm2_standard(offsetNoiseUV, noiseTime, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
            blurredNoise += offsetNoise;
            sampleCount += 1.0;
        }
    }
    
    blurredNoise /= sampleCount;
    return mix(baseNoise, blurredNoise, blurAmount);
}

// Calculate border color from noise and processing
// OPTIMIZATION Phase 2.2: Accept pre-calculated thresholds to avoid redundant calculation
vec3 calculateBorderColor(
    float noiseValue,
    vec2 toPixelScaled,
    float aspectRatio,
    float noiseMultiplier,
    float blurAmount,
    float dprScale,
    float animationSpeed,
    float time,
    float threshold1, float threshold2, float threshold3, float threshold4, float threshold5,
    float threshold6, float threshold7, float threshold8, float threshold9, float threshold10
) {
    // Apply blur if enabled
    if (blurAmount > 0.0) {
        noiseValue = blurBorderNoise(noiseValue, toPixelScaled, dprScale, animationSpeed, time, blurAmount);
    }
    
    // Process noise to feed
    float feed = processBorderNoiseToFeed(noiseValue, toPixelScaled, aspectRatio, noiseMultiplier);
    
    // OPTIMIZATION Phase 2.2: Use pre-calculated thresholds instead of recalculating
    // Thresholds are passed as parameters (calculated once in main())
    
    // Map to color
    return mapNoiseToColorSmooth(
        feed,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uArcColorTransitionWidth
    );
}

#endif

