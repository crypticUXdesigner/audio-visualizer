precision highp float;

#include "common/uniforms.glsl"
#include "common/color-mapping.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"
#include "common/dither.glsl"
#include "common/oklch.glsl"

// Frequency data texture
// uFrequencyTexture: LUMINANCE = left channel, ALPHA = right channel
uniform sampler2D uFrequencyTexture;

// Number of visual bands (for display)
uniform int uNumBands;
// Number of measured bands (for texture sampling)
uniform float uMeasuredBands;

// Arc parameters
uniform float uBaseRadius;          // Base radius of the arc (0.0-1.0)
uniform float uMaxRadiusOffset;     // Maximum radius offset based on volume (0.0-1.0)
uniform float uCenterX;             // Center X position (0.0-1.0)
uniform float uCenterY;             // Center Y position (0.0-1.0)
uniform float uColorTransitionWidth; // Color transition width for smoothstep (0.0-0.1)
uniform float uArcColorTransitionWidth; // Arc color transition width for smooth gradient blending (0.0-0.1)
uniform float uColorSmoothing;      // Color smoothing between adjacent bands (0.0-1.0)
uniform float uColorSmoothingRadius; // Number of bands to sample for color smoothing (0.5-5.0)
uniform float uCornerRoundSize;     // Size of corner rounding at bottom center (0.0-0.5)
uniform float uMaskRadius;         // Subtractive mask radius for center cutout (0.0-0.4)
uniform float uMaskBorderWidth;   // Thickness of border around mask (0.0-0.02)
uniform float uMaskBorderNoiseSpeed; // Animation speed multiplier for border noise (0.0-1.0)
uniform float uMaskBorderInnerFeathering; // Inner edge feathering (0.0-0.01)
uniform float uMaskBorderOuterFeathering; // Outer edge feathering (0.0-0.01)
uniform float uMaskBorderNoiseMultiplier; // Multiplier for noise value before color mapping (0.0-2.0)
uniform float uArcBorderWidth;   // Thickness of border around arc outline (0.0-0.02)
uniform float uArcBorderNoiseSpeed; // Animation speed multiplier for arc border noise (0.0-1.0)
uniform float uArcBorderInnerFeathering; // Inner edge feathering (0.0-0.01)
uniform float uArcBorderOuterFeathering; // Outer edge feathering (0.0-0.01)
uniform float uArcBorderNoiseMultiplier; // Multiplier for noise value before color mapping (0.0-2.0)
uniform float uBorderNoiseBlur; // Blur amount for border noise colors (0.0 = no blur, 1.0 = full blur)
uniform float uDistortionStrength; // Multiplier for bass-reactive radial distortion (0.0 = disabled, 1.0 = default)
uniform float uDistortionSize; // Size/radius of distortion effect (0.0 = center only, 1.0 = full screen, >1.0 = extends beyond screen)
uniform float uDistortionFalloff; // Easing curve for distortion falloff (1.0 = linear, 2.0 = smooth, 4.0 = very sharp)
uniform float uDistortionPerspectiveStrength; // Strength of center perspective scaling (0.0 = no scaling, 1.0 = default, 2.0 = double)
uniform float uDistortionEasing; // Easing type for bass interpolation (0.0 = linear, 1.0 = smooth, 2.0 = exponential)
uniform float uContrast; // Contrast adjustment (1.0 = normal, >1.0 = more contrast)
uniform float uContrastAudioReactive; // How much audio affects contrast (0.0-1.0)
uniform float uContrastMin; // Minimum contrast (at quiet audio)
uniform float uContrastMax; // Maximum contrast (at loud audio)
uniform float uSmoothedContrastAudioLevel; // Smoothed audio level for contrast (from JS with attack/release)
uniform float uContrastMaskEnabled; // Contrast mask enabled (0.0 = off, 1.0 = on)
uniform float uContrastMaskStartDistance; // Distance from arc to start contrast fade
uniform float uContrastMaskFeathering; // Smoothness of contrast transition
uniform float uDitherMinThreshold;  // Minimum brightness to trigger dithering (0.0-1.0)
uniform float uDitherMinStrength;   // Minimum dither strength at threshold (0.0-1.0)
uniform float uDitherMaxStrength;   // Maximum dither strength at full brightness (0.0-1.0)
uniform float uDitherSize;          // Dither pattern scale (higher = finer pattern)
uniform float uBackgroundEnabled;   // Background enabled (0.0 = off, 1.0 = on)
uniform float uBackgroundIntensity; // Background intensity (base opacity)
uniform float uBackgroundBassThreshold; // Bass threshold to start showing background
uniform float uBackgroundBassSensitivity; // Bass sensitivity (higher = more reactive)
uniform float uBackgroundNoiseScale; // Background noise scale (larger = finer detail)
uniform float uBackgroundNoiseSpeed; // Background noise animation speed multiplier
uniform float uBackgroundDistortionStrength; // Background UV distortion strength
uniform float uBackgroundFrequencyReactivity; // How much frequency texture affects background
uniform float uBackgroundStereoPan; // How much stereo affects background position
uniform float uBackgroundBlur; // Background blur amount (0.0 = sharp, 1.0 = very smooth)
uniform float uBackgroundDitherEnabled; // Background dither enabled (0.0 = off, 1.0 = on)
uniform float uBackgroundDitherMinThreshold; // Background dither min threshold (brightness level to start)
uniform float uBackgroundDitherMinStrength; // Background dither min strength (at threshold)
uniform float uBackgroundDitherMaxStrength; // Background dither max strength (at full brightness)
uniform float uBackgroundDitherSize; // Background dither pattern scale
uniform float uBackgroundDitherBassReactivity; // How much bass affects dither strength (0.0-1.0)
uniform float uBackgroundFadeEnabled; // Background fade enabled (0.0 = off, 1.0 = on)
uniform float uBackgroundFadeStartDistance; // Distance from max arc radius to start fading
uniform float uBackgroundFadeFeathering; // Distance over which fade occurs
uniform float uCenterSphereEnabled;         // Center sphere enabled (0.0 = off, 1.0 = on)
uniform float uCenterSphereBaseRadius;      // Base radius of sphere (minimum size)
uniform float uCenterSphereMaxRadius;       // Maximum radius expansion
uniform float uCenterSphereSizeThreshold;  // Volume threshold to start appearing
uniform float uCenterSphereBassWeight;      // Weight between volume (0.0) and bass (1.0)
uniform float uCenterSphereCoreSize;        // Core radius as fraction of sphere (0.3-1.0)
uniform float uCenterSphereGlowSize;        // Glow radius as multiple of sphere (1.0-3.0)
uniform float uCenterSphereGlowIntensity;   // Glow intensity (0.0-1.0)
uniform float uCenterSphereGlowFalloff;      // Glow falloff sharpness (1.0-8.0)
uniform float uCenterSphereBaseBrightness;  // Base brightness (0.0-1.0)
uniform float uCenterSphereBrightnessRange; // Additional brightness from audio (0.0-1.0)
uniform float uCenterSphereNoiseEnabled;    // Noise animation enabled (0.0 = off, 1.0 = on)
uniform float uCenterSphereNoiseScale;      // Noise scale (1.0-20.0)
uniform float uCenterSphereNoiseSpeed;      // Noise animation speed (0.0-2.0)
uniform float uCenterSphereNoiseAmount;     // Noise variation amount (0.0-0.5)
uniform float uCenterSphere3DEnabled;       // 3D shading enabled (0.0 = off, 1.0 = on)
uniform float uCenterSphere3DStrength;     // 3D shading strength (0.0-1.0)
uniform float uSmoothedSphereBrightness;  // Smoothed brightness (from JS with attack/release)
uniform float uSmoothedSphereSizeVolume; // Smoothed size from volume (from JS with attack/release)
uniform float uSmoothedSphereSizeBass;   // Smoothed size from bass (from JS with attack/release)
uniform float uCenterSphereBassSizeMultiplier; // How much bass adds to size
uniform float uCenterSphereBrightnessMidThreshold; // Mid level for "fairly bright" stage
uniform float uCenterSphereBrightnessFullThreshold; // Mid level for full brightness
uniform float uCenterSphereBrightnessCompression; // Compression strength (0 = none, 1 = max)
uniform float uCenterSphereBrightnessMultiplier; // Base brightness multiplier
uniform float uCenterSphereBrightnessMultiplierRange; // Additional multiplier range from audio
uniform float uSmoothedSphereBrightnessMultiplier; // Smoothed brightness multiplier (from JS with attack/release)
uniform float uCenterSphereHueShift; // Base hue shift (degrees)
uniform float uCenterSphereHueShiftRange; // Additional hue shift range from audio (degrees)
uniform float uSmoothedSphereHueShift; // Smoothed hue shift (from JS with attack/release)

