precision highp float;

#include "common/uniforms.glsl"
#include "common/color-mapping.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"

// Frequency data texture
// uFrequencyTexture: LUMINANCE = left channel, ALPHA = right channel
uniform sampler2D uFrequencyTexture;

// Number of visual bands (for display)
uniform int uNumBands;
// Number of measured bands (for texture sampling)
uniform float uMeasuredBands;
// Number of top bands to exclude from visualization
uniform int uExcludeTopBands;
// Top arc margin (fraction of arc height to leave empty at top)
uniform float uTopArcMargin;

// Arc parameters
uniform float uBaseRadius;          // Base radius of the arc (0.0-1.0)
uniform float uMaxRadiusOffset;     // Maximum radius offset based on volume (0.0-1.0)
uniform float uCenterX;             // Center X position (0.0-1.0)
uniform float uCenterY;             // Center Y position (0.0-1.0)
uniform float uColorTransitionWidth; // Color transition width for smoothstep (0.0-0.1)
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

#define PI 3.14159265359

// Bayer matrix helpers for dithering
float Bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2. + a.y * a.y * .75);
}

#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

// FBM parameters for mask border noise
#define FBM_OCTAVES     5
#define FBM_LACUNARITY  1.3
#define FBM_GAIN        0.3
#define FBM_SCALE       0.9

// Blur constants
#define BLUR_SAMPLE_DISTANCE 0.01  // Distance for blur samples as fraction of screen

// Distortion constants
#define DISTORTION_MAX_STRENGTH 0.15  // Maximum distortion strength (15% of screen)

// Apply easing curve to bass intensity for smoother or more dramatic response
// easingType: 0.0 = linear, 1.0 = smooth (smoothstep), 2.0 = exponential
float applyBassEasing(float bassValue, float easingType) {
    float clampedBass = clamp(bassValue, 0.0, 1.0);
    
    if (easingType < 0.5) {
        // Linear: no easing
        return clampedBass;
    } else if (easingType < 1.5) {
        // Smooth: smoothstep curve (ease in/out)
        return smoothstep(0.0, 1.0, clampedBass);
    } else {
        // Exponential: power curve (ease in)
        // Map 1.5-2.0 to power range 2.0-4.0
        float power = 2.0 + (easingType - 1.5) * 4.0; // 2.0 to 4.0
        return pow(clampedBass, power);
    }
}

// Apply hue shift to RGB color
// hueShift is in degrees (-180 to 180)
vec3 applyHueShift(vec3 rgb, float hueShift) {
    if (abs(hueShift) < 0.001) {
        return rgb;
    }
    
    // Convert RGB to HSV
    float maxVal = max(max(rgb.r, rgb.g), rgb.b);
    float minVal = min(min(rgb.r, rgb.g), rgb.b);
    float delta = maxVal - minVal;
    
    float hue = 0.0;
    if (delta > 0.001) {
        if (maxVal == rgb.r) {
            hue = mod(((rgb.g - rgb.b) / delta) * 60.0 + 360.0, 360.0);
        } else if (maxVal == rgb.g) {
            hue = ((rgb.b - rgb.r) / delta + 2.0) * 60.0;
        } else {
            hue = ((rgb.r - rgb.g) / delta + 4.0) * 60.0;
        }
    }
    
    float saturation = (maxVal > 0.001) ? (delta / maxVal) : 0.0;
    float value = maxVal;
    
    // Apply hue shift
    hue = mod(hue + hueShift + 360.0, 360.0);
    
    // Convert back to RGB
    float c = value * saturation;
    float x = c * (1.0 - abs(mod(hue / 60.0, 2.0) - 1.0));
    float m = value - c;
    
    vec3 rgbOut;
    if (hue < 60.0) {
        rgbOut = vec3(c, x, 0.0);
    } else if (hue < 120.0) {
        rgbOut = vec3(x, c, 0.0);
    } else if (hue < 180.0) {
        rgbOut = vec3(0.0, c, x);
    } else if (hue < 240.0) {
        rgbOut = vec3(0.0, x, c);
    } else if (hue < 300.0) {
        rgbOut = vec3(x, 0.0, c);
    } else {
        rgbOut = vec3(c, 0.0, x);
    }
    
    return rgbOut + vec3(m);
}

// Apply radial pincushion distortion (like looking into a sphere)
// Strongest at edges, weakest at center
// Center appears to recede while staying flat
// Reacts to bass intensity
// Uses configured center (uCenterX, uCenterY) instead of screen center
vec2 applyBassDistortion(vec2 uv, float aspectRatio, vec2 center, float bassIntensity) {
    // Convert to centered coordinates relative to configured center
    vec2 centeredUV = uv - center;
    
    // Calculate viewport scale to ensure visualization fits in viewport
    // Use minimum dimension to ensure it fits in both portrait and landscape
    float minDimension = min(uResolution.x, uResolution.y);
    float maxDimension = max(uResolution.x, uResolution.y);
    float viewportScale = minDimension / maxDimension; // 1.0 for square, <1.0 for non-square
    
    // Scale x by aspect ratio to maintain circular shape
    vec2 centeredUVScaled = vec2(centeredUV.x * aspectRatio, centeredUV.y);
    
    // Apply viewport scale to ensure visualization fits
    centeredUVScaled *= viewportScale;
    
    // Calculate distance from center
    float distFromCenter = length(centeredUVScaled);
    
    // Normalize distance (0 = center, 1 = edge of screen)
    // Use viewport scale to get proper distance in screen space
    float maxDist = length(vec2(aspectRatio * 0.5 * viewportScale, 0.5 * viewportScale));
    float normalizedDist = distFromCenter / maxDist;
    
    // Apply size control: uDistortionSize controls how far the effect extends
    // 0.0 = center only, 1.0 = full screen, >1.0 = extends beyond screen
    // Clamp to prevent division by zero
    float distortionSize = max(0.01, uDistortionSize);
    float sizeAdjustedDist = clamp(normalizedDist / distortionSize, 0.0, 1.0);
    
    // INVERTED falloff curve: strong at edges (1.0), weak at center (0.0)
    // This creates the "looking into sphere" effect
    // uDistortionFalloff controls the easing: 1.0 = linear, 2.0 = smooth, 4.0 = very sharp
    float falloffPower = max(0.1, uDistortionFalloff);
    float falloff = pow(sizeAdjustedDist, falloffPower); // Inverted: use dist directly instead of (1.0 - dist)
    falloff = clamp(falloff, 0.0, 1.0);
    
    // Calculate distortion strength based on bass with easing
    // Apply easing curve to bass intensity for smoother or more dramatic response
    float rawBassStrength = uSmoothedBass * bassIntensity;
    float easedBassStrength = applyBassEasing(rawBassStrength, uDistortionEasing);
    
    // Calculate distortion amount with eased bass
    float distortionAmount = easedBassStrength * DISTORTION_MAX_STRENGTH * falloff * uDistortionStrength;
    
    // REVERSE direction: pull inward toward center (negative direction)
    // This creates pincushion effect (edges pulled in)
    vec2 direction = normalize(centeredUVScaled);
    // Convert direction back to non-scaled space for distortion
    vec2 directionUnscaled = normalize(centeredUV);
    vec2 distortion = directionUnscaled * -distortionAmount; // Negative = pull inward
    
    // Add perspective scaling: scale center down to make it appear to recede
    // Stronger scaling at center, weaker at edges
    // uDistortionPerspectiveStrength controls the strength
    float centerFalloff = 1.0 - sizeAdjustedDist; // Inverse: strong at center, weak at edges
    float perspectiveScale = 1.0 - (easedBassStrength * DISTORTION_MAX_STRENGTH * centerFalloff * uDistortionStrength * uDistortionPerspectiveStrength);
    perspectiveScale = clamp(perspectiveScale, 0.7, 1.0); // Limit scaling to prevent too much zoom
    
    // Apply both distortion and perspective scaling
    // Distortion is applied in unscaled space, then we scale around the center
    vec2 distortedUV = (uv + distortion - center) * perspectiveScale + center;
    
    return distortedUV;
}

