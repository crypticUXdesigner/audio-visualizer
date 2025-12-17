precision highp float;

// Define FWIDTH macro - will be replaced by JavaScript based on extension availability
// If extension is available, this will be replaced with actual fwidth() call
// If not available, this will be replaced with a constant approximation
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
uniform float uSteps; // Number of steps (2-5)
uniform vec2  uResolution;
uniform vec4  uMouse;
uniform float uTime;
uniform float uTimeOffset;  // Time debt offset (accumulates on loudness, decays to catch up)
uniform float uPixelSize;

// Dithering control uniforms
uniform float uDitherStrength;     // Global multiplier for dithering intensity (0.0-2.0, default 1.0)
uniform float uTransitionWidth;    // Smoothness of color transitions (0.005-0.1, default 0.03)

// Audio uniforms (0.0 to 1.0) - defaults to 0.0 if not set
uniform float uBass;    // Low frequencies (20-250Hz)
uniform float uMid;     // Mid frequencies (250-2000Hz)
uniform float uTreble;  // High frequencies (2000-11025Hz)
uniform float uVolume;  // Overall volume/RMS

// Frequency bands for color mapping (0.0 to 1.0)
// Standard 10-band EQ frequencies: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz
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
// WebGL doesn't support array uniforms directly, so we use separate arrays
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

uniform int   uShapeType;         // 0=square 1=circle 2=tri 3=diamond
const int SHAPE_SQUARE   = 0;
const int SHAPE_CIRCLE   = 1;
const int SHAPE_TRIANGLE = 2;
const int SHAPE_DIAMOND  = 3;

// Ripple effect parameters (real-time configurable)
uniform float uRippleSpeed;              // Speed of expanding ring (0.1-2.0)
uniform float uRippleWidth;               // Width of the ring (0.02-0.5)
uniform float uRippleMinRadius;          // Minimum ring radius (0.0-1.0)
uniform float uRippleMaxRadius;           // Maximum ring radius (0.0-2.0)
uniform float uRippleIntensityThreshold; // Intensity threshold for ripples (0.0-1.0)
uniform float uRippleIntensity;          // Overall ripple intensity multiplier (0.0-1.0)

// Title texture
uniform sampler2D uTitleTexture;
uniform vec2 uTitleTextureSize;
uniform float uTitleScale; // Scale factor for title texture (1.0 = normal, >1.0 = zoomed in/larger)
uniform float uTitleScaleBottomLeft; // Scale factor when in bottom left position
uniform float uPlaybackProgress; // Playback progress (0.0 = start, 1.0 = end)
uniform vec2 uTitlePositionOffset; // Position offset for title (x, y) - used to move text to bottom left

// Bayer matrix helpers (ordered dithering thresholds)
float Bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2. + a.y * a.y * .75);
}

#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

#define FBM_OCTAVES     6
#define FBM_LACUNARITY  1.35
#define FBM_GAIN        0.65
#define FBM_SCALE       1.25          // master scale for uv (smaller = larger spots)

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

// Stable fBm – no default args, loop fully static
float fbm2(vec2 uv, float t)
{
    vec3 p   = vec3(uv * FBM_SCALE, t);
    float amp  = 1.;
    float freq = 1.;
    float sum  = 1.;

    for (int i = 0; i < FBM_OCTAVES; ++i)
    {
        sum  += amp * vnoise(p * freq);
        freq *= FBM_LACUNARITY;
        amp  *= FBM_GAIN;
    }
    
    return sum * 0.5 + 0.5;   // [0,1]
}

float maskCircle(vec2 p, float cov) {
    float r = sqrt(cov) * .25;
    float d = length(p - 0.5) - r;
    // cheap analytic AA
    float aa = 0.5 * FWIDTH(d);
    return cov * (1.0 - smoothstep(-aa, aa, d * 2.));
}

float maskTriangle(vec2 p, vec2 id, float cov) {
    bool flip = mod(id.x + id.y, 2.0) > 0.5;
    if (flip) p.x = 1.0 - p.x;
    float r = sqrt(cov);
    float d  = p.y - r*(1.0 - p.x);   // signed distance to the edge
    float aa = FWIDTH(d);             // analytic pixel width
    return cov * clamp(0.5 - d/aa, 0.0, 1.0);
}

float maskDiamond(vec2 p, float cov) {
    float r = sqrt(cov) * 0.564;
    return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
}

