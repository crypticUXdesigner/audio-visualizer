precision highp float;

#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/color-mapping.glsl"
#include "common/screen-adaptation.glsl"

// Frequency data texture
// uFrequencyTexture: LUMINANCE = left channel (swing), ALPHA = right channel (swing)
uniform sampler2D uFrequencyTexture;
// uHeightTexture: LUMINANCE = left channel (height), ALPHA = right channel (height)
uniform sampler2D uHeightTexture;

// Number of visual bands (for display)
uniform int uNumBands;
// Number of measured bands (for texture sampling)
uniform float uMeasuredBands;

// String parameters
uniform float uMinStringWidth;     // Minimum string width (pixels)
uniform float uMaxStringWidth;     // Maximum string width (pixels)
uniform float uMaxAmplitude;       // Maximum swing amplitude (0.0-1.0)
uniform float uWaveNote;           // Musical note value (fraction of bar, e.g. 1/4 = quarter note)
uniform float uStringTop;           // Top of string area (0.0-1.0)
uniform float uStringBottom;       // Bottom of string area (0.0-1.0)
uniform float uStringEndFadeMinAlpha;  // Minimum alpha at string ends (0.0-1.0)
uniform float uMaxHeight;               // Maximum height scale for bars (0.0-1.0)
uniform float uWaveCycles;             // Number of wave cycles along the string
uniform float uShowBars;               // Show frequency bars (1.0 = on, 0.0 = off)
uniform float uShowStrings;            // Show strings (1.0 = on, 0.0 = off)
uniform float uWaveAmplitude;          // Wave amplitude multiplier
uniform int uMaxStrings;               // Maximum number of strings per band
uniform float uThreshold2Strings;      // Threshold for showing 2 strings
uniform float uThreshold3Strings;      // Threshold for showing 3 strings

// Band bar height parameters
uniform float uBandMinHeight;          // Minimum bar height (0.0-1.0)
uniform float uBandMaxHeight;          // Maximum bar height (0.0-1.0)
uniform float uBandHeightCurveX1;      // Cubic bezier curve control point X1
uniform float uBandHeightCurveY1;      // Cubic bezier curve control point Y1
uniform float uBandHeightCurveX2;      // Cubic bezier curve control point X2
uniform float uBandHeightCurveY2;      // Cubic bezier curve control point Y2
uniform float uStringHeightMultiplier; // Multiplier to make strings taller than bars (>= 1.0)

// Background noise parameters
uniform float uBackgroundNoiseScale;    // Noise scale
uniform float uBackgroundNoiseIntensity; // Noise intensity (0.0-1.0)
uniform float uBackgroundNoiseAudioReactive; // Audio reactivity amount (0.0-1.0)
uniform int uBackgroundNoiseAudioSource; // Audio source (0=Volume, 1=Bass, 2=Mid, 3=Treble)
uniform float uBackgroundNoiseBrightnessCurveX1; // Cubic bezier curve X1
uniform float uBackgroundNoiseBrightnessCurveY1; // Cubic bezier curve Y1
uniform float uBackgroundNoiseBrightnessCurveX2; // Cubic bezier curve X2
uniform float uBackgroundNoiseBrightnessCurveY2; // Cubic bezier curve Y2
uniform float uBackgroundNoiseBrightnessMin; // Min brightness factor
uniform float uBackgroundNoiseBrightnessMax; // Max brightness factor
uniform float uSmoothedNoiseAudioLevel; // Smoothed audio level (from JS with attack/release)
uniform float uColorTransitionWidth; // Color transition width for smoothstep (0.0-0.1)
uniform float uBackgroundNoiseBlurStrength; // Blur strength for background noise (0.0-3.0)
uniform float uBackgroundNoisePixelizeLevels; // Pixelization levels for background noise (0.0 = off, >0 = quantization steps)
uniform float uBarAlphaMin;  // Minimum alpha for bars (at low volume)
uniform float uBarAlphaMax;  // Maximum alpha for bars (at high volume)
uniform float uMaskCutoutIntensity;  // How much to cut out background (0-1)
uniform float uMaskExpansion;  // How much larger the mask is than the visualization
uniform float uMaskFeathering;  // Edge softness for mask (0-1)
uniform float uMaskNoiseStrength;  // Strength of animated noise on mask edges (0-1)
uniform float uMaskNoiseScale;  // Scale/frequency of noise pattern
uniform float uMaskNoiseSpeed;  // Animation speed of noise
uniform float uBandWidthThreshold;  // Volume threshold for width scaling (0.0-1.0)
uniform float uBandWidthMinMultiplier;  // Minimum width multiplier (at low volume, below threshold)
uniform float uBandWidthMaxMultiplier;  // Maximum width multiplier (at high volume, above threshold)

