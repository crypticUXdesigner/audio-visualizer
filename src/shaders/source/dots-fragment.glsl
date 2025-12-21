precision highp float;

// Define FWIDTH macro - will be replaced by JavaScript based on extension availability
#define FWIDTH(x) fwidth(x)

// Include common code
#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"
#include "common/color-mapping.glsl"
#include "common/ripples.glsl"
#include "common/screen-adaptation.glsl"

// Dots shader specific uniforms
uniform float uDotSpacing;              // Pixels between dots
uniform float uDotSize;                 // Size of dots (0.0-1.0, relative to spacing)
uniform float uPulsationStrength;      // How much dots pulse with frequency (0.0-0.5)
uniform float uRippleDistortionStrength; // How much ripples distort the grid (0.0-1.0)

// Dot movement control uniforms (1.0 = enabled, 0.0 = disabled)
uniform float uEnableCenterPositionOffset; // Enable offset to dot's center position (1.0 = on, 0.0 = off)
uniform float uEnableUVOffset;            // Enable offset to UV sampling (1.0 = on, 0.0 = off)
uniform float uMovementStrength;           // Multiplier for dot center position movement (0.0-3.0)
uniform float uUVOffsetStrength;          // Multiplier for UV sampling offset (0.0-3.0)

// Shader-specific constants
#define FBM_OCTAVES     5        // Fewer octaves for coarser, more distinct pattern
#define FBM_LACUNARITY  2.0      // Much higher lacunarity = wider frequency spacing (creates more contrast)
#define FBM_GAIN        0.5      // Lower gain = faster amplitude decay (more contrast between octaves)
#define FBM_SCALE       0.8      // Smaller scale = larger features (opposite of heightmap)
#define FBM_WARP_STRENGTH 0.3    // Domain warping strength for swirly, turbulent pattern

// Cubic bezier easing constants
#define CUBIC_BEZIER_MAX_ITERATIONS 10

// Dots-specific functions
// Helper function to get frequency value for pulsation (still based on vertical position)
float getFrequencyForPosition(float verticalPos) {
    if (verticalPos < 0.333) {
        float t = verticalPos * 3.0;
        return mix(uFreq10, uFreq7, t);
    } else if (verticalPos < 0.667) {
        float t = (verticalPos - 0.333) * 3.0;
        return mix(uFreq6, uFreq4, t);
    } else {
        float t = (verticalPos - 0.667) * 3.0;
        return mix(uFreq3, uFreq1, t);
    }
}