// ============================================================================
// Constants and Helpers
// ============================================================================

// Mathematical constants
#define PI 3.14159265359

// Performance constants
#define MAX_COLOR_SMOOTHING_SAMPLES 10
#define MAX_BLUR_SAMPLES_PER_SIDE 2
#define EARLY_EXIT_THRESHOLD 0.001
#define WEIGHT_EARLY_EXIT_THRESHOLD 0.01

// Visual constants
#define BLUR_SAMPLE_DISTANCE 0.01  // Distance for blur samples as fraction of screen

// ============================================================================
// Module Includes
// ============================================================================

// Include modules AFTER uniforms and constants are declared
#include "source/arc-sphere.glsl"
#include "source/arc-background.glsl"
#include "source/arc-rendering.glsl"
#include "source/arc-distortion.glsl"
#include "source/arc-borders.glsl"
#include "strings/math-utils.glsl"  // For cubicBezierEase function

// Recording tone curve (replaces gamma correction)
// Maps input luminance through bezier curve to output luminance
// This provides full control over the tone curve (gamma-like adjustment)
vec3 applyRecordingToneCurve(vec3 color) {
    // Calculate luminance (brightness) using standard weights
    float inputLuminance = dot(color, vec3(0.299, 0.587, 0.114));
    
    // Map input luminance through bezier tone curve
    float outputLuminance = cubicBezierEase(
        inputLuminance,
        uRecordingToneCurveX1,
        uRecordingToneCurveY1,
        uRecordingToneCurveX2,
        uRecordingToneCurveY2
    );
    
    // Scale each color channel proportionally to maintain hue and saturation
    // Formula: output = input * (outputLuminance / inputLuminance)
    // Handle division by zero
    if (inputLuminance > 0.001) {
        float scale = outputLuminance / inputLuminance;
        return color * scale;
    } else {
        // For very dark colors, just scale by output luminance
        return color * outputLuminance;
    }
}