// Shader-specific constants
#define FBM_OCTAVES     7
#define FBM_LACUNARITY  1.2
#define FBM_GAIN        0.85

#define CUBIC_BEZIER_MAX_ITERATIONS 10

// Blur constants
#define BASE_BLUR_RADIUS 0.0        // Base blur radius as fraction of screen (1%)
#define MIN_BLUR_RADIUS 0.0      // Minimum blur radius (0.05% of screen)
#define BLUR_WEIGHT 0.5              // Weight for blur samples

// Bayer matrix helpers (ordered dithering thresholds) - for background dithering
float Bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2. + a.y * a.y * .75);
}

#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

// Quantize/pixelize a value into discrete steps
float pixelize(float value, float levels) {
    if (levels <= 0.0) return value; // No pixelization if levels is 0 or negative
    return floor(value * levels) / levels;
}

// Calculate volume-based width factor with threshold curve
// Minimal change below threshold, subtle but noticeable above threshold
float getVolumeWidthFactor(float volume, float threshold, float minMult, float maxMult) {
    // Clamp inputs to valid ranges
    volume = clamp(volume, 0.0, 1.0);
    threshold = clamp(threshold, 0.0, 1.0);
    minMult = max(minMult, 0.1); // Ensure minimum multiplier is at least 0.1 to prevent zero width
    maxMult = max(maxMult, minMult); // Ensure max is at least min
    
    // Safety check: if threshold is too close to 0 or 1, use simpler calculation
    if (threshold < 0.001) {
        // No threshold, just scale from 1.0 to maxMult
        return mix(1.0, maxMult, smoothstep(0.0, 1.0, volume));
    } else if (threshold > 0.999) {
        // Threshold is at max, just scale from 1.0 to minMult
        return mix(1.0, minMult, smoothstep(0.0, 1.0, volume));
    }
    
    if (volume < threshold) {
        // Below threshold: minimal change from 1.0 to minMult
        // Smooth transition from 1.0 (at volume 0) to minMult (at threshold)
        float normalized = volume / threshold;
        return mix(1.0, minMult, smoothstep(0.0, 1.0, normalized));
    } else {
        // Above threshold: subtle but noticeable change from minMult to maxMult
        float aboveThreshold = (volume - threshold) / (1.0 - threshold); // Normalize to 0-1 above threshold
        return mix(minMult, maxMult, smoothstep(0.0, 1.0, aboveThreshold));
    }
}

