precision highp float;

// Include common code
#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"
#include "common/color-mapping.glsl"
#include "common/ripples.glsl"
#include "common/screen-adaptation.glsl"

// Refraction-specific uniforms
uniform float uOuterGridSize;  // Number of cells in outer grid (e.g., 8.0 = 8x8 grid)
uniform float uInnerGridSize;  // Number of cells in inner grid (e.g., 8.0 = 8x8 sub-grid)
uniform float uBlurStrength;   // Strength of blur effect (0.0-2.0)
uniform float uOffsetStrength; // Strength of position offset (0.0-0.1)
uniform float uPixelizeLevels; // Number of quantization levels for pixelization (0.0 = disabled, >0 = number of steps)
uniform float uCellBrightnessVariation; // Amount of brightness variation per cell (0.0-0.2, default 0.05 = 5%)
uniform float uCellAnimNote1;  // Animation cycle duration as fraction of bar (e.g., 0.25 = 1/4 bar)
uniform float uCellAnimNote2;  // Animation cycle duration as fraction of bar (e.g., 0.125 = 1/8 bar)
uniform float uCellAnimNote3;  // Animation cycle duration as fraction of bar (e.g., 0.5 = 1/2 bar)
uniform float uDistortionStrength; // Multiplier for bass-reactive radial distortion (0.0 = disabled, 1.0 = default)
uniform float uDistortionSize; // Size/radius of distortion effect (0.0 = center only, 1.0 = full screen, >1.0 = extends beyond screen)
uniform float uDistortionFalloff; // Easing curve for distortion falloff (1.0 = linear, 2.0 = smooth, 4.0 = very sharp)
uniform float uDistortionPerspectiveStrength; // Strength of center perspective scaling (0.0 = no scaling, 1.0 = default, 2.0 = double)
uniform float uDistortionEasing; // Easing type for bass interpolation (0.0 = linear, 1.0 = smooth, 2.0 = exponential)

// Tempo-smoothed values (calculated in JavaScript with BPM-based attack/release)
uniform float uSmoothedVolumeScale;      // Smoothed volume scale (0.3 to 1.0) - replaces instant calculation
uniform float uSmoothedFbmZoom;             // Smoothed FBM zoom factor (1.0 to maxZoom)

// Shader-specific constants
#define FBM_OCTAVES     6
#define FBM_LACUNARITY  1.35
#define FBM_GAIN        0.65
#define FBM_SCALE       1.25

// Beat detection constants
#define BEAT_TIME_THRESHOLD 0.25      // Time window for recent beat detection (seconds)
#define BEAT_INTENSITY_THRESHOLD 0.5 // Minimum intensity to trigger beat
#define BEAT_GRID_BOOST 6.0          // Grid size boost when beat detected

// Animation constants
#define ANIMATION_MULTIPLIER 0.3     // Brightness animation multiplier
#define FREQ_VARIATION_RANGE 0.3     // Frequency variation range (30%)

// Blur constants
#define BASE_BLUR_RADIUS 0.5        // Base blur radius as fraction of screen (1%)
#define MIN_BLUR_RADIUS 0.05        // Minimum blur radius (0.5% of screen)
#define BLUR_WEIGHT 0.5             // Weight for blur samples

// Brightness constants
#define RIPPLE_BRIGHTNESS_SCALE 0.02 // Scale for ripple brightness boost
#define DISTANCE_STRENGTH_MIN 0.3    // Minimum distance-based strength (center)
#define DISTANCE_STRENGTH_MAX 1.0    // Maximum distance-based strength (edge)
#define DISTANCE_STRENGTH_RANGE 0.7  // Range for distance-based strength interpolation

// Distortion constants
#define DISTORTION_MAX_STRENGTH 0.15  // Maximum distortion strength (15% of screen)

// Refraction-specific functions
// Quantize/pixelize a value into discrete steps
float pixelize(float value, float levels) {
    if (levels <= 0.0) return value; // No pixelization if levels is 0 or negative
    return floor(value * levels) / levels;
}