// Recording color adjustments using cubic bezier curves
// Works like Photoshop curves: maps input values (0-1) to output values (0-1) through bezier curves
// Each adjustment can be individually enabled/disabled via uniforms
vec3 applyRecordingColorAdjustments(vec3 color) {
    // Calculate luminance (brightness) using standard weights
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    
    // Apply brightness only if enabled
    // Photoshop-style curve: input brightness (0-1) → output brightness (0-1)
    if (uApplyRecordingBrightness > 0.5) {
        // Map input luminance through bezier curve to get output luminance
        float inputBrightness = luminance;
        float outputBrightness = cubicBezierEase(
            inputBrightness,
            uRecordingBrightnessCurveX1,
            uRecordingBrightnessCurveY1,
            uRecordingBrightnessCurveX2,
            uRecordingBrightnessCurveY2
        );
        
        // Remap color to new brightness while preserving hue and saturation
        // Scale each channel proportionally: output = input * (outputBrightness / inputBrightness)
        if (inputBrightness > 0.001) {
            float scale = outputBrightness / inputBrightness;
            color *= scale;
        } else {
            // For very dark colors, scale by output brightness directly
            color *= outputBrightness;
        }
        
        // Recalculate luminance after brightness adjustment
        luminance = dot(color, vec3(0.299, 0.587, 0.114));
    }
    
    // Apply contrast only if enabled
    // Photoshop-style curve: input luminance (0-1) → output luminance (0-1)
    // Contrast affects the relationship between light and dark areas
    if (uApplyRecordingContrast > 0.5) {
        // Map input luminance through bezier curve to get output luminance
        float inputLuminance = luminance;
        float outputLuminance = cubicBezierEase(
            inputLuminance,
            uRecordingContrastCurveX1,
            uRecordingContrastCurveY1,
            uRecordingContrastCurveX2,
            uRecordingContrastCurveY2
        );
        
        // Remap color to new luminance while preserving hue and saturation
        if (inputLuminance > 0.001) {
            float scale = outputLuminance / inputLuminance;
            color *= scale;
        } else {
            color *= outputLuminance;
        }
        
        // Recalculate luminance after contrast adjustment
        luminance = dot(color, vec3(0.299, 0.587, 0.114));
    }
    
    // Apply saturation only if enabled
    // Photoshop-style curve: input luminance (0-1) → output saturation factor (0-1)
    // The curve allows adjusting saturation differently for dark vs bright areas
    if (uApplyRecordingSaturation > 0.5) {
        // Calculate current saturation (distance from gray)
        float gray = dot(color, vec3(0.299, 0.587, 0.114));
        vec3 colorDiff = color - vec3(gray);
        float currentSaturation = length(colorDiff);
        
        // Map input luminance through bezier curve to get saturation factor
        // Curve input: luminance (0-1), Curve output: saturation factor (0-1)
        // 0.0 = grayscale, 1.0 = full saturation, >1.0 = oversaturated
        float saturationFactor = cubicBezierEase(
            luminance, // Use luminance as curve input (adjust saturation based on brightness)
            uRecordingSaturationCurveX1,
            uRecordingSaturationCurveY1,
            uRecordingSaturationCurveX2,
            uRecordingSaturationCurveY2
        );
        
        // Apply saturation adjustment
        // saturationFactor: 0 = grayscale, 1 = original saturation, >1 = increased saturation
        if (currentSaturation > 0.001) {
            // Scale saturation by the factor
            color = vec3(gray) + colorDiff * saturationFactor;
        } else {
            // If no saturation, blend toward gray based on saturationFactor
            // saturationFactor = 1.0 means keep as-is, 0.0 means full gray
            color = mix(vec3(gray), color, saturationFactor);
        }
        color = clamp(color, 0.0, 1.0);
    }
    
    return color;
}

