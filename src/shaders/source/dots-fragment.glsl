precision highp float;

// Define FWIDTH macro - will be replaced by JavaScript based on extension availability
#define FWIDTH(x) fwidth(x)

uniform vec3  uColor; // Ultra bright cyan (step 1) - brightest
uniform vec3  uColor2; // Very bright cyan (step 2)
uniform vec3  uColor3; // Super bright cyan/blue (step 3)
uniform vec3  uColor4; // Bright teal (step 4)
uniform vec3  uColor5; // Medium green (step 5)
uniform vec3  uColor6; // Dark green (step 6)
uniform vec3  uColor7; // Dark medium (step 7)
uniform vec3  uColor8; // Dark (step 8)
uniform vec3  uColor9; // Very dark (step 9)
uniform vec3  uColor10; // Almost black (step 10) - darkest
uniform vec2  uResolution;
uniform vec4  uMouse;
uniform float uTime;
uniform float uTimeOffset;

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

// Audio uniforms (0.0 to 1.0) - defaults to 0.0 if not set
uniform float uBass;    // Low frequencies (20-250Hz)
uniform float uMid;     // Mid frequencies (250-2000Hz)
uniform float uTreble;  // High frequencies (2000-11025Hz)
uniform float uVolume;  // Overall volume/RMS

// Frequency bands for color mapping (0.0 to 1.0)
uniform float uFreq1;  // 11.3k-20k Hz (brightest/color)
uniform float uFreq2;  // 5.7k-11.3k Hz (color2)
uniform float uFreq3;  // 2.8k-5.7k Hz (color3)
uniform float uFreq4;  // 1.4k-2.8k Hz (color4)
uniform float uFreq5;  // 707-1414 Hz (color5)
uniform float uFreq6;  // 354-707 Hz (color6)
uniform float uFreq7;  // 177-354 Hz (color7)
uniform float uFreq8;  // 88-177 Hz (color8)
uniform float uFreq9;  // 44-88 Hz (color9)
uniform float uFreq10; // 20-44 Hz (darkest/color10)

// Stereo balance uniforms (-1 = left, 0 = center, 1 = right)
uniform float uBassStereo;   // Stereo balance for bass frequencies
uniform float uMidStereo;    // Stereo balance for mid frequencies
uniform float uTrebleStereo; // Stereo balance for treble frequencies

// Temporal and beat detection uniforms
uniform float uSmoothedBass;   // Smoothed bass (temporal average)
uniform float uSmoothedMid;    // Smoothed mid (temporal average)
uniform float uSmoothedTreble; // Smoothed treble (temporal average)
uniform float uPeakBass;       // Peak bass (decaying peak)
uniform float uBeatTime;       // Time since last beat (seconds, 0-2)
uniform float uBeatIntensity; // Intensity of last beat (0-1)
uniform float uBPM;           // Estimated beats per minute

// Multi-frequency ripple uniforms (kept for backward compatibility)
uniform float uBeatTimeBass;
uniform float uBeatTimeMid;
uniform float uBeatTimeTreble;
uniform float uBeatIntensityBass;
uniform float uBeatIntensityMid;
uniform float uBeatIntensityTreble;
uniform float uBeatStereoBass;  // Fixed stereo position when bass beat was detected
uniform float uBeatStereoMid;   // Fixed stereo position when mid beat was detected
uniform float uBeatStereoTreble; // Fixed stereo position when treble beat was detected

// Multiple ripple tracking uniforms
#define MAX_RIPPLES 16
uniform float uRippleCenterX[MAX_RIPPLES];  // X position (stereo) for each ripple
uniform float uRippleCenterY[MAX_RIPPLES];  // Y position (vertical) for each ripple
uniform float uRippleTimes[MAX_RIPPLES];    // Time since ripple started (seconds)
uniform float uRippleIntensities[MAX_RIPPLES]; // Intensity of each ripple (0-1)
uniform float uRippleWidths[MAX_RIPPLES];   // Width of ring for each ripple
uniform float uRippleMinRadii[MAX_RIPPLES]; // Minimum radius for each ripple
uniform float uRippleMaxRadii[MAX_RIPPLES]; // Maximum radius for each ripple
uniform float uRippleIntensityMultipliers[MAX_RIPPLES]; // Intensity multiplier for each ripple
uniform float uRippleActive[MAX_RIPPLES];   // 1.0 if ripple is active, 0.0 otherwise
uniform int uRippleCount;                   // Number of active ripples

