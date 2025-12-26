// Arc Background Module
// Background rendering with distorted noise field and frequency reactivity
// Extracted from arc-fragment.glsl for better code organization

#ifndef ARC_BACKGROUND_GLSL
#define ARC_BACKGROUND_GLSL

#include "common/uniforms.glsl"
#include "common/color-mapping.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"

// Constants needed by background module
// Note: PI and Bayer functions (Bayer2, Bayer4, Bayer8) are defined in the main fragment shader
// This module is included after those definitions, so they are available here

// OPTIMIZATION Phase 1.1: Calculate angle from vertical once and reuse
// Helper function to calculate angle from vertical axis
// Defined here with guard to prevent duplicate definition (also defined in arc-rendering.glsl)
#ifndef CALCULATE_ANGLE_FROM_VERTICAL_DEFINED
#define CALCULATE_ANGLE_FROM_VERTICAL_DEFINED
float calculateAngleFromVertical(vec2 toPixelScaled) {
    float distForAngle = length(toPixelScaled);
    
    if (distForAngle < 0.001) {
        // Too close to center, return middle angle
        return PI * 0.5;
    }
    
    float absX = abs(toPixelScaled.x);
    float absY = abs(toPixelScaled.y);
    float angleFromVertical;
    
    if (absY > 0.001) {
        // Use atan to get angle from vertical: atan(x/y) gives angle from y-axis
        angleFromVertical = atan(absX / absY);
        
        // For bottom half (y<0), convert to angle from vertical
        if (toPixelScaled.y < 0.0) {
            angleFromVertical = PI - angleFromVertical;
        }
    } else {
        // When y≈0 (horizontal center), angle should be π/2 (horizontal)
        angleFromVertical = PI * 0.5;
    }
    
    return angleFromVertical;
}
#endif

// OPTIMIZATION: Extract noise calculation for background (Phase 1.1)
// Calculate background noise value at a specific UV position (without color mapping)
float calculateBackgroundNoise(
    vec2 sampleUV,
    float aspectRatio,
    vec2 center,
    float time
) {
    // OPTIMIZATION: Early exit if background is disabled (Phase 1.5)
    if (uBackgroundEnabled < 0.5) {
        return 0.0;
    }
    
    // Apply stereo panning offset
    vec2 stereoOffset = vec2(0.0);
    if (uBackgroundStereoPan > 0.001) {
        float bassLevel = uSmoothedBass;
        float panAmount = uBassStereo * uBackgroundStereoPan * bassLevel;
        stereoOffset = vec2(panAmount * 0.1, 0.0);
    }
    
    vec2 bgUV = sampleUV + stereoOffset;
    
    // Apply bass-reactive UV distortion
    vec2 distortedUV = bgUV;
    if (uBackgroundDistortionStrength > 0.001) {
        float bassLevel = uSmoothedBass;
        float threshold = uBackgroundBassThreshold;
        float baseVisibility = 0.1;
        float bassVisibility = smoothstep(threshold, threshold + 0.2, bassLevel);
        float sensitivityCurve = pow(bassLevel, 1.0 / max(uBackgroundBassSensitivity, 0.1));
        float visibility = clamp(baseVisibility + bassVisibility * sensitivityCurve * 0.9, 0.0, 1.0);
        
        vec2 flow = curlNoise(bgUV, time * uBackgroundNoiseSpeed, 2.0);
        float distortionAmount = bassLevel * uBackgroundDistortionStrength * visibility;
        distortedUV += flow * distortionAmount * 0.1;
        
        vec2 toCenter = bgUV - center;
        float distFromCenter = length(toCenter);
        if (distFromCenter > 0.001) {
            float radialDistortion = smoothstep(0.0, 0.5, distFromCenter);
            vec2 radialDir = normalize(toCenter);
            distortedUV += radialDir * distortionAmount * radialDistortion * 0.05;
        }
    }
    
    // Multi-layer noise generation
    // OPTIMIZATION Phase 3.2: Reduce octaves on mobile for better performance
    float noiseTime = time * uBackgroundNoiseSpeed;
    #ifdef GL_ES
        int noise1Octaves = 3;  // Reduced from 4 on mobile
        int noise2Octaves = 2;  // Reduced from 3 on mobile
    #else
        int noise1Octaves = 4;
        int noise2Octaves = 3;
    #endif
    float noise1 = fbm2_standard(distortedUV * uBackgroundNoiseScale, noiseTime, 1.0, noise1Octaves, 1.8, 0.5);
    float noise2 = fbm2_standard(distortedUV * uBackgroundNoiseScale * 2.5, noiseTime * 1.3, 1.0, noise2Octaves, 2.0, 0.4);
    float combinedNoise = noise1 * 0.625 + noise2 * 0.375;
    
    // Sample frequency texture for frequency-reactive elements
    float frequencyContribution = 0.0;
    if (uBackgroundFrequencyReactivity > 0.001) {
        vec2 freqUV1 = distortedUV * vec2(0.5, 1.0) + vec2(0.25, 0.0);
        vec2 freqUV2 = distortedUV * vec2(0.3, 0.8) + vec2(0.35, 0.1);
        freqUV1 = fract(freqUV1);
        freqUV2 = fract(freqUV2);
        vec4 freqData1 = texture2D(uFrequencyTexture, vec2(freqUV1.x, 0.5));
        vec4 freqData2 = texture2D(uFrequencyTexture, vec2(freqUV2.x, 0.5));
        float freq1 = (freqData1.r + freqData1.a) * 0.5;
        float freq2 = (freqData2.r + freqData2.a) * 0.5;
        float avgFreq = (freq1 + freq2) * 0.5;
        frequencyContribution = avgFreq * uBackgroundFrequencyReactivity;
    }
    
    float finalNoise = mix(combinedNoise, max(combinedNoise, frequencyContribution), 0.5);
    float volumeScale = calculateVolumeScale(uVolume);
    finalNoise *= volumeScale;
    
    float stereoBrightness = calculateStereoBrightness(
        bgUV,
        aspectRatio,
        uBassStereo,
        uMidStereo,
        uTrebleStereo,
        uBass,
        uMid,
        uTreble
    );
    finalNoise *= stereoBrightness;
    finalNoise = applySoftCompression(finalNoise, 0.7, 0.3);
    finalNoise = clamp(finalNoise, 0.0, 1.0);
    
    return finalNoise;
}

