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
uniform float uContrast; // Contrast adjustment (1.0 = normal, >1.0 = more contrast)
uniform float uContrastAudioReactive; // How much audio affects contrast (0.0-1.0)
uniform float uContrastMin; // Minimum contrast (at quiet audio)
uniform float uContrastMax; // Maximum contrast (at loud audio)
uniform float uSmoothedContrastAudioLevel; // Smoothed audio level for contrast (from JS with attack/release)

#define PI 3.14159265359

// FBM parameters for mask border noise
#define FBM_OCTAVES     7
#define FBM_LACUNARITY  1.2
#define FBM_GAIN        0.4
#define FBM_SCALE       1.2

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / uResolution;
    
    // Convert to polar coordinates relative to center
    // Account for aspect ratio to keep circles circular
    float aspectRatio = uResolution.x / uResolution.y;
    vec2 center = vec2(uCenterX, uCenterY);
    vec2 toPixel = uv - center;
    // Scale x by aspect ratio to maintain circular shape
    vec2 toPixelScaled = vec2(toPixel.x * aspectRatio, toPixel.y);
    float angle = atan(toPixel.y, toPixel.x);
    float dist = length(toPixelScaled);
    
    // Determine which arc (left or right side of screen)
    // Split vertically: left side = left channel, right side = right channel
    // Each arc spans 180 degrees: from PI/2 (top) to -PI/2 (bottom)
    bool isLeftArc = (toPixel.x < 0.0);
    bool isRightArc = (toPixel.x >= 0.0);
    
    // Initialize with background color
    vec3 finalColor = uColor10;
    float finalAlpha = 1.0;
    
    if (isLeftArc || isRightArc) {
        // Map position along arc to band index
        // Both arcs span 180 degrees: full semicircle from top to bottom
        // Bottom of arc (low freq) = band 0, top of arc (high freq) = band numBands-1
        // Use the angle's vertical component (angle from horizontal)
        // For a semicircle, we can use the y-component relative to the arc's extent
        // Calculate the angle from the vertical axis (simpler: use angle from horizontal)
        float verticalAngle;
        if (dist > 0.001) {
            // Calculate angle from horizontal using scaled coordinates for consistency
            // toPixelScaled.y = toPixel.y (y wasn't scaled), but use scaled for clarity
            verticalAngle = asin(clamp(toPixelScaled.y / dist, -1.0, 1.0));
        } else {
            verticalAngle = 0.0;
        }
        // verticalAngle ranges from -PI/2 (bottom) to PI/2 (top)
        // Map to [0, 1] where 0 = bottom, 1 = top
        float normalizedPosition = (verticalAngle + PI/2.0) / PI;
        normalizedPosition = clamp(normalizedPosition, 0.0, 1.0);
        float bandIndex = normalizedPosition * (float(uNumBands) - 1.0);
        
        // Clamp band index to valid range
        bandIndex = clamp(bandIndex, 0.0, float(uNumBands) - 1.0);
        
        // Sample frequency texture with interpolation between bands for smoother radius transitions
        // Use fractional part of bandIndex to interpolate between adjacent bands
        float bandIndexFloor = floor(bandIndex);
        float bandIndexFrac = bandIndex - bandIndexFloor;
        float bandIndexCeil = min(bandIndexFloor + 1.0, float(uNumBands) - 1.0);
        
        // Sample current and adjacent bands
        float bandXFloor = (bandIndexFloor + 0.5) / float(uNumBands);
        float bandXCeil = (bandIndexCeil + 0.5) / float(uNumBands);
        vec4 freqDataFloor = texture2D(uFrequencyTexture, vec2(bandXFloor, 0.5));
        vec4 freqDataCeil = texture2D(uFrequencyTexture, vec2(bandXCeil, 0.5));
        
        // Interpolate between bands for smooth radius transitions
        vec4 freqData = mix(freqDataFloor, freqDataCeil, bandIndexFrac);
        
        // Get volume for appropriate channel
        float volume = isLeftArc ? freqData.r : freqData.a;
        
        // Calculate target radius based on volume
        float targetRadius = uBaseRadius + volume * uMaxRadiusOffset;
        
        // Round the bottom center where left and right arcs meet to smooth the corner
        float cornerRoundSize = uCornerRoundSize;
        float distToVerticalCenter = abs(toPixel.x); // Distance from vertical center line
        float distBelowCenter = max(0.0, -toPixel.y); // Distance below horizontal center
        // Create rounded transition at bottom center using distance from corner
        float cornerDist = length(vec2(distToVerticalCenter, distBelowCenter));
        float cornerRound = smoothstep(cornerRoundSize * 1.5, 0.0, cornerDist);
        float cornerRadiusAdjust = cornerRound * cornerRoundSize * 0.5;
        
        // Apply corner rounding to final radius
        float finalRadius = targetRadius - cornerRadiusAdjust;
        
        // Check if pixel is inside the arc shape
        // Use smoothstep for anti-aliasing at the edge
        float edgeSmooth = 0.002; // Small smoothing for anti-aliasing
        float insideFactor = smoothstep(finalRadius + edgeSmooth, finalRadius - edgeSmooth, dist);
        
        // Apply subtractive mask: cut out center if pixel is within mask radius
        float maskFactor = 1.0;
        float maskBorderFactor = 0.0;
        
        if (uMaskRadius > 0.0) {
            // Check if pixel is inside the mask radius (subtract it)
            float maskInside = smoothstep(uMaskRadius + edgeSmooth, uMaskRadius - edgeSmooth, dist);
            maskFactor = 1.0 - maskInside; // Invert: 0.0 inside mask, 1.0 outside mask
            
            // Render border around mask radius (visible both inside and outside)
            if (uMaskBorderWidth > 0.0) {
                // Calculate inner and outer edges of border
                float borderHalfWidth = uMaskBorderWidth * 0.5;
                float innerEdge = uMaskRadius - borderHalfWidth;
                float outerEdge = uMaskRadius + borderHalfWidth;
                
                // Apply feathering on inner and outer edges
                float innerFeatherStart = innerEdge - uMaskBorderInnerFeathering;
                float innerFeatherEnd = innerEdge;
                float outerFeatherStart = outerEdge;
                float outerFeatherEnd = outerEdge + uMaskBorderOuterFeathering;
                
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
        if (maskBorderFactor > 0.0 || finalFactor > 0.0) {
            // Calculate frequency thresholds for color mapping
            float threshold1, threshold2, threshold3, threshold4, threshold5;
            float threshold6, threshold7, threshold8, threshold9, threshold10;
            calculateAllFrequencyThresholds(
                0.0,  // No bayer dithering
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
                // Use fixed loop count (max 10 samples = 5 bands on each side)
                // This allows GLSL to compile while still providing good smoothing
                const int maxSamples = 10;
                float smoothingRadius = uColorSmoothingRadius;
                float sampleStep = 0.5;
                
                for (int i = 0; i < maxSamples; i++) {
                    // Calculate sample band index from loop iteration
                    float sampleOffset = (float(i) - float(maxSamples) * 0.5) * sampleStep;
                    float sampleBand = bandIndex + sampleOffset;
                    
                    // Skip if outside smoothing radius
                    float dist = abs(sampleOffset);
                    if (dist > smoothingRadius) continue;
                    
                    // Clamp to valid range
                    float clampedBand = clamp(sampleBand, 0.0, float(uNumBands) - 1.0);
                    
                    // Weight decreases with distance (Gaussian-like falloff)
                    float weight = exp(-dist * dist / (smoothingRadius * smoothingRadius * 0.5));
                    
                    // Sample frequency data for this band
                    float bandX = (clampedBand + 0.5) / float(uNumBands);
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
            
            // Render mask border (visible both inside and outside mask)
            if (maskBorderFactor > 0.0) {
                // Calculate BPM-based animation speed with minimum fallback
                // Convert BPM to time multiplier: higher BPM = faster animation
                // Use minimum speed of 0.1 (10% of base speed) when no BPM detected
                float minSpeed = 0.1;
                float bpmSpeed = (uBPM > 0.0) ? (uBPM / 120.0) : minSpeed; // Normalize to 120 BPM = 1.0x speed
                float baseAnimationSpeed = max(bpmSpeed, minSpeed); // Ensure minimum speed
                // Apply user-configurable speed multiplier
                float animationSpeed = baseAnimationSpeed * uMaskBorderNoiseSpeed;
                float noiseTime = uTime * animationSpeed;
                
                // Use Cartesian coordinates scaled by reference radius to avoid distortion
                // Scale by a reference radius (use base mask radius or fixed value) to keep noise consistent
                // This prevents "panning" while avoiding polar coordinate distortion
                float referenceRadius = 0.1; // Fixed reference for consistent noise scale
                float noiseScale = 1.0 / referenceRadius; // Normalize by reference
                vec2 noiseUV = toPixelScaled * noiseScale;
                
                // Add time offset for animation (in spatial coordinates to avoid distortion)
                vec2 timeOffset = vec2(noiseTime * 0.1, noiseTime * 0.15);
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
    
    // Apply contrast adjustment
    // Formula: (color - 0.5) * contrast + 0.5
    // Safety check: if contrast is 0.0 or invalid, default to 1.0 (no change)
    if (abs(contrastValue - 1.0) > 0.001) {
        finalColor = (finalColor - 0.5) * contrastValue + 0.5;
        finalColor = clamp(finalColor, 0.0, 1.0);
    }
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}