// Calculate ripple wave size multiplier for a dot
// Returns a multiplier that makes dots bigger when the wave ring passes through them
// The wave intensity directly modulates how much the dots grow
float calculateRippleSizeMultiplier(vec2 dotPos, float aspectRatio) {
    float sizeMultiplier = 1.0;
    
    // Scale stereo position by aspectRatio to match UV space coordinates
    float stereoScale = aspectRatio * 0.5;
    
    // Ripple parameters
    float rippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.3;
    float defaultRippleMinRadius = uRippleMinRadius >= 0.0 ? uRippleMinRadius : 0.0;
    float defaultRippleMaxRadius = uRippleMaxRadius > 0.0 ? uRippleMaxRadius : 1.5;
    float defaultRippleWidth = uRippleWidth > 0.0 ? uRippleWidth : 0.1;
    
    int maxRipplesInt = MAX_RIPPLES;
    int rippleCount = (uRippleCount < maxRipplesInt) ? uRippleCount : maxRipplesInt;
    
    for (int i = 0; i < MAX_RIPPLES; i++) {
        if (i >= rippleCount) break;
        
        // Check if this ripple is active
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            // Get ripple center position (stereo position in x, vertical position in y)
            vec2 rippleCenter = vec2(uRippleCenterX[i] * stereoScale, uRippleCenterY[i]);
            
            // Calculate distance from dot to ripple center
            float distToCenter = length(dotPos - rippleCenter);
            
            // Get per-ripple parameters (use defaults if not set)
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : defaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : defaultRippleMaxRadius;
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : defaultRippleWidth;
            float rippleIntensity = uRippleIntensities[i];
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : 1.0;
            
            // Calculate where the wave ring is now (expanding outward)
            // Wave starts at minRadius and expands toward maxRadius
            float radiusRange = rippleMaxRadius - rippleMinRadius;
            float distanceTraveled = uRippleTimes[i] * rippleSpeed;
            float waveRingRadius = rippleMinRadius + min(distanceTraveled, radiusRange);
            
            // Calculate fade opacity based on progress to maxRadius
            // Progress: 0.0 = at minRadius (full opacity), 1.0 = at maxRadius (zero opacity)
            float fadeOpacity = 1.0;
            if (radiusRange > 0.001) {
                float progressToMax = (waveRingRadius - rippleMinRadius) / radiusRange;
                // Smooth fade from 1.0 to 0.0 as wave approaches maxRadius
                // Use smoothstep for smooth transition, reaches 0 exactly at maxRadius
                fadeOpacity = 1.0 - smoothstep(0.0, 1.0, progressToMax);
            }
            
            // Calculate how close the dot is to the wave ring
            // Only dots very close to the wave ring should be affected
            float distFromRing = abs(distToCenter - waveRingRadius);
            
            // Wave width should be narrow - only dots directly on or very close to the ring are affected
            // Scale wave width with intensity slightly, but keep it tight
            float effectiveWaveWidth = rippleWidth * 1.5; // Narrow wave width - only affects dots near the ring
            
            // Only affect dots that are:
            // 1. Close to the wave ring (within effectiveWaveWidth)
            // 2. Beyond the minimum radius (wave has started)
            // 3. Within the maximum radius (wave hasn't finished)
            float waveEffect = 0.0;
            if (distFromRing < effectiveWaveWidth && 
                distToCenter >= rippleMinRadius && 
                distToCenter <= rippleMaxRadius) {
                
                // Normalize distance to 0-1 within the wave width
                // 0.0 = dot is exactly on the wave ring, 1.0 = dot is at the edge of the wave width
                float normalizedDist = distFromRing / effectiveWaveWidth;
                
                // Create smooth bell curve: 1.0 at center (wave ring), 0.0 at edges
                // Use smoothstep for smooth falloff - creates a nice peak at the ring
                float smoothFalloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
                
                // Apply intensity with easing curve - weaker signals have less effect
                // Power curve: pow(intensity, exponent) makes weak signals less sensitive
                // Exponent 2.2: weak (0.1) → 0.006x, medium (0.5) → 0.22x, strong (1.0) → 1.0x
                float intensityExponent = 2.2;
                float easedIntensity = pow(rippleIntensity, intensityExponent);
                
                // Apply eased intensity - stronger ripples create bigger size changes
                // The wave effect is strongest at the ring center and fades to edges
                waveEffect = smoothFalloff * easedIntensity * rippleIntensityMultiplier;
                
                // Apply global ripple distortion strength (user control)
                waveEffect *= uRippleDistortionStrength;
                
                // Apply fade opacity - ripple fades out as it reaches maxRadius
                // fadeOpacity reaches 0 exactly when waveRingRadius reaches maxRadius
                waveEffect *= fadeOpacity;
            }
            
            // Add to size multiplier (accumulate from multiple ripples)
            // Wave effect directly modulates size: 0.0 = no change, 1.0 = 100% bigger (2x size)
            // Scale by 1.5 for more visible effect (max 2.5x size with strong ripples)
            sizeMultiplier += waveEffect * 1.5;
        }
    }
    
    return sizeMultiplier;
}