// Helper function to calculate background noise and color at a specific UV position
vec3 calculateBackgroundColorAtUV(
    vec2 sampleUV,
    float aspectRatio,
    vec2 center,
    float time,
    float dprScale
) {
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
    float noiseTime = time * uBackgroundNoiseSpeed;
    float noise1 = fbm2_standard(distortedUV * uBackgroundNoiseScale, noiseTime, 1.0, 4, 1.8, 0.5);
    float noise2 = fbm2_standard(distortedUV * uBackgroundNoiseScale * 2.5, noiseTime * 1.3, 1.0, 3, 2.0, 0.4);
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
    
    // Calculate dithering for bright areas (before color mapping, like arc shader)
    float bayerDither = 0.0;
    if (uBackgroundDitherEnabled > 0.5 && uBackgroundDitherMaxStrength > 0.0 && uBackgroundDitherMinThreshold < 1.0) {
        // Calculate brightness from noise (before color mapping)
        // Use the noise value directly, like arc shader uses volume
        float noiseBrightness = finalNoise;
        
        // Check if brightness is above threshold
        if (noiseBrightness > uBackgroundDitherMinThreshold) {
            // Normalize brightness from [threshold, 1.0] to [0.0, 1.0]
            float brightnessRange = 1.0 - uBackgroundDitherMinThreshold;
            float normalizedBrightness = (noiseBrightness - uBackgroundDitherMinThreshold) / max(brightnessRange, 0.001);
            normalizedBrightness = clamp(normalizedBrightness, 0.0, 1.0);
            
            // Base dither strength from brightness
            float baseDitherStrength = mix(uBackgroundDitherMinStrength, uBackgroundDitherMaxStrength, normalizedBrightness);
            
            // Apply bass reactivity: increase dither strength with bass
            float bassLevel = uSmoothedBass;
            float bassBoost = 1.0 + (bassLevel * uBackgroundDitherBassReactivity);
            float ditherStrength = baseDitherStrength * bassBoost;
            ditherStrength = clamp(ditherStrength, 0.0, uBackgroundDitherMaxStrength * 2.0); // Allow up to 2x max strength with bass
            
            // Generate Bayer dither pattern using screen-space coordinates
            vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * 0.5;
            
            // Calculate effective pixel size: uBackgroundDitherSize controls pattern scale
            float referenceScale = 50.0;
            float effectivePixelSize = uPixelSize * (referenceScale / uBackgroundDitherSize);
            vec2 ditherCoord = fragCoordCentered / effectivePixelSize;
            float bayerValue = Bayer8(ditherCoord);
            
            // Convert to dither offset: [-0.5, 0.5] * strength
            bayerDither = (bayerValue - 0.5) * ditherStrength;
        }
    }
    
    // Calculate color thresholds with dithering applied (like arc shader)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateAllFrequencyThresholds(
        bayerDither,  // Apply dithering to thresholds (0.0 when not in bright area)
        false,  // useFrequencyModulation = false
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map noise to color using dithered thresholds
    return mapNoiseToColor(
        finalNoise,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uColorTransitionWidth
    );
}

