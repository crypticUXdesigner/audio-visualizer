// Background Noise and Mask Calculation
// Handles background noise pattern, audio-reactive brightness, and visualization mask
//
// This module manages:
// - Background noise generation using FBM (Fractal Brownian Motion)
// - Audio-reactive brightness modulation (darker when audio is loud for contrast)
// - Color mapping based on frequency thresholds
// - Blur effect for background noise
// - Visualization mask calculation (cuts out background where bars/strings appear)
//
// Audio-Reactive Brightness Algorithm:
// Uses cubic bezier curve to map audio level to brightness factor.
// INTENTIONAL INVERSION: When audio is loud, background gets darker for better contrast
// with the bright strings/bars. This creates a dynamic contrast effect.
//
// Mask Algorithm:
// Calculates signed distance from bar edges. Applies animated noise to distort
// edges for organic variation. Uses smoothstep for soft feathering.
// Mask alpha is modulated by volume using cubic bezier curve.
//
// Dependencies: common/constants.glsl, strings/math-utils.glsl, strings/validation.glsl,
//               strings/effects.glsl, strings/band-utils.glsl
// Used by: strings-fragment.glsl

#include "common/constants.glsl"
#include "strings/math-utils.glsl"
#include "strings/validation.glsl"
#include "strings/effects.glsl"
#include "strings/band-utils.glsl"

// Shader-specific constants
// Note: FBM_OCTAVES is now adaptive via uniform uBackgroundFbmOctaves
#define FBM_LACUNARITY  1.2
#define FBM_GAIN        0.85

// Background brightness modulation constants
#define MIN_BRIGHTNESS_MULTIPLIER 0.25  // Minimum multiplier to prevent complete black

// Mask calculation constants
#define MASK_VOLUME_MULTIPLIER 3.0      // Volume multiplier for mask alpha modulation
#define MASK_EDGE_DISTANCE_OFFSET 0.1   // Additional offset for edge distance calculation