// Calculate ripple wave brightness boost for a dot
// Returns a brightness value (0.0-1.0) that increases the noise value where waves are active
// This makes dots brighter (shift to higher color thresholds) where waves pass through
float calculateRippleBrightness(vec2 dotPos, float aspectRatio) {
    float brightnessBoost = 0.0;
    
    // Scale stereo position by aspectRatio to match UV space coordinates
    float stereoScale = aspectRatio * 0.5;
    
    // Ripple parameters
    float rippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.3;
    float defaultRippleMinRadius = uRippleMinRadius >= 0.0 ? uRippleMinRadius : 0.0;
    float defaultRippleMaxRadius = uRippleMaxRadius > 0.0 ? uRippleMaxRadius : 1.5;
    float defaultRippleWidth = uRippleWidth > 0.0 ? uRippleWidth : 0.1;
    
    int maxRipplesInt = MAX_RIPPLES;
    int rippleCount = (uRippleCount < maxRipplesInt) ? uRippleCount : maxRipplesInt;
    
    for (int i = 0; i < MAX_RIPPLES; i++) {
        if (i >= rippleCount) break;
        
        // Check if this ripple is active
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            // Get ripple center position (stereo position in x, vertical position in y)
            vec2 rippleCenter = vec2(uRippleCenterX[i] * stereoScale, uRippleCenterY[i]);
            
            // Calculate distance from dot to ripple center
            float distToCenter = length(dotPos - rippleCenter);
            
            // Get per-ripple parameters (use defaults if not set)
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : defaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : defaultRippleMaxRadius;
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : defaultRippleWidth;
            float rippleIntensity = uRippleIntensities[i];
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : 1.0;
            
            // Calculate where the wave ring is now (expanding outward)
            float radiusRange = rippleMaxRadius - rippleMinRadius;
            float distanceTraveled = uRippleTimes[i] * rippleSpeed;
            float waveRingRadius = rippleMinRadius + min(distanceTraveled, radiusRange);
            
            // Calculate fade opacity based on progress to maxRadius
            float fadeOpacity = 1.0;
            if (radiusRange > 0.001) {
                float progressToMax = (waveRingRadius - rippleMinRadius) / radiusRange;
                fadeOpacity = 1.0 - smoothstep(0.0, 1.0, progressToMax);
            }
            
            // Calculate how close the dot is to the wave ring
            float distFromRing = abs(distToCenter - waveRingRadius);
            
            // Wave width for brightness effect (can be wider than size effect for more visible brightness)
            float effectiveWaveWidth = rippleWidth * 2.0; // Wider than size effect for more visible brightness
            
            // Only affect dots that are near the wave ring
            if (distFromRing < effectiveWaveWidth && 
                distToCenter >= rippleMinRadius && 
                distToCenter <= rippleMaxRadius) {
                
                // Normalize distance to 0-1 within the wave width
                float normalizedDist = distFromRing / effectiveWaveWidth;
                
                // Create smooth bell curve: 1.0 at center (wave ring), 0.0 at edges
                float smoothFalloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
                
                // Apply intensity with easing curve - weaker signals have less effect
                // Use same easing as size effect for consistency
                float intensityExponent = 2.2;
                float easedIntensity = pow(rippleIntensity, intensityExponent);
                
                // Calculate brightness boost based on eased intensity
                // Stronger ripples create more brightness, weak ripples have minimal effect
                float waveBrightness = smoothFalloff * easedIntensity * rippleIntensityMultiplier;
                
                // Apply fade opacity
                waveBrightness *= fadeOpacity;
                
                // Add to brightness boost (accumulate from multiple ripples)
                // Scale brightness boost (0.0-0.3 range for subtle but visible effect)
                brightnessBoost += waveBrightness * 0.3;
            }
        }
    }
    
    return brightnessBoost;
}