// Calculate arc radius at a specific position (for fade mask)
float calculateArcRadiusAtPosition(
    vec2 uv,
    vec2 center,
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
    
    // Calculate angle from vertical axis
    float angleFromVertical = acos(clamp(toPixelScaled.y / distForAngle, -1.0, 1.0));
    
    // Map from [0, π] to [0, 1] where 0 = top (highest bands), π = bottom (lowest bands)
    float normalizedPosition = 1.0 - (angleFromVertical / PI);
    normalizedPosition = clamp(normalizedPosition, 0.0, 1.0);
    
    // Exclude top bands and remap
    int excludedBands = uExcludeTopBands;
    if (excludedBands < 0) excludedBands = 0;
    if (excludedBands > uNumBands - 1) excludedBands = uNumBands - 1;
    int effectiveBands = uNumBands - excludedBands;
    
    // Apply top margin
    float topMargin = clamp(uTopArcMargin, 0.0, 0.99);
    float usableArcRange = 1.0 - topMargin;
    float remappedPosition;
    if (topMargin > 0.001) {
        if (normalizedPosition <= usableArcRange) {
            remappedPosition = normalizedPosition / usableArcRange;
        } else {
            remappedPosition = 1.0;
        }
    } else {
        remappedPosition = normalizedPosition;
    }
    remappedPosition = clamp(remappedPosition, 0.0, 1.0);
    
    // Map to band index
    float bandIndex = 0.0;
    if (effectiveBands > 0) {
        float clampedRemapped = min(remappedPosition, 1.0);
        float effectiveBandIndex = clampedRemapped * float(effectiveBands - 1);
        bandIndex = clamp(effectiveBandIndex, 0.0, float(uNumBands - excludedBands - 1));
    }
    
    // Sample frequency texture
    float maxVisualBand = float(uNumBands - excludedBands - 1);
    vec4 freqData;
    
    if (maxVisualBand < 0.5) {
        float bandX = 0.5 / uMeasuredBands;
        freqData = texture2D(uFrequencyTexture, vec2(bandX, 0.5));
    } else {
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
    }
    
    // Get volume for appropriate channel
    float leftVolume = freqData.r;
    float rightVolume = freqData.a;
    float volume = isLeftArc ? leftVolume : rightVolume;
    
    // Blend volumes at bottom center (same as arc rendering)
    float blendZoneWidth = 0.05;
    float distFromCenter = abs(toPixel.x);
    float blendFactor = 1.0;
    
    if (toPixel.y < 0.0 && distFromCenter < blendZoneWidth) {
        blendFactor = smoothstep(0.0, blendZoneWidth, distFromCenter);
    }
    
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
    
    // Calculate target radius
    float targetRadius = (uBaseRadius + volume * uMaxRadiusOffset) * viewportScale;
    
    // Apply corner rounding (simplified - just use a smooth falloff)
    float cornerRoundSize = uCornerRoundSize * viewportScale;
    float distToVerticalCenter = abs(toPixelAspectCorrected.x * viewportScale);
    float distBelowCenter = max(0.0, -toPixelAspectCorrected.y * viewportScale);
    float cornerDist = length(vec2(distToVerticalCenter, distBelowCenter));
    float cornerRound = smoothstep(cornerRoundSize * 1.5, 0.0, cornerDist);
    float cornerRadiusAdjust = cornerRound * cornerRoundSize * 0.5;
    
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
    
    // Apply stereo panning offset
    vec2 stereoOffset = vec2(0.0);
    if (uBackgroundStereoPan > 0.001) {
        // Pan based on bass stereo balance
        float panAmount = uBassStereo * uBackgroundStereoPan * bassLevel;
        stereoOffset = vec2(panAmount * 0.1, 0.0); // Horizontal pan
    }
    
    // Base UV coordinates with stereo offset
    vec2 bgUV = uv + stereoOffset;
    
    // Apply bass-reactive UV distortion
    vec2 distortedUV = bgUV;
    if (uBackgroundDistortionStrength > 0.001) {
        // Use curl noise for flow-based distortion
        vec2 flow = curlNoise(bgUV, time * uBackgroundNoiseSpeed, 2.0);
        
        // Scale distortion by bass intensity
        float distortionAmount = bassLevel * uBackgroundDistortionStrength * visibility;
        
        // Apply distortion
        distortedUV += flow * distortionAmount * 0.1;
        
        // Additional radial distortion from center (like arc shader)
        vec2 toCenter = bgUV - center;
        float distFromCenter = length(toCenter);
        if (distFromCenter > 0.001) {
            float radialDistortion = smoothstep(0.0, 0.5, distFromCenter);
            vec2 radialDir = normalize(toCenter);
            distortedUV += radialDir * distortionAmount * radialDistortion * 0.05;
        }
    }
    
    // Multi-layer noise generation
    // Layer 1: Base noise (slow, large scale)
    float noiseTime = time * uBackgroundNoiseSpeed;
    float noise1 = fbm2_standard(
        distortedUV * uBackgroundNoiseScale,
        noiseTime,
        1.0,
        4,  // octaves
        1.8, // lacunarity
        0.5  // gain
    );
    
    // Layer 2: Detail noise (faster, smaller scale)
    float noise2 = fbm2_standard(
        distortedUV * uBackgroundNoiseScale * 2.5,
        noiseTime * 1.3,
        1.0,
        3,  // octaves
        2.0, // lacunarity
        0.4  // gain
    );
    
    // Combine noise layers (removed third layer for performance)
    float combinedNoise = noise1 * 0.625 + noise2 * 0.375;
    
    // Sample frequency texture for frequency-reactive elements
    float frequencyContribution = 0.0;
    if (uBackgroundFrequencyReactivity > 0.001) {
        // Sample frequency texture at multiple points for spatial variation
        vec2 freqUV1 = distortedUV * vec2(0.5, 1.0) + vec2(0.25, 0.0);
        vec2 freqUV2 = distortedUV * vec2(0.3, 0.8) + vec2(0.35, 0.1);
        
        // Map UV to texture coordinates (0-1 range)
        freqUV1 = fract(freqUV1);
        freqUV2 = fract(freqUV2);
        
        // Sample frequency data (use average of left and right channels)
        vec4 freqData1 = texture2D(uFrequencyTexture, vec2(freqUV1.x, 0.5));
        vec4 freqData2 = texture2D(uFrequencyTexture, vec2(freqUV2.x, 0.5));
        float freq1 = (freqData1.r + freqData1.a) * 0.5;
        float freq2 = (freqData2.r + freqData2.a) * 0.5;
        
        // Combine frequency samples
        float avgFreq = (freq1 + freq2) * 0.5;
        
        // Apply frequency reactivity
        frequencyContribution = avgFreq * uBackgroundFrequencyReactivity;
    }
    
    // Combine noise with frequency contribution
    float finalNoise = mix(combinedNoise, max(combinedNoise, frequencyContribution), 0.5);
    
    // Apply volume scaling (quieter songs stay darker)
    float volumeScale = calculateVolumeScale(uVolume);
    finalNoise *= volumeScale;
    
    // Apply stereo brightness modulation
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
    
    // Soft compression to prevent washout
    finalNoise = applySoftCompression(finalNoise, 0.7, 0.3);
    
    // Clamp to valid range
    finalNoise = clamp(finalNoise, 0.0, 1.0);
    
    // Calculate color thresholds (same as arc shader)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateAllFrequencyThresholds(
        0.0,  // No dithering for background
        false, // useFrequencyModulation = false
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map noise to color using same system as arcs
    vec3 bgColor = mapNoiseToColor(
        finalNoise,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uColorTransitionWidth
    );
    
    // Apply blur by sampling nearby pixels and averaging colors
    if (uBackgroundBlur > 0.001) {
        // Cache center pixel color (already calculated above) to avoid recalculating
        vec3 centerColor = bgColor;
        vec3 blurredColor = centerColor;
        float sampleCount = 1.0;
        
        // Calculate blur radius in UV space
        // Scale by DPR to maintain consistent blur appearance across screen densities
        float blurRadius = uBackgroundBlur * 0.02 * dprScale;
        
        // Sample neighboring positions in a fixed grid pattern
        // Use constant loop bounds (GLSL requirement) but conditionally weight samples
        // Always use cross pattern (5 samples) for better performance
        const int maxSamplesPerSide = 2; // Fixed constant for loop bounds
        
        for (int i = -maxSamplesPerSide; i <= maxSamplesPerSide; i++) {
            for (int j = -maxSamplesPerSide; j <= maxSamplesPerSide; j++) {
                // Use pre-calculated center color instead of recalculating
                if (i == 0 && j == 0) {
                    blurredColor = centerColor;
                    continue;
                }
                
                // Only use cross pattern (i == 0 || j == 0) for better performance
                if (i != 0 && j != 0) continue; // Skip diagonal samples
                
                float dist = length(vec2(float(i), float(j)));
                
                // Calculate offset in UV space
                vec2 offset = vec2(float(i), float(j)) * blurRadius;
                vec2 sampleUV = uv + offset;
                
                // Sample color at offset position
                vec3 sampleColor = calculateBackgroundColorAtUV(
                    sampleUV,
                    aspectRatio,
                    center,
                    time,
                    dprScale
                );
                
                // Weight by distance (closer samples have more weight)
                float weight = 1.0 / (1.0 + dist * 0.5);
                
                blurredColor += sampleColor * weight;
                sampleCount += weight;
            }
        }
        
        // Average the colors
        blurredColor /= sampleCount;
        
        // Mix between original and blurred based on blur amount
        bgColor = mix(bgColor, blurredColor, uBackgroundBlur);
    }
    
    // Dithering is now applied BEFORE color mapping in calculateBackgroundColorAtUV
    // (same approach as arc shader - applied to thresholds before color mapping)
    
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
        float arcRadius = calculateArcRadiusAtPosition(uv, center, aspectRatio, viewportScale);
        
        // Calculate fade distances: fade from inside (dark) to outside (visible)
        // fadeStartDistance is how far OUTSIDE the arc to start being fully visible
        // We want: inside arc = dark (0.0), outside = visible (1.0)
        // Make the mask larger by adding to the arc radius
        float expandedRadius = arcRadius + uBackgroundFadeStartDistance * viewportScale;
        
        // Apply fade: 0.0 (dark) when dist < fadeStart, 1.0 (visible) when dist > fadeEnd
        // Simplify when feathering is very small
        if (uBackgroundFadeFeathering < 0.001) {
            // Hard cut: 0.0 if inside expandedRadius, 1.0 if outside
            fadeFactor = (distFromCenter <= expandedRadius) ? 0.0 : 1.0;
        } else {
            // Smooth fade: 0.0 at fadeStart (inside), 1.0 at fadeEnd (outside)
            float fadeStart = expandedRadius; // Start of fade (inside, dark)
            float fadeEnd = fadeStart + uBackgroundFadeFeathering * viewportScale; // End of fade (outside, visible)
            fadeFactor = smoothstep(fadeStart, fadeEnd, distFromCenter);
        }
        fadeFactor = clamp(fadeFactor, 0.0, 1.0);
    }
    
    // Apply intensity, visibility, and fade
    float finalIntensity = uBackgroundIntensity * visibility * fadeFactor;
    bgColor = mix(uColor10, bgColor, finalIntensity);
    
    return bgColor;
}