// Cubic bezier easing function for GLSL
// Maps input t (0-1) to eased output (0-1) using cubic bezier control points
float cubicBezierEase(float t, float x1, float y1, float x2, float y2) {
    // Binary search to find the t parameter that gives us x = input t
    float low = 0.0;
    float high = 1.0;
    float mid = 0.5;
    float epsilon = 0.0001;
    
    for (int i = 0; i < CUBIC_BEZIER_MAX_ITERATIONS; i++) {
        mid = (low + high) * 0.5;
        
        // Calculate x-coordinate at mid using cubic bezier formula
        // B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        // For x: P₀=0, P₁=x1, P₂=x2, P₃=1
        float cx = 3.0 * (1.0 - mid) * (1.0 - mid) * mid * x1 + 
                   3.0 * (1.0 - mid) * mid * mid * x2 + 
                   mid * mid * mid;
        
        if (abs(cx - t) < epsilon) break;
        if (cx < t) {
            low = mid;
        } else {
            high = mid;
        }
    }
    
    // Calculate y-coordinate at the found t
    float cy = 3.0 * (1.0 - mid) * (1.0 - mid) * mid * y1 + 
               3.0 * (1.0 - mid) * mid * mid * y2 + 
               mid * mid * mid;
    return cy;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * 0.5; // Centered for Bayer dithering
    vec2 uv = fragCoord / uResolution;
    
    // ============================================
    // BACKGROUND NOISE PATTERN
    // ============================================
    float t = uTime * 0.1; // Slow animation
    float aspectRatio = getAspectRatio();
    
    // Sample base noise
    float sampleNoise = fbm2_standard(uv, t, uBackgroundNoiseScale, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
    
    // Apply pixelization to base sample BEFORE blur
    // This creates visible banding when blur averages the quantized samples
    if (uBackgroundNoisePixelizeLevels > 0.0) {
        sampleNoise = pixelize(sampleNoise, uBackgroundNoisePixelizeLevels);
    }
    float noiseValue = sampleNoise;
    
    // Apply blur - creates frosted glass effect
    // Blur averages already-quantized samples, creating visible banding
    if (uBackgroundNoiseBlurStrength > 0.0) {
        // Blur radius as fraction of screen space, scaled by blur strength
        float blurRadius = BASE_BLUR_RADIUS * uBackgroundNoiseBlurStrength;
        blurRadius = max(blurRadius, MIN_BLUR_RADIUS);
        
        vec2 blurOffset = vec2(blurRadius * aspectRatio, blurRadius);
        
        // 4-directional blur - pixelize each sample before averaging
        float weight = BLUR_WEIGHT;
        
        // Sample each blur direction
        float sample1 = fbm2_standard(uv + blurOffset, t, uBackgroundNoiseScale, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        float sample2 = fbm2_standard(uv - blurOffset, t, uBackgroundNoiseScale, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        float sample3 = fbm2_standard(uv + vec2(-blurOffset.y, blurOffset.x), t, uBackgroundNoiseScale, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        float sample4 = fbm2_standard(uv + vec2(blurOffset.y, -blurOffset.x), t, uBackgroundNoiseScale, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        
        // Pixelize each sample BEFORE averaging - this is key for visible banding
        if (uBackgroundNoisePixelizeLevels > 0.0) {
            sample1 = pixelize(sample1, uBackgroundNoisePixelizeLevels);
            sample2 = pixelize(sample2, uBackgroundNoisePixelizeLevels);
            sample3 = pixelize(sample3, uBackgroundNoisePixelizeLevels);
            sample4 = pixelize(sample4, uBackgroundNoisePixelizeLevels);
        }
        
        // Average the quantized samples
        noiseValue += sample1 * weight;
        noiseValue += sample2 * weight;
        noiseValue += sample3 * weight;
        noiseValue += sample4 * weight;
        
        noiseValue /= (1.0 + 4.0 * weight);
    }
    
    // ============================================
    // AUDIO-REACTIVE BRIGHTNESS MODULATION
    // ============================================
    // Use pre-smoothed audio level (with attack/release timing applied in JavaScript)
    // Validate input to prevent NaN/infinity issues
    float audioLevel = uSmoothedNoiseAudioLevel;
    // Check for NaN: NaN != NaN is true
    if (audioLevel != audioLevel) {
        audioLevel = 0.0; // Fallback to quiet
    }
    // Check for infinity: clamp to valid range
    audioLevel = clamp(audioLevel, 0.0, 1.0);
    
    // Use cubic bezier to map audio level to brightness factor
    float brightnessFactor = cubicBezierEase(
        audioLevel,
        uBackgroundNoiseBrightnessCurveX1,
        uBackgroundNoiseBrightnessCurveY1,
        uBackgroundNoiseBrightnessCurveX2,
        uBackgroundNoiseBrightnessCurveY2
    );
    
    // Validate brightnessFactor
    if (brightnessFactor != brightnessFactor) {
        brightnessFactor = 0.0; // Fallback to minimum brightness
    }
    brightnessFactor = clamp(brightnessFactor, 0.0, 1.0);
    
    // Map brightness factor from curve output (0-1) to actual brightness range
    // brightnessFactor: 0 = quiet audio, 1 = loud audio
    // INTENTIONAL INVERSION: When audio is loud, we want darker background for contrast
    // Max = brightness at quiet (brighter), Min = brightness at loud (darker)
    // So we mix from Max to Min as factor goes from 0 to 1
    float brightness = mix(
        uBackgroundNoiseBrightnessMax,  // At quiet (factor=0) - brighter
        uBackgroundNoiseBrightnessMin,  // At loud (factor=1) - darker
        brightnessFactor
    );
    
    // Validate brightness
    if (brightness != brightness) {
        brightness = 1.0; // Fallback to no change
    }
    brightness = clamp(brightness, 0.0, 2.0);
    
    // Apply audio-reactive brightness modulation to noise value
    // When audio is quiet: noiseValue is brighter (brightness = Max, typically 0.3)
    // When audio is loud: noiseValue is darker (brightness = Min, typically 0.0)
    // Map brightness to a multiplier range: 0.0 (loud) -> 0.25 (dark but visible), Max (quiet) -> 1.0+Max (bright)
    float modulatedNoiseValue = noiseValue;
    if (uBackgroundNoiseAudioReactive > 0.0) {
        // Map brightness value to a multiplier that varies smoothly
        // brightness range: Min (0.0) to Max (0.3)
        // multiplier range: 0.25 (dark but visible) to 1.0+Max (bright)
        float minMultiplier = 0.25; // Minimum multiplier to prevent complete black
        float maxMultiplier = 1.0 + uBackgroundNoiseBrightnessMax; // Maximum multiplier for brightening
        
        // Normalize brightness from [Min, Max] to [0, 1] for interpolation
        float brightnessRange = uBackgroundNoiseBrightnessMax - uBackgroundNoiseBrightnessMin;
        float normalizedBrightness = (brightnessRange > 0.001) 
            ? (brightness - uBackgroundNoiseBrightnessMin) / brightnessRange 
            : 0.5; // Fallback if range is too small
        
        // Interpolate multiplier from min (dark) to max (bright) based on normalized brightness
        // When normalizedBrightness = 0 (loud, brightness = Min) -> multiplier = minMultiplier (dark)
        // When normalizedBrightness = 1 (quiet, brightness = Max) -> multiplier = maxMultiplier (bright)
        float brightnessMultiplier = mix(minMultiplier, maxMultiplier, normalizedBrightness);
        
        float adjustedNoise = noiseValue * brightnessMultiplier;
        // Mix between original and adjusted based on reactivity amount
        modulatedNoiseValue = mix(noiseValue, adjustedNoise, uBackgroundNoiseAudioReactive);
        // Clamp to valid range
        modulatedNoiseValue = clamp(modulatedNoiseValue, 0.0, 1.0);
        
        // Final validation
        if (modulatedNoiseValue != modulatedNoiseValue) {
            modulatedNoiseValue = noiseValue; // Fallback to original
        }
    }
    
    // Apply pixelization AFTER brightness modulation to preserve quantization
    // This ensures the final value is quantized even after brightness changes
    if (uBackgroundNoisePixelizeLevels > 0.0) {
        modulatedNoiseValue = pixelize(modulatedNoiseValue, uBackgroundNoisePixelizeLevels);
    }
    
    // Calculate thresholds for color mapping (needed for noise colorization)
    float freq1Active, freq2Active, freq3Active, freq4Active, freq5Active;
    float freq6Active, freq7Active, freq8Active, freq9Active, freq10Active;
    calculateFrequencyActiveStates(
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active
    );
    
    // Multi-step dithering with Bayer matrix (for background noise colorization)
    float ditherStrength = uDitherStrength > 0.0 ? uDitherStrength : 3.0;
    float bayer = (Bayer8(fragCoordCentered / uPixelSize) - 0.5) * ditherStrength;
    
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateFrequencyThresholds(
        bayer,  // Apply bayer dithering to thresholds
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active,
        false,  // useFrequencyModulation = false
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Apply color mapping to noise based on thresholds
    // Use smaller transition width when pixelization is enabled to preserve quantization
    float effectiveTransitionWidth = uColorTransitionWidth;
    if (uBackgroundNoisePixelizeLevels > 0.0) {
        // Use very small or zero transition width to preserve pixelization effect
        effectiveTransitionWidth = min(uColorTransitionWidth, 0.0001);
    }
    
    vec3 backgroundNoiseColor = mapNoiseToColor(
        modulatedNoiseValue,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        effectiveTransitionWidth
    );
    
    // Apply pixelization to final color output to ensure quantization is visible
    // This is a backup in case color mapping smooths things out
    if (uBackgroundNoisePixelizeLevels > 0.0) {
        // Pixelize each color channel to create visible quantization bands
        backgroundNoiseColor.r = pixelize(backgroundNoiseColor.r, uBackgroundNoisePixelizeLevels);
        backgroundNoiseColor.g = pixelize(backgroundNoiseColor.g, uBackgroundNoisePixelizeLevels);
        backgroundNoiseColor.b = pixelize(backgroundNoiseColor.b, uBackgroundNoisePixelizeLevels);
    }
    
    // Apply noise to background with intensity control
    vec3 baseBackground = uColor10;
    // Validate for NaN/infinity only (don't force dark gray if it's legitimately black)
    if (baseBackground.r != baseBackground.r || baseBackground.g != baseBackground.g || baseBackground.b != baseBackground.b) {
        // Only fallback if truly invalid, use a reasonable dark color
        baseBackground = vec3(0.1, 0.1, 0.1);
    }
    
    // Validate backgroundNoiseColor for NaN/infinity
    if (backgroundNoiseColor.r != backgroundNoiseColor.r || backgroundNoiseColor.g != backgroundNoiseColor.g || backgroundNoiseColor.b != backgroundNoiseColor.b) {
        backgroundNoiseColor = baseBackground; // Fallback to base
    }
    
    vec3 finalBackground = mix(baseBackground, backgroundNoiseColor, uBackgroundNoiseIntensity);
    
    // Final validation for finalBackground (NaN/infinity only)
    if (finalBackground.r != finalBackground.r || finalBackground.g != finalBackground.g || finalBackground.b != finalBackground.b) {
        finalBackground = baseBackground; // Fallback to base
    }
    
    // Split screen: left half = left channel (high to low), right half = right channel (low to high)
    float bandIndex;
    int band;
    float leftLevel = 0.0;
    float rightLevel = 0.0;
    bool isLeftSide = uv.x < 0.5;
    
    if (isLeftSide) {
        // Left half: left channel, high to low frequency (reversed)
        // uv.x 0.0 → band uNumBands-1 (high), uv.x 0.5 → band 0 (low)
        float normalizedX = uv.x * 2.0; // Map 0.0-0.5 to 0.0-1.0
        bandIndex = (1.0 - normalizedX) * (float(uNumBands) - 1.0);
        band = int(floor(bandIndex));
        if (band < 0) band = 0;
        if (band >= uNumBands) band = uNumBands - 1;
        
        // Sample frequency level for this band (left channel only)
        float bandX = (float(band) + 0.5) / float(uNumBands);
        vec2 texCoord = vec2(bandX, 0.5);
        vec4 freqData = texture2D(uFrequencyTexture, texCoord);
        leftLevel = freqData.r;
        rightLevel = 0.0; // Not used on left side
    } else {
        // Right half: right channel, low to high frequency (normal)
        // uv.x 0.5 → band 0 (low), uv.x 1.0 → band uNumBands-1 (high)
        float normalizedX = (uv.x - 0.5) * 2.0; // Map 0.5-1.0 to 0.0-1.0
        bandIndex = normalizedX * (float(uNumBands) - 1.0);
        band = int(floor(bandIndex));
        if (band < 0) band = 0;
        if (band >= uNumBands) band = uNumBands - 1;
        
        // Sample frequency level for this band (right channel only)
        float bandX = (float(band) + 0.5) / float(uNumBands);
        vec2 texCoord = vec2(bandX, 0.5);
        vec4 freqData = texture2D(uFrequencyTexture, texCoord);
        leftLevel = 0.0; // Not used on right side
        rightLevel = freqData.a;
    }
    
    // Thresholds are already calculated above for noise colorization
    // They are reused here for strings and bars
    
    // ============================================
    // CALCULATE FREQUENCY VISUALIZATION MASK
    // ============================================
    float visualizationMask = 0.0;
    
    // Calculate mask for bars
    if (uShowBars > 0.5) {
        // Calculate bar position based on split-screen mapping
        float barX;
        if (isLeftSide) {
            float bandCenterIndex = float(band) + 0.5;
            barX = 0.5 - bandCenterIndex / (2.0 * float(uNumBands - 1));
        } else {
            float bandCenterIndex = float(band) + 0.5;
            barX = 0.5 + bandCenterIndex / (2.0 * float(uNumBands - 1));
        }
        
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
        
        // Calculate distance from bar edges for ALL pixels (not just inside)
        // Negative values mean outside, positive values mean inside
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
            // Sample noise at this position with time animation
            float noiseTime = uTime * uMaskNoiseSpeed;
            vec3 noisePos = vec3(uv * uMaskNoiseScale, noiseTime);
            float noiseValue = vnoise(noisePos);  // Returns [-1, 1]
            
            // Apply noise to the signed distance - this distorts the edge position
            // Noise strength controls how much the edge can move
            // Only apply noise near the edge region for performance and visual quality
            // Use step function to create a smooth falloff instead of hard if
            float edgeDistance = abs(signedDistToEdge);
            float maxEdgeDistance = uMaskExpansion + uMaskFeathering + 0.1;
            float noiseInfluence = 1.0 - smoothstep(0.0, maxEdgeDistance, edgeDistance);
            
            float noiseOffset = noiseValue * uMaskNoiseStrength * noiseInfluence;
            signedDistToEdge += noiseOffset;
        }
        
        // Create mask that extends beyond the bar edges
        // signedDistToEdge: positive inside bar, negative outside (in normalized UV coordinates)
        //   - signedDistToEdge = 0.0 at the edge
        //   - signedDistToEdge > 0.0 inside the bar
        //   - signedDistToEdge < 0.0 outside the bar
        // uMaskExpansion is in normalized coordinates (0-1)
        // We want: mask = 1.0 when inside bar OR within expansion distance outside
        //         mask = 0.0 when more than expansion distance outside
        // signedDistToEdge is positive inside, negative outside
        // To expand outward, we subtract expansion from the threshold
        // If signedDistToEdge >= -uMaskExpansion, we're inside or within expansion
        float expandedEdge = -uMaskExpansion;  // At expansion boundary (negative value)
        // Apply feathering: use smoothstep instead of step for soft edges
        // featheringStart: where feathering begins (at expansion boundary)
        // featheringEnd: where feathering ends (expansion + feathering distance)
        float featheringStart = expandedEdge;
        float featheringEnd = expandedEdge + uMaskFeathering;
        // smoothstep gives smooth transition from 0.0 to 1.0
        // When signedDistToEdge < featheringStart: mask = 0.0
        // When signedDistToEdge > featheringEnd: mask = 1.0
        // Between: smooth transition
        float barMask = smoothstep(featheringStart, featheringEnd, signedDistToEdge);
        visualizationMask = max(visualizationMask, barMask);
    }
    
    // Calculate mask for strings
    if (uShowStrings > 0.5) {
        // Calculate string height based on audio level
        float stringLevel;
        if (isLeftSide) {
            float bandX = (float(band) + 0.5) / float(uNumBands);
            vec2 texCoord = vec2(bandX, 0.5);
            vec4 heightData = texture2D(uHeightTexture, texCoord);
            stringLevel = heightData.r;
        } else {
            float bandX = (float(band) + 0.5) / float(uNumBands);
            vec2 texCoord = vec2(bandX, 0.5);
            vec4 heightData = texture2D(uHeightTexture, texCoord);
            stringLevel = heightData.a;
        }
        
        float easedStringLevel = cubicBezierEase(
            stringLevel,
            uBandHeightCurveX1,
            uBandHeightCurveY1,
            uBandHeightCurveX2,
            uBandHeightCurveY2
        );
        
        float maxStringHeight = (uStringTop - uStringBottom) * uMaxHeight;
        float stringHeightRange = maxStringHeight * (uBandMaxHeight - uBandMinHeight);
        float stringHeight = uBandMinHeight * maxStringHeight + easedStringLevel * stringHeightRange;
        stringHeight = stringHeight * uStringHeightMultiplier;
        
        float maxAvailableHeight = (uStringTop - uStringBottom) * uMaxHeight;
        stringHeight = min(stringHeight, maxAvailableHeight);
        
        float centerY = (uStringTop + uStringBottom) * 0.5;
        float effectiveStringTop = centerY + stringHeight * 0.5;
        float effectiveStringBottom = centerY - stringHeight * 0.5;
        
        // Calculate string mask for ALL pixels (not just in string area)
        // We need to calculate string positions even outside the vertical area to get proper mask
        float stringLength = effectiveStringTop - effectiveStringBottom;
        float halfPixelY = 0.5 / uResolution.y;
        float adjustedBottom = effectiveStringBottom - halfPixelY;
        float adjustedTop = effectiveStringTop + halfPixelY;
        float adjustedLength = adjustedTop - adjustedBottom;
        
        // Calculate normalized Y position (clamp to 0-1 for calculations)
        float yNormalized = clamp((uv.y - adjustedBottom) / adjustedLength, 0.0, 1.0);
        
        float distFromCenter = abs(yNormalized - 0.5) * 2.0;
        float stringAlpha = mix(uStringEndFadeMinAlpha, 1.0, 1.0 - smoothstep(0.0, 1.0, distFromCenter));
        float standingWaveEnvelope = sin(yNormalized * 3.14159265359);
        float wavePattern = sin(yNormalized * 3.14159265359 * uWaveCycles);
        
        float musicalTime = (uBPM > 0.0) ? (uTime * uBPM / 60.0) : uTime;
        float baseWaveFrequency = 1.0 / max(uWaveNote, 0.001);
        float minOscillationSpeed = 0.3;
        float maxOscillationSpeed = 3.0;
        
        float leftOscillationSpeed = baseWaveFrequency * mix(minOscillationSpeed, maxOscillationSpeed, leftLevel);
        float leftOscillationPhase = musicalTime * leftOscillationSpeed;
        float leftOscillation = sin(leftOscillationPhase * 3.14159265359 * 2.0);
        
        float rightOscillationSpeed = baseWaveFrequency * mix(minOscillationSpeed, maxOscillationSpeed, rightLevel);
        float rightOscillationPhase = musicalTime * rightOscillationSpeed + 0.1;
        float rightOscillation = sin(rightOscillationPhase * 3.14159265359 * 2.0);
        
        float bandWidth = 0.5 / float(uNumBands);
        float stringXScreen;
        if (isLeftSide) {
            float bandCenterIndex = float(band) + 0.5;
            stringXScreen = 0.5 - bandCenterIndex / (2.0 * float(uNumBands - 1));
        } else {
            float bandCenterIndex = float(band) + 0.5;
            stringXScreen = 0.5 + bandCenterIndex / (2.0 * float(uNumBands - 1));
        }
        
        float minLevel = 0.1;
        float effectiveLeftLevel = max(leftLevel, minLevel);
        float effectiveRightLevel = max(rightLevel, minLevel);
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
        
        float maxStringWidthNorm = uMaxStringWidth / uResolution.x;
        float maxAvailableSpace = (bandWidth * 0.5) - (maxStringWidthNorm * 0.5);
        maxAvailableSpace = max(maxAvailableSpace, 0.001);
        
        float maxOffsetAtFullVolume = 1.0 * 1.0 * 1.0 * 1.0 * uMaxAmplitude * uWaveAmplitude;
        float amplitudeScale = (maxOffsetAtFullVolume > 0.0) ? (maxAvailableSpace / maxOffsetAtFullVolume) : 1.0;
        
        float currentOscillationPhase = isLeftSide ? leftOscillationPhase : rightOscillationPhase;
        float currentEffectiveLevel = isLeftSide ? effectiveLeftLevel : effectiveRightLevel;
        
        int numStrings = 1;
        if (currentLevel >= uThreshold3Strings && uMaxStrings >= 3) {
            numStrings = 3;
        } else if (currentLevel >= uThreshold2Strings && uMaxStrings >= 2) {
            numStrings = 2;
        }
        
        // Strings are excluded from mask creation - only bars contribute to the mask
        // This allows strings to render on top of the background without creating cutouts
        // (Mask calculation code removed - strings no longer contribute to visualizationMask)
    }
    
    // Apply mask to background noise
    // visualizationMask: 0 = no cutout, 1 = full cutout
    // Reduce noise intensity in masked areas
    float maskedNoiseIntensity = uBackgroundNoiseIntensity * (1.0 - visualizationMask * uMaskCutoutIntensity);
    finalBackground = mix(baseBackground, backgroundNoiseColor, maskedNoiseIntensity);
    
    
    // Initialize with background color (now includes noise and mask)
    vec3 finalColor = finalBackground;
    float finalAlpha = 0.0;
    
    // ============================================
    // 1. DRAW FREQUENCY LEVEL BARS (behind strings)
    // ============================================
    if (uShowBars > 0.5) {
        // Calculate bar position based on split-screen mapping
        // Center each bar at the true center of its band's UV range
        float barX;
        if (isLeftSide) {
            // Left side: map band to left half (high to low)
            // Center of band i: midpoint of its UV range
            float bandCenterIndex = float(band) + 0.5;
            barX = 0.5 - bandCenterIndex / (2.0 * float(uNumBands - 1));
        } else {
            // Right side: map band to right half (low to high)
            // Center of band i: midpoint of its UV range
            float bandCenterIndex = float(band) + 0.5;
            barX = 0.5 + bandCenterIndex / (2.0 * float(uNumBands - 1));
        }
        
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
            finalColor = barColor * barAlpha + finalBackground * (1.0 - barAlpha);
            finalAlpha = barAlpha;
        }
    }
    
    // ============================================
    // 2. DRAW STRINGS (on top of bars)
    // ============================================
    if (uShowStrings > 0.5) {
        // Calculate string height based on audio level (use height texture for separate smoothing)
        float stringLevel;
        if (isLeftSide) {
            // Sample height texture for left channel
            float bandX = (float(band) + 0.5) / float(uNumBands);
            vec2 texCoord = vec2(bandX, 0.5);
            vec4 heightData = texture2D(uHeightTexture, texCoord);
            stringLevel = heightData.r; // LUMINANCE = left channel
        } else {
            // Sample height texture for right channel
            float bandX = (float(band) + 0.5) / float(uNumBands);
            vec2 texCoord = vec2(bandX, 0.5);
            vec4 heightData = texture2D(uHeightTexture, texCoord);
            stringLevel = heightData.a; // ALPHA = right channel
        }
        
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
        
        if (inStringArea) {
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
        float standingWaveEnvelope = sin(yNormalized * 3.14159265359);
        
        // Wave pattern along the string (multiple cycles for wavy appearance)
        float wavePattern = sin(yNormalized * 3.14159265359 * uWaveCycles);
        
        // Convert time to musical time (beats)
        float musicalTime = (uBPM > 0.0) ? (uTime * uBPM / 60.0) : uTime;
        
        // Base oscillation frequency (from waveNote parameter)
        float baseWaveFrequency = 1.0 / max(uWaveNote, 0.001);
        
        // Oscillation frequency tied to audio level
        // Louder frequencies vibrate faster (multiply base frequency by audio level)
        // Add a minimum so quiet frequencies still oscillate slightly
        float minOscillationSpeed = 0.3;  // Minimum 30% of base speed
        float maxOscillationSpeed = 3.0;   // Maximum 3x base speed
        
        // Left channel: oscillation speed based on leftLevel
        float leftOscillationSpeed = baseWaveFrequency * mix(minOscillationSpeed, maxOscillationSpeed, leftLevel);
        float leftOscillationPhase = musicalTime * leftOscillationSpeed;
        // Use full sin() range (-1 to 1) for bidirectional oscillation
        float leftOscillation = sin(leftOscillationPhase * 3.14159265359 * 2.0);
        
        // Right channel: oscillation speed based on rightLevel
        float rightOscillationSpeed = baseWaveFrequency * mix(minOscillationSpeed, maxOscillationSpeed, rightLevel);
        float rightOscillationPhase = musicalTime * rightOscillationSpeed + 0.1;  // Slight phase offset
        // Use full sin() range (-1 to 1) for bidirectional oscillation
        float rightOscillation = sin(rightOscillationPhase * 3.14159265359 * 2.0);
        
        // Calculate band width for available space calculation
        // All uNumBands bands are mapped to each half, so each band is 0.5 / uNumBands wide
        float bandWidth = 0.5 / float(uNumBands);
        
        // Calculate string position based on split-screen mapping
        // Center each string in its band to allow equal oscillation in both directions
        // Use same formula as bars for alignment
        float stringXScreen;
        if (isLeftSide) {
            // Left side: map band to left half (high to low)
            // Center of band i: midpoint of its UV range (same as bars)
            float bandCenterIndex = float(band) + 0.5;
            stringXScreen = 0.5 - bandCenterIndex / (2.0 * float(uNumBands - 1));
        } else {
            // Right side: map band to right half (low to high)
            // Center of band i: midpoint of its UV range (same as bars)
            float bandCenterIndex = float(band) + 0.5;
            stringXScreen = 0.5 + bandCenterIndex / (2.0 * float(uNumBands - 1));
        }
        
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
        
        // Maximum available space on each side (half band width, minus some padding for string width)
        // Use max string width for available space calculation to ensure strings never exceed boundaries
        float maxStringWidthNorm = uMaxStringWidth / uResolution.x;
        float maxAvailableSpace = (bandWidth * 0.5) - (maxStringWidthNorm * 0.5);
        maxAvailableSpace = max(maxAvailableSpace, 0.001); // Ensure it's never zero
        
        // Calculate what the maximum offset would be at full volume (effectiveLevel = 1.0)
        // This is our reference for scaling
        // wavePattern: max abs = 1.0, standingWaveEnvelope: max = 1.0, oscillation: max abs = 1.0
        float maxOffsetAtFullVolume = 1.0 * 1.0 * 1.0 * 1.0 * uMaxAmplitude * uWaveAmplitude;
        
        // Always scale so that at full volume, strings use the full available space
        // This ensures strings maximize space usage regardless of amplitude settings
        float amplitudeScale = (maxOffsetAtFullVolume > 0.0) ? (maxAvailableSpace / maxOffsetAtFullVolume) : 1.0;
        
        // Get current channel's oscillation phase and levels
        float currentOscillationPhase = isLeftSide ? leftOscillationPhase : rightOscillationPhase;
        float currentEffectiveLevel = isLeftSide ? effectiveLeftLevel : effectiveRightLevel;
        // currentRawLevel already declared above for width calculation
        
        // Determine number of strings based on audio level and thresholds
        // Use effectiveLevel (with minimum) for threshold comparison
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
            float phaseOffset = (float(i) / float(numStrings)) * 3.14159265359 * 2.0;
            
            // Apply phase offset to oscillation
            float oscillation = sin(currentOscillationPhase + phaseOffset);
            
            // Use abs(wavePattern) for symmetric wave shape along the string
            // oscillation controls the overall left/right direction (-1 to 1)
            // This ensures strings oscillate equally in both directions
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
        }
    }
    
    // Ensure we have some color
    if (finalAlpha < 0.01) {
        finalColor = finalBackground;
        finalAlpha = 1.0;
    }
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}