// Calculate ripple wave movement boost for a dot
// Returns a movement intensity multiplier (0.0-1.0+) that increases dot movement when waves pass through
// This makes dots vibrate and move more when ripples hit them
float calculateRippleMovementBoost(vec2 dotPos, float aspectRatio) {
    float movementBoost = 0.0;
    
    // Scale stereo position by aspectRatio to match UV space coordinates
    float stereoScale = aspectRatio * 0.5;
    
    // Ripple parameters
    float rippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.3;
    float defaultRippleMinRadius = uRippleMinRadius >= 0.0 ? uRippleMinRadius : 0.0;
    float defaultRippleMaxRadius = uRippleMaxRadius > 0.0 ? uRippleMaxRadius : 1.5;
    float defaultRippleWidth = uRippleWidth > 0.0 ? uRippleWidth : 0.1;
    
    int maxRipplesInt = MAX_RIPPLES;
    int rippleCount = (uRippleCount < maxRipplesInt) ? uRippleCount : maxRipplesInt;
    
    for (int i = 0; i < MAX_RIPPLES; i++) {
        if (i >= rippleCount) break;
        
        // Check if this ripple is active
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            // Get ripple center position (stereo position in x, vertical position in y)
            vec2 rippleCenter = vec2(uRippleCenterX[i] * stereoScale, uRippleCenterY[i]);
            
            // Calculate distance from dot to ripple center
            float distToCenter = length(dotPos - rippleCenter);
            
            // Get per-ripple parameters (use defaults if not set)
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : defaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : defaultRippleMaxRadius;
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : defaultRippleWidth;
            float rippleIntensity = uRippleIntensities[i];
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : 1.0;
            
            // Calculate where the wave ring is now (expanding outward)
            float radiusRange = rippleMaxRadius - rippleMinRadius;
            float distanceTraveled = uRippleTimes[i] * rippleSpeed;
            float waveRingRadius = rippleMinRadius + min(distanceTraveled, radiusRange);
            
            // Calculate fade opacity based on progress to maxRadius
            float fadeOpacity = 1.0;
            if (radiusRange > 0.001) {
                float progressToMax = (waveRingRadius - rippleMinRadius) / radiusRange;
                fadeOpacity = 1.0 - smoothstep(0.0, 1.0, progressToMax);
            }
            
            // Calculate how close the dot is to the wave ring
            float distFromRing = abs(distToCenter - waveRingRadius);
            
            // Wave width for movement effect (similar to brightness, wider than size for visibility)
            float effectiveWaveWidth = rippleWidth * 2.0;
            
            // Only affect dots that are near the wave ring
            if (distFromRing < effectiveWaveWidth && 
                distToCenter >= rippleMinRadius && 
                distToCenter <= rippleMaxRadius) {
                
                // Normalize distance to 0-1 within the wave width
                float normalizedDist = distFromRing / effectiveWaveWidth;
                
                // Create smooth bell curve: 1.0 at center (wave ring), 0.0 at edges
                float smoothFalloff = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
                
                // Apply intensity with easing curve - weaker signals have less effect
                float intensityExponent = 2.2;
                float easedIntensity = pow(rippleIntensity, intensityExponent);
                
                // Calculate movement boost based on eased intensity
                // Stronger ripples create more movement, weak ripples have minimal effect
                float waveMovement = smoothFalloff * easedIntensity * rippleIntensityMultiplier;
                
                // Apply fade opacity
                waveMovement *= fadeOpacity;
                
                // Add to movement boost (accumulate from multiple ripples)
                // Scale movement boost (0.0-0.8 range for visible movement effect)
                movementBoost += waveMovement * 0.8;
            }
        }
    }
    
    return movementBoost;
}

