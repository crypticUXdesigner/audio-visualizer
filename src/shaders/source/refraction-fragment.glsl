precision highp float;

// Include common code
#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"
#include "common/color-mapping.glsl"
#include "common/ripples.glsl"
#include "common/screen-adaptation.glsl"
#include "common/beat-detection.glsl"

// Refraction-specific uniforms (must be declared before module includes)
uniform float uOuterGridSize;  // Number of cells in outer grid (e.g., 8.0 = 8x8 grid)
uniform float uInnerGridSize;  // Number of cells in inner grid (e.g., 8.0 = 8x8 sub-grid)
uniform float uBlurStrength;   // Strength of blur effect (0.0-2.0)
uniform float uOffsetStrength; // Strength of position offset (0.0-0.1)
uniform float uPixelizeLevels; // Number of quantization levels for pixelization (0.0 = disabled, >0 = number of steps)
uniform float uCellBrightnessVariation; // Amount of brightness variation per cell (0.0-0.2, default 0.05 = 5%)
uniform float uCellAnimNote1;  // Animation cycle duration as fraction of bar (e.g., 0.25 = 1/4 bar)
uniform float uCellAnimNote2;  // Animation cycle duration as fraction of bar (e.g., 0.125 = 1/8 bar)
uniform float uCellAnimNote3;  // Animation cycle duration as fraction of bar (e.g., 0.5 = 1/2 bar)
uniform float uDistortionStrength; // Multiplier for bass-reactive radial distortion (0.0 = disabled, 1.0 = default)
uniform float uDistortionSize; // Size/radius of distortion effect (0.0 = center only, 1.0 = full screen, >1.0 = extends beyond screen)
uniform float uDistortionFalloff; // Easing curve for distortion falloff (1.0 = linear, 2.0 = smooth, 4.0 = very sharp)
uniform float uDistortionPerspectiveStrength; // Strength of center perspective scaling (0.0 = no scaling, 1.0 = default, 2.0 = double)
uniform float uDistortionEasing; // Easing type for bass interpolation (0.0 = linear, 1.0 = smooth, 2.0 = exponential)

// Tempo-smoothed values (calculated in JavaScript with BPM-based attack/release)
uniform float uSmoothedVolumeScale;      // Smoothed volume scale (0.3 to 1.0) - replaces instant calculation
uniform float uSmoothedFbmZoom;             // Smoothed FBM zoom factor (1.0 to maxZoom)

// Performance optimization uniforms (adaptive quality)
uniform int uFbmOctaves;                 // Adaptive fBm octaves (default 6, reduced on mobile)
uniform int uBlurSampleCount;            // Number of blur samples (1=none, 2=horizontal, 5=full)
uniform int uCellAnimationLayers;       // Number of cell animation layers (1-3, reduced on mobile)

// Include refraction-specific modules (after uniforms are declared)
#include "source/refraction-distortion.glsl"
#include "source/refraction-pixelization.glsl"
#include "source/refraction-sampling.glsl"
#include "source/refraction-cell-brightness.glsl"

// Time calculation constants
#define STATIC_TIME_OFFSET 105.0
#define BASE_TIME_SPEED 0.08

// Color mapping constants
#define TRANSITION_WIDTH 0.003

/**
 * Calculate grid sizes with beat boost
 * 
 * @param beatGridBoost - Beat-triggered grid boost amount
 * @param outerGridSize - Output: outer grid size with beat boost
 * @param innerGridSize - Output: inner grid size with beat boost
 */
void calculateGridSizes(float beatGridBoost, out float outerGridSize, out float innerGridSize) {
    float baseOuterGridSize = max(2.0, uOuterGridSize);
    outerGridSize = baseOuterGridSize + beatGridBoost;
    float baseInnerGridSize = max(2.0, uInnerGridSize);
    innerGridSize = baseInnerGridSize + beatGridBoost;
}

/**
 * Process noise feed: apply volume scaling, compression, and ripples
 * 
 * @param feed - Input noise value
 * @param uv - UV coordinates in centered space
 * @param aspectRatio - Screen aspect ratio
 * @returns Processed noise value (0.0 to 1.0)
 */
float processNoiseFeed(float feed, vec2 uv, float aspectRatio) {
    // Scale feed based on volume (use tempo-smoothed volume scale)
    float volumeScale = calculateVolumeScaleWithFallback(uVolume, uSmoothedVolumeScale);
    feed = feed * volumeScale;
    
    // Soft compression for high values
    feed = applySoftCompression(feed, 0.7, 0.3);
    
    // Multiple ripples positioned by stereo field
    float beatRipple = renderAllRipples(uv, aspectRatio, uRippleCount);
    feed = feed + beatRipple;
    
    // Ensure feed stays in valid range
    return clamp(feed, 0.0, 1.0);
}

/**
 * Map noise value to color with thresholds
 * 
 * @param noiseValue - Noise value (0.0 to 1.0)
 * @returns Mapped color
 */
vec3 mapNoiseToColorWithThresholds(float noiseValue) {
    // Calculate thresholds using shared wrapper function (NO frequency modulation for refraction)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    // For refraction, we use constant thresholds (no bayer dithering in color mapping)
    calculateAllFrequencyThresholds(
        0.0,  // No bayer dithering for refraction
        false,  // useFrequencyModulation = false for refraction (constant thresholds)
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map to color using shared function
    return mapNoiseToColor(
        noiseValue,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        TRANSITION_WIDTH
    );
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    float aspectRatio = getAspectRatio();
    
    // Setup: Calculate UV coordinates and apply distortion
    vec2 uv = fragCoord / uResolution;
    uv = (uv - 0.5) * vec2(aspectRatio, 1.0);
    float bassIntensity = uBass; // Use raw bass for immediate response
    uv = applyBassDistortion(uv, aspectRatio, bassIntensity);
    
    // Time: Calculate modulated time
    float modulatedTime = calculateModulatedTime(
        uTime, uTimeOffset, uVolume,
        uBass, uMid, uTreble, uBPM,
        STATIC_TIME_OFFSET, BASE_TIME_SPEED
    );
    
    // Sampling: Sample noise with refraction effect
    float noiseValue = sampleNoiseWithRefraction(uv, aspectRatio, modulatedTime);
    
    // Processing: Apply volume scaling, compression, and ripples
    noiseValue = processNoiseFeed(noiseValue, uv, aspectRatio);
    
    // Color Mapping: Map noise to color
    vec3 color = mapNoiseToColorWithThresholds(noiseValue);
    
    // Cell Brightness: Add per-cell brightness variation
    vec2 normalizedUV = vec2((uv.x / aspectRatio + 0.5), (uv.y + 0.5));
    float beatGridBoost = getBeatGridBoost();
    float outerGridSize, innerGridSize;
    calculateGridSizes(beatGridBoost, outerGridSize, innerGridSize);
    
    float cellBrightness = calculateCellBrightness(
        normalizedUV, uv, aspectRatio, outerGridSize, innerGridSize, beatGridBoost
    );
    applySaturationPreservation(color, cellBrightness);
    
    // Output
    gl_FragColor = vec4(color, 1.0);
}