// Calculate background noise with audio-reactive brightness modulation
// Returns finalBackground, also outputs baseBackground, backgroundNoiseColor, and thresholds
vec3 calculateBackgroundNoise(vec2 uv, float time, out vec3 baseBackground, out vec3 backgroundNoiseColor,
    out float threshold1, out float threshold2, out float threshold3, 
    out float threshold4, out float threshold5, out float threshold6, 
    out float threshold7, out float threshold8, out float threshold9, out float threshold10) {
    // Calculate modulated time using audio-reactive function
    float staticTimeOffset = uBackgroundNoiseTimeOffset;
    float baseTimeSpeed = uBackgroundNoiseTimeSpeed;
    float t = calculateModulatedTime(
        uTime, uTimeOffset, uVolume,
        uBass, uMid, uTreble, uBPM,
        staticTimeOffset, baseTimeSpeed
    );
    
    // Apply glitch distortion to UV coordinates
    vec2 glitchUV = applyGlitchDistortion(uv, uTime);
    
    // Apply pixelization if enabled
    glitchUV = applyPixelization(glitchUV);
    
    // Store glitchUV for blur calculation (needed later)
    
    // Sample base noise with distorted UV
    // Use adaptive fBm octaves (default 7, reduced on mobile for performance)
    int backgroundOctaves = uBackgroundFbmOctaves > 0 ? uBackgroundFbmOctaves : 7;
    float noiseValue = fbm2_standard(glitchUV, t, uBackgroundNoiseScale, backgroundOctaves, FBM_LACUNARITY, FBM_GAIN);
    
    // ============================================
    // AUDIO-REACTIVE BRIGHTNESS MODULATION
    // ============================================
    // Use pre-smoothed audio level (with attack/release timing applied in JavaScript)
    float audioLevel = validateAudioLevel(uSmoothedNoiseAudioLevel);
    
    // Use cubic bezier to map audio level to brightness factor
    float brightnessFactor = cubicBezierEase(
        audioLevel,
        uBackgroundNoiseBrightnessCurveX1,
        uBackgroundNoiseBrightnessCurveY1,
        uBackgroundNoiseBrightnessCurveX2,
        uBackgroundNoiseBrightnessCurveY2
    );
    
    brightnessFactor = validateBrightnessFactor(brightnessFactor);
    
    // Map brightness factor from curve output (0-1) to actual brightness range
    // INTENTIONAL INVERSION: When audio is loud, we want darker background for contrast
    float brightness = mix(
        uBackgroundNoiseBrightnessMax,  // At quiet (factor=0) - brighter
        uBackgroundNoiseBrightnessMin,  // At loud (factor=1) - darker
        brightnessFactor
    );
    
    brightness = validateBrightness(brightness, 0.0, 2.0);
    
    // Declare variables for blur effect (needed later)
    float minMultiplier = MIN_BRIGHTNESS_MULTIPLIER; // Minimum multiplier to prevent complete black
    float maxMultiplier = 1.0 + uBackgroundNoiseBrightnessMax; // Maximum multiplier for brightening
    float brightnessRange = uBackgroundNoiseBrightnessMax - uBackgroundNoiseBrightnessMin;
    float normalizedBrightness = (brightnessRange > EPSILON) 
        ? (brightness - uBackgroundNoiseBrightnessMin) / brightnessRange 
        : 0.5; // Fallback if range is too small
    
    float modulatedNoiseValue = noiseValue;
    if (uBackgroundNoiseAudioReactive > 0.0) {
        float brightnessMultiplier = mix(minMultiplier, maxMultiplier, normalizedBrightness);
        
        float adjustedNoise = noiseValue * brightnessMultiplier;
        modulatedNoiseValue = mix(noiseValue, adjustedNoise, uBackgroundNoiseAudioReactive);
        modulatedNoiseValue = clamp(modulatedNoiseValue, 0.0, 1.0);
        
        // Final validation
        if (modulatedNoiseValue != modulatedNoiseValue) {
            modulatedNoiseValue = noiseValue; // Fallback to original
        }
    }
    
    // Calculate thresholds for color mapping (needed for noise colorization)
    float freq1Active, freq2Active, freq3Active, freq4Active, freq5Active;
    float freq6Active, freq7Active, freq8Active, freq9Active, freq10Active;
    calculateFrequencyActiveStates(
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active
    );
    
    // Calculate thresholds - they're declared as out parameters, so we don't redeclare them
    calculateFrequencyThresholds(
        0.0,  // No dithering
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active,
        false,  // useFrequencyModulation = false
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Apply color mapping to noise based on thresholds
    // backgroundNoiseColor is declared as out parameter, so we assign to it (not declare it)
    backgroundNoiseColor = mapNoiseToColor(
        modulatedNoiseValue,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uColorTransitionWidth
    );
    
    // Apply blur effect if enabled (glitchUV is already calculated above)
    // Adaptive blur: reduce samples on mobile for performance
    if (uGlitchBlurAmount > 0.0 && uBackgroundBlurSamples > 0) {
        vec3 blurredNoise = backgroundNoiseColor;
        vec2 pixelSize = 1.0 / uResolution;
        float sampleCount = 1.0;
        
        // Full 3×3 blur (8 samples) if quality allows
        if (uBackgroundBlurSamples >= 8) {
            // Sample neighboring pixels for blur
            for (int i = -1; i <= 1; i++) {
                for (int j = -1; j <= 1; j++) {
                    if (i == 0 && j == 0) continue;
                    
                    vec2 offsetUV = glitchUV + vec2(float(i), float(j)) * pixelSize * 2.0;
                    offsetUV = mod(offsetUV, 1.0); // Wrap around
                    
                    // Sample noise at offset position
                    float offsetNoise = fbm2_standard(offsetUV, t, uBackgroundNoiseScale, backgroundOctaves, FBM_LACUNARITY, FBM_GAIN);
                    
                    // Apply same modulation as main noise
                    float offsetModulatedNoise = offsetNoise;
                    if (uBackgroundNoiseAudioReactive > 0.0) {
                        float offsetBrightnessMultiplier = mix(minMultiplier, maxMultiplier, normalizedBrightness);
                        float offsetAdjustedNoise = offsetNoise * offsetBrightnessMultiplier;
                        offsetModulatedNoise = mix(offsetNoise, offsetAdjustedNoise, uBackgroundNoiseAudioReactive);
                        offsetModulatedNoise = clamp(offsetModulatedNoise, 0.0, 1.0);
                    }
                    
                    // Color map the offset noise
                    vec3 offsetColor = mapNoiseToColor(
                        offsetModulatedNoise,
                        threshold1, threshold2, threshold3, threshold4, threshold5,
                        threshold6, threshold7, threshold8, threshold9, threshold10,
                        uColorTransitionWidth
                    );
                    
                    blurredNoise += offsetColor;
                    sampleCount += 1.0;
                }
            }
        } else if (uBackgroundBlurSamples >= 4) {
            // 2×2 blur (4 samples: corners only)
            // GLSL ES 2.0 doesn't support array initializers, so we unroll the loop
            vec2 offset1 = vec2(-1.0, -1.0);
            vec2 offset2 = vec2(1.0, -1.0);
            vec2 offset3 = vec2(-1.0, 1.0);
            vec2 offset4 = vec2(1.0, 1.0);
            
            // Sample corner 1
            vec2 offsetUV1 = glitchUV + offset1 * pixelSize * 2.0;
            offsetUV1 = mod(offsetUV1, 1.0);
            float offsetNoise1 = fbm2_standard(offsetUV1, t, uBackgroundNoiseScale, backgroundOctaves, FBM_LACUNARITY, FBM_GAIN);
            float offsetModulatedNoise1 = offsetNoise1;
            if (uBackgroundNoiseAudioReactive > 0.0) {
                float offsetBrightnessMultiplier1 = mix(minMultiplier, maxMultiplier, normalizedBrightness);
                float offsetAdjustedNoise1 = offsetNoise1 * offsetBrightnessMultiplier1;
                offsetModulatedNoise1 = mix(offsetNoise1, offsetAdjustedNoise1, uBackgroundNoiseAudioReactive);
                offsetModulatedNoise1 = clamp(offsetModulatedNoise1, 0.0, 1.0);
            }
            vec3 offsetColor1 = mapNoiseToColor(
                offsetModulatedNoise1,
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10,
                uColorTransitionWidth
            );
            blurredNoise += offsetColor1;
            sampleCount += 1.0;
            
            // Sample corner 2
            vec2 offsetUV2 = glitchUV + offset2 * pixelSize * 2.0;
            offsetUV2 = mod(offsetUV2, 1.0);
            float offsetNoise2 = fbm2_standard(offsetUV2, t, uBackgroundNoiseScale, backgroundOctaves, FBM_LACUNARITY, FBM_GAIN);
            float offsetModulatedNoise2 = offsetNoise2;
            if (uBackgroundNoiseAudioReactive > 0.0) {
                float offsetBrightnessMultiplier2 = mix(minMultiplier, maxMultiplier, normalizedBrightness);
                float offsetAdjustedNoise2 = offsetNoise2 * offsetBrightnessMultiplier2;
                offsetModulatedNoise2 = mix(offsetNoise2, offsetAdjustedNoise2, uBackgroundNoiseAudioReactive);
                offsetModulatedNoise2 = clamp(offsetModulatedNoise2, 0.0, 1.0);
            }
            vec3 offsetColor2 = mapNoiseToColor(
                offsetModulatedNoise2,
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10,
                uColorTransitionWidth
            );
            blurredNoise += offsetColor2;
            sampleCount += 1.0;
            
            // Sample corner 3
            vec2 offsetUV3 = glitchUV + offset3 * pixelSize * 2.0;
            offsetUV3 = mod(offsetUV3, 1.0);
            float offsetNoise3 = fbm2_standard(offsetUV3, t, uBackgroundNoiseScale, backgroundOctaves, FBM_LACUNARITY, FBM_GAIN);
            float offsetModulatedNoise3 = offsetNoise3;
            if (uBackgroundNoiseAudioReactive > 0.0) {
                float offsetBrightnessMultiplier3 = mix(minMultiplier, maxMultiplier, normalizedBrightness);
                float offsetAdjustedNoise3 = offsetNoise3 * offsetBrightnessMultiplier3;
                offsetModulatedNoise3 = mix(offsetNoise3, offsetAdjustedNoise3, uBackgroundNoiseAudioReactive);
                offsetModulatedNoise3 = clamp(offsetModulatedNoise3, 0.0, 1.0);
            }
            vec3 offsetColor3 = mapNoiseToColor(
                offsetModulatedNoise3,
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10,
                uColorTransitionWidth
            );
            blurredNoise += offsetColor3;
            sampleCount += 1.0;
            
            // Sample corner 4
            vec2 offsetUV4 = glitchUV + offset4 * pixelSize * 2.0;
            offsetUV4 = mod(offsetUV4, 1.0);
            float offsetNoise4 = fbm2_standard(offsetUV4, t, uBackgroundNoiseScale, backgroundOctaves, FBM_LACUNARITY, FBM_GAIN);
            float offsetModulatedNoise4 = offsetNoise4;
            if (uBackgroundNoiseAudioReactive > 0.0) {
                float offsetBrightnessMultiplier4 = mix(minMultiplier, maxMultiplier, normalizedBrightness);
                float offsetAdjustedNoise4 = offsetNoise4 * offsetBrightnessMultiplier4;
                offsetModulatedNoise4 = mix(offsetNoise4, offsetAdjustedNoise4, uBackgroundNoiseAudioReactive);
                offsetModulatedNoise4 = clamp(offsetModulatedNoise4, 0.0, 1.0);
            }
            vec3 offsetColor4 = mapNoiseToColor(
                offsetModulatedNoise4,
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10,
                uColorTransitionWidth
            );
            blurredNoise += offsetColor4;
            sampleCount += 1.0;
        }
        // else: no blur (uBackgroundBlurSamples == 0)
        
        blurredNoise /= sampleCount; // Average of all samples
        backgroundNoiseColor = mix(backgroundNoiseColor, blurredNoise, uGlitchBlurAmount);
    }
    
    // Apply noise to background with intensity control
    baseBackground = uColor10;
    // Validate for NaN/infinity only
    if (baseBackground.r != baseBackground.r || baseBackground.g != baseBackground.g || baseBackground.b != baseBackground.b) {
        baseBackground = vec3(0.1, 0.1, 0.1);
    }
    
    // Validate backgroundNoiseColor for NaN/infinity
    if (backgroundNoiseColor.r != backgroundNoiseColor.r || backgroundNoiseColor.g != backgroundNoiseColor.g || backgroundNoiseColor.b != backgroundNoiseColor.b) {
        backgroundNoiseColor = baseBackground; // Fallback to base
    }
    
    // backgroundNoiseColor is already set above with blur applied
    // Now mix with base background
    vec3 finalBackground = mix(baseBackground, backgroundNoiseColor, uBackgroundNoiseIntensity);
    
    // Final validation for finalBackground (NaN/infinity only)
    if (finalBackground.r != finalBackground.r || finalBackground.g != finalBackground.g || finalBackground.b != finalBackground.b) {
        finalBackground = baseBackground; // Fallback to base
    }
    
    return finalBackground;
}

// Calculate visualization mask for bars (used to cut out background noise)
float calculateBarMask(vec2 uv, int band, bool isLeftSide, float leftLevel, float rightLevel) {
    if (uShowBars <= 0.5) {
        return 0.0;
    }
    
    // Calculate bar position based on split-screen mapping
    float barX = calculateBandPosition(band, isLeftSide);
    
    // Calculate bar width using helper function
    float baseBarWidthNorm = calculateBarWidthNormalized(uNumBands);
    
    float barLevel = isLeftSide ? leftLevel : rightLevel;
    
    // Apply volume-based width scaling
    float widthFactor = getVolumeWidthFactor(
        barLevel,
        uBandWidthThreshold,
        uBandWidthMinMultiplier,
        uBandWidthMaxMultiplier
    );
    float barWidthNorm = baseBarWidthNorm * widthFactor;
    
    float barStartX = barX - barWidthNorm * 0.5;
    float barEndX = barX + barWidthNorm * 0.5;
    float easedLevel = cubicBezierEase(
        barLevel,
        uBandHeightCurveX1,
        uBandHeightCurveY1,
        uBandHeightCurveX2,
        uBandHeightCurveY2
    );
    
    float maxBarHeight = (uStringTop - uStringBottom) * uMaxHeight;
    float heightRange = maxBarHeight * (uBandMaxHeight - uBandMinHeight);
    float barHeight = uBandMinHeight * maxBarHeight + easedLevel * heightRange;
    
    float centerY = calculateStringAreaCenterY();
    float barTop = centerY + barHeight * 0.5;
    float barBottom = centerY - barHeight * 0.5;
    
    // Calculate distance from bar edges for ALL pixels
    float distFromLeft = uv.x - barStartX;
    float distFromRight = barEndX - uv.x;
    float distFromTop = barTop - uv.y;
    float distFromBottom = uv.y - barBottom;
    
    // Calculate signed distance: positive inside, negative outside
    float distX = min(distFromLeft, distFromRight);
    float distY = min(distFromTop, distFromBottom);
    float signedDistToEdge = min(distX, distY);
    
    // Apply animated noise to distort the edge position for organic variation
    // Use scaled noise strength on mobile for performance
    float effectiveMaskNoiseStrength = uMaskNoiseStrengthMobile > 0.0 
        ? uMaskNoiseStrengthMobile 
        : (uQualityLevel >= 0.6 ? uMaskNoiseStrength : uMaskNoiseStrength * 0.3);
    
    if (effectiveMaskNoiseStrength > 0.0) {
        float noiseTime = uTime * uMaskNoiseSpeed;
        vec3 noisePos = vec3(uv * uMaskNoiseScale, noiseTime);
        float noiseValue = vnoise(noisePos);  // Returns [-1, 1]
        
        float edgeDistance = abs(signedDistToEdge);
        float maxEdgeDistance = uMaskExpansion + uMaskFeathering + MASK_EDGE_DISTANCE_OFFSET;
        float noiseInfluence = 1.0 - smoothstep(0.0, maxEdgeDistance, edgeDistance);
        
        float noiseOffset = noiseValue * effectiveMaskNoiseStrength * noiseInfluence;
        signedDistToEdge += noiseOffset;
    }
    
    // Create mask that extends beyond the bar edges
    float expandedEdge = -uMaskExpansion;
    float featheringStart = expandedEdge;
    float featheringEnd = expandedEdge + uMaskFeathering;
    float barMask = smoothstep(featheringStart, featheringEnd, signedDistToEdge);
    
    return barMask;
}

// Apply mask to background
vec3 applyMaskToBackground(vec3 baseBackground, vec3 backgroundNoiseColor, float visualizationMask) {
    // Modulate mask alpha by volume using cubic bezier curve
    float volumeAlpha = cubicBezierEase(
        uVolume * MASK_VOLUME_MULTIPLIER,
        uMaskAlphaCurveX1,
        uMaskAlphaCurveY1,
        uMaskAlphaCurveX2,
        uMaskAlphaCurveY2
    );
    float volumeModulatedMask = visualizationMask * volumeAlpha;
    float maskedNoiseIntensity = uBackgroundNoiseIntensity * (1.0 - volumeModulatedMask * uMaskCutoutIntensity);
    vec3 result = mix(baseBackground, backgroundNoiseColor, maskedNoiseIntensity);
    
    // Final validation
    if (result.r != result.r || result.g != result.g || result.b != result.b) {
        result = baseBackground;
    }
    
    return result;
}