// Cubic bezier easing function for GLSL
// Maps input t (0-1) to eased output (0-1) using cubic bezier control points
// Uses binary search to find the t parameter that gives us x = input t
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
    float aspectRatio = getAspectRatio();
    
    // Convert fragment coordinates to centered UV space
    // Center UV around origin (0,0) so grid is symmetric
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 centeredUV = (uv - 0.5) * vec2(aspectRatio, 1.0);
    
    // Calculate grid spacing in normalized coordinates with DPR-aware scaling
    // Use pixelsToNormalizedDPR to ensure dots scale correctly on high-DPR screens
    float dotSpacingPixels = uDotSpacing > 0.0 ? uDotSpacing : 15.0;
    float gridSpacing = pixelsToNormalizedDPR(dotSpacingPixels);
    
    // Get grid cell ID (centered, so edges are symmetric)
    // Use original centeredUV (no distortion) for consistent grid
    vec2 cellId = floor(centeredUV / gridSpacing);
    
    // Calculate base dot position in world space (for ripple calculations and noise)
    vec2 baseDotWorldPos = cellId * gridSpacing;
    
    // Calculate vertical position for pulsation (normalized 0-1)
    // centeredUV.y ranges from -0.5 to 0.5, normalize to 0-1
    float verticalPos = (centeredUV.y + 0.5);
    
    // Generate fBm noise based on cell position for color variation
    // Use baseDotWorldPos (will be offset later if center position offset is enabled)
    vec2 cellWorldPos = baseDotWorldPos;
    
    // Calculate modulated time using shared function
    float staticTimeOffset = 0.0; // Dots uses uTimeOffset directly
    float baseTimeSpeed = 0.08;
    float modulatedTime = calculateModulatedTime(
        uTime, uTimeOffset, uVolume,
        uBass, uMid, uTreble, uBPM,
        staticTimeOffset, baseTimeSpeed
    );
    
    // Use domain-warped fBm for distinct visual character (swirly, turbulent pattern)
    float noiseValue = fbm2_domainWarped(cellWorldPos, modulatedTime, FBM_SCALE, FBM_WARP_STRENGTH, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
    
    // Add direct audio influence to noise value for stronger reaction
    // Frequency bands create spatial variation in noise intensity
    float audioBoost = (uBass * 0.15 + uMid * 0.10 + uTreble * 0.08) * 0.2;
    noiseValue = clamp(noiseValue + audioBoost, 0.0, 1.0);
    
    // Calculate brightness boost from ripple waves
    // This increases the noise value where waves are active, making dots brighter
    // Use baseDotWorldPos for initial calculation (will use final position after offset if needed)
    float waveBrightness = calculateRippleBrightness(baseDotWorldPos, aspectRatio);
    
    // Add brightness boost to noise value (before color threshold calculation)
    // Clamp to valid range [0.0, 1.0] to ensure proper color mapping
    float noiseValueForColor = clamp(noiseValue + waveBrightness, 0.0, 1.0);
    
    // Calculate frequency active states using shared function
    float freq1Active, freq2Active, freq3Active, freq4Active, freq5Active;
    float freq6Active, freq7Active, freq8Active, freq9Active, freq10Active;
    calculateFrequencyActiveStates(
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active
    );
    
    // Calculate thresholds using shared function (WITH frequency modulation for dots)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    // Simple hash-based dither for variation (similar to Bayer but simpler)
    float cellHash = hash11(dot(cellId, vec2(12.9898, 78.233)));
    float dither = (cellHash - 0.5) * 0.1; // Small dither variation
    // Convert dither to bayer-like value for threshold function (scale to match bayer range)
    float bayer = dither * 0.4; // Scale to match bayer dithering range
    
    calculateFrequencyThresholds(
        bayer,
        freq1Active, freq2Active, freq3Active, freq4Active, freq5Active,
        freq6Active, freq7Active, freq8Active, freq9Active, freq10Active,
        true,  // useFrequencyModulation = true for dots (frequency affects thresholds)
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map to color using shared function
    float transitionWidth = 0.005;
    vec3 dotColor = mapNoiseToColor(
        noiseValueForColor,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        transitionWidth
    );
    
    // Calculate spring-like vibration and rotation based on noise value
    // Low noise (dark) = no movement, High noise (bright) = lots of movement
    // Use cubic bezier easing: (0, 0.6, 1, 0.8) for smooth acceleration curve
    float baseMovementIntensity = cubicBezierEase(noiseValue, 0.0, 0.6, 1.0, 0.8);
    
    // Add ripple movement boost - ripples make dots move more when they pass through
    // Use baseDotWorldPos for initial calculation
    float rippleMovementBoost = calculateRippleMovementBoost(baseDotWorldPos, aspectRatio);
    
    // Combine base movement with ripple boost
    // Ripple boost adds to movement intensity (can exceed 1.0 for extra movement)
    float movementIntensity = baseMovementIntensity + rippleMovementBoost;
    
    // ===== SWARM MOVEMENT SYSTEM =====
    // Individual dots with subtle spatial coherence (like a swarm of particles)
    
    float t = (uTime + uTimeOffset) * 2.0; // Faster time for more visible movement
    
    // 1. PER-DOT BASE VARIATION (individuality)
    // Each dot gets unique hash for base characteristics
    float cellHash2 = hash11(dot(cellId, vec2(12.9898, 78.233)));
    float basePhase = cellHash2 * 6.28318; // 0 to 2π
    
    // 2. SPATIAL PHASE GRADIENTS (subtle coherence)
    // Sample noise at dot position to create smooth phase gradients across space
    // Nearby dots get similar but not identical phase offsets
    vec3 phaseFieldPos = vec3(baseDotWorldPos * 0.3, t * 0.2);
    float phaseField1 = vnoise(phaseFieldPos) * 2.0; // -2π to 2π range
    float phaseField2 = vnoise(phaseFieldPos + vec3(100.0, 0.0, 0.0)) * 1.5;
    
    // Combine base phase with spatial gradient (spatial adds ~30% variation)
    float perDotPhase = basePhase + (phaseField1 + phaseField2) * 0.3;
    
    // 3. SPATIAL FREQUENCY GRADIENTS (varying speeds across space)
    // Dots in different regions move at slightly different speeds
    vec3 freqFieldPos = vec3(baseDotWorldPos * 0.25, t * 0.15);
    float freqVariation = vnoise(freqFieldPos) * 0.4; // ±0.4 frequency variation
    
    // Per-dot base frequencies with spatial variation
    float baseFreq1 = 6.0 + cellHash2 * 4.0;  // 6-10 Hz base
    float baseFreq2 = 11.0 + cellHash2 * 5.0; // 11-16 Hz base
    float springFreq1 = baseFreq1 + freqVariation;
    float springFreq2 = baseFreq2 + freqVariation * 1.3;
    
    // 4. SPATIAL DIRECTION GRADIENTS (smooth direction changes)
    // Create smooth direction field so nearby dots move in similar but not identical directions
    vec3 dirFieldPos = vec3(baseDotWorldPos * 0.35, t * 0.25);
    float dirFieldX = vnoise(dirFieldPos);
    float dirFieldY = vnoise(dirFieldPos + vec3(0.0, 0.0, 50.0));
    
    // Base direction from per-dot phase, modified by spatial field
    vec2 baseDirection = vec2(cos(perDotPhase), sin(perDotPhase));
    vec2 spatialDirection = normalize(vec2(dirFieldX, dirFieldY));
    
    // Blend: 70% per-dot direction, 30% spatial influence (creates coherence without uniformity)
    vec2 offsetDirection = normalize(mix(baseDirection, spatialDirection, 0.3));
    
    // 5. MULTI-SCALE NOISE FOR COMPLEX PATTERNS
    // Multiple overlapping noise fields create rich, varied movement
    vec3 multiScalePos1 = vec3(baseDotWorldPos * 0.5, t * 0.3);
    vec3 multiScalePos2 = vec3(baseDotWorldPos * 0.2, t * 0.4);
    vec3 multiScalePos3 = vec3(baseDotWorldPos * 0.8, t * 0.2);
    
    float multiScale1 = vnoise(multiScalePos1) * 0.15;
    float multiScale2 = vnoise(multiScalePos2) * 0.10;
    float multiScale3 = vnoise(multiScalePos3) * 0.08;
    
    // 6. STAGGERED OSCILLATION
    // Time with per-dot phase creates natural staggering
    float tWithPhase = t + perDotPhase;
    
    // Periodic damping with spatial variation
    float envelopePhase = perDotPhase + phaseField1 * 0.5;
    float envelope = 0.5 + 0.5 * sin(t * 0.3 + envelopePhase);
    float damping = 0.6 + 0.4 * envelope;
    
    // Multi-frequency oscillation with spatial frequency variation
    float oscillation1 = sin(tWithPhase * springFreq1) * damping;
    float oscillation2 = cos(tWithPhase * springFreq2 * 1.3) * damping * 0.7;
    float oscillation3 = sin(tWithPhase * springFreq1 * 2.1 + 1.5) * damping * 0.4;
    
    // Combined vibration with multi-scale noise
    float vibration = (oscillation1 + oscillation2 + oscillation3) * movementIntensity;
    vibration += (multiScale1 + multiScale2 + multiScale3) * movementIntensity;
    
    // 7. FINAL MOVEMENT VECTOR
    // Direction from blended sources, magnitude from staggered oscillation
    float movementStrength = uMovementStrength > 0.0 ? uMovementStrength : 1.3;
    vec2 movementOffset = offsetDirection * vibration * gridSpacing * movementStrength;
    
    // Calculate vibration magnitude for rotation
    float vibrationMagnitude = abs(vibration);
    
    // Apply center position offset if enabled
    // This moves the dot's center position in world space
    float enableCenterOffset = uEnableCenterPositionOffset > 0.5 ? 1.0 : 0.0;
    vec2 dotWorldPos = baseDotWorldPos + movementOffset * enableCenterOffset;
    
    // Keep cellUV in original cell coordinate system (-0.5 to 0.5)
    // Don't recalculate it - just offset the center point within the cell
    vec2 cellUV = fract(centeredUV / gridSpacing) - 0.5; // Center within cell (-0.5 to 0.5)
    
    // Apply center offset within the cellUV coordinate system
    // Convert world offset to cell-relative offset
    vec2 centerOffsetInCell = (movementOffset * enableCenterOffset) / gridSpacing;
    
    // Rotation component - dots rotate around their center
    float rotationAngle = vibrationMagnitude * 0.5; // Increased rotation amount
    
    // Apply rotation to cellUV (rotate around center) if UV offset is enabled
    float enableUVOffset = uEnableUVOffset > 0.5 ? 1.0 : 0.0;
    vec2 rotatedCellUV = cellUV;
    if (enableUVOffset > 0.5) {
        float cosRot = cos(rotationAngle);
        float sinRot = sin(rotationAngle);
        rotatedCellUV = vec2(
            cellUV.x * cosRot - cellUV.y * sinRot,
            cellUV.x * sinRot + cellUV.y * cosRot
        );
    }
    
    // Apply center position offset to cellUV (moves the center point within the cell)
    // This is independent of UV offset - both can be active simultaneously
    // Center offset moves the dot's position, so we subtract it from the cell coordinates
    vec2 offsetCellUV = rotatedCellUV;
    if (enableCenterOffset > 0.5) {
        offsetCellUV = rotatedCellUV - centerOffsetInCell;
    }
    
    // Add vibration offset to UV sampling if enabled
    // This shifts the sampling point within the cell independently of center offset
    // UV offset shifts what part of the pattern is sampled, so we add it to the coordinates
    // Both effects work together: center offset moves the dot, UV offset shifts the sampling
    float uvOffsetStrength = uUVOffsetStrength > 0.0 ? uUVOffsetStrength : 1.0; // Default to 1.0 if not set
    // Create independent UV offset - use perpendicular direction to movement
    // When both are enabled, center offset moves the dot position and UV offset shifts the sampling
    // Using a perpendicular direction ensures both effects are visible and don't cancel
    vec2 uvOffsetDirection = vec2(-offsetDirection.y, offsetDirection.x); // Perpendicular (90° phase offset)
    vec2 uvMovementOffset = uvOffsetDirection * vibrationMagnitude * gridSpacing * movementStrength;
    vec2 uvOffset = (uvMovementOffset / gridSpacing) * enableUVOffset * uvOffsetStrength;
    // Combine both effects: center offset moves position, UV offset shifts sampling
    // Both are applied independently - center offset affects dot position, UV offset affects sampling
    // Using perpendicular directions ensures both effects are visible when enabled simultaneously
    vec2 modulatedCellUV = offsetCellUV + uvOffset;
    
    // Get frequency value for pulsation (still based on vertical position)
    float frequency = getFrequencyForPosition(verticalPos);
    
    // Calculate base dot size with pulsation
    float baseDotSize = uDotSize > 0.0 ? uDotSize : 0.4;
    float pulsation = 1.0 + (frequency * (uPulsationStrength > 0.0 ? uPulsationStrength : 0.15));
    
    // Apply ripple wave size multiplier (dots grow when wave hits them)
    float rippleSizeMultiplier = calculateRippleSizeMultiplier(dotWorldPos, aspectRatio);
    
    // Final dot radius combines base size, pulsation, and ripple effects
    float dotRadius = (baseDotSize * 0.5) * pulsation * rippleSizeMultiplier;
    
    // Calculate distance from modulated cell center to fragment
    float distToCenter = length(modulatedCellUV);
    
    // Render dot with smooth edges
    // Use smoothstep for anti-aliased edges
    float dotAlpha = 1.0 - smoothstep(dotRadius * 0.7, dotRadius, distToCenter);
    
    // Apply volume-based brightness (quieter = darker)
    float volumeBrightness = calculateVolumeScale(uVolume);
    dotColor *= volumeBrightness;
    
    // Use uColor10 (darkest color) as background instead of black
    vec3 finalColor = mix(uColor10, dotColor, dotAlpha);
    
    gl_FragColor = vec4(finalColor, dotAlpha);
}
