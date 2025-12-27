// Frequency Bar Rendering
// Renders frequency level bars behind strings
//
// This module handles rendering of frequency level bars that appear behind the strings.
// Bars provide visual feedback for audio levels in each frequency band.
//
// Features:
// - Volume-based width scaling (bars get wider with higher volume)
// - Cubic bezier easing for smooth height transitions
// - Alpha modulation based on volume
// - Color selection based on volume level (darker colors for higher volume)
//
// Dependencies: common/constants.glsl, strings/math-utils.glsl, strings/band-utils.glsl
// Used by: strings-fragment.glsl

#include "common/constants.glsl"
#include "strings/math-utils.glsl"
#include "strings/band-utils.glsl"

// Render frequency bars
vec3 renderBars(vec2 uv, int band, bool isLeftSide, float leftLevel, float rightLevel, vec3 finalBackground) {
    if (uShowBars <= 0.5) {
        return finalBackground;
    }
    
    // Calculate bar position based on split-screen mapping
    float barX = calculateBandPosition(band, isLeftSide);
    
    // Calculate bar width using helper function
    float baseBarWidthNorm = calculateBarWidthNormalized(uNumBands);
    
    // Calculate bar height based on frequency level (use appropriate channel)
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
    
    // Apply cubic bezier easing to the audio level
    float easedLevel = cubicBezierEase(
        barLevel,
        uBandHeightCurveX1,
        uBandHeightCurveY1,
        uBandHeightCurveX2,
        uBandHeightCurveY2
    );
    
    // Map eased level to height range between min and max
    float maxBarHeight = (uStringTop - uStringBottom) * uMaxHeight;
    float heightRange = maxBarHeight * (uBandMaxHeight - uBandMinHeight);
    float barHeight = uBandMinHeight * maxBarHeight + easedLevel * heightRange;
    
    // Center the bar vertically, so it grows in both directions
    float centerY = calculateStringAreaCenterY();
    float barTop = centerY + barHeight * 0.5;
    float barBottom = centerY - barHeight * 0.5;
    
    // Check if pixel is within bar
    bool inBar = (uv.x >= barStartX && uv.x <= barEndX) && (uv.y >= barBottom && uv.y <= barTop);
    
    if (inBar) {
        // Low volumes get second darkest color (uColor9), high volumes get black
        vec3 barColor;
        if (barLevel < 0.5) {
            // Low volume: use second darkest color (uColor9)
            barColor = uColor9;
        } else {
            // High volume: use black
            barColor = vec3(0.0);
        }
        
        // Alpha modulation based on volume: interpolate between min and max
        float barAlpha = mix(uBarAlphaMin, uBarAlphaMax, barLevel);
        
        // Premultiply color by alpha for proper transparency - blend with background
        return barColor * barAlpha + finalBackground * (1.0 - barAlpha);
    }
    
    return finalBackground;
}