// Function to create a ripple at a specific position
// Creates an expanding ring like a water drop - bright ring at wave front, fading on both sides
float createRipple(vec2 uv, vec2 center, float beatTime, float intensity, float speed, float width, float minRadius, float maxRadius) {
    // Allow beatTime == 0.0 (immediate beat detection) and up to 2.0 seconds
    if (beatTime < 0.0 || beatTime > 2.0 || intensity <= 0.0) return 0.0;
    
    float dist = length(uv - center);
    
    // Calculate target radius based on intensity (loudness)
    // Stronger beats create larger rings, weaker beats create smaller rings
    // Intensity maps to size between minRadius and maxRadius
    float targetRadius = minRadius + (maxRadius - minRadius) * intensity;
    
    // Calculate expanding wave radius - speed controls how fast it travels to target size
    // Ring starts at minRadius and expands toward targetRadius
    // Weak beats (low intensity) → smaller target radius (closer to minRadius)
    // Strong beats (high intensity) → larger target radius (closer to maxRadius)
    float radiusRange = targetRadius - minRadius;
    float distanceTraveled = beatTime * speed;
    float waveRadius = minRadius + min(distanceTraveled, radiusRange);
    
    // Calculate movement duration - when the ring stops expanding
    float movementDuration = radiusRange / speed;
    
    // Distance from the wave front (the expanding ring)
    float distFromRing = abs(dist - waveRadius);
    
    // Create expanding ring: brightest at the wave front, fading on both sides
    // This creates the classic water drop ripple effect
    float ripple = exp(-distFromRing / width);
    
    // Fade out synchronized with movement - starts immediately, slow at first, faster at end
    // Normalize time to 0-1 range based on movement duration
    float normalizedTime = beatTime / movementDuration;
    // Clamp to prevent negative fade and ensure fade completes when movement stops
    normalizedTime = min(normalizedTime, 1.0);
    
    // Cubic fade: starts slow (fade stays near 1.0), then accelerates to 0.0
    // This creates: slow fade at start → faster fade → smoothly invisible
    // Fade completes exactly when movement stops (normalizedTime = 1.0)
    float fade = pow(1.0 - normalizedTime, 3.0);
    
    // Ensure fade is 0 when movement has stopped
    if (beatTime >= movementDuration) {
        fade = 0.0;
    }
    
    return ripple * fade * intensity;
}