// Ripple effect parameters
uniform float uRippleSpeed;              // Speed of expanding ring (0.1-2.0)
uniform float uRippleWidth;               // Width of the ring (0.02-0.5)
uniform float uRippleMinRadius;          // Minimum ring radius (0.0-1.0)
uniform float uRippleMaxRadius;           // Maximum ring radius (0.0-2.0)
uniform float uRippleIntensityThreshold; // Intensity threshold for ripples (0.0-1.0)
uniform float uRippleIntensity;          // Overall ripple intensity multiplier (0.0-1.0)

// Threshold uniforms - calculated from thresholdCurve bezier
uniform float uThreshold1;
uniform float uThreshold2;
uniform float uThreshold3;
uniform float uThreshold4;
uniform float uThreshold5;
uniform float uThreshold6;
uniform float uThreshold7;
uniform float uThreshold8;
uniform float uThreshold9;
uniform float uThreshold10;

// fBm noise functions (different from heightmap shader for visual distinction)
#define FBM_OCTAVES     5        // Fewer octaves for coarser, more distinct pattern
#define FBM_LACUNARITY  2.0      // Much higher lacunarity = wider frequency spacing (creates more contrast)
#define FBM_GAIN        0.5      // Lower gain = faster amplitude decay (more contrast between octaves)
#define FBM_SCALE       0.8      // Smaller scale = larger features (opposite of heightmap)
#define FBM_WARP_STRENGTH 0.3    // Domain warping strength for swirly, turbulent pattern

// Cubic bezier easing constants
#define CUBIC_BEZIER_MAX_ITERATIONS 10

// Cubic bezier easing constants
#define CUBIC_BEZIER_MAX_ITERATIONS 10

// 1-D hash and 3-D value-noise helpers
float hash11(float n) { return fract(sin(n)*43758.5453); }

float vnoise(vec3 p)
{
    vec3 ip = floor(p);
    vec3 fp = fract(p);

    float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
    float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
    float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
    float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));

    vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);   // smootherstep

    float x00 = mix(n000, n100, w.x);
    float x10 = mix(n010, n110, w.x);
    float x01 = mix(n001, n101, w.x);
    float x11 = mix(n011, n111, w.x);

    float y0  = mix(x00, x10, w.y);
    float y1  = mix(x01, x11, w.y);

    return mix(y0, y1, w.z) * 2.0 - 1.0;         // [-1,1]
}

// Domain-warped fBm for distinct visual character (swirly, turbulent pattern)
// This creates a very different look from the heightmap shader's smooth fBm
float fbm2(vec2 uv, float t)
{
    // Apply domain warping - use noise to warp the domain before sampling
    // This creates swirly, turbulent patterns that look very different from standard fBm
    vec2 warpedUV = uv * FBM_SCALE;
    
    // First pass: create warp vectors from noise
    vec3 warpP1 = vec3(warpedUV * 0.7, t * 0.5);
    vec3 warpP2 = vec3(warpedUV * 0.9 + vec2(5.2, 1.3), t * 0.7);
    
    // Get warp vectors (use noise gradients)
    float warpX = vnoise(warpP1);
    float warpY = vnoise(warpP2);
    vec2 warp = vec2(warpX, warpY) * FBM_WARP_STRENGTH;
    
    // Apply warp to UV coordinates
    vec2 warped = warpedUV + warp;
    
    // Add time-based rotation for dynamic movement
    float rotationAngle = t * 0.15; // Rotation speed
    float cosRot = cos(rotationAngle);
    float sinRot = sin(rotationAngle);
    vec2 rotatedUV = vec2(
        warped.x * cosRot - warped.y * sinRot,
        warped.x * sinRot + warped.y * cosRot
    );
    
    // Sample fBm with warped coordinates
    vec3 p = vec3(rotatedUV, t * 1.5); // Time component scaled differently
    float amp = 1.0;
    float freq = 1.0;
    float sum = 0.0;

    for (int i = 0; i < FBM_OCTAVES; ++i)
    {
        sum += amp * vnoise(p * freq);
        freq *= FBM_LACUNARITY;
        amp *= FBM_GAIN;
    }
    
    return sum * 0.5 + 0.5;   // [0,1]
}

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

