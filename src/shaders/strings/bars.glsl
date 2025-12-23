// Frequency Bar Rendering
// Renders frequency level bars behind strings

#include "shaders/common/constants.glsl"
#include "shaders/strings/math-utils.glsl"
#include "shaders/strings/band-utils.glsl"

// Render frequency bars
vec3 renderBars(vec2 uv, int band, bool isLeftSide, float leftLevel, float rightLevel, vec3 finalBackground) {
    if (uShowBars <= 0.5) {
        return finalBackground;
    }
    
    // Calculate bar position based on split-screen mapping
    float barX = calculateBandPosition(band, isLeftSide);
    
    // Calculate bar width (half the screen width divided by number of bands)
    float halfScreenBands = float(uNumBands) * 0.5;
    float baseBarWidthNorm = (0.5 / halfScreenBands) * 0.8; // Bar width is 80% of band width
    
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
    float centerY = (uStringTop + uStringBottom) * 0.5;
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

