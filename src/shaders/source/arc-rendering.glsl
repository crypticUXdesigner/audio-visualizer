// Arc Rendering Module
// Core arc shape calculation and color rendering
// Extracted from arc-fragment.glsl for better code organization

#ifndef ARC_RENDERING_GLSL
#define ARC_RENDERING_GLSL

#include "common/uniforms.glsl"
#include "common/color-mapping.glsl"
#include "common/audio.glsl"

// Performance constants (needed by arc rendering)
#define MAX_COLOR_SMOOTHING_SAMPLES 10
#ifdef GL_ES
    // OPTIMIZATION Phase 1.3: Reduce max samples on mobile for better performance
    #define MAX_COLOR_SMOOTHING_SAMPLES_MOBILE 5
#else
    #define MAX_COLOR_SMOOTHING_SAMPLES_MOBILE MAX_COLOR_SMOOTHING_SAMPLES
#endif
#define WEIGHT_EARLY_EXIT_THRESHOLD 0.01

// OPTIMIZATION Phase 1.1: Calculate angle from vertical once and reuse
// Helper function to calculate angle from vertical axis
// Defined here with guard to prevent duplicate definition (also defined in arc-background.glsl)
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

// Calculate arc rendering data for a pixel position
// Returns arc color and factors needed for border rendering
void calculateArcRendering(
    vec2 uv,
    vec2 center,
    vec2 toPixel,
    vec2 toPixelScaled,
    float dist,
    float angleFromVertical,  // OPTIMIZATION Phase 1.1: Pre-calculated angle
    float aspectRatio,
    float viewportScale,
    float dprScale,
    bool isLeftArc,
    bool isRightArc,
    out float bandIndex,
    out float volume,
    out float finalRadius,
    out float arcRadiusAtPosition,  // OPTIMIZATION Phase 1.2: Cache for reuse in background fade and contrast mask
    out float arcBorderFactor,
    out float maskBorderFactor,
    out float finalFactor,
    out vec3 arcColor
) {
    // Initialize outputs
    bandIndex = 0.0;
    volume = 0.0;
    finalRadius = 0.0;
    arcRadiusAtPosition = 0.0;  // OPTIMIZATION Phase 1.2: Initialize cached radius
    arcBorderFactor = 0.0;
    maskBorderFactor = 0.0;
    finalFactor = 0.0;
    arcColor = vec3(0.0);
    
    // Map position along arc to band index
    // OPTIMIZATION Phase 1.1: Use pre-calculated angle instead of recalculating
    // For a semicircle, the angle from vertical (0° = top) directly determines band position
    // Top (0° from vertical) = highest frequency, Bottom (π from vertical) = lowest frequency
    float normalizedPosition;
    
    // Map from [0, π] to [0, 1] where 0 = top (highest bands), π = bottom (lowest bands)
    // Invert so 0° (top) → 1.0, π (bottom) → 0.0
    // Linear mapping ensures even spacing: equal angle changes produce equal position changes
    normalizedPosition = 1.0 - (angleFromVertical / PI);
    normalizedPosition = clamp(normalizedPosition, 0.0, 1.0);
    
    // Simple linear mapping: normalizedPosition directly maps to band index
    // No special rules, exclusions, or remapping - just even spacing
    // normalizedPosition: 0.0 (bottom) -> 1.0 (top)
    // bandIndex: 0 (lowest) -> uNumBands - 1 (highest)
    bandIndex = normalizedPosition * float(uNumBands - 1);
    bandIndex = clamp(bandIndex, 0.0, float(uNumBands - 1));
    
    // Sample frequency texture with interpolation between bands for smoother radius transitions
    vec4 freqData;
    float maxVisualBand = float(uNumBands - 1);
    
    // Special case: when only one band is visible, always sample that band directly
    if (maxVisualBand < 0.5) {
        // Only one band visible (band 0), sample it directly
        float bandX = 0.5 / uMeasuredBands;
        freqData = texture2D(uFrequencyTexture, vec2(bandX, 0.5));
    } else {
        // Multiple bands: use interpolation
        float bandIndexFloor = floor(bandIndex);
        float bandIndexFrac = bandIndex - bandIndexFloor;
        float bandIndexCeil = min(bandIndexFloor + 1.0, maxVisualBand);
        
        // Map visual band indices to measured band space (like strings shader)
        // This allows interpolation from fewer measured bands (64) to more visual bands (256)
        float normalizedBandFloor = bandIndexFloor / maxVisualBand;
        float normalizedBandCeil = bandIndexCeil / maxVisualBand;
        float measuredBandIndexFloor = normalizedBandFloor * (uMeasuredBands - 1.0);
        float measuredBandIndexCeil = normalizedBandCeil * (uMeasuredBands - 1.0);
        
        // Sample current and adjacent bands using measured band coordinates
        float bandXFloor = (measuredBandIndexFloor + 0.5) / uMeasuredBands;
        float bandXCeil = (measuredBandIndexCeil + 0.5) / uMeasuredBands;
        vec4 freqDataFloor = texture2D(uFrequencyTexture, vec2(bandXFloor, 0.5));
        vec4 freqDataCeil = texture2D(uFrequencyTexture, vec2(bandXCeil, 0.5));
        
        // Interpolate between bands for smooth radius transitions
        freqData = mix(freqDataFloor, freqDataCeil, bandIndexFrac);
    }
    
    // Get volume for appropriate channel
    float leftVolume = freqData.r;
    float rightVolume = freqData.a;
    
    // For the lowest frequency band (bandIndex ≈ 0), use the same channel on both sides
    // Use left channel for both arcs at the lowest band
    if (bandIndex < 0.5) {
        // Lowest band: both arcs use left channel
        volume = leftVolume;
    } else {
        // All other bands: use respective channels
        volume = isLeftArc ? leftVolume : rightVolume;
    }
    
    // Add smooth blending where left and right arcs meet at vertical center (x ≈ 0)
    // Create a blend zone near the vertical center to smoothly transition between channels
    float blendZoneWidth = 0.05; // Width of blend zone as fraction of screen (adjust as needed)
    float distFromCenter = abs(toPixel.x); // Distance from vertical center
    float blendFactor = 1.0;
    
    // Blend left and right channels where arcs meet at vertical center
    // Remove y-check to avoid horizontal line artifact at y=0
    if (distFromCenter < blendZoneWidth) {
        // Smooth transition: 1.0 at edges, 0.0 at center
        // At center (x = 0), blendFactor = 0.0, so we'll mix both channels equally
        // At edges of blend zone, blendFactor = 1.0, so we use the original channel
        blendFactor = smoothstep(0.0, blendZoneWidth, distFromCenter);
    }
    
    // Blend volumes based on position and blend factor
    // Skip blending for lowest band since it already uses the same channel
    if (bandIndex >= 0.5) {
        if (isLeftArc) {
            // Left arc: use left channel, but blend with right near center
            volume = mix(
                mix(leftVolume, rightVolume, 0.5), // At center: equal mix
                leftVolume,                          // At edge: left only
                blendFactor
            );
        } else {
            // Right arc: use right channel, but blend with left near center
            volume = mix(
                mix(rightVolume, leftVolume, 0.5), // At center: equal mix
                rightVolume,                       // At edge: right only
                blendFactor
            );
        }
    }
    
    // Calculate target radius based on volume
    // The radius parameters (uBaseRadius, uMaxRadiusOffset) are in normalized space (0-1)
    // where 1.0 = full screen dimension in the minimum dimension direction
    //
    // The distance is in aspect-corrected space: dist = length(vec2(toPixel.x * aspectRatio, toPixel.y) * viewportScale)
    // The radius must be calculated in the same coordinate space as the distance to ensure
    // consistent expansion in all directions. Since the distance calculation applies aspectRatio
    // only to the X component, the radius should use viewportScale only (not max(1.0, aspectRatio)).
    // This ensures the arc expands uniformly: at top/bottom, dist = |y| * viewportScale matches
    // targetRadius = r * viewportScale, and at sides, dist = |x| * aspectRatio * viewportScale
    // naturally extends further horizontally, creating a circular appearance in screen space.
    float targetRadius = (uBaseRadius + volume * uMaxRadiusOffset) * viewportScale;
    
    // Round the top and bottom center where left and right arcs meet
    // Scale corner round size to match the coordinate space (same as targetRadius)
    // Apply DPR scaling to maintain consistent visual appearance across screen densities
    float cornerRoundSize = uCornerRoundSize * viewportScale * dprScale;
    
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
    finalRadius = targetRadius - cornerRadiusAdjust;
    
    // OPTIMIZATION Phase 1.2: Cache radius for reuse in background fade and contrast mask
    arcRadiusAtPosition = finalRadius;
    
    // Calculate arc outline border (similar to mask border)
    if (uArcBorderWidth > 0.0) {
        // Calculate inner and outer edges of border around arc outline
        // Scale border width to match scaled coordinate space (same as targetRadius)
        // Apply DPR scaling to maintain consistent visual appearance across screen densities
        float borderHalfWidth = (uArcBorderWidth * 0.5) * viewportScale * dprScale;
        float innerEdge = finalRadius - borderHalfWidth;
        float outerEdge = finalRadius + borderHalfWidth;
        
        // Apply feathering on inner and outer edges
        // Scale feathering to match scaled coordinate space (same as targetRadius)
        // Apply DPR scaling to maintain consistent visual appearance across screen densities
        float scaledInnerFeathering = uArcBorderInnerFeathering * viewportScale * dprScale;
        float scaledOuterFeathering = uArcBorderOuterFeathering * viewportScale * dprScale;
        float innerFeatherStart = innerEdge - scaledInnerFeathering;
        float innerFeatherEnd = innerEdge;
        float outerFeatherStart = outerEdge;
        float outerFeatherEnd = outerEdge + scaledOuterFeathering;
        
        // Check if pixel is within the border region (with feathering)
        // Inner factor: fade out as we go toward center (dist < innerEdge)
        float innerFactor = smoothstep(innerFeatherStart, innerFeatherEnd, dist);
        // Outer factor: fade out as we go away from border (dist > outerEdge)
        float outerFactor = 1.0 - smoothstep(outerFeatherStart, outerFeatherEnd, dist);
        
        // Border is visible where both inner and outer factors are active
        arcBorderFactor = innerFactor * outerFactor;
    }
    
    // Check if pixel is inside the arc shape
    // Use smoothstep for anti-aliasing at the edge
    // Scale edge smooth to match scaled coordinate space and DPR (same as targetRadius)
    float edgeSmooth = 0.002 * viewportScale * dprScale; // Small smoothing for anti-aliasing
    float insideFactor = smoothstep(finalRadius + edgeSmooth, finalRadius - edgeSmooth, dist);
    
    // Apply subtractive mask: cut out center if pixel is within mask radius
    float maskFactor = 1.0;
    
    // Scale mask radius to match scaled coordinate space (same as targetRadius)
    float scaledMaskRadius = uMaskRadius * viewportScale;
    
    if (uMaskRadius > 0.0) {
        // Check if pixel is inside the mask radius (subtract it)
        float maskInside = smoothstep(scaledMaskRadius + edgeSmooth, scaledMaskRadius - edgeSmooth, dist);
        maskFactor = 1.0 - maskInside; // Invert: 0.0 inside mask, 1.0 outside mask
        
        // Render border around mask radius (visible both inside and outside)
        if (uMaskBorderWidth > 0.0) {
            // Calculate inner and outer edges of border
            // Scale border width to match scaled coordinate space (same as targetRadius)
            // Apply DPR scaling to maintain consistent visual appearance across screen densities
            float borderHalfWidth = (uMaskBorderWidth * 0.5) * viewportScale * dprScale;
            float innerEdge = scaledMaskRadius - borderHalfWidth;
            float outerEdge = scaledMaskRadius + borderHalfWidth;
            
            // Apply feathering on inner and outer edges
            // Scale feathering to match scaled coordinate space (same as targetRadius)
            // Apply DPR scaling to maintain consistent visual appearance across screen densities
            float scaledMaskInnerFeathering = uMaskBorderInnerFeathering * viewportScale * dprScale;
            float scaledMaskOuterFeathering = uMaskBorderOuterFeathering * viewportScale * dprScale;
            float innerFeatherStart = innerEdge - scaledMaskInnerFeathering;
            float innerFeatherEnd = innerEdge;
            float outerFeatherStart = outerEdge;
            float outerFeatherEnd = outerEdge + scaledMaskOuterFeathering;
            
            // Check if pixel is within the border region (with feathering)
            // Inner factor: fade out as we go toward center (dist < innerEdge)
            float innerFactor = smoothstep(innerFeatherStart, innerFeatherEnd, dist);
            // Outer factor: fade out as we go away from border (dist > outerEdge)
            float outerFactor = 1.0 - smoothstep(outerFeatherStart, outerFeatherEnd, dist);
            
            // Border is visible where both inner and outer factors are active
            maskBorderFactor = innerFactor * outerFactor;
        }
    }
    
    // Combine inside factor with mask factor
    finalFactor = insideFactor * maskFactor;
    
    // Calculate dithering for bright areas (applied to thresholds like heightmap shader)
    float bayerDither = 0.0;
    if (uDitherMaxStrength > 0.0 && uDitherMinThreshold < 1.0) {
        // Calculate brightness from volume (before color mapping)
        // Volume is already in [0,1] range
        float volumeBrightness = volume;
        
        // Check if brightness is above threshold
        if (volumeBrightness > uDitherMinThreshold) {
            // Normalize brightness from [threshold, 1.0] to [0.0, 1.0]
            float brightnessRange = 1.0 - uDitherMinThreshold;
            float normalizedBrightness = (volumeBrightness - uDitherMinThreshold) / max(brightnessRange, 0.001);
            normalizedBrightness = clamp(normalizedBrightness, 0.0, 1.0);
            
            // Interpolate dither strength based on brightness
            float ditherStrength = mix(uDitherMinStrength, uDitherMaxStrength, normalizedBrightness);
            
            // Generate Bayer dither pattern using screen-space coordinates (like heightmap)
            // Use centered fragment coordinates for consistent pattern
            vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * 0.5;
            
            // Calculate effective pixel size: uDitherSize controls pattern scale
            // Higher uDitherSize = finer pattern (smaller cells)
            // Reference scale of 50.0 means uDitherSize=50.0 gives same as heightmap default
            // Formula: effectivePixelSize = uPixelSize * (referenceScale / uDitherSize)
            float referenceScale = 50.0;
            float effectivePixelSize = uPixelSize * (referenceScale / uDitherSize);
            vec2 ditherCoord = fragCoordCentered / effectivePixelSize;
            float bayerValue = Bayer8(ditherCoord);
            
            // Convert to dither offset like heightmap: [-0.5, 0.5] * strength
            // Heightmap uses: (Bayer8(...) - 0.5) * ditherStrength
            bayerDither = (bayerValue - 0.5) * ditherStrength;
        }
    }
    
    // Calculate frequency thresholds for color mapping
    // Apply dithering to thresholds (like heightmap shader) when in bright areas
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateAllFrequencyThresholds(
        bayerDither,  // Apply dithering to thresholds (0.0 when not in bright area)
        false,  // useFrequencyModulation = false (constant thresholds)
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map VOLUME to color (not frequency)
    // Calculate color from interpolated volume (original approach, used when smoothing = 0)
    vec3 colorInterpolated = mapNoiseToColorSmooth(
        volume,  // Use volume (amplitude) for color mapping
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uArcColorTransitionWidth
    );
    
    // Multi-band color smoothing: sample multiple bands and weight by distance
    vec3 colorBlended = vec3(0.0);
    float totalWeight = 0.0;
    
    if (uColorSmoothing > 0.0 && uColorSmoothingRadius > 0.0) {
        // OPTIMIZATION Phase 1.3: Calculate actual sample count based on radius
        float smoothingRadius = uColorSmoothingRadius;
        int actualSamples = int(ceil(smoothingRadius * 2.0));
        
        // OPTIMIZATION Phase 1.3: Use mobile-specific max samples
        #ifdef GL_ES
            int maxSamples = MAX_COLOR_SMOOTHING_SAMPLES_MOBILE;
        #else
            int maxSamples = MAX_COLOR_SMOOTHING_SAMPLES;
        #endif
        
        // Clamp to max samples using if statement (GLSL ES doesn't support const int min())
        if (actualSamples > maxSamples) {
            actualSamples = maxSamples;
        }
        float sampleStep = 0.5;
        
        for (int i = 0; i < MAX_COLOR_SMOOTHING_SAMPLES; i++) {
            // Early exit if we've processed enough samples
            if (i >= actualSamples) break;
            
            // Calculate sample band index from loop iteration
            float sampleOffset = (float(i) - float(actualSamples) * 0.5) * sampleStep;
            float dist = abs(sampleOffset);
            
            // OPTIMIZATION Phase 1.3: Early exit before expensive operations
            if (dist > smoothingRadius) break;
            if (dist < 0.1) continue; // Skip redundant center sample
            
            // OPTIMIZATION Phase 1.3: Calculate weight using polynomial approximation instead of exp()
            // Polynomial approximation: 1.0 - (dist/smoothingRadius)^2 for quadratic falloff
            // This is much faster than exp() on mobile GPUs
            float distNorm = dist / smoothingRadius;
            float weight = 1.0 - distNorm * distNorm;
            weight = max(weight, 0.0);
            
            // OPTIMIZATION Phase 1.3: Early exit when weight becomes negligible (before expensive operations)
            if (weight < WEIGHT_EARLY_EXIT_THRESHOLD) break;
            
            float sampleBand = bandIndex + sampleOffset;
            
            // Clamp to valid range
            float clampedBand = clamp(sampleBand, 0.0, float(uNumBands - 1));
            
            // Map visual band index to measured band space (like strings shader)
            float maxVisualBand = float(uNumBands - 1);
            float normalizedSampleBand = clampedBand / max(maxVisualBand, 1.0);
            float measuredSampleBandIndex = normalizedSampleBand * (uMeasuredBands - 1.0);
            
            // Sample frequency data for this band using measured band coordinates
            float bandX = (measuredSampleBandIndex + 0.5) / uMeasuredBands;
            vec4 sampleFreqData = texture2D(uFrequencyTexture, vec2(bandX, 0.5));
            float sampleVolume = isLeftArc ? sampleFreqData.r : sampleFreqData.a;
            
            // Calculate color for this band
            vec3 sampleColor = mapNoiseToColorSmooth(
                sampleVolume,
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10,
                uArcColorTransitionWidth
            );
            
            // Accumulate weighted color
            colorBlended += sampleColor * weight;
            totalWeight += weight;
        }
        
        // Normalize by total weight
        if (totalWeight > 0.0) {
            colorBlended /= totalWeight;
        } else {
            colorBlended = colorInterpolated;
        }
    } else {
        // No smoothing: use interpolated color
        colorBlended = colorInterpolated;
    }
    
    // Interpolate between interpolated color (no smoothing) and smoothed color (full smoothing)
    arcColor = mix(colorInterpolated, colorBlended, uColorSmoothing);
}

#endif

