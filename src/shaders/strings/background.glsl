// Background Noise and Mask Calculation
// Handles background noise pattern, audio-reactive brightness, and visualization mask

#include "common/constants.glsl"
#include "strings/math-utils.glsl"
#include "strings/validation.glsl"
#include "strings/effects.glsl"
#include "strings/band-utils.glsl"

// Shader-specific constants
#define FBM_OCTAVES     7
#define FBM_LACUNARITY  1.2
#define FBM_GAIN        0.85

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
    float noiseValue = fbm2_standard(glitchUV, t, uBackgroundNoiseScale, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
    
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
    float minMultiplier = 0.25; // Minimum multiplier to prevent complete black
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
    if (uGlitchBlurAmount > 0.0) {
        vec3 blurredNoise = backgroundNoiseColor;
        vec2 pixelSize = 1.0 / uResolution;
        float sampleCount = 1.0;
        
        // Sample neighboring pixels for blur
        for (int i = -1; i <= 1; i++) {
            for (int j = -1; j <= 1; j++) {
                if (i == 0 && j == 0) continue;
                
                vec2 offsetUV = glitchUV + vec2(float(i), float(j)) * pixelSize * 2.0;
                offsetUV = mod(offsetUV, 1.0); // Wrap around
                
                // Sample noise at offset position
                float offsetNoise = fbm2_standard(offsetUV, t, uBackgroundNoiseScale, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
                
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
    
    float halfScreenBands = float(uNumBands) * 0.5;
    float baseBarWidthNorm = (0.5 / halfScreenBands) * 0.8;
    
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
    
    float centerY = (uStringTop + uStringBottom) * 0.5;
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
    if (uMaskNoiseStrength > 0.0) {
        float noiseTime = uTime * uMaskNoiseSpeed;
        vec3 noisePos = vec3(uv * uMaskNoiseScale, noiseTime);
        float noiseValue = vnoise(noisePos);  // Returns [-1, 1]
        
        float edgeDistance = abs(signedDistToEdge);
        float maxEdgeDistance = uMaskExpansion + uMaskFeathering + 0.1;
        float noiseInfluence = 1.0 - smoothstep(0.0, maxEdgeDistance, edgeDistance);
        
        float noiseOffset = noiseValue * uMaskNoiseStrength * noiseInfluence;
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
        uVolume * 3.0,
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