// Check for recent bass or mid beats and return grid boost amount
// Returns BEAT_GRID_BOOST if recent beat detected, 0.0 otherwise
float getBeatGridBoost() {
    // Check bass beat (primary trigger for ripples)
    bool hasBassBeat = (uBeatTimeBass < BEAT_TIME_THRESHOLD && uBeatIntensityBass > BEAT_INTENSITY_THRESHOLD);
    
    // Check mid beat (secondary trigger)
    bool hasMidBeat = (uBeatTimeMid < BEAT_TIME_THRESHOLD && uBeatIntensityMid > BEAT_INTENSITY_THRESHOLD);
    
    // Apply grid boost instantly when beat detected
    return (hasBassBeat || hasMidBeat) ? BEAT_GRID_BOOST : 0.0;
}

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

// Apply radial pincushion distortion (like looking into a sphere)
// Strongest at edges, weakest at center
// Center appears to recede while staying flat
// Reacts to bass intensity
vec2 applyBassDistortion(vec2 uv, float aspectRatio, float bassIntensity) {
    // Convert to centered coordinates
    vec2 centeredUV = uv;
    
    // Calculate distance from center
    vec2 centerToUV = centeredUV;
    float distFromCenter = length(centerToUV);
    
    // Normalize distance (0 = center, 1 = edge of screen)
    // Use aspect ratio to get proper distance in screen space
    float maxDist = length(vec2(aspectRatio * 0.5, 0.5));
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
    vec2 direction = normalize(centerToUV);
    vec2 distortion = direction * -distortionAmount; // Negative = pull inward
    
    // Add perspective scaling: scale center down to make it appear to recede
    // Stronger scaling at center, weaker at edges
    // uDistortionPerspectiveStrength controls the strength (replaces hardcoded 0.3)
    float centerFalloff = 1.0 - sizeAdjustedDist; // Inverse: strong at center, weak at edges
    float perspectiveScale = 1.0 - (easedBassStrength * DISTORTION_MAX_STRENGTH * centerFalloff * uDistortionStrength * uDistortionPerspectiveStrength);
    perspectiveScale = clamp(perspectiveScale, 0.7, 1.0); // Limit scaling to prevent too much zoom
    
    // Apply both distortion and perspective scaling
    vec2 distortedUV = (uv + distortion) * perspectiveScale;
    
    return distortedUV;
}