// OKLCH-based color adjustments using cubic bezier curves
// Perceptually uniform adjustments: L, C, H are adjusted independently
// Works like Photoshop curves: maps input values (0-1) to output values (0-1)
vec3 applyRecordingOklchAdjustments(vec3 color) {
    // Convert RGB to OKLCH
    vec3 oklch = rgbToOklch(color);
    float L = oklch.x;  // Lightness [0, 1]
    float C = oklch.y;  // Chroma [0, ~0.4]
    float H = oklch.z;  // Hue [0, 360)
    
    // Apply lightness curve if enabled
    if (uApplyRecordingOklchLightness > 0.5) {
        // Map input lightness (0-1) through bezier curve to output lightness (0-1)
        float inputL = L;
        float outputL = cubicBezierEase(
            inputL,
            uRecordingOklchLightnessCurveX1,
            uRecordingOklchLightnessCurveY1,
            uRecordingOklchLightnessCurveX2,
            uRecordingOklchLightnessCurveY2
        );
        L = outputL;
    }
    
    // Apply chroma curve if enabled
    if (uApplyRecordingOklchChroma > 0.5) {
        // Normalize chroma to 0-1 for curve (max chroma is ~0.4)
        float maxChroma = 0.4;
        float normalizedC = C / maxChroma;
        
        // Map input chroma (0-1 normalized) through bezier curve
        float outputNormalizedC = cubicBezierEase(
            normalizedC,
            uRecordingOklchChromaCurveX1,
            uRecordingOklchChromaCurveY1,
            uRecordingOklchChromaCurveX2,
            uRecordingOklchChromaCurveY2
        );
        
        // Denormalize back to actual chroma range
        C = outputNormalizedC * maxChroma;
    }
    
    // Apply hue curve if enabled
    if (uApplyRecordingOklchHue > 0.5) {
        // Normalize hue to 0-1 for curve (hue is 0-360)
        float normalizedH = H / 360.0;
        
        // Map input hue (0-1 normalized) through bezier curve
        float outputNormalizedH = cubicBezierEase(
            normalizedH,
            uRecordingOklchHueCurveX1,
            uRecordingOklchHueCurveY1,
            uRecordingOklchHueCurveX2,
            uRecordingOklchHueCurveY2
        );
        
        // Denormalize back to hue range (0-360) and ensure wrapping
        H = mod(outputNormalizedH * 360.0, 360.0);
    }
    
    // Convert OKLCH back to RGB
    vec3 adjustedOklch = vec3(L, C, H);
    return oklchToRgb(adjustedOklch);
}