void main() {
    float pixelSize = uPixelSize; // Size of each pixel in the Bayer matrix
    vec2 fragCoord = gl_FragCoord.xy; // Use non-centered for cell calculation
    vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * .5; // Centered for Bayer dithering

    // Calculate the UV coordinates for the grid
    float aspectRatio = uResolution.x / uResolution.y;

    vec2 pixelId = floor(fragCoordCentered / pixelSize); // integer Bayer cell
    vec2 pixelUV = fract(fragCoordCentered / pixelSize); 

    float cellPixelSize =  8. * pixelSize; // 8x8 Bayer matrix
    vec2 cellId = floor(fragCoord / cellPixelSize); // integer Bayer cell (use non-centered)
    
    vec2 cellCoord = cellId * cellPixelSize;
    
    // Calculate UV properly - normalize to [0,1] range then center for fBm
    vec2 uv = cellCoord / uResolution;
    // Center UV around origin for proper fBm noise calculation
    uv = (uv - 0.5) * vec2(aspectRatio, 1.0);
    
    // Step 3: Position-dependent spatial stereo mapping
    // Left-panned content appears more on left side, right-panned on right side
    // Center-balanced content appears in center
    
    // Get horizontal position in normalized space (-1 = left edge, 0 = center, 1 = right edge)
    // uv.x is already centered and scaled, so divide by aspectRatio to get -0.5 to 0.5, then scale to -1 to 1
    float horizontalPos = (uv.x / aspectRatio) * 2.0;
    
    // Calculate stereo contribution per frequency band
    // Positive stereo = right-panned, negative = left-panned
    float bassStereoContribution = uBassStereo * uBass;
    float midStereoContribution = uMidStereo * uMid;
    float trebleStereoContribution = uTrebleStereo * uTreble;
    
    // Position-dependent stereo mapping
    // Left side (horizontalPos < 0): emphasize left-panned content (negative stereo)
    // Right side (horizontalPos > 0): emphasize right-panned content (positive stereo)
    // Center (horizontalPos ≈ 0): show balanced content
    
    float leftWeight = max(-horizontalPos, 0.0); // 1.0 at left edge, 0.0 at right
    float rightWeight = max(horizontalPos, 0.0);  // 0.0 at left edge, 1.0 at right
    float centerWeight = 1.0 - abs(horizontalPos); // 1.0 at center, 0.0 at edges
    
    // Combine stereo effects with position weighting
    float stereoModulation = 
        (bassStereoContribution + midStereoContribution + trebleStereoContribution) * 0.3 +
        (leftWeight * (bassStereoContribution + midStereoContribution + trebleStereoContribution) * -0.2) +
        (rightWeight * (bassStereoContribution + midStereoContribution + trebleStereoContribution) * 0.2);
    
    // Apply stereo modulation to feed (affects brightness/intensity based on position)
    // Left-panned content makes left side brighter, right-panned makes right side brighter
    float stereoBrightness = 1.0 + stereoModulation * 0.15;

    // Animated fbm feed with time offset
    float staticTimeOffset = 105.0;  // Skip forward in animation (adjust this value)
    
    // Tempo-based animation speed (BPM affects pattern rhythm)
    // Higher BPM = faster animation, but with limits
    float tempoSpeed = 1.0;
    if (uBPM > 0.0) {
        // Normalize BPM to speed multiplier (60-180 BPM range maps to 1.0-2.0x speed)
        float normalizedBPM = clamp((uBPM - 60.0) / 120.0, 0.0, 1.0);
        tempoSpeed = 1.0 + normalizedBPM * 1.0;
    }
    
    // Base animation speed (constant - no volume modulation)
    float baseTimeSpeed = 0.08 * tempoSpeed;
    
    // Time debt system: uTimeOffset accumulates when loud, decays when quiet
    // This creates a "morphing" effect: animation jumps ahead, then catches up
    // Base fBm noise pattern - provides organic spatial variation
    float feed = fbm2(uv, (uTime + staticTimeOffset + uTimeOffset) * baseTimeSpeed);
    
    // Scale feed based on volume - quieter songs stay darker
    // This fixes the white issue: silent songs should be dark, not white
    float volumeScale = 0.3 + uVolume * 0.7; // Range: 0.3-1.0 for quiet, up to 1.0 for loud
    feed = feed * volumeScale;
    
    // Apply stereo brightness modulation (subtle)
    feed *= stereoBrightness;
    
    // Multiple ripples positioned by stereo field
    // Each ripple is independent and expands/fades on its own timeline
    float beatRipple = 0.0;
    
    // Calculate ripple parameters
    // Stereo ranges from -1 (left) to 1 (right), map to horizontal position
    // UV space is centered and scaled by aspectRatio, so we need to scale the stereo position
    // Use configurable uniforms for real-time tuning (fallback values)
    float rippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.5; // Speed of expanding ring (how fast it travels)
    float defaultRippleWidth = uRippleWidth > 0.0 ? uRippleWidth : 0.1; // Default width of the ring
    float defaultRippleMinRadius = uRippleMinRadius >= 0.0 ? uRippleMinRadius : 0.0; // Default minimum ring radius
    float defaultRippleMaxRadius = uRippleMaxRadius > 0.0 ? uRippleMaxRadius : 1.5; // Default maximum ring radius
    float defaultRippleIntensityMultiplier = uRippleIntensity >= 0.0 ? uRippleIntensity : 0.4; // Default intensity multiplier
    
    // Scale stereo position by aspectRatio to match UV space coordinates
    // UV space goes from -aspectRatio/2 to aspectRatio/2 horizontally
    float stereoScale = aspectRatio * 0.5; // Scale to match UV space range
    
    // Render all active ripples
    int maxRipplesInt = MAX_RIPPLES;
    int rippleCount = (uRippleCount < maxRipplesInt) ? uRippleCount : maxRipplesInt;
    for (int i = 0; i < MAX_RIPPLES; i++) {
        if (i >= rippleCount) break; // Stop if we've processed all active ripples
        
        // Check if this ripple is active
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            // Get ripple center position (stereo position in x, vertical position in y based on frequency band)
            vec2 rippleCenter = vec2(uRippleCenterX[i] * stereoScale, uRippleCenterY[i]);
            
            // Get ripple age (time since it started)
            float rippleAge = uRippleTimes[i];
            
            // Get ripple intensity
            float rippleIntensity = uRippleIntensities[i];
            
            // Get per-ripple parameters (use defaults if not set)
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : defaultRippleWidth;
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : defaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : defaultRippleMaxRadius;
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : defaultRippleIntensityMultiplier;
            
            // Create this ripple and add it to the total
            float ripple = createRipple(uv, rippleCenter, rippleAge, rippleIntensity, rippleSpeed, rippleWidth, rippleMinRadius, rippleMaxRadius);
            beatRipple += ripple * rippleIntensityMultiplier; // Apply per-ripple intensity multiplier
        }
    }
    
    // Add ripple to feed - expanding rings add brightness at the wave front
    // This creates the water drop effect where the ring is brighter than the background
    feed = feed + beatRipple; // Intensity multiplier already applied per-ripple
    
    // DEBUG: Force ripple to be visible for testing - shows bright area when any beat is detected
    // Uncomment the line below to test if beat uniforms are being set
    // feed = max(feed, (uBeatIntensityBass + uBeatIntensityMid + uBeatIntensityTreble) * 0.3);

    // Multi-step dithering with Bayer matrix
    // Apply dithering strength multiplier for adjustable intensity
    float ditherStrength = uDitherStrength > 0.0 ? uDitherStrength : 3.0; // Fallback to 3.0 if not set
    float bayer = (Bayer8(fragCoordCentered / uPixelSize) - 0.5) * ditherStrength;
    
    // Frequency-based color mapping
    // Each frequency band lowers its threshold to make its color appear
    // No global boost - frequencies only affect their own color thresholds
    // This allows bass to show dark colors and treble to show bright colors independently
    
    // Ensure feed stays in valid range
    feed = clamp(feed, 0.0, 1.0);
    
    float t = feed; // t spans [0.0, 1.0] for full color gradient range
    
    // Create thresholds for 10 color steps (10 total levels)
    // Frequency-based mapping: each frequency band drives its corresponding color
    // Each frequency has a loudness threshold - color appears when frequency exceeds threshold
    // Smoothed frequency values provide persistence (stay longer than actual frequency)
    
    // Loudness thresholds for each frequency band (minimum value to trigger color)
    float freq1Min = 0.20;  // Brightest: 11.3k-20k Hz, needs 20% loudness to trigger
    float freq2Min = 0.20;  // color2: 5.7k-11.3k Hz, needs 20% loudness to trigger
    float freq3Min = 0.25;  // color3: 2.8k-5.7k Hz, needs 25% loudness to trigger
    float freq4Min = 0.30;  // color4: 1.4k-2.8k Hz, needs 30% loudness to trigger
    float freq5Min = 0.30;  // color5: 707-1414 Hz, needs 30% loudness to trigger
    float freq6Min = 0.25;  // color6: 354-707 Hz, needs 25% loudness to trigger
    float freq7Min = 0.20;  // color7: 177-354 Hz, needs 20% loudness to trigger
    float freq8Min = 0.15;  // color8: 88-177 Hz, needs 15% loudness to trigger
    float freq9Min = 0.10;  // color9: 44-88 Hz, needs 10% loudness to trigger
    float freq10Min = 0.10; // Darkest: 20-44 Hz, needs 10% loudness to trigger
    
    // Calculate active state with smooth transition (prevents harsh cutoffs)
    float freq1Active = smoothstep(freq1Min - 0.05, freq1Min + 0.05, uFreq1);
    float freq2Active = smoothstep(freq2Min - 0.05, freq2Min + 0.05, uFreq2);
    float freq3Active = smoothstep(freq3Min - 0.05, freq3Min + 0.05, uFreq3);
    float freq4Active = smoothstep(freq4Min - 0.05, freq4Min + 0.05, uFreq4);
    float freq5Active = smoothstep(freq5Min - 0.05, freq5Min + 0.05, uFreq5);
    float freq6Active = smoothstep(freq6Min - 0.05, freq6Min + 0.05, uFreq6);
    float freq7Active = smoothstep(freq7Min - 0.05, freq7Min + 0.05, uFreq7);
    float freq8Active = smoothstep(freq8Min - 0.05, freq8Min + 0.05, uFreq8);
    float freq9Active = smoothstep(freq9Min - 0.05, freq9Min + 0.05, uFreq9);
    float freq10Active = smoothstep(freq10Min - 0.05, freq10Min + 0.05, uFreq10);
    
    // Threshold distribution using INVERSE of OKLCH lightness cubic-bezier curve [0.3, 0.0, 1.0, 0.7]
    // Effect: Even more balanced distribution - much less dark, more even progression
    // Result: Smooth, gradual progression across all brightness levels
    
    // Brightest (color1): freq1 (11.3k-20k Hz) - occupies 2.3% of feed range
    float threshold1Base = 0.9800 + bayer * 0.04;
    float threshold1Reduced = threshold1Base - (uFreq1 * 0.05 * freq1Active);  // Minimal reduction
    float threshold1Min = threshold1Base * 0.70;  // Relative floor: 70% of base (preserves Bayer variation)
    float threshold1 = max(threshold1Reduced, threshold1Min);
    
    // color2: freq2 (5.7k-11.3k Hz) - occupies 5.2% of feed range
    float threshold2Base = 0.9571 + bayer * 0.08;
    float threshold2Reduced = threshold2Base - (uFreq2 * 0.08 * freq2Active);  // Slight reduction
    float threshold2Min = threshold2Base * 0.70;  // Relative floor: 70% of base
    float threshold2 = max(threshold2Reduced, threshold2Min);
    
    // color3: freq3 (2.8k-5.7k Hz) - occupies 7.0% of feed range
    float threshold3Base = 0.9054 + bayer * 0.10;
    float threshold3Reduced = threshold3Base - (uFreq3 * 0.12 * freq3Active);  // Light reduction
    float threshold3Min = threshold3Base * 0.70;  // Relative floor: 70% of base
    float threshold3 = max(threshold3Reduced, threshold3Min);
    
    // color4: freq4 (1.4k-2.8k Hz) - occupies 8.3% of feed range
    float threshold4Base = 0.8359 + bayer * 0.12;
    float threshold4Reduced = threshold4Base - (uFreq4 * 0.20 * freq4Active);  // Moderate reduction
    float threshold4Min = threshold4Base * 0.75;  // Relative floor: 75% of base
    float threshold4 = max(threshold4Reduced, threshold4Min);
    
    // color5: freq5 (707-1414 Hz) - occupies 9.5% of feed range
    float threshold5Base = 0.7528 + bayer * 0.14;
    float threshold5Reduced = threshold5Base - (uFreq5 * 0.30 * freq5Active);  // Medium reduction
    float threshold5Min = threshold5Base * 0.75;  // Relative floor: 75% of base
    float threshold5 = max(threshold5Reduced, threshold5Min);
    
    // color6: freq6 (354-707 Hz) - occupies 10.8% of feed range
    float threshold6Base = 0.6577 + bayer * 0.14;
    float threshold6Reduced = threshold6Base - (uFreq6 * 0.35 * freq6Active);  // Medium-strong reduction
    float threshold6Min = threshold6Base * 0.75;  // Relative floor: 75% of base
    float threshold6 = max(threshold6Reduced, threshold6Min);
    
    // color7: freq7 (177-354 Hz) - occupies 12.3% of feed range
    float threshold7Base = 0.5499 + bayer * 0.14;
    float threshold7Reduced = threshold7Base - (uFreq7 * 0.40 * freq7Active);  // Strong reduction
    float threshold7Min = threshold7Base * 0.80;  // Relative floor: 80% of base
    float threshold7 = max(threshold7Reduced, threshold7Min);
    
    // color8: freq8 (88-177 Hz) - occupies 14.7% of feed range
    float threshold8Base = 0.4270 + bayer * 0.12;
    float threshold8Reduced = threshold8Base - (uFreq8 * 0.50 * freq8Active);  // Very strong reduction
    float threshold8Min = threshold8Base * 0.80;  // Relative floor: 80% of base
    float threshold8 = max(threshold8Reduced, threshold8Min);
    
    // color9: freq9 (44-88 Hz) - occupies 26.6% of feed range
    float threshold9Base = 0.2800 + bayer * 0.08;
    float threshold9Reduced = threshold9Base - (uFreq9 * 0.60 * freq9Active);  // Aggressive reduction
    float threshold9Min = threshold9Base * 0.80;  // Relative floor: 80% of base
    float threshold9 = max(threshold9Reduced, threshold9Min);
    
    // Darkest (color10): freq10 (20-44 Hz) - occupies 26.6% of feed range
    float threshold10Base = 0.0138 + bayer * 0.04;
    float threshold10Reduced = threshold10Base - (uFreq10 * 0.70 * freq10Active);  // Maximum reduction
    float threshold10Min = threshold10Base * 0.80;  // Relative floor: 80% of base
    float threshold10 = max(threshold10Reduced, threshold10Min);
    
    vec3 color;
    float coverage = 1.0;
    
    // CRITICAL: Ensure all color uniforms are always referenced to prevent WebGL optimization
    // Calculate a weighted sum that always evaluates all uniforms (even if weight is 0)
    // This prevents the shader compiler from optimizing them out as unused
    
    // Transition width control: larger = softer edges, smaller = sharper edges
    // Use uniform for real-time control (0.005-0.1 range, 0.005 default)
    float transitionWidth = uTransitionWidth > 0.0 ? uTransitionWidth : 0.005; // Fallback to 0.005
    
    // Use smoothstep instead of step for gradual color transitions
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
    
    // Always evaluate all uniforms - this prevents optimization
    // Add tiny contribution from each to ensure WebGL can't optimize them out
    // Even if weight is 0, the uniform is still referenced in the calculation
    color = uColor * w1 + uColor2 * w2 + uColor3 * w3 + uColor4 * w4 + uColor5 * w5 + 
            uColor6 * w6 + uColor7 * w7 + uColor8 * w8 + uColor9 * w9 + uColor10 * (w10 + w0);
    
    // Force all uniforms to be evaluated by using them in a calculation that can't be optimized
    // This ensures WebGL doesn't remove them even if weights suggest they're unused
    float uniformPresence = (uColor.r + uColor2.r + uColor3.r + uColor4.r + uColor5.r + 
                            uColor6.r + uColor7.r + uColor8.r + uColor9.r + uColor10.r) * 0.0000001;
    color += vec3(uniformPresence); // Negligible but prevents optimization
    // If you see a gradient, t is working. If you see black, t is too low.
    // gl_FragColor = vec4(vec3(t), 1.0);
    // return;
    
    // Remove aggressive fallback - let natural gradients show through
    // The wider t range and better threshold distribution should handle visibility
    
    // Blend title texture with shader output
    vec3 finalColor = color;
    
    // Check if title texture is available (size > 0 indicates texture is set)
    if (uTitleTextureSize.x > 1.0 && uTitleTextureSize.y > 1.0) {
        // Calculate UV coordinates for title texture
        // Since texture matches canvas size, screen space maps 1:1 to texture UV
        vec2 screenUV = gl_FragCoord.xy / uResolution.xy; // 0-1 screen space
        
        // Determine which scale to use based on playback progress
        float playbackProgressForScale = clamp(uPlaybackProgress, 0.0, 1.0);
        float titleScale = uTitleScale > 0.0 ? uTitleScale : 1.0;
        float currentScale;
        if (playbackProgressForScale < 0.08) {
            // Phase 1-2: use center scale
            currentScale = titleScale;
        } else {
            // Phase 3+: use bottom left scale (smaller)
            currentScale = uTitleScaleBottomLeft > 0.0 ? uTitleScaleBottomLeft : 0.6;
        }
        
        // uTitlePositionOffset contains target screen position (0-1)
        // x: 0.0 = left edge, 0.5 = center, 1.0 = right edge
        // y: 0.0 = top edge, 0.5 = center, 1.0 = bottom edge
        vec2 targetScreenPos = uTitlePositionOffset;
        
        // Since texture matches canvas, screen space maps 1:1 to texture UV
        // Text is now rendered at the correct position in the texture (matching targetScreenPos)
        // So we can simply scale around the target position
        
        vec2 titleUV;
        // Scale around target position (text is already at targetScreenPos in texture)
        titleUV = (screenUV - targetScreenPos) / currentScale + targetScreenPos;
        
        // Flip Y coordinate (canvas has 0,0 at top-left, WebGL texture has 0,0 at bottom-left)
        titleUV.y = 1.0 - titleUV.y;
        
        // Clamp UV to valid range
        titleUV = clamp(titleUV, 0.0, 1.0);
        
        // Sample title texture
        vec4 titleColor = texture2D(uTitleTexture, titleUV);
        
        // Calculate text position in the same UV space as visualization
        // Convert titleUV (screen space 0-1) to centered UV space used by fBm
        // titleUV is already in screen space, convert to centered UV like the main visualization
        vec2 textScreenUV = titleUV;
        vec2 textVizUV = (textScreenUV - 0.5) * vec2(aspectRatio, 1.0);
        
        // Calculate feed at text position (use same fBm system, no ripples)
        float textFeed = fbm2(textVizUV, (uTime + staticTimeOffset + uTimeOffset) * baseTimeSpeed);
        textFeed = textFeed * volumeScale * stereoBrightness;
        textFeed = clamp(textFeed, 0.0, 1.0);
        
        // Calculate intensity/brightness at text position (needed for all phases)
        float textBrightness = dot(color, vec3(0.299, 0.587, 0.114)); // Luminance calculation
        
        // Sequence phases:
        // Phase 1: 0-5% - Beginning: fade in, visible, affected by sound/visualization, then fade out
        // Phase 2: 5-8% - Transition: move position and scale (text hidden during transition)
        // Phase 3: 8%-95% - Bottom left: visible based on loudness, impacted by pixels, slightly visible
        // Phase 4: 95-100% - End: can show again if needed
        
        float playbackProgress = clamp(uPlaybackProgress, 0.0, 1.0);
        float phase1End = 0.05;      // End of beginning phase (5%)
        float phase2Start = 0.05;    // Start of transition (5%)
        float phase2End = 0.08;      // End of transition (8%)
        float phase3Start = 0.08;    // Start of bottom left phase (8%)
        float phase3End = 0.95;      // End of bottom left phase (95%)
        
        float textVisibility = 0.0;
        
        if (playbackProgress < phase1End) {
            // Phase 1: Beginning - fade in, visible, affected by sound/visualization, then fade out
            float fadeInDuration = 0.01;  // Fade in over 1% (very quick)
            float fadeOutStart = phase1End - 0.02; // Start fade out 2% before end
            
            float fadeIn = smoothstep(0.0, fadeInDuration, playbackProgress);
            float fadeOut = 1.0 - smoothstep(fadeOutStart, phase1End, playbackProgress);
            float baseVisibility = min(fadeIn, fadeOut);
            
            // Affected by sound/visualization
            float loudnessFactor = smoothstep(0.1, 0.6, uVolume);
            float brightnessFactor = smoothstep(0.2, 0.7, textBrightness);
            float feedFactor = smoothstep(0.3, 0.7, textFeed);
            float audioVisualFactor = max(loudnessFactor, max(brightnessFactor, feedFactor));
            
            textVisibility = baseVisibility * (0.6 + audioVisualFactor * 0.4); // 60% base + up to 40% from audio/visual
            
        } else if (playbackProgress >= phase2Start && playbackProgress < phase2End) {
            // Phase 2: Transition - text hidden during position/scale transition
            textVisibility = 0.0;
            
        } else if (playbackProgress >= phase3Start && playbackProgress < phase3End) {
            // Phase 3: Bottom left - visible based on loudness, impacted by surrounding pixels, slightly visible
            float volumeBasedVisibility = smoothstep(0.15, 0.5, uVolume); // Show when volume is present
            float brightnessBasedVisibility = smoothstep(0.2, 0.6, textBrightness); // Impacted by surrounding pixels
            float feedBasedVisibility = smoothstep(0.2, 0.5, textFeed); // Show when feed is present
            
            // Combine factors - any one can make it visible
            float combinedVisibility = max(volumeBasedVisibility, max(brightnessBasedVisibility, feedBasedVisibility));
            
            // Slightly visible - scale down to make it subtle
            textVisibility = combinedVisibility * 0.4; // 40% max visibility (slightly visible)
            
        } else {
            // Phase 4: End (95-100%) - can show again if needed
            float endFadeIn = smoothstep(phase3End, phase3End + 0.02, playbackProgress);
            float volumeBasedVisibility = smoothstep(0.15, 0.5, uVolume);
            float brightnessBasedVisibility = smoothstep(0.2, 0.6, textBrightness);
            textVisibility = endFadeIn * max(volumeBasedVisibility, brightnessBasedVisibility) * 0.5;
        }
        
        textVisibility = clamp(textVisibility, 0.0, 1.0);
        
        // Use the SAME color system for text (use visualization color)
        // Mix between pure white and visualization color (70% viz, 30% white for readability)
        vec3 titleColorRGB = mix(vec3(1.0), color, 0.7);
        
        // Text alpha combines: base alpha, feed-based visibility, and ripple boost
        float baseAlpha = 0.4;
        float titleAlpha = titleColor.a * baseAlpha * textVisibility;
        
        // Additive blend - text adds to visualization, feels like part of it
        finalColor = finalColor + titleColorRGB * titleAlpha * 0.5;
    }
    
    gl_FragColor = vec4(finalColor, coverage);
}