// Sample noise with refraction distortion
// Applies blur and offset at two grid levels
// Each cell acts like a separate pane of glass viewing the noise from a different angle
float sampleNoiseWithRefraction(vec2 uv, float aspectRatio, float t) {
    // uv is in centered space: x in [-aspectRatio/2, aspectRatio/2], y in [-0.5, 0.5]
    // Convert to [0,1] space for grid calculations
    vec2 normalizedUV = vec2(
        (uv.x / aspectRatio + 0.5),
        (uv.y + 0.5)
    );
    
    // Beat-triggered grid size change: use same beat detection as ripples
    float beatGridBoost = getBeatGridBoost();
    
    // Use tempo-smoothed FBM zoom factor (calculated in JavaScript with attack/release)
    // Smoothed value is always set in JavaScript, so use it directly
    // Fallback to 1.0 (no zoom) if uniform not available
    float fbmZoomFactor = (uSmoothedFbmZoom > 0.001 || uSmoothedFbmZoom < -0.001) ? uSmoothedFbmZoom : 1.0;
    
    // Calculate outer grid cell with beat boost
    float baseOuterGridSize = max(2.0, uOuterGridSize);
    float outerGridSize = baseOuterGridSize + beatGridBoost;
    vec2 outerCellSize = vec2(1.0) / outerGridSize;
    vec2 outerCellId = floor(normalizedUV / outerCellSize);
    vec2 outerCellUV = fract(normalizedUV / outerCellSize);
    
    // Generate random offset for outer cell (consistent per cell)
    vec2 outerHash = hash22(outerCellId);
    
    // Calculate inner grid cell (within outer cell) with beat boost
    // outerCellUV is already fract(normalizedUV / outerCellSize), so use it directly
    float baseInnerGridSize = max(2.0, uInnerGridSize);
    float innerGridSize = baseInnerGridSize + beatGridBoost;
    vec2 innerCellSize = outerCellSize / innerGridSize;
    vec2 innerCellId = floor(outerCellUV / innerCellSize);
    
    // Generate random offset for inner cell (consistent per sub-cell)
    // Each inner cell gets its own unique hash based on both outer and inner cell IDs
    vec2 innerHash = hash22(outerCellId * 100.0 + innerCellId);
    
    // Generate random offset for each cell - creates visible boundaries
    // Calculate distance from center to apply distance-based offset strength
    // Distance from center: 0.0 (center) to ~0.707 (corner)
    vec2 centerToUV = normalizedUV - vec2(0.5, 0.5);
    float distFromCenter = length(centerToUV);
    float maxDist = length(vec2(0.5, 0.5)); // Maximum distance (corner)
    float normalizedDist = distFromCenter / maxDist; // 0.0 (center) to 1.0 (corner)
    
    // Offset strength: weaker in center, stronger at edges
    // Smooth interpolation from center to edge
    float distanceBasedStrength = DISTANCE_STRENGTH_MIN + normalizedDist * DISTANCE_STRENGTH_RANGE;
    
    // Outer offset: scaled by outer cell size and distance from center
    vec2 outerOffset = (outerHash - 0.5) * 2.0 * uOffsetStrength * distanceBasedStrength;
    vec2 outerOffsetInUV = outerOffset * vec2(aspectRatio, 1.0) * outerCellSize * 2.0;
    
    // Inner offset: scaled by inner cell size and distance from center
    // This makes inner cell offsets visible and proportional to inner cell size
    vec2 innerOffset = (innerHash - 0.5) * 2.0 * uOffsetStrength * distanceBasedStrength;
    // Make inner offset more visible - scale it larger relative to inner cell size
    vec2 innerOffsetInUV = innerOffset * vec2(aspectRatio, 1.0) * innerCellSize * 4.0;
    
    // Combine offsets - both are now in centered UV space
    vec2 totalOffset = outerOffsetInUV + innerOffsetInUV;
    
    // Sample noise at offset position - each cell samples different part
    // Apply zoom factor to create zoom-out effect during beat animation
    vec2 sampleUV = (uv + totalOffset) * fbmZoomFactor;
    
    // Apply pixelization BEFORE blur so each sample is quantized first
    // This creates visible banding when blur averages the quantized samples
    float sampleNoise = fbm2_standard(sampleUV, t, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
    if (uPixelizeLevels > 0.0) {
        sampleNoise = pixelize(sampleNoise, uPixelizeLevels);
    }
    float noiseValue = sampleNoise;
    
    // Apply blur per-cell - creates frosted glass effect
    // Blur now averages already-quantized samples, creating visible banding
    if (uBlurStrength > 0.0) {
        // Blur radius should be independent of cell size for consistent frost effect
        // Use a fixed fraction of screen space (0.01 = 1% of screen) scaled by blur strength
        // This ensures frost effect is visible regardless of grid size
        float baseBlurRadius = 0.01; // Base blur radius as fraction of screen (1%)
        float blurRadius = baseBlurRadius * uBlurStrength;
        
        // Ensure minimum blur radius so frost effect is always visible even with small cells
        blurRadius = max(blurRadius, MIN_BLUR_RADIUS);
        
        vec2 blurOffset = vec2(blurRadius * aspectRatio, blurRadius);
        
        // 4-directional blur - pixelize each sample before averaging
        float weight = BLUR_WEIGHT; // Reduced weight to preserve cell boundaries
        
        // Sample and pixelize each blur direction
        float sample1 = fbm2_standard(sampleUV + blurOffset, t, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        float sample2 = fbm2_standard(sampleUV - blurOffset, t, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        float sample3 = fbm2_standard(sampleUV + vec2(-blurOffset.y, blurOffset.x), t, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        float sample4 = fbm2_standard(sampleUV + vec2(blurOffset.y, -blurOffset.x), t, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
        
        // Pixelize each sample if pixelization is enabled
        if (uPixelizeLevels > 0.0) {
            sample1 = pixelize(sample1, uPixelizeLevels);
            sample2 = pixelize(sample2, uPixelizeLevels);
            sample3 = pixelize(sample3, uPixelizeLevels);
            sample4 = pixelize(sample4, uPixelizeLevels);
        }
        
        // Average the quantized samples
        noiseValue += sample1 * weight;
        noiseValue += sample2 * weight;
        noiseValue += sample3 * weight;
        noiseValue += sample4 * weight;
        
        noiseValue /= (1.0 + 4.0 * weight);
    }
    
    return noiseValue;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    float aspectRatio = getAspectRatio();
    
    // Calculate UV coordinates
    vec2 uv = fragCoord / uResolution;
    uv = (uv - 0.5) * vec2(aspectRatio, 1.0);
    
    // Apply bass-reactive radial distortion BEFORE noise sampling
    // This warps the entire image with a bulge effect (like looking into a bowl)
    float bassIntensity = uBass; // Use raw bass for immediate response
    uv = applyBassDistortion(uv, aspectRatio, bassIntensity);
    
    // Calculate modulated time using shared function
    float staticTimeOffset = 105.0;
    float baseTimeSpeed = 0.08;
    float modulatedTime = calculateModulatedTime(
        uTime, uTimeOffset, uVolume,
        uBass, uMid, uTreble, uBPM,
        staticTimeOffset, baseTimeSpeed
    );
    
    // Sample noise with refraction effect
    float feed = sampleNoiseWithRefraction(uv, aspectRatio, modulatedTime);
    
    // Scale feed based on volume (use tempo-smoothed volume scale)
    // Smoothed value is always set in JavaScript, so use it directly
    // Fallback to instant calculation only if uniform not available (defaults to 0.0)
    float volumeScale = (uSmoothedVolumeScale > 0.001 || uSmoothedVolumeScale < -0.001) ? uSmoothedVolumeScale : (0.3 + uVolume * 0.7);
    feed = feed * volumeScale;
    
    // Soft compression for high values
    if (feed > 0.7) {
        feed = 0.7 + (feed - 0.7) * 0.3;
    }
    
    // Multiple ripples positioned by stereo field
    float beatRipple = 0.0;
    
    float rippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.5;
    float defaultRippleWidth = uRippleWidth > 0.0 ? uRippleWidth : 0.1;
    float defaultRippleMinRadius = uRippleMinRadius >= 0.0 ? uRippleMinRadius : 0.0;
    float defaultRippleMaxRadius = uRippleMaxRadius > 0.0 ? uRippleMaxRadius : 1.5;
    float defaultRippleIntensityMultiplier = uRippleIntensity >= 0.0 ? uRippleIntensity : 0.4;
    
    float stereoScale = aspectRatio * 0.5;
    
    int maxRipplesInt = MAX_RIPPLES;
    int rippleCount = (uRippleCount < maxRipplesInt) ? uRippleCount : maxRipplesInt;
    for (int i = 0; i < MAX_RIPPLES; i++) {
        if (i >= rippleCount) break;
        
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            vec2 rippleCenter = vec2(uRippleCenterX[i] * stereoScale, uRippleCenterY[i]);
            float rippleAge = uRippleTimes[i];
            float rippleIntensity = uRippleIntensities[i];
            
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : defaultRippleWidth;
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : defaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : defaultRippleMaxRadius;
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : defaultRippleIntensityMultiplier;
            
            float ripple = createRipple(uv, rippleCenter, rippleAge, rippleIntensity, rippleSpeed, rippleWidth, rippleMinRadius, rippleMaxRadius);
            beatRipple += ripple * rippleIntensityMultiplier;
        }
    }
    
    // Add ripple to feed
    feed = feed + beatRipple;
    
    // Ensure feed stays in valid range
    feed = clamp(feed, 0.0, 1.0);
    
    float t = feed;
    
    // Calculate frequency active states using shared function
    float freq1Active, freq2Active, freq3Active, freq4Active, freq5Active;
    float freq6Active, freq7Active, freq8Active, freq9Active, freq10Active;
    calculateFrequencyActiveStates(
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active
    );
    
    // Calculate thresholds using shared function (NO frequency modulation for refraction)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    // For refraction, we use constant thresholds (no bayer dithering in color mapping)
    // But we still need to call the function to get the thresholds
    calculateFrequencyThresholds(
        0.0,  // No bayer dithering for refraction
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active,
        false,  // useFrequencyModulation = false for refraction (constant thresholds)
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map to color using shared function
    float transitionWidth = 0.003;
    vec3 color = mapNoiseToColor(
        t,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        transitionWidth
    );
    
    float coverage = 1.0;
    
    // Add subtle brightness variation per cell to make cells more distinct
    // Calculate cell IDs in main() to apply brightness to final color
    vec2 normalizedUV = vec2(
        (uv.x / aspectRatio + 0.5),
        (uv.y + 0.5)
    );
    
    // Beat-triggered grid size change: use same beat detection as ripples
    float beatGridBoost = getBeatGridBoost();
    
    float baseOuterGridSize = max(2.0, uOuterGridSize);
    float outerGridSize = baseOuterGridSize + beatGridBoost;
    vec2 outerCellSize = vec2(1.0) / outerGridSize;
    vec2 outerCellId = floor(normalizedUV / outerCellSize);
    
    // Calculate inner grid for brightness variation with beat boost
    float baseInnerGridSize = max(2.0, uInnerGridSize);
    float innerGridSize = baseInnerGridSize + beatGridBoost;
    vec2 innerCellSize = outerCellSize / innerGridSize;
    vec2 innerCellUV = fract(normalizedUV / outerCellSize);
    vec2 innerCellId = floor(innerCellUV / innerCellSize);
    
    // Base static brightness variation - this is the foundation that should be preserved
    // Each cell has unique brightness centered at 1.0 with configurable variation
    // Variation is the total range (e.g., 0.05 = ±2.5% = range 0.975 to 1.025, 0.1 = ±5% = range 0.95 to 1.05)
    float brightnessVariation = uCellBrightnessVariation;
    float staticBrightness = hash11(dot(outerCellId, vec2(12.9898, 78.233))) * brightnessVariation + (1.0 - brightnessVariation * 0.5);
    
    // Base animation: simple sine waves with BPM-synced frequencies using musical time
    // Each cell has unique phase offsets and frequency variations for natural variation
    float phase1 = (outerCellId.x * 7.0 + outerCellId.y * 13.0) * 0.8976;
    float phase2 = (outerCellId.x * 11.0 + outerCellId.y * 17.0) * 0.5236;
    float phase3 = (outerCellId.x * 3.0 + outerCellId.y * 19.0) * 1.2566;
    
    // Generate per-cell frequency multipliers using hash functions
    // This breaks up visual patterns by making each cell animate at slightly different speeds
    float freqHash1 = hash11(dot(outerCellId, vec2(17.0, 31.0)) + 0.1);
    float freqHash2 = hash11(dot(outerCellId, vec2(23.0, 41.0)) + 0.2);
    float freqHash3 = hash11(dot(outerCellId, vec2(29.0, 47.0)) + 0.3);
    
    // Frequency variation range: 0.85x to 1.15x (30% variation)
    // This keeps cells musically synced but breaks up synchronized patterns
    float freqMult1 = 1.0 + (freqHash1 - 0.5) * FREQ_VARIATION_RANGE;  // Range: 0.85 to 1.15
    float freqMult2 = 1.0 + (freqHash2 - 0.5) * FREQ_VARIATION_RANGE;
    float freqMult3 = 1.0 + (freqHash3 - 0.5) * FREQ_VARIATION_RANGE;
    
    // Convert time to musical time (beats) - time in beats = time * BPM / 60
    // Fallback to regular time if BPM is not available
    float musicalTime = (uBPM > 0.0) ? (uTime * uBPM / 60.0) : uTime;
    
    // Convert musical note values (fraction of bar) to frequencies (cycles per beat)
    // Each cell applies its unique frequency multiplier to break up synchronized patterns
    // Assuming 4/4 time: 1 bar = 4 beats
    // If cycle takes 1/4 bar (0.25), that's 1 beat, so frequency = 1.0 cycles per beat
    // Formula: frequency = 1.0 / noteValue (where noteValue is fraction of bar)
    float freq1 = (1.0 / max(uCellAnimNote1, 0.001)) * freqMult1;  // Prevent division by zero
    float freq2 = (1.0 / max(uCellAnimNote2, 0.001)) * freqMult2;
    float freq3 = (1.0 / max(uCellAnimNote3, 0.001)) * freqMult3;
    
    // Layered sine waves using musical time with per-cell frequency variation
    float anim1 = sin(musicalTime * freq1 + phase1) * 0.1;  // Base layer
    float anim2 = sin(musicalTime * freq2 + phase2) * 0.2;  // Medium layer
    float anim3 = sin(musicalTime * freq3 + phase3) * 0.3;  // Detail layer
    
    // Combine layers for organic variation - max ±0.10 (10% brightness variation)
    float baseAnimatedBrightness = anim1 + anim2 + anim3;
    
    // Increase multiplier to make animation visible
    // This gives ±24% brightness variation instead of ±6%, making the flickering clearly visible
    float animatedBrightness = baseAnimatedBrightness * ANIMATION_MULTIPLIER;
    
    // Calculate ripple contribution at cell center for consistent cell brightness
    // Use the center of the outer cell to sample ripple effect
    vec2 cellCenterUV = (outerCellId + 0.5) * outerCellSize;
    vec2 cellCenter = vec2(
        (cellCenterUV.x - 0.5) * aspectRatio,
        cellCenterUV.y - 0.5
    );
    
    // Sample ripples at cell center (reuse variables already defined above)
    float cellRippleBrightness = 0.0;
    for (int i = 0; i < MAX_RIPPLES; i++) {
        if (i >= rippleCount) break;
        
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            vec2 rippleCenter = vec2(uRippleCenterX[i] * stereoScale, uRippleCenterY[i]);
            float rippleAge = uRippleTimes[i];
            float rippleIntensity = uRippleIntensities[i];
            
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : defaultRippleWidth;
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : defaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : defaultRippleMaxRadius;
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : defaultRippleIntensityMultiplier;
            
            float ripple = createRipple(cellCenter, rippleCenter, rippleAge, rippleIntensity, rippleSpeed, rippleWidth, rippleMinRadius, rippleMaxRadius);
            cellRippleBrightness += ripple * rippleIntensityMultiplier;
        }
    }
    
    // Convert per-cell ripple value to brightness boost (reduced scale to prevent overpowering)
    // Use the actual ripple value sampled at this cell's center for per-cell variation
    float rippleBrightnessBoost = cellRippleBrightness * RIPPLE_BRIGHTNESS_SCALE;
    
    // Apply brightness changes: static brightness is the base, then add animation and ripples
    // Formula: base * (1 + animated_boost + ripple_boost) preserves relative differences
    float cellBrightness = staticBrightness * (1.0 + animatedBrightness + rippleBrightnessBoost);
    
    // Preserve saturation when brightness changes to prevent washed out colors
    // Use a better approach: apply brightness in a way that preserves saturation
    float maxColor = max(max(color.r, color.g), color.b);
    float minColor = min(min(color.r, color.g), color.b);
    
    if (maxColor > 0.001) {
        // Calculate current saturation
        float currentSat = (maxColor - minColor) / maxColor;
        
        // Apply brightness change
        color *= cellBrightness;
        
        // Recalculate max after brightness change
        float newMaxColor = max(max(color.r, color.g), color.b);
        
        // Preserve saturation by boosting it when brightness increases
        if (newMaxColor > 0.001 && currentSat > 0.001) {
            float brightnessRatio = cellBrightness;
            if (brightnessRatio > 1.0) {
                // When brightness increases, boost saturation more aggressively
                float saturationBoost = 1.0 + (brightnessRatio - 1.0) * 0.8; // Boost by 80% of brightness increase
                float targetSat = min(currentSat * saturationBoost, 1.0);
                
                // Calculate new saturation after brightness change
                float newMinColor = min(min(color.r, color.g), color.b);
                float newSat = (newMaxColor - newMinColor) / newMaxColor;
                
                // Boost saturation toward target
                if (newSat > 0.001 && newSat < targetSat) {
                    vec3 gray = vec3(newMaxColor);
                    float satRatio = targetSat / newSat;
                    color = mix(gray, color, satRatio);
                }
            }
        }
    } else {
        // Apply brightness change for very dark colors
        color *= cellBrightness;
    }
    
    gl_FragColor = vec4(color, coverage);
}