// Get color from noise value using frequency-based threshold system (same as background shader)
vec3 getColorFromNoise(float noiseValue, vec2 cellId) {
    // Ensure noise value is in valid range
    float t = clamp(noiseValue, 0.0, 1.0);
    
    // Calculate active state for each frequency band
    float freq1Active = smoothstep(0.20 - 0.05, 0.20 + 0.05, uFreq1);
    float freq2Active = smoothstep(0.20 - 0.05, 0.20 + 0.05, uFreq2);
    float freq3Active = smoothstep(0.25 - 0.05, 0.25 + 0.05, uFreq3);
    float freq4Active = smoothstep(0.30 - 0.05, 0.30 + 0.05, uFreq4);
    float freq5Active = smoothstep(0.30 - 0.05, 0.30 + 0.05, uFreq5);
    float freq6Active = smoothstep(0.25 - 0.05, 0.25 + 0.05, uFreq6);
    float freq7Active = smoothstep(0.20 - 0.05, 0.20 + 0.05, uFreq7);
    float freq8Active = smoothstep(0.15 - 0.05, 0.15 + 0.05, uFreq8);
    float freq9Active = smoothstep(0.10 - 0.05, 0.10 + 0.05, uFreq9);
    float freq10Active = smoothstep(0.10 - 0.05, 0.10 + 0.05, uFreq10);
    
    // Simple hash-based dither for variation (similar to Bayer but simpler)
    float cellHash = hash11(dot(cellId, vec2(12.9898, 78.233)));
    float dither = (cellHash - 0.5) * 0.1; // Small dither variation
    
    // Calculate thresholds with frequency-based adjustments (similar to background shader)
    float threshold1Base = uThreshold1 + dither * 0.04;
    float threshold1Reduced = threshold1Base - (uFreq1 * 0.05 * freq1Active);
    float threshold1Min = threshold1Base * 0.70;
    float threshold1 = max(threshold1Reduced, threshold1Min);
    
    float threshold2Base = uThreshold2 + dither * 0.08;
    float threshold2Reduced = threshold2Base - (uFreq2 * 0.08 * freq2Active);
    float threshold2Min = threshold2Base * 0.70;
    float threshold2 = max(threshold2Reduced, threshold2Min);
    
    float threshold3Base = uThreshold3 + dither * 0.10;
    float threshold3Reduced = threshold3Base - (uFreq3 * 0.12 * freq3Active);
    float threshold3Min = threshold3Base * 0.70;
    float threshold3 = max(threshold3Reduced, threshold3Min);
    
    float threshold4Base = uThreshold4 + dither * 0.12;
    float threshold4Reduced = threshold4Base - (uFreq4 * 0.20 * freq4Active);
    float threshold4Min = threshold4Base * 0.75;
    float threshold4 = max(threshold4Reduced, threshold4Min);
    
    float threshold5Base = uThreshold5 + dither * 0.14;
    float threshold5Reduced = threshold5Base - (uFreq5 * 0.30 * freq5Active);
    float threshold5Min = threshold5Base * 0.75;
    float threshold5 = max(threshold5Reduced, threshold5Min);
    
    float threshold6Base = uThreshold6 + dither * 0.14;
    float threshold6Reduced = threshold6Base - (uFreq6 * 0.35 * freq6Active);
    float threshold6Min = threshold6Base * 0.75;
    float threshold6 = max(threshold6Reduced, threshold6Min);
    
    float threshold7Base = uThreshold7 + dither * 0.14;
    float threshold7Reduced = threshold7Base - (uFreq7 * 0.25 * freq7Active);
    float threshold7Min = threshold7Base * 0.85;
    float threshold7 = max(threshold7Reduced, threshold7Min);
    
    float threshold8Base = uThreshold8 + dither * 0.12;
    float threshold8Reduced = threshold8Base - (uFreq8 * 0.30 * freq8Active);
    float threshold8Min = threshold8Base * 0.85;
    float threshold8 = max(threshold8Reduced, threshold8Min);
    
    float threshold9Base = uThreshold9 + dither * 0.08;
    float threshold9Reduced = threshold9Base - (uFreq9 * 0.40 * freq9Active);
    float threshold9Min = threshold9Base * 0.85;
    float threshold9 = max(threshold9Reduced, threshold9Min);
    
    float threshold10Base = uThreshold10 + dither * 0.04;
    float threshold10Reduced = threshold10Base - (uFreq10 * 0.50 * freq10Active);
    float threshold10Min = threshold10Base * 0.85;
    float threshold10 = max(threshold10Reduced, threshold10Min);
    
    // Use smoothstep for gradual color transitions
    float transitionWidth = 0.005;
    float w1 = smoothstep(threshold1 - transitionWidth, threshold1 + transitionWidth, t);
    float w2 = smoothstep(threshold2 - transitionWidth, threshold2 + transitionWidth, t) * (1.0 - w1);
    float w3 = smoothstep(threshold3 - transitionWidth, threshold3 + transitionWidth, t) * (1.0 - w1 - w2);
    float w4 = smoothstep(threshold4 - transitionWidth, threshold4 + transitionWidth, t) * (1.0 - w1 - w2 - w3);
    float w5 = smoothstep(threshold5 - transitionWidth, threshold5 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4);
    float w6 = smoothstep(threshold6 - transitionWidth, threshold6 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5);
    float w7 = smoothstep(threshold7 - transitionWidth, threshold7 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6);
    float w8 = smoothstep(threshold8 - transitionWidth, threshold8 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7);
    float w9 = smoothstep(threshold9 - transitionWidth, threshold9 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7 - w8);
    float w10 = smoothstep(threshold10 - transitionWidth, threshold10 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7 - w8 - w9);
    float w0 = 1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7 - w8 - w9 - w10;
    
    // Mix colors based on weights
    vec3 color = uColor * w1 + uColor2 * w2 + uColor3 * w3 + uColor4 * w4 + uColor5 * w5 + 
                uColor6 * w6 + uColor7 * w7 + uColor8 * w8 + uColor9 * w9 + uColor10 * (w10 + w0);
    
    // Ensure all uniforms are referenced (prevent optimization)
    float uniformPresence = (uColor.r + uColor2.r + uColor3.r + uColor4.r + uColor5.r + 
                            uColor6.r + uColor7.r + uColor8.r + uColor9.r + uColor10.r) * 0.0000001;
    color += vec3(uniformPresence);
    
    return color;
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
    float aspectRatio = uResolution.x / uResolution.y;
    
    // Convert fragment coordinates to centered UV space
    // Center UV around origin (0,0) so grid is symmetric
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 centeredUV = (uv - 0.5) * vec2(aspectRatio, 1.0);
    
    // Calculate grid spacing in normalized coordinates
    // Use minimum dimension to keep dots square regardless of aspect ratio
    float minResolution = min(uResolution.x, uResolution.y);
    float gridSpacing = (uDotSpacing > 0.0 ? uDotSpacing : 15.0) / minResolution;
    
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
    
    // Add volume-based time modulation that's more sensitive at low volumes
    // Use an inverse curve to amplify small changes when volume is low
    // When volume is 0.0-0.3, small changes have big impact
    // When volume is high, changes are more linear
    float volumeSensitivity = 0.0;
    if (uVolume > 0.0) {
        // Create a curve that's more sensitive at low volumes
        // Low volumes (0.0-0.3): high sensitivity (2.0-1.0x)
        // High volumes (0.3-1.0): lower sensitivity (1.0-0.3x)
        float lowVolumeRange = 0.3;
        if (uVolume < lowVolumeRange) {
            // High sensitivity for low volumes: 2.0x at 0.0, 1.0x at 0.3
            volumeSensitivity = 2.0 - (uVolume / lowVolumeRange);
        } else {
            // Lower sensitivity for higher volumes: 1.0x at 0.3, 0.3x at 1.0
            float highVolumeT = (uVolume - lowVolumeRange) / (1.0 - lowVolumeRange);
            volumeSensitivity = 1.0 - (highVolumeT * 0.7);
        }
    } else {
        // Maximum sensitivity when completely silent
        volumeSensitivity = 2.0;
    }
    
    // Tempo-based animation speed (BPM affects pattern rhythm)
    // Higher BPM = faster animation, but with limits
    float tempoSpeed = 1.0;
    if (uBPM > 0.0) {
        // Normalize BPM to speed multiplier (60-180 BPM range maps to 1.0-2.0x speed)
        float normalizedBPM = clamp((uBPM - 60.0) / 120.0, 0.0, 1.0);
        tempoSpeed = 1.0 + normalizedBPM * 1.0;
    }
    
    // Modulate time with volume changes - more sensitive at low volumes
    // Use a combination of volume and frequency bands for more nuanced response
    // Increased frequency band weights for stronger audio reaction
    float volumeModulation = (uVolume + uBass * 0.5 + uMid * 0.4 + uTreble * 0.3) * volumeSensitivity;
    
    // Apply volume modulation to time - creates more variation at low volumes
    // Increased multiplier from 0.15 to 0.35 for stronger reaction
    float baseTimeSpeed = 0.08 * tempoSpeed;
    float modulatedTime = (uTime + uTimeOffset) * baseTimeSpeed + volumeModulation * 0.35;
    
    float noiseValue = fbm2(cellWorldPos, modulatedTime);
    
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
    
    // Get color from noise using frequency-based threshold system
    // Higher noise values map to brighter colors in the threshold system
    vec3 dotColor = getColorFromNoise(noiseValueForColor, cellId);
    
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
    
    // Per-dot variation using cell ID for unique movement patterns
    float cellHash = hash11(dot(cellId, vec2(12.9898, 78.233)));
    float perDotPhase = cellHash * 6.28318; // 0 to 2π
    
    // Spring oscillation parameters
    float springFreq1 = 6.0 + cellHash * 4.0;  // Vary frequency per dot (6-10 Hz)
    float springFreq2 = 11.0 + cellHash * 5.0; // Secondary frequency (11-16 Hz)
    
    // Time-based oscillation - use periodic damping instead of exponential decay
    float t = (uTime + uTimeOffset) * 2.0; // Faster time for more visible movement
    float tWithPhase = t + perDotPhase; // Add per-dot phase offset
    
    // Periodic damping - creates spring-like oscillation that doesn't fade out
    // Use envelope modulation instead of exponential decay
    float envelope = 0.5 + 0.5 * sin(t * 0.3 + perDotPhase); // Slow envelope modulation
    float damping = 0.6 + 0.4 * envelope; // Vary between 0.6-1.0
    
    // Multi-frequency oscillation for spring-like behavior
    float oscillation1 = sin(tWithPhase * springFreq1) * damping;
    float oscillation2 = cos(tWithPhase * springFreq2 * 1.3) * damping * 0.7;
    float oscillation3 = sin(tWithPhase * springFreq1 * 2.1 + 1.5) * damping * 0.4; // Higher harmonic
    
    // Combined vibration (multiple frequencies create spring-like behavior)
    float vibration = (oscillation1 + oscillation2 + oscillation3) * movementIntensity;
    
    // Calculate offset direction for movement
    // Use a direction based on cell ID for consistent per-dot movement
    vec2 offsetDirection = vec2(cos(perDotPhase), sin(perDotPhase));
    
    // Calculate the offset vector (used for both center position and UV sampling)
    float movementStrength = uMovementStrength > 0.0 ? uMovementStrength : 1.3; // Default to 1.3 if not set
    vec2 movementOffset = offsetDirection * vibration * gridSpacing * movementStrength;
    
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
    float rotationAngle = vibration * 0.5; // Increased rotation amount
    
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
    
    // Add center position offset to cellUV (moves the center point within the cell)
    vec2 offsetCellUV = rotatedCellUV - centerOffsetInCell;
    
    // Add vibration offset to UV sampling if enabled
    // This shifts the sampling point within the cell
    float uvOffsetStrength = uUVOffsetStrength > 0.0 ? uUVOffsetStrength : 1.0; // Default to 1.0 if not set
    vec2 uvOffset = (movementOffset / gridSpacing) * enableUVOffset * uvOffsetStrength;
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
    float volumeBrightness = 0.3 + uVolume * 0.7;
    dotColor *= volumeBrightness;
    
    // Use uColor10 (darkest color) as background instead of black
    vec3 finalColor = mix(uColor10, dotColor, dotAlpha);
    
    gl_FragColor = vec4(finalColor, dotAlpha);
}