void main() {
    // ========================================================================
    // Setup: Calculate coordinate system and transformations
    // ========================================================================
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / uResolution;
    
    // Convert to polar coordinates relative to center
    // Account for aspect ratio to keep circles circular on screen
    float aspectRatio = uResolution.x / uResolution.y;
    
    // Calculate viewport scale to ensure visualization fits in viewport
    // Use minimum dimension to ensure it fits in both portrait and landscape
    float minDimension = min(uResolution.x, uResolution.y);
    float maxDimension = max(uResolution.x, uResolution.y);
    float viewportScale = minDimension / maxDimension; // 1.0 for square, <1.0 for non-square
    
    // Calculate DPR scale factor to maintain visual appearance across screen densities
    // Since design is on high DPI, scale values up for lower DPI screens
    // This ensures the same visual size regardless of pixel density
    float dpr = max(uDevicePixelRatio, 1.0); // Fallback to 1.0 if not set
    float dprScale = 1.0 / dpr; // Inverse scaling: larger values on lower DPI
    
    vec2 center = vec2(uCenterX, uCenterY);
    
    // Apply bass-reactive radial distortion BEFORE calculating arc shape
    // This warps the entire visualization with a bulge effect (like looking into a bowl)
    float bassIntensity = uBass; // Use raw bass for immediate response
    if (uDistortionStrength > 0.0) {
        uv = applyBassDistortion(uv, aspectRatio, center, bassIntensity);
    }
    
    vec2 toPixel = uv - center;
    
    // Calculate distance in aspect-corrected coordinate space
    // First apply aspect ratio correction to make circles appear circular on screen
    vec2 toPixelAspectCorrected = vec2(toPixel.x * aspectRatio, toPixel.y);
    
    // Apply viewport scale to ensure visualization fits
    // This scales down the entire visualization in portrait mode
    vec2 toPixelScaled = toPixelAspectCorrected * viewportScale;
    
    // OPTIMIZATION Phase 3.1: Calculate distance once and reuse
    // Distance in aspect-corrected, viewport-scaled space
    float dist = length(toPixelScaled);
    float distSquared = dist * dist;  // OPTIMIZATION Phase 3.1: Cache squared distance for comparisons (avoid sqrt)
    
    // OPTIMIZATION Phase 2.3: Early exit for pixels far from arcs
    // Calculate maximum possible arc radius (base + max offset) to determine if pixel is too far
    float maxPossibleRadius = (uBaseRadius + uMaxRadiusOffset) * viewportScale * 1.5; // 1.5x safety margin
    float maxRadiusSquared = maxPossibleRadius * maxPossibleRadius;
    
    // If pixel is far beyond any possible arc, only render background
    bool isFarFromArcs = distSquared > maxRadiusSquared;
    
    // OPTIMIZATION Phase 1.1: Calculate angle once and reuse (avoids redundant atan() calls)
    float angleFromVertical = calculateAngleFromVertical(toPixelScaled);
    
    // Determine which arc (left or right side of screen)
    // Split vertically: left side = left channel, right side = right channel
    // Each arc spans 180 degrees: from PI/2 (top) to -PI/2 (bottom)
    bool isLeftArc = (toPixel.x < 0.0);
    bool isRightArc = (toPixel.x >= 0.0);
    
    // OPTIMIZATION Phase 2.2: Calculate thresholds once and reuse
    // Calculate base thresholds (no dithering) for functions that don't need dithering
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateAllFrequencyThresholds(
        0.0,  // No dithering for base thresholds
        false, // useFrequencyModulation = false
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // ========================================================================
    // Background Rendering
    // ========================================================================
    vec3 finalColor = renderBackground(
        uv,
        aspectRatio,
        center,
        uTime,
        dprScale,
        viewportScale
    );
    float finalAlpha = 1.0;
    
    // CRITICAL: Reference recording adjustment uniforms to prevent optimization
    // This ensures uniforms are always "active" even when disabled
    // We add a zero-offset to finalColor (no visual effect) but keeps uniforms loaded
    finalColor += vec3(
        (uApplyRecordingOklchAdjustments + 
         uApplyRecordingOklchLightness + 
         uRecordingOklchLightnessCurveX1 + 
         uRecordingOklchLightnessCurveY1 +
         uRecordingOklchLightnessCurveX2 + 
         uRecordingOklchLightnessCurveY2 +
         uApplyRecordingToneCurve +
         uApplyRecordingColorAdjustments) * 0.0
    );
    
    // ========================================================================
    // Center Sphere Rendering
    // ========================================================================
    // OPTIMIZATION Phase 2.3: Skip sphere rendering if pixel is far from arcs
    vec3 sphereColor = vec3(0.0);
    if (!isFarFromArcs) {
        sphereColor = renderCenterSphere(
            uv,
            center,
            aspectRatio,
            viewportScale,
            dprScale,
            uTime,
            threshold1, threshold2, threshold3, threshold4, threshold5,
            threshold6, threshold7, threshold8, threshold9, threshold10
        );
    }
    
    // Blend sphere with background using additive blending
    // This makes the sphere glow on top of the background
    finalColor = finalColor + sphereColor;
    // Clamp to prevent overflow from additive blending
    finalColor = clamp(finalColor, 0.0, 1.0);
    
    // ========================================================================
    // Arc Rendering
    // ========================================================================
    // #region agent log - Store calculated values for debug logging
    // These will be used in debug output to log actual calculation values
    float debugBaseAngle = 0.0;
    float debugAngleAmplification = 1.0;
    float debugAngleFromVertical = 0.0;
    float debugNormalizedPosition = 0.0;
    float debugRemappedPosition = 0.0;
    float debugBandIndex = 0.0;
    float debugBandIndexBeforeConstraint = 0.0;
    float debugAbsX = 0.0;
    float debugAbsY = 0.0;
    bool debugConstraintApplied = false;
    // #endregion
    
    // OPTIMIZATION Phase 1.2: Declare arcRadiusAtPosition outside block for use in contrast mask
    float arcRadiusAtPosition = uBaseRadius * viewportScale; // Default to base radius
    
    // OPTIMIZATION Phase 2.3: Skip arc rendering if pixel is far from arcs
    if ((isLeftArc || isRightArc) && !isFarFromArcs) {
        // OPTIMIZATION: Use arc rendering module (Phase 2.3)
        float bandIndex;
        float volume;
        float finalRadius;
        float arcBorderFactor;
        float maskBorderFactor;
        float finalFactor;
        vec3 arcColor;
        
        calculateArcRendering(
            uv,
            center,
            toPixel,
            toPixelScaled,
            dist,
            angleFromVertical,  // OPTIMIZATION Phase 1.1: Pass pre-calculated angle
            aspectRatio,
            viewportScale,
            dprScale,
            isLeftArc,
            isRightArc,
            bandIndex,
            volume,
            finalRadius,
            arcRadiusAtPosition,  // OPTIMIZATION Phase 1.2: Cache radius output
            arcBorderFactor,
            maskBorderFactor,
            finalFactor,
            arcColor
        );
        
        // #region agent log - Store calculated values for debug logging
        debugBandIndex = bandIndex;
        debugNormalizedPosition = bandIndex / float(uNumBands - 1);
        debugRemappedPosition = debugNormalizedPosition;
        debugBandIndexBeforeConstraint = bandIndex;
        debugConstraintApplied = false;
        // #endregion
        
        // Render arc shape
        if (finalFactor > 0.0) {
            finalColor = mix(finalColor, arcColor, finalFactor);
        }
        
        // Render arc outline border (visible both inside and outside the arc)
        if (arcBorderFactor > 0.0) {
            // OPTIMIZATION: Use shared border calculation (Phase 2.4)
            float aspectRatio = uResolution.x / uResolution.y;
            float animationSpeed = calculateBorderAnimationSpeed(uArcBorderNoiseSpeed, uBPM);
            float noiseValue = calculateBorderNoise(toPixelScaled, dprScale, animationSpeed, uTime);
            vec3 borderColor = calculateBorderColor(
                noiseValue,
                toPixelScaled,
                aspectRatio,
                uArcBorderNoiseMultiplier,
                uBorderNoiseBlur,
                dprScale,
                animationSpeed,
                uTime,
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10
            );
            
            finalColor = mix(finalColor, borderColor, arcBorderFactor);
        }
        
        // Render mask border (visible both inside and outside mask)
        if (maskBorderFactor > 0.0) {
            // OPTIMIZATION: Use shared border calculation (Phase 2.4)
            float aspectRatio = uResolution.x / uResolution.y;
            float animationSpeed = calculateBorderAnimationSpeed(uMaskBorderNoiseSpeed, uBPM);
            float noiseValue = calculateBorderNoise(toPixelScaled, dprScale, animationSpeed, uTime);
            vec3 borderColor = calculateBorderColor(
                noiseValue,
                toPixelScaled,
                aspectRatio,
                uMaskBorderNoiseMultiplier,
                uBorderNoiseBlur,
                dprScale,
                animationSpeed,
                uTime,
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10
            );
            
            finalColor = mix(finalColor, borderColor, maskBorderFactor);
        }
    }
    
    // ========================================================================
    // Post-Processing: Contrast Adjustment
    // ========================================================================
    float contrastValue = uContrast;
    
    // Apply audio reactivity to contrast
    if (uContrastAudioReactive > 0.001) {
        // Use pre-smoothed audio level (with attack/release timing applied in JavaScript)
        float audioLevel = clamp(uSmoothedContrastAudioLevel, 0.0, 1.0);
        
        // Map audio level to contrast range (min at quiet, max at loud)
        // Use smoothstep for smooth transition
        float audioFactor = smoothstep(0.0, 1.0, audioLevel);
        float audioContrast = mix(uContrastMin, uContrastMax, audioFactor);
        
        // Mix between base contrast and audio-reactive contrast based on reactivity amount
        contrastValue = mix(contrastValue, audioContrast, uContrastAudioReactive);
    }
    
    // Calculate contrast mask (same shape as fade mask, but with different feathering)
    float contrastMask = 1.0;
    if (uContrastMaskEnabled > 0.5 && abs(contrastValue - 1.0) > 0.001) {
        // OPTIMIZATION Phase 3.1: Reuse cached dist instead of recalculating length()
        float distFromCenter = dist;
        
        // Calculate actual arc radius at this position (matches arc shape)
        // OPTIMIZATION Phase 1.2: Reuse cached radius from calculateArcRendering() instead of recalculating
        float arcRadius = arcRadiusAtPosition;
        
        // Calculate contrast mask distances
        // Mask is strongest near arcs, fades out further away
        // Apply DPR scaling to maintain consistent visual appearance across screen densities
        float expandedRadius = arcRadius + uContrastMaskStartDistance * viewportScale * dprScale;
        float maskStart = expandedRadius; // Start of mask (near arc, full contrast)
        float maskEnd = maskStart + uContrastMaskFeathering * viewportScale * dprScale; // End of mask (far from arc, no contrast)
        
        // Apply mask: 1.0 (full contrast) when dist < maskStart, 0.0 (no contrast) when dist > maskEnd
        if (uContrastMaskFeathering < 0.001) {
            // Hard cut: 1.0 if inside expandedRadius, 0.0 if outside
            contrastMask = (distFromCenter <= expandedRadius) ? 1.0 : 0.0;
        } else {
            // Smooth fade: 1.0 at maskStart (near arc), 0.0 at maskEnd (far from arc)
            contrastMask = smoothstep(maskEnd, maskStart, distFromCenter);
        }
        contrastMask = clamp(contrastMask, 0.0, 1.0);
    }
    
    // Apply contrast adjustment with mask
    // Formula: (color - 0.5) * contrast + 0.5
    // Blend between full contrast and no contrast based on mask
    if (abs(contrastValue - 1.0) > 0.001) {
        // Calculate contrast-adjusted color
        vec3 contrastColor = (finalColor - 0.5) * contrastValue + 0.5;
        contrastColor = clamp(contrastColor, 0.0, 1.0);
        
        // Mix between original and contrast-adjusted based on mask
        finalColor = mix(finalColor, contrastColor, contrastMask);
    }
    
    // ========================================================================
    // Recording Tone Curve (for recording only)
    // ========================================================================
    // Apply bezier curve-based tone mapping (replaces gamma correction)
    // This provides full control over the tone curve for matching browser display
    if (uApplyRecordingToneCurve > 0.5) {
        finalColor = applyRecordingToneCurve(finalColor);
    }
    
    // ========================================================================
    // Recording Color Adjustments (for recording only)
    // ========================================================================
    // Apply bezier curve-based brightness, contrast, and saturation adjustments
    // This allows fine-tuned color correction for recordings
    if (uApplyRecordingColorAdjustments > 0.5) {
        finalColor = applyRecordingColorAdjustments(finalColor);
    }
    
    // ========================================================================
    // Recording OKLCH Adjustments (for recording only)
    // ========================================================================
    // Apply perceptually uniform color adjustments using OKLCH color space
    // Lightness, chroma, and hue are adjusted independently through bezier curves
    if (uApplyRecordingOklchAdjustments > 0.5) {
        finalColor = applyRecordingOklchAdjustments(finalColor);
    }
    
    // ========================================================================
    // Final Output
    // ========================================================================
    gl_FragColor = vec4(finalColor, finalAlpha);
}