// OPTIMIZATION: Blur noise values instead of colors (Phase 1.1)
// Blur background noise field for more efficient background blur
// OPTIMIZATION Phase 3.3: Reduce blur samples on mobile for better performance
float blurBackgroundNoise(
    float centerNoise,
    vec2 uv,
    float aspectRatio,
    vec2 center,
    float time,
    float blurRadius
) {
    float blurredNoise = centerNoise;
    float sampleCount = 1.0;
    
    #ifdef GL_ES
        const int maxSamplesPerSide = 1;  // Reduced from 2 on mobile
    #else
        const int maxSamplesPerSide = 2;
    #endif
    
    for (int i = -maxSamplesPerSide; i <= maxSamplesPerSide; i++) {
        for (int j = -maxSamplesPerSide; j <= maxSamplesPerSide; j++) {
            if (i == 0 && j == 0) continue;
            if (i != 0 && j != 0) continue; // Cross pattern only
            
            float dist = length(vec2(float(i), float(j)));
            vec2 offset = vec2(float(i), float(j)) * blurRadius;
            vec2 sampleUV = uv + offset;
            
            // Sample noise at offset position (much cheaper than full color calculation)
            float sampleNoise = calculateBackgroundNoise(sampleUV, aspectRatio, center, time);
            
            float weight = 1.0 / (1.0 + dist * 0.5);
            blurredNoise += sampleNoise * weight;
            sampleCount += weight;
        }
    }
    
    return blurredNoise / sampleCount;
}

