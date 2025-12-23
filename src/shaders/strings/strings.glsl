// String Rendering
// Renders animated guitar strings with standing wave patterns

#include "shaders/common/constants.glsl"
#include "shaders/strings/math-utils.glsl"
#include "shaders/strings/band-utils.glsl"

// Render strings
vec3 renderStrings(vec2 uv, int band, bool isLeftSide, float leftLevel, float rightLevel, 
    float threshold1, float threshold2, float threshold3, float threshold4, float threshold5,
    float threshold6, float threshold7, float threshold8, float threshold9, float threshold10,
    vec3 finalColor, inout float finalAlpha) {
    
    if (uShowStrings <= 0.5) {
        return finalColor;
    }
    
    // Calculate string height based on audio level (use height texture for separate smoothing)
    float stringLevel = sampleBandHeightLevel(band, isLeftSide, uHeightTexture);
    
    // Apply cubic bezier easing to the audio level (same as bars)
    float easedStringLevel = cubicBezierEase(
        stringLevel,
        uBandHeightCurveX1,
        uBandHeightCurveY1,
        uBandHeightCurveX2,
        uBandHeightCurveY2
    );
    
    // Map eased level to height range between min and max (same as bars)
    float maxStringHeight = (uStringTop - uStringBottom) * uMaxHeight;
    float stringHeightRange = maxStringHeight * (uBandMaxHeight - uBandMinHeight);
    float stringHeight = uBandMinHeight * maxStringHeight + easedStringLevel * stringHeightRange;
    
    // Apply multiplier to make strings always taller than bars
    stringHeight = stringHeight * uStringHeightMultiplier;
    
    // Clamp to ensure strings don't exceed the available space
    float maxAvailableHeight = (uStringTop - uStringBottom) * uMaxHeight;
    stringHeight = min(stringHeight, maxAvailableHeight);
    
    // Center the string vertically, so it grows in both directions (same as bars)
    float centerY = (uStringTop + uStringBottom) * 0.5;
    float effectiveStringTop = centerY + stringHeight * 0.5;
    float effectiveStringBottom = centerY - stringHeight * 0.5;
    
    float halfPixelY = 0.5 / uResolution.y;
    float effectiveBottom = effectiveStringBottom - halfPixelY;
    float effectiveTop = effectiveStringTop + halfPixelY;
    bool inStringArea = (uv.y >= effectiveBottom && uv.y <= effectiveTop);
    
    if (!inStringArea) {
        return finalColor;
    }
    
    float stringLength = effectiveStringTop - effectiveStringBottom;
    
    // Normalize y position along string (0 = bottom, 1 = top)
    float adjustedBottom = effectiveStringBottom - halfPixelY;
    float adjustedTop = effectiveStringTop + halfPixelY;
    float adjustedLength = adjustedTop - adjustedBottom;
    float yNormalized = (uv.y - adjustedBottom) / adjustedLength;
    yNormalized = clamp(yNormalized, 0.0, 1.0);
    
    // Calculate alpha fade: top = minAlpha, center = 1.0, bottom = minAlpha
    float distFromCenter = abs(yNormalized - 0.5) * 2.0;  // 0.0 at center, 1.0 at edges
    float stringAlpha = mix(uStringEndFadeMinAlpha, 1.0, 1.0 - smoothstep(0.0, 1.0, distFromCenter));
    
    // Standing wave envelope: 0 at ends, 1 at center (ensures string fades at ends)
    float standingWaveEnvelope = sin(yNormalized * PI);
    
    // Wave pattern along the string (multiple cycles for wavy appearance)
    float wavePattern = sin(yNormalized * PI * uWaveCycles);
    
    // Convert time to musical time (beats)
    float musicalTime = (uBPM > 0.0) ? (uTime * uBPM / 60.0) : uTime;
    
    // Base oscillation frequency (from waveNote parameter)
    float baseWaveFrequency = 1.0 / max(uWaveNote, EPSILON);
    
    // Oscillation frequency tied to audio level
    float minOscillationSpeed = 0.3;  // Minimum 30% of base speed
    float maxOscillationSpeed = 3.0;   // Maximum 3x base speed
    
    // Left channel: oscillation speed based on leftLevel
    float leftOscillationSpeed = baseWaveFrequency * mix(minOscillationSpeed, maxOscillationSpeed, leftLevel);
    float leftOscillationPhase = musicalTime * leftOscillationSpeed;
    
    // Right channel: oscillation speed based on rightLevel
    float rightOscillationSpeed = baseWaveFrequency * mix(minOscillationSpeed, maxOscillationSpeed, rightLevel);
    float rightOscillationPhase = musicalTime * rightOscillationSpeed + 0.1;  // Slight phase offset
    
    // Calculate band width for available space calculation
    float bandWidth = 0.5 / float(uNumBands);
    
    // Calculate string position based on split-screen mapping
    float stringXScreen = calculateBandPosition(band, isLeftSide);
    
    // Ensure minimum visibility: use max to ensure strings are always at least slightly visible
    float minLevel = 0.1;  // Minimum 10% visibility even when audio is quiet
    float effectiveLeftLevel = max(leftLevel, minLevel);
    float effectiveRightLevel = max(rightLevel, minLevel);
    
    // Calculate dynamic string width based on audio level
    float currentLevel = isLeftSide ? effectiveLeftLevel : effectiveRightLevel;
    float baseDynamicStringWidth = mix(uMinStringWidth, uMaxStringWidth, currentLevel);
    
    // Apply volume-based width scaling (multiply existing dynamic width)
    float currentRawLevel = isLeftSide ? leftLevel : rightLevel;
    float widthFactor = getVolumeWidthFactor(
        currentRawLevel,
        uBandWidthThreshold,
        uBandWidthMinMultiplier,
        uBandWidthMaxMultiplier
    );
    float dynamicStringWidth = baseDynamicStringWidth * widthFactor;
    float stringWidthNorm = dynamicStringWidth / uResolution.x;
    
    // Maximum available space on each side
    float maxStringWidthNorm = uMaxStringWidth / uResolution.x;
    float maxAvailableSpace = (bandWidth * 0.5) - (maxStringWidthNorm * 0.5);
    maxAvailableSpace = max(maxAvailableSpace, EPSILON); // Ensure it's never zero
    
    // Calculate what the maximum offset would be at full volume
    float maxOffsetAtFullVolume = 1.0 * 1.0 * 1.0 * 1.0 * uMaxAmplitude * uWaveAmplitude;
    
    // Always scale so that at full volume, strings use the full available space
    float amplitudeScale = (maxOffsetAtFullVolume > 0.0) ? (maxAvailableSpace / maxOffsetAtFullVolume) : 1.0;
    
    // Get current channel's oscillation phase and levels
    float currentOscillationPhase = isLeftSide ? leftOscillationPhase : rightOscillationPhase;
    float currentEffectiveLevel = isLeftSide ? effectiveLeftLevel : effectiveRightLevel;
    
    // Determine number of strings based on audio level and thresholds
    int numStrings = 1;
    if (currentLevel >= uThreshold3Strings && uMaxStrings >= 3) {
        numStrings = 3;
    } else if (currentLevel >= uThreshold2Strings && uMaxStrings >= 2) {
        numStrings = 2;
    }
    
    // Render multiple strings with phase offsets (same position, different animation phases)
    for (int i = 0; i < 3; i++) {
        if (i >= numStrings) break;
        
        // Phase offset for animation cycle (not position) - equal spacing
        float phaseOffset = (float(i) / float(numStrings)) * TWO_PI;
        
        // Apply phase offset to oscillation
        float oscillation = sin(currentOscillationPhase + phaseOffset);
        
        // Use abs(wavePattern) for symmetric wave shape along the string
        float waveShape = abs(wavePattern) * standingWaveEnvelope;
        float offset = waveShape * oscillation * currentEffectiveLevel * uMaxAmplitude * uWaveAmplitude * amplitudeScale;
        float stringX = stringXScreen + offset;
        
        // Calculate distance and mask
        float distFromString = abs(uv.x - stringX);
        float stringMask = (1.0 - smoothstep(0.0, stringWidthNorm, distFromString)) * stringAlpha;
        
        // Get color based on level
        vec3 stringColor = mapNoiseToColor(
            currentRawLevel,
            threshold1, threshold2, threshold3, threshold4, threshold5,
            threshold6, threshold7, threshold8, threshold9, threshold10,
            uColorTransitionWidth
        );
        
        // Blend string over background/bar
        finalColor = mix(finalColor, stringColor, stringMask);
        finalAlpha = max(finalAlpha, stringMask);
    }
    
    return finalColor;
}