// Render glowing center sphere
vec3 renderCenterSphere(
    vec2 uv,
    vec2 center,
    float aspectRatio,
    float viewportScale,
    float dprScale,
    float time
) {
    // Early exit if sphere is disabled
    if (uCenterSphereEnabled < 0.5) {
        return vec3(0.0);
    }
    
    // Calculate distance from center in aspect-corrected space
    vec2 toCenter = uv - center;
    vec2 toCenterAspectCorrected = vec2(toCenter.x * aspectRatio, toCenter.y);
    vec2 toCenterScaled = toCenterAspectCorrected * viewportScale;
    float distFromCenter = length(toCenterScaled);
    
    // Audio-reactive size: use smoothed volume for base size + smoothed bass for subtle boost
    float baseSphereRadius = uCenterSphereBaseRadius * viewportScale;
    float volumeSize = uSmoothedSphereSizeVolume;
    float bassSize = uSmoothedSphereSizeBass * uCenterSphereBassSizeMultiplier;
    float combinedSize = volumeSize + bassSize; // Combined additively
    float audioSize = baseSphereRadius + combinedSize * uCenterSphereMaxRadius * viewportScale;
    
    // Apply size threshold: sphere only appears above minimum volume
    float sizeThreshold = uCenterSphereSizeThreshold;
    float sizeFactor = smoothstep(sizeThreshold, sizeThreshold + 0.1, combinedSize);
    float sphereRadius = baseSphereRadius + (audioSize - baseSphereRadius) * sizeFactor;
    
    // Core sphere: bright center with smooth falloff
    float coreRadius = sphereRadius * uCenterSphereCoreSize;
    float coreDist = distFromCenter / coreRadius;
    float coreFactor = 1.0 - smoothstep(0.0, 1.0, coreDist);
    
    // Glow halo: extends beyond core with exponential falloff
    float glowRadius = sphereRadius * uCenterSphereGlowSize;
    float glowDist = distFromCenter / glowRadius;
    float glowFactor = exp(-glowDist * glowDist * uCenterSphereGlowFalloff);
    
    // Audio-reactive brightness: two-stage curve (fast to fairly bright, slow to full)
    // Uses voice frequencies (uMid) via smoothed brightness
    float baseBrightness = uCenterSphereBaseBrightness;
    float smoothedMid = uSmoothedSphereBrightness;
    float midThreshold = uCenterSphereBrightnessMidThreshold;
    float fullThreshold = uCenterSphereBrightnessFullThreshold;
    
    float brightnessStage1 = 0.0;
    float brightnessStage2 = 0.0;
    
    if (smoothedMid <= midThreshold) {
        // Stage 1: Fast attack to "fairly bright" (0.0 to midThreshold maps to 0.0 to 0.7 brightness)
        brightnessStage1 = (smoothedMid / midThreshold) * 0.7;
        brightnessStage2 = 0.0;
    } else {
        // Stage 2: Slow release to full brightness (midThreshold to fullThreshold maps to 0.7 to 1.0)
        float stage2Range = fullThreshold - midThreshold;
        if (stage2Range > 0.001) {
            float stage2Progress = (smoothedMid - midThreshold) / stage2Range;
            brightnessStage1 = 0.7; // Already at "fairly bright"
            brightnessStage2 = stage2Progress * 0.3; // Additional 0.3 to reach 1.0
        } else {
            brightnessStage1 = 0.7;
            brightnessStage2 = 0.0;
        }
    }
    
    float totalBrightness = brightnessStage1 + brightnessStage2;
    float brightnessPulse = baseBrightness + totalBrightness * uCenterSphereBrightnessRange;
    
    // Optional: subtle animation/noise for visual interest
    float animationFactor = 1.0;
    if (uCenterSphereNoiseEnabled > 0.5) {
        vec2 noiseUV = toCenterScaled * uCenterSphereNoiseScale;
        float noiseTime = time * uCenterSphereNoiseSpeed;
        float noise = fbm2_standard(noiseUV, noiseTime, 1.0, 3, 2.0, 0.5);
        animationFactor = 1.0 + (noise - 0.5) * uCenterSphereNoiseAmount;
    }
    
    // Optional: 3D-like shading (subtle gradient from center)
    float shadingFactor = 1.0;
    if (uCenterSphere3DEnabled > 0.5) {
        // Create a subtle gradient: brighter at center, darker at edges
        float normalizedDist = clamp(distFromCenter / sphereRadius, 0.0, 1.0);
        shadingFactor = 1.0 - normalizedDist * uCenterSphere3DStrength;
    }
    
    // Combine core and glow
    float sphereFactor = max(coreFactor, glowFactor * uCenterSphereGlowIntensity);
    sphereFactor *= brightnessPulse * animationFactor * shadingFactor;
    sphereFactor = clamp(sphereFactor, 0.0, 1.0);
    
    // Early exit if sphere factor is too small (performance optimization)
    if (sphereFactor < 0.001) {
        return vec3(0.0);
    }
    
    // Map to color using existing color system
    // Use combined size (volume + bass) for color mapping to match sphere size
    float colorInput = combinedSize;
    colorInput = applySoftCompression(colorInput, 0.7, 0.3);
    
    // Calculate color thresholds (reuse existing system)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateAllFrequencyThresholds(
        0.0,  // No dithering for sphere
        false,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map audio level to color
    vec3 sphereColor = mapNoiseToColor(
        colorInput,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        uColorTransitionWidth
    );
    
    // Apply brightness multiplier (can exceed 1.0 for super-bright effect)
    sphereColor *= uSmoothedSphereBrightnessMultiplier;
    
    // Apply hue shift
    sphereColor = applyHueShift(sphereColor, uSmoothedSphereHueShift);
    
    // Apply sphere factor (fade from center)
    return sphereColor * sphereFactor;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / uResolution;
    
    // Convert to polar coordinates relative to center
    // Account for aspect ratio to keep circles circular
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
    
    float angle = atan(toPixel.y, toPixel.x);
    // Distance in aspect-corrected, viewport-scaled space
    float dist = length(toPixelScaled);
    
    // Determine which arc (left or right side of screen)
    // Split vertically: left side = left channel, right side = right channel
    // Each arc spans 180 degrees: from PI/2 (top) to -PI/2 (bottom)
    bool isLeftArc = (toPixel.x < 0.0);
    bool isRightArc = (toPixel.x >= 0.0);
    
    // Render background effect
    vec3 finalColor = renderBackground(
        uv,
        aspectRatio,
        center,
        uTime,
        dprScale,
        viewportScale
    );
    float finalAlpha = 1.0;
    
    // Render center sphere (after background, before arcs)
    vec3 sphereColor = renderCenterSphere(
        uv,
        center,
        aspectRatio,
        viewportScale,
        dprScale,
        uTime
    );
    
    // Blend sphere with background using additive blending
    // This makes the sphere glow on top of the background
    finalColor = finalColor + sphereColor;
    // Clamp to prevent overflow from additive blending
    finalColor = clamp(finalColor, 0.0, 1.0);
    
    if (isLeftArc || isRightArc) {
        // Map position along arc to band index
        // Calculate angle from vertical axis directly from position
        // For a semicircle, the angle from vertical (0° = top) directly determines band position
        // Top (0° from vertical) = highest frequency, Bottom (π from vertical) = lowest frequency
        float normalizedPosition;
        float distForAngle = length(toPixelScaled);  // Use scaled coordinates for consistency
        
        if (distForAngle > 0.001) {
            // Calculate angle from vertical axis using both x and y components
            // This is more stable than using polar angle when x ≈ 0
            // Use toPixelScaled consistently for both numerator and denominator
            // angleFromVertical ranges from 0 (top, y > 0) to π (bottom, y < 0)
            float angleFromVertical = acos(clamp(toPixelScaled.y / distForAngle, -1.0, 1.0));
            
            // Map from [0, π] to [0, 1] where 0 = top (highest bands), π = bottom (lowest bands)
            // Invert so 0° (top) → 1.0, π (bottom) → 0.0
            normalizedPosition = 1.0 - (angleFromVertical / PI);
            
            // Apply power curve to compress top region (optional, can be adjusted)
            float power = 1.0;
            normalizedPosition = pow(normalizedPosition, power);
            normalizedPosition = clamp(normalizedPosition, 0.0, 1.0);
        } else {
            normalizedPosition = 0.5; // Center if too close to origin
        }
        
        // Exclude top bands and remap remaining bands across the full arc
        // Clamp excluded bands to valid range (0 to uNumBands - 1)
        int excludedBands = uExcludeTopBands;
        if (excludedBands < 0) excludedBands = 0;
        if (excludedBands > uNumBands - 1) excludedBands = uNumBands - 1;
        int effectiveBands = uNumBands - excludedBands;
        
        // Apply top margin: remap position so top margin area is excluded from band mapping
        float topMargin = clamp(uTopArcMargin, 0.0, 0.99);
        float usableArcRange = 1.0 - topMargin;
        
        // Calculate remapped position for band mapping
        float remappedPosition;
        if (topMargin > 0.001) {
            // Top margin is active: remap [0, usableArcRange] to [0, 1]
            if (normalizedPosition <= usableArcRange) {
                remappedPosition = normalizedPosition / usableArcRange;
            } else {
                // In top margin area - no bands shown
                remappedPosition = 1.0;
            }
        } else {
            // No top margin: use position directly
            remappedPosition = normalizedPosition;
        }
        remappedPosition = clamp(remappedPosition, 0.0, 1.0);
        
        // Map remapped position to effective band range [0, effectiveBands - 1]
        // When remappedPosition = 1.0 (top), we want the highest visible band
        float bandIndex;
        if (effectiveBands > 0) {
            // Ensure remappedPosition = 1.0 maps exactly to the highest band
            // Use min to handle edge case where remappedPosition might be slightly > 1.0 due to floating point
            float clampedRemapped = min(remappedPosition, 1.0);
            float effectiveBandIndex = clampedRemapped * float(effectiveBands - 1);
            // The bandIndex represents the actual band (excluding top bands)
            // Band 0 (lowest) stays at 0, highest visible band is (uNumBands - excludedBands - 1)
            bandIndex = effectiveBandIndex;
            // Clamp to valid range (excluding top bands)
            bandIndex = clamp(bandIndex, 0.0, float(uNumBands - excludedBands - 1));
        } else {
            // Fallback if all bands excluded
            bandIndex = 0.0;
        }
        
        // Sample frequency texture with interpolation between bands for smoother radius transitions
        vec4 freqData;
        float maxVisualBand = float(uNumBands - excludedBands - 1);
        
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
        float volume = isLeftArc ? leftVolume : rightVolume;
        
        // Add smooth blending at bottom center where arcs meet
        // Create a blend zone near the vertical center (x ≈ 0) at the bottom
        float blendZoneWidth = 0.05; // Width of blend zone as fraction of screen (adjust as needed)
        float distFromCenter = abs(toPixel.x); // Distance from vertical center
        float blendFactor = 1.0;
        
        // Only blend at the bottom (y < 0) and near center
        if (toPixel.y < 0.0 && distFromCenter < blendZoneWidth) {
            // Smooth transition: 1.0 at edges, 0.5 at center
            // At center (x = 0), blendFactor = 0.0, so we'll mix both channels equally
            // At edges of blend zone, blendFactor = 1.0, so we use the original channel
            blendFactor = smoothstep(0.0, blendZoneWidth, distFromCenter);
        }
        
        // Blend volumes based on position and blend factor
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
        
        // Round the bottom center where left and right arcs meet
        // Scale corner round size to match the coordinate space (same as targetRadius)
        float cornerRoundSize = uCornerRoundSize * viewportScale;
        // Calculate corner distance in aspect-corrected, viewport-scaled space to match dist calculation
        float distToVerticalCenter = abs(toPixelAspectCorrected.x * viewportScale);
        float distBelowCenter = max(0.0, -toPixelAspectCorrected.y * viewportScale);
        // Create rounded transition at bottom center using distance from corner
        float cornerDist = length(vec2(distToVerticalCenter, distBelowCenter));
        float cornerRound = smoothstep(cornerRoundSize * 1.5, 0.0, cornerDist);
        float cornerRadiusAdjust = cornerRound * cornerRoundSize * 0.5;
        
        // Apply corner rounding to final radius
        float finalRadius = targetRadius - cornerRadiusAdjust;
        
        // Calculate arc outline border (similar to mask border)
        float arcBorderFactor = 0.0;
        
        if (uArcBorderWidth > 0.0) {
            // Calculate inner and outer edges of border around arc outline
            // Scale border width to match scaled coordinate space (same as targetRadius)
            float borderHalfWidth = (uArcBorderWidth * 0.5) * viewportScale;
            float innerEdge = finalRadius - borderHalfWidth;
            float outerEdge = finalRadius + borderHalfWidth;
            
            // Apply feathering on inner and outer edges
            // Scale feathering to match scaled coordinate space (same as targetRadius)
            float scaledInnerFeathering = uArcBorderInnerFeathering * viewportScale;
            float scaledOuterFeathering = uArcBorderOuterFeathering * viewportScale;
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
        float maskBorderFactor = 0.0;
        
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
                float borderHalfWidth = (uMaskBorderWidth * 0.5) * viewportScale;
                float innerEdge = scaledMaskRadius - borderHalfWidth;
                float outerEdge = scaledMaskRadius + borderHalfWidth;
                
                // Apply feathering on inner and outer edges
                // Scale feathering to match scaled coordinate space (same as targetRadius)
                float scaledMaskInnerFeathering = uMaskBorderInnerFeathering * viewportScale;
                float scaledMaskOuterFeathering = uMaskBorderOuterFeathering * viewportScale;
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
        float finalFactor = insideFactor * maskFactor;
        
        // Render border if present (border is visible regardless of mask factor)
        if (arcBorderFactor > 0.0 || maskBorderFactor > 0.0 || finalFactor > 0.0) {
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
            vec3 colorInterpolated = mapNoiseToColor(
                volume,  // Use volume (amplitude) for color mapping
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10,
                uColorTransitionWidth
            );
            
            // Multi-band color smoothing: sample multiple bands and weight by distance
            vec3 colorBlended = vec3(0.0);
            float totalWeight = 0.0;
            
            if (uColorSmoothing > 0.0 && uColorSmoothingRadius > 0.0) {
                // Sample bands within the smoothing radius
                // Use constant loop bound (GLSL requirement) - early exits optimize performance
                float smoothingRadius = uColorSmoothingRadius;
                const int maxSamples = 10; // Constant for GLSL loop bounds
                float sampleStep = 0.5;
                
                for (int i = 0; i < maxSamples; i++) {
                    // Calculate sample band index from loop iteration
                    float sampleOffset = (float(i) - float(maxSamples) * 0.5) * sampleStep;
                    float sampleBand = bandIndex + sampleOffset;
                    
                    // Skip if outside smoothing radius (naturally limits iterations for small radius)
                    float dist = abs(sampleOffset);
                    if (dist > smoothingRadius) continue;
                    
                    // Skip if too close to current band (redundant sample)
                    if (abs(sampleOffset) < 0.1) continue;
                    
                    // Clamp to valid range (excluding top bands)
                    float clampedBand = clamp(sampleBand, 0.0, float(uNumBands - excludedBands - 1));
                    
                    // Map visual band index to measured band space (like strings shader)
                    float maxVisualBand = float(uNumBands - excludedBands - 1);
                    float normalizedSampleBand = clampedBand / max(maxVisualBand, 1.0);
                    float measuredSampleBandIndex = normalizedSampleBand * (uMeasuredBands - 1.0);
                    
                    // Weight decreases with distance (Gaussian-like falloff)
                    float weight = exp(-dist * dist / (smoothingRadius * smoothingRadius * 0.5));
                    
                    // Early exit when weight becomes negligible
                    if (weight < 0.01) break;
                    
                    // Sample frequency data for this band using measured band coordinates
                    float bandX = (measuredSampleBandIndex + 0.5) / uMeasuredBands;
                    vec4 sampleFreqData = texture2D(uFrequencyTexture, vec2(bandX, 0.5));
                    float sampleVolume = isLeftArc ? sampleFreqData.r : sampleFreqData.a;
                    
                    // Calculate color for this band
                    vec3 sampleColor = mapNoiseToColor(
                        sampleVolume,
                        threshold1, threshold2, threshold3, threshold4, threshold5,
                        threshold6, threshold7, threshold8, threshold9, threshold10,
                        uColorTransitionWidth
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
            vec3 arcColor = mix(colorInterpolated, colorBlended, uColorSmoothing);
            
            // Render arc shape
            if (finalFactor > 0.0) {
                finalColor = mix(finalColor, arcColor, finalFactor);
            }
            
            // Render arc outline border (visible both inside and outside the arc)
            if (arcBorderFactor > 0.0) {
                // Calculate BPM-based animation speed with minimum fallback
                float minSpeed = 0.1;
                float bpmSpeed = (uBPM > 0.0) ? (uBPM / 120.0) : minSpeed;
                float baseAnimationSpeed = max(bpmSpeed, minSpeed);
                
                // Apply beat-based speed boost (similar to refraction shader)
                float beatSpeedBoost = 1.0;
                const float BEAT_TIME_THRESHOLD = 0.3; // Time window for recent beat detection (seconds)
                const float BEAT_INTENSITY_THRESHOLD = 0.5; // Minimum intensity to trigger boost
                const float MAX_SPEED_BOOST = 2.0; // Maximum speed multiplier on strong beats
                
                // Check for recent bass or mid beats
                bool hasBassBeat = (uBeatTimeBass < BEAT_TIME_THRESHOLD && uBeatIntensityBass > BEAT_INTENSITY_THRESHOLD);
                bool hasMidBeat = (uBeatTimeMid < BEAT_TIME_THRESHOLD && uBeatIntensityMid > BEAT_INTENSITY_THRESHOLD);
                
                if (hasBassBeat || hasMidBeat) {
                    // Get maximum beat intensity
                    float maxBeatIntensity = 0.0;
                    if (hasBassBeat) {
                        maxBeatIntensity = max(maxBeatIntensity, uBeatIntensityBass);
                    }
                    if (hasMidBeat) {
                        maxBeatIntensity = max(maxBeatIntensity, uBeatIntensityMid);
                    }
                    
                    // Map intensity (BEAT_INTENSITY_THRESHOLD to 1.0) to speed boost (1.0 to MAX_SPEED_BOOST)
                    float intensityFactor = (maxBeatIntensity - BEAT_INTENSITY_THRESHOLD) / (1.0 - BEAT_INTENSITY_THRESHOLD);
                    intensityFactor = clamp(intensityFactor, 0.0, 1.0);
                    beatSpeedBoost = 1.0 + intensityFactor * (MAX_SPEED_BOOST - 1.0);
                }
                
                float animationSpeed = baseAnimationSpeed * uArcBorderNoiseSpeed * beatSpeedBoost;
                float noiseTime = uTime * animationSpeed;
                
                // Use Cartesian coordinates scaled by reference radius to avoid distortion
                // Scale reference radius by DPR to maintain consistent noise detail
                float referenceRadius = 0.1 * dprScale;
                float noiseScale = 1.0 / referenceRadius;
                vec2 noiseUV = toPixelScaled * noiseScale;
                
                // Add time offset for animation
                // Scale time offset by DPR to maintain consistent animation speed
                vec2 timeOffset = vec2(noiseTime * 0.1 * dprScale, noiseTime * 0.15 * dprScale);
                noiseUV += timeOffset;
                
                float noiseValue = fbm2_standard(noiseUV, noiseTime, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
                
                // Apply same processing as mask border
                float volumeScale = calculateVolumeScale(uVolume);
                float feed = noiseValue * volumeScale;
                
                float aspectRatio = uResolution.x / uResolution.y;
                vec2 borderUV = toPixelScaled;
                float stereoBrightness = calculateStereoBrightness(
                    borderUV, aspectRatio,
                    uBassStereo, uMidStereo, uTrebleStereo,
                    uBass, uMid, uTreble
                );
                feed *= stereoBrightness;
                feed = applySoftCompression(feed, 0.7, 0.3);
                feed = feed * uArcBorderNoiseMultiplier;
                feed = clamp(feed, 0.0, 1.0);
                
                // Map to color using same method
                vec3 borderColor = mapNoiseToColor(
                    feed,
                    threshold1, threshold2, threshold3, threshold4, threshold5,
                    threshold6, threshold7, threshold8, threshold9, threshold10,
                    uColorTransitionWidth
                );
                
                // Apply blur to border color if enabled
                if (uBorderNoiseBlur > 0.0) {
                    vec3 blurredColor = borderColor;
                    float sampleCount = 1.0;
                    // Blur distance in noise UV space - use a larger value for visible effect
                    // Scale by blur amount (0.0-1.0) to control intensity
                    // Scale by DPR to maintain consistent blur appearance across screen densities
                    float blurDistance = 0.1 * uBorderNoiseBlur * dprScale;
                    
                    // Sample neighboring positions in noise space
                    // Use cross pattern (5 samples) for better performance
                    for (int i = -1; i <= 1; i++) {
                        for (int j = -1; j <= 1; j++) {
                            if (i == 0 && j == 0) continue;
                            
                            // Only use cross pattern (i == 0 || j == 0) for better performance
                            if (i != 0 && j != 0) continue; // Skip diagonal samples
                            
                            // Calculate offset in noise UV space
                            vec2 offsetNoiseUV = noiseUV + vec2(float(i), float(j)) * blurDistance;
                            
                            // Sample noise at offset position
                            float offsetNoiseValue = fbm2_standard(offsetNoiseUV, noiseTime, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
                            
                            // Apply same processing as main noise
                            float offsetFeed = offsetNoiseValue * volumeScale;
                            offsetFeed *= stereoBrightness;
                            offsetFeed = applySoftCompression(offsetFeed, 0.7, 0.3);
                            offsetFeed = offsetFeed * uArcBorderNoiseMultiplier;
                            offsetFeed = clamp(offsetFeed, 0.0, 1.0);
                            
                            // Map to color
                            vec3 offsetColor = mapNoiseToColor(
                                offsetFeed,
                                threshold1, threshold2, threshold3, threshold4, threshold5,
                                threshold6, threshold7, threshold8, threshold9, threshold10,
                                uColorTransitionWidth
                            );
                            
                            blurredColor += offsetColor;
                            sampleCount += 1.0;
                        }
                    }
                    
                    blurredColor /= sampleCount;
                    borderColor = mix(borderColor, blurredColor, uBorderNoiseBlur);
                }
                
                finalColor = mix(finalColor, borderColor, arcBorderFactor);
            }
            
            // Render mask border (visible both inside and outside mask)
            if (maskBorderFactor > 0.0) {
                // Calculate BPM-based animation speed with minimum fallback
                // Convert BPM to time multiplier: higher BPM = faster animation
                // Use minimum speed of 0.1 (10% of base speed) when no BPM detected
                float minSpeed = 0.1;
                float bpmSpeed = (uBPM > 0.0) ? (uBPM / 120.0) : minSpeed; // Normalize to 120 BPM = 1.0x speed
                float baseAnimationSpeed = max(bpmSpeed, minSpeed); // Ensure minimum speed
                
                // Apply beat-based speed boost (similar to refraction shader)
                float beatSpeedBoost = 1.0;
                const float BEAT_TIME_THRESHOLD = 0.3; // Time window for recent beat detection (seconds)
                const float BEAT_INTENSITY_THRESHOLD = 0.5; // Minimum intensity to trigger boost
                const float MAX_SPEED_BOOST = 2.0; // Maximum speed multiplier on strong beats
                
                // Check for recent bass or mid beats
                bool hasBassBeat = (uBeatTimeBass < BEAT_TIME_THRESHOLD && uBeatIntensityBass > BEAT_INTENSITY_THRESHOLD);
                bool hasMidBeat = (uBeatTimeMid < BEAT_TIME_THRESHOLD && uBeatIntensityMid > BEAT_INTENSITY_THRESHOLD);
                
                if (hasBassBeat || hasMidBeat) {
                    // Get maximum beat intensity
                    float maxBeatIntensity = 0.0;
                    if (hasBassBeat) {
                        maxBeatIntensity = max(maxBeatIntensity, uBeatIntensityBass);
                    }
                    if (hasMidBeat) {
                        maxBeatIntensity = max(maxBeatIntensity, uBeatIntensityMid);
                    }
                    
                    // Map intensity (BEAT_INTENSITY_THRESHOLD to 1.0) to speed boost (1.0 to MAX_SPEED_BOOST)
                    float intensityFactor = (maxBeatIntensity - BEAT_INTENSITY_THRESHOLD) / (1.0 - BEAT_INTENSITY_THRESHOLD);
                    intensityFactor = clamp(intensityFactor, 0.0, 1.0);
                    beatSpeedBoost = 1.0 + intensityFactor * (MAX_SPEED_BOOST - 1.0);
                }
                
                // Apply user-configurable speed multiplier
                float animationSpeed = baseAnimationSpeed * uMaskBorderNoiseSpeed * beatSpeedBoost;
                float noiseTime = uTime * animationSpeed;
                
                // Use Cartesian coordinates scaled by reference radius to avoid distortion
                // Scale by a reference radius (use base mask radius or fixed value) to keep noise consistent
                // This prevents "panning" while avoiding polar coordinate distortion
                // Scale reference radius by DPR to maintain consistent noise detail
                float referenceRadius = 0.1 * dprScale; // Fixed reference for consistent noise scale
                float noiseScale = 1.0 / referenceRadius; // Normalize by reference
                vec2 noiseUV = toPixelScaled * noiseScale;
                
                // Add time offset for animation (in spatial coordinates to avoid distortion)
                // Scale time offset by DPR to maintain consistent animation speed
                vec2 timeOffset = vec2(noiseTime * 0.1 * dprScale, noiseTime * 0.15 * dprScale);
                noiseUV += timeOffset;
                
                float noiseValue = fbm2_standard(noiseUV, noiseTime, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
                
                // Apply same processing as heightmap shader
                // Scale feed based on volume - quieter songs stay darker
                float volumeScale = calculateVolumeScale(uVolume);
                float feed = noiseValue * volumeScale;
                
                // Calculate stereo brightness for border (use center position for stereo)
                float aspectRatio = uResolution.x / uResolution.y;
                vec2 borderUV = toPixelScaled;
                float stereoBrightness = calculateStereoBrightness(
                    borderUV, aspectRatio,
                    uBassStereo, uMidStereo, uTrebleStereo,
                    uBass, uMid, uTreble
                );
                feed *= stereoBrightness;
                
                // Soft compression for high values (prevents washout during loud sections)
                feed = applySoftCompression(feed, 0.7, 0.3);
                
                // Apply configurable multiplier before color mapping
                feed = feed * uMaskBorderNoiseMultiplier;
                
                // Clamp feed to valid range
                feed = clamp(feed, 0.0, 1.0);
                
                // Map to color using same method as heightmap (thresholds already calculated above)
                vec3 borderColor = mapNoiseToColor(
                    feed,
                    threshold1, threshold2, threshold3, threshold4, threshold5,
                    threshold6, threshold7, threshold8, threshold9, threshold10,
                    uColorTransitionWidth
                );
                
                // Apply blur to border color if enabled
                if (uBorderNoiseBlur > 0.0) {
                    vec3 blurredColor = borderColor;
                    float sampleCount = 1.0;
                    // Blur distance in noise UV space - use a larger value for visible effect
                    // Scale by blur amount (0.0-1.0) to control intensity
                    // Scale by DPR to maintain consistent blur appearance across screen densities
                    float blurDistance = 0.1 * uBorderNoiseBlur * dprScale;
                    
                    // Sample neighboring positions in noise space
                    // Use cross pattern (5 samples) for better performance
                    for (int i = -1; i <= 1; i++) {
                        for (int j = -1; j <= 1; j++) {
                            if (i == 0 && j == 0) continue;
                            
                            // Only use cross pattern (i == 0 || j == 0) for better performance
                            if (i != 0 && j != 0) continue; // Skip diagonal samples
                            
                            // Calculate offset in noise UV space
                            vec2 offsetNoiseUV = noiseUV + vec2(float(i), float(j)) * blurDistance;
                            
                            // Sample noise at offset position
                            float offsetNoiseValue = fbm2_standard(offsetNoiseUV, noiseTime, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
                            
                            // Apply same processing as main noise
                            float offsetFeed = offsetNoiseValue * volumeScale;
                            offsetFeed *= stereoBrightness;
                            offsetFeed = applySoftCompression(offsetFeed, 0.7, 0.3);
                            offsetFeed = offsetFeed * uMaskBorderNoiseMultiplier;
                            offsetFeed = clamp(offsetFeed, 0.0, 1.0);
                            
                            // Map to color
                            vec3 offsetColor = mapNoiseToColor(
                                offsetFeed,
                                threshold1, threshold2, threshold3, threshold4, threshold5,
                                threshold6, threshold7, threshold8, threshold9, threshold10,
                                uColorTransitionWidth
                            );
                            
                            blurredColor += offsetColor;
                            sampleCount += 1.0;
                        }
                    }
                    
                    blurredColor /= sampleCount;
                    borderColor = mix(borderColor, blurredColor, uBorderNoiseBlur);
                }
                
                finalColor = mix(finalColor, borderColor, maskBorderFactor);
            }
        }
    }
    
    // Apply contrast adjustment
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
        // Calculate distance from center in aspect-corrected, viewport-scaled space
        vec2 toPixel = uv - center;
        vec2 toPixelAspectCorrected = vec2(toPixel.x * aspectRatio, toPixel.y);
        vec2 toPixelScaled = toPixelAspectCorrected * viewportScale;
        float distFromCenter = length(toPixelScaled);
        
        // Calculate actual arc radius at this position (matches arc shape)
        float arcRadius = calculateArcRadiusAtPosition(uv, center, aspectRatio, viewportScale);
        
        // Calculate contrast mask distances
        // Mask is strongest near arcs, fades out further away
        float expandedRadius = arcRadius + uContrastMaskStartDistance * viewportScale;
        float maskStart = expandedRadius; // Start of mask (near arc, full contrast)
        float maskEnd = maskStart + uContrastMaskFeathering * viewportScale; // End of mask (far from arc, no contrast)
        
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
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}