// Helper function to calculate background color from noise value
vec3 calculateBackgroundColorFromNoise(
    float noiseValue,
    float dprScale
) {
    // Calculate dithering for bright areas (before color mapping, like arc shader)
    float bayerDither = 0.0;
    if (uBackgroundDitherEnabled > 0.5 && uBackgroundDitherMaxStrength > 0.0 && uBackgroundDitherMinThreshold < 1.0) {
        float noiseBrightness = noiseValue;
        
        if (noiseBrightness > uBackgroundDitherMinThreshold) {
            float brightnessRange = 1.0 - uBackgroundDitherMinThreshold;
            float normalizedBrightness = (noiseBrightness - uBackgroundDitherMinThreshold) / max(brightnessRange, 0.001);
            normalizedBrightness = clamp(normalizedBrightness, 0.0, 1.0);
            
            float baseDitherStrength = mix(uBackgroundDitherMinStrength, uBackgroundDitherMaxStrength, normalizedBrightness);
            float bassLevel = uSmoothedBass;
            float bassBoost = 1.0 + (bassLevel * uBackgroundDitherBassReactivity);
            float ditherStrength = baseDitherStrength * bassBoost;
            ditherStrength = clamp(ditherStrength, 0.0, uBackgroundDitherMaxStrength * 2.0);
            
            vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * 0.5;
            float referenceScale = 50.0;
            float effectivePixelSize = uPixelSize * (referenceScale / uBackgroundDitherSize);
            vec2 ditherCoord = fragCoordCentered / effectivePixelSize;
            float bayerValue = Bayer8(ditherCoord);
            bayerDither = (bayerValue - 0.5) * ditherStrength;
        }
    }
    
    // Calculate color thresholds with dithering applied
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateAllFrequencyThresholds(
        bayerDither,
        false,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map noise to color using dithered thresholds
    return mapNoiseToColorSmooth(
        noiseValue,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uArcColorTransitionWidth
    );
}

// Legacy function kept for compatibility (now uses optimized approach)
vec3 calculateBackgroundColorAtUV(
    vec2 sampleUV,
    float aspectRatio,
    vec2 center,
    float time,
    float dprScale
) {
    float noise = calculateBackgroundNoise(sampleUV, aspectRatio, center, time);
    return calculateBackgroundColorFromNoise(noise, dprScale);
}

// Calculate arc radius at a specific position (for fade mask)
// This function is used by background fade to match the arc shape
// OPTIMIZATION Phase 1.1: Accept pre-calculated angle to avoid redundant atan() call
float calculateArcRadiusAtPosition(
    vec2 uv,
    vec2 center,
    float angleFromVertical,  // OPTIMIZATION Phase 1.1: Pre-calculated angle
    float aspectRatio,
    float viewportScale
) {
    vec2 toPixel = uv - center;
    vec2 toPixelAspectCorrected = vec2(toPixel.x * aspectRatio, toPixel.y);
    vec2 toPixelScaled = toPixelAspectCorrected * viewportScale;
    float distForAngle = length(toPixelScaled);
    
    if (distForAngle < 0.001) {
        // Too close to center, use base radius
        return uBaseRadius * viewportScale;
    }
    
    // Determine which arc (left or right)
    bool isLeftArc = (toPixel.x < 0.0);
    bool isRightArc = (toPixel.x >= 0.0);
    
    if (!isLeftArc && !isRightArc) {
        // Exactly on center line, use base radius
        return uBaseRadius * viewportScale;
    }
    
    // OPTIMIZATION Phase 1.1: Use pre-calculated angle instead of recalculating
    
    // Map from [0, π] to [0, 1] where 0 = top (highest bands), π = bottom (lowest bands)
    // Simple linear mapping: no exclusions or remapping
    float normalizedPosition = 1.0 - (angleFromVertical / PI);
    normalizedPosition = clamp(normalizedPosition, 0.0, 1.0);
    
    // Direct linear mapping to band index: all bands evenly spaced
    float bandIndex = normalizedPosition * float(uNumBands - 1);
    bandIndex = clamp(bandIndex, 0.0, float(uNumBands - 1));
    
    // Sample frequency texture with interpolation
    // Simple linear mapping: all bands evenly spaced
    float maxVisualBand = float(uNumBands - 1);
    vec4 freqData;
    
    float bandIndexFloor = floor(bandIndex);
    float bandIndexFrac = bandIndex - bandIndexFloor;
    float bandIndexCeil = min(bandIndexFloor + 1.0, maxVisualBand);
    
    float normalizedBandFloor = bandIndexFloor / maxVisualBand;
    float normalizedBandCeil = bandIndexCeil / maxVisualBand;
    float measuredBandIndexFloor = normalizedBandFloor * (uMeasuredBands - 1.0);
    float measuredBandIndexCeil = normalizedBandCeil * (uMeasuredBands - 1.0);
    
    float bandXFloor = (measuredBandIndexFloor + 0.5) / uMeasuredBands;
    float bandXCeil = (measuredBandIndexCeil + 0.5) / uMeasuredBands;
    vec4 freqDataFloor = texture2D(uFrequencyTexture, vec2(bandXFloor, 0.5));
    vec4 freqDataCeil = texture2D(uFrequencyTexture, vec2(bandXCeil, 0.5));
    
    freqData = mix(freqDataFloor, freqDataCeil, bandIndexFrac);
    
    // Get volume for appropriate channel
    float leftVolume = freqData.r;
    float rightVolume = freqData.a;
    
    // For the lowest frequency band (bandIndex ≈ 0), use the same channel on both sides
    // Use left channel for both arcs at the lowest band
    float volume;
    if (bandIndex < 0.5) {
        // Lowest band: both arcs use left channel
        volume = leftVolume;
    } else {
        // All other bands: use respective channels
        volume = isLeftArc ? leftVolume : rightVolume;
    }
    
    // Blend volumes where left and right arcs meet at vertical center (same as arc rendering)
    float blendZoneWidth = 0.05;
    float distFromCenter = abs(toPixel.x);
    float blendFactor = 1.0;
    
    // Blend left and right channels where arcs meet at vertical center
    // Remove y-check to avoid horizontal line artifact at y=0
    if (distFromCenter < blendZoneWidth) {
        blendFactor = smoothstep(0.0, blendZoneWidth, distFromCenter);
    }
    
    // Skip blending for lowest band since it already uses the same channel
    if (bandIndex >= 0.5) {
        if (isLeftArc) {
            volume = mix(
                mix(leftVolume, rightVolume, 0.5),
                leftVolume,
                blendFactor
            );
        } else {
            volume = mix(
                mix(rightVolume, leftVolume, 0.5),
                rightVolume,
                blendFactor
            );
        }
    }
    
    // Calculate target radius
    float targetRadius = (uBaseRadius + volume * uMaxRadiusOffset) * viewportScale;
    
    // Round the top and bottom center where left and right arcs meet
    // Scale corner round size to match the coordinate space (same as targetRadius)
    float cornerRoundSize = uCornerRoundSize * viewportScale;
    
    // Calculate corner rounding based on distance from arc center, not from corner point
    // Use the same coordinate system as the main distance check (toPixelScaled)
    // At the top/bottom center, we want to reduce the radius smoothly
    // Measure how close we are to the vertical center line (x ≈ 0) and top/bottom (y ≈ ±targetRadius)
    float distFromVerticalCenter = abs(toPixelScaled.x);
    float distFromTopBottom = abs(abs(toPixelScaled.y) - targetRadius);
    
    // Create a smooth falloff that reduces radius near the top/bottom center
    // The corner rounding should only affect pixels very close to the vertical center line
    // and near the top/bottom of the arc
    float cornerDist = max(distFromVerticalCenter, distFromTopBottom);
    float cornerRound = smoothstep(cornerRoundSize * 1.5, 0.0, cornerDist);
    float cornerRadiusAdjust = cornerRound * cornerRoundSize * 0.5;
    
    // Apply corner rounding to final radius
    float finalRadius = targetRadius - cornerRadiusAdjust;
    
    return finalRadius;
}

// Render background with distorted noise field and frequency reactivity
vec3 renderBackground(
    vec2 uv,
    float aspectRatio,
    vec2 center,
    float time,
    float dprScale,
    float viewportScale
) {
    // Early exit if disabled
    if (uBackgroundEnabled < 0.5) {
        return uColor10;
    }
    
    // Calculate bass-reactive visibility
    // Background is always slightly visible, but becomes more intense with bass
    float bassLevel = uSmoothedBass;
    float threshold = uBackgroundBassThreshold;
    
    // Base visibility: always show a little bit (0.1 minimum)
    // Then add bass-reactive visibility above threshold
    float baseVisibility = 0.1;
    float bassVisibility = smoothstep(threshold, threshold + 0.2, bassLevel);
    
    // Apply sensitivity curve: more reactive at higher bass levels
    float sensitivityCurve = pow(bassLevel, 1.0 / max(uBackgroundBassSensitivity, 0.1));
    float bassContribution = bassVisibility * sensitivityCurve;
    
    // Combine base and bass-reactive visibility
    float visibility = baseVisibility + bassContribution * 0.9; // Max 1.0
    visibility = clamp(visibility, 0.0, 1.0);
    
    // OPTIMIZATION: Use shared noise calculation function (Phase 1.4)
    // Calculate background noise using shared function (eliminates duplication)
    float finalNoise = calculateBackgroundNoise(uv, aspectRatio, center, time);
    
    // OPTIMIZATION: Blur noise values first, then map to color once (Phase 1.1)
    // This is much more efficient than blurring colors
    if (uBackgroundBlur > 0.001) {
        float blurRadius = uBackgroundBlur * 0.02 * dprScale;
        finalNoise = blurBackgroundNoise(finalNoise, uv, aspectRatio, center, time, blurRadius);
    }
    
    // Map blurred noise to color once (instead of mapping each blur sample)
    vec3 bgColor = calculateBackgroundColorFromNoise(finalNoise, dprScale);
    
    // Apply fade to dark around arc visualization shape
    // Fade should be: 0.0 (dark) inside/near arcs, 1.0 (visible) outside
    float fadeFactor = 1.0;
    if (uBackgroundFadeEnabled > 0.5) {
        // Calculate distance from center in aspect-corrected, viewport-scaled space
        vec2 toPixel = uv - center;
        vec2 toPixelAspectCorrected = vec2(toPixel.x * aspectRatio, toPixel.y);
        vec2 toPixelScaled = toPixelAspectCorrected * viewportScale;
        float distFromCenter = length(toPixelScaled);
        
        // Calculate actual arc radius at this position (matches arc shape)
        // OPTIMIZATION Phase 1.2: This function is now only used as a fallback when arcRadiusAtPosition
        // is not available. The main usage should pass arcRadiusAtPosition from calculateArcRendering().
        // For now, we still calculate it here, but this should be optimized further by passing
        // the cached value from the calling code.
        vec2 toPixelForAngle = uv - center;
        vec2 toPixelAspectCorrectedForAngle = vec2(toPixelForAngle.x * aspectRatio, toPixelForAngle.y);
        vec2 toPixelScaledForAngle = toPixelAspectCorrectedForAngle * viewportScale;
        float angleFromVertical = calculateAngleFromVertical(toPixelScaledForAngle);
        float arcRadius = calculateArcRadiusAtPosition(uv, center, angleFromVertical, aspectRatio, viewportScale);
        
        // Calculate fade distances: fade from inside (dark) to outside (visible)
        // fadeStartDistance is how far OUTSIDE the arc to start being fully visible
        // We want: inside arc = dark (0.0), outside = visible (1.0)
        // Make the mask larger by adding to the arc radius
        // Apply DPR scaling to maintain consistent visual appearance across screen densities
        float expandedRadius = arcRadius + uBackgroundFadeStartDistance * viewportScale * dprScale;
        
        // Apply fade: 0.0 (dark) when dist < fadeStart, 1.0 (visible) when dist > fadeEnd
        // Simplify when feathering is very small
        if (uBackgroundFadeFeathering < 0.001) {
            // Hard cut: 0.0 if inside expandedRadius, 1.0 if outside
            fadeFactor = (distFromCenter <= expandedRadius) ? 0.0 : 1.0;
        } else {
            // Smooth fade: 0.0 at fadeStart (inside), 1.0 at fadeEnd (outside)
            float fadeStart = expandedRadius; // Start of fade (inside, dark)
            // Apply DPR scaling to maintain consistent visual appearance across screen densities
            float fadeEnd = fadeStart + uBackgroundFadeFeathering * viewportScale * dprScale; // End of fade (outside, visible)
            fadeFactor = smoothstep(fadeStart, fadeEnd, distFromCenter);
        }
        fadeFactor = clamp(fadeFactor, 0.0, 1.0);
    }
    
    // Apply intensity, visibility, and fade
    float finalIntensity = uBackgroundIntensity * visibility * fadeFactor;
    bgColor = mix(uColor10, bgColor, finalIntensity);
    
    return bgColor;
}

#endif

