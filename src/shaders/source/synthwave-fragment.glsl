precision highp float;

uniform vec3  uColor;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform vec3  uColor8;
uniform vec3  uColor9;
uniform vec3  uColor10;
uniform float uSteps;
uniform vec2  uResolution;
uniform vec4  uMouse;
uniform float uTime;
uniform float uTimeOffset;
uniform float uPixelSize;

// Synthwave parameters
uniform float uGridDensity;
uniform float uPerspectiveStrength;
uniform float uScanlineIntensity;
uniform float uGlowIntensity;
uniform float uHorizonPosition;

// Audio uniforms
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;

// Frequency bands for color mapping
uniform float uFreq1;
uniform float uFreq2;
uniform float uFreq3;
uniform float uFreq4;
uniform float uFreq5;
uniform float uFreq6;
uniform float uFreq7;
uniform float uFreq8;
uniform float uFreq9;
uniform float uFreq10;

// Stereo balance uniforms
uniform float uBassStereo;
uniform float uMidStereo;
uniform float uTrebleStereo;

// Temporal and beat detection uniforms
uniform float uSmoothedBass;
uniform float uSmoothedMid;
uniform float uSmoothedTreble;
uniform float uPeakBass;
uniform float uBeatTime;
uniform float uBeatIntensity;
uniform float uBPM;

// Multi-frequency beat uniforms
uniform float uBeatTimeBass;
uniform float uBeatTimeMid;
uniform float uBeatTimeTreble;
uniform float uBeatIntensityBass;
uniform float uBeatIntensityMid;
uniform float uBeatIntensityTreble;
uniform float uBeatStereoBass;
uniform float uBeatStereoMid;
uniform float uBeatStereoTreble;

// Multiple ripple tracking uniforms
#define MAX_RIPPLES 16
uniform float uRippleCenterX[MAX_RIPPLES];
uniform float uRippleCenterY[MAX_RIPPLES];
uniform float uRippleTimes[MAX_RIPPLES];
uniform float uRippleIntensities[MAX_RIPPLES];
uniform float uRippleWidths[MAX_RIPPLES];
uniform float uRippleMinRadii[MAX_RIPPLES];
uniform float uRippleMaxRadii[MAX_RIPPLES];
uniform float uRippleIntensityMultipliers[MAX_RIPPLES];
uniform float uRippleActive[MAX_RIPPLES];
uniform int uRippleCount;

// Ripple effect parameters
uniform float uRippleSpeed;
uniform float uRippleWidth;
uniform float uRippleMinRadius;
uniform float uRippleMaxRadius;
uniform float uRippleIntensityThreshold;
uniform float uRippleIntensity;

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

// fBm noise for texture and depth
#define FBM_OCTAVES     5
#define FBM_LACUNARITY  1.4
#define FBM_GAIN        0.6
#define FBM_SCALE       0.8

// Hash function for random values
float hash11(float n) { 
    return fract(sin(n) * 43758.5453); 
}

// 2D hash for vec2
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

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
    float sum  = 0.;

    for (int i = 0; i < FBM_OCTAVES; ++i)
    {
        sum  += amp * vnoise(p * freq);
        freq *= FBM_LACUNARITY;
        amp  *= FBM_GAIN;
    }
    
    return sum * 0.5 + 0.5;   // [0,1]
}

// Smooth step with better falloff
float smoothstep2(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// Function to create a ripple at a specific position
float createRipple(vec2 uv, vec2 center, float beatTime, float intensity, float speed, float width, float minRadius, float maxRadius) {
    if (beatTime < 0.0 || beatTime > 2.0 || intensity <= 0.0) return 0.0;
    
    float dist = length(uv - center);
    
    float targetRadius = minRadius + (maxRadius - minRadius) * intensity;
    float radiusRange = targetRadius - minRadius;
    float distanceTraveled = beatTime * speed;
    float waveRadius = minRadius + min(distanceTraveled, radiusRange);
    
    float movementDuration = radiusRange / speed;
    float distFromRing = abs(dist - waveRadius);
    float ripple = exp(-distFromRing / width);
    
    float normalizedTime = beatTime / movementDuration;
    normalizedTime = min(normalizedTime, 1.0);
    float fade = pow(1.0 - normalizedTime, 3.0);
    
    if (beatTime >= movementDuration) {
        fade = 0.0;
    }
    
    return ripple * fade * intensity;
}

// Draw perspective grid lines with enhanced glow - mobile/portrait compatible
float drawGrid(vec2 uv, float aspectRatio, float time) {
    // Center UV coordinates
    vec2 centeredUV = uv;
    
    // Apply stereo offset (horizontal shift based on audio)
    float stereoOffset = (uBassStereo * uBass + uMidStereo * uMid + uTrebleStereo * uTreble) * 0.3;
    centeredUV.x += stereoOffset * aspectRatio;
    
    // Add subtle time-based animation to grid (slow drift)
    float timeOffset = sin(time * 0.1) * 0.05;
    centeredUV.y += timeOffset;
    
    // Adaptive horizon: adjust for portrait/landscape
    float adaptiveHorizon = uHorizonPosition;
    if (aspectRatio < 1.0) {
        adaptiveHorizon = mix(0.7, 0.85, (1.0 - aspectRatio) / 0.4);
    }
    
    // Perspective transformation: lines converge at horizon
    float distFromHorizon = abs(centeredUV.y - adaptiveHorizon);
    
    // Perspective factor: stronger as we go down (away from horizon)
    float perspectiveScale = mix(1.0, aspectRatio, 0.3);
    float perspectiveFactor = 1.0 + distFromHorizon * uPerspectiveStrength * perspectiveScale;
    
    // Audio-reactive perspective: bass increases depth
    float audioDepth = 1.0 + uBass * 0.5;
    perspectiveFactor *= audioDepth;
    
    // Grid spacing with perspective - adapt density for portrait
    float gridSpacing = uGridDensity;
    if (aspectRatio < 1.0) {
        gridSpacing *= 0.85;
    }
    
    // Horizontal lines (converge at horizon)
    float horizontalLines = 0.0;
    float yDist = centeredUV.y - adaptiveHorizon;
    if (yDist > 0.0) {
        float perspectiveY = yDist * perspectiveFactor;
        float lineY = mod(perspectiveY * gridSpacing, 1.0);
        // Enhanced line width with distance-based scaling
        float lineWidth = 0.025 * (1.0 + yDist * 0.6);
        horizontalLines = smoothstep2(lineWidth, 0.0, min(lineY, 1.0 - lineY));
        
        // Add glow effect - wider falloff for bloom
        float glowWidth = lineWidth * 2.5;
        float glow = smoothstep2(glowWidth, 0.0, min(lineY, 1.0 - lineY)) * 0.3;
        horizontalLines = max(horizontalLines, glow);
    }
    
    // Vertical lines (converge at center)
    float verticalLines = 0.0;
    float xDist = abs(centeredUV.x);
    float perspectiveX = xDist * perspectiveFactor;
    float lineX = mod(perspectiveX * gridSpacing, 1.0);
    float lineWidthX = 0.018;
    verticalLines = smoothstep2(lineWidthX, 0.0, min(lineX, 1.0 - lineX));
    
    // Add glow to vertical lines too
    float glowWidthX = lineWidthX * 2.5;
    float glowX = smoothstep2(glowWidthX, 0.0, min(lineX, 1.0 - lineX)) * 0.3;
    verticalLines = max(verticalLines, glowX);
    
    // Combine grid lines
    float grid = max(horizontalLines, verticalLines);
    
    // Beat pulse effect: grid brightens on beats with enhanced glow
    float beatPulse = 0.0;
    if (uBeatTimeBass < 0.4 && uBeatIntensityBass > 0.5) {
        float beatProgress = uBeatTimeBass / 0.4;
        float pulse = (1.0 - beatProgress) * uBeatIntensityBass;
        beatPulse = max(beatPulse, pulse * 0.6);
    }
    if (uBeatTimeMid < 0.4 && uBeatIntensityMid > 0.5) {
        float beatProgress = uBeatTimeMid / 0.4;
        float pulse = (1.0 - beatProgress) * uBeatIntensityMid;
        beatPulse = max(beatPulse, pulse * 0.4);
    }
    
    grid += beatPulse;
    grid = min(grid, 1.0);
    
    return grid;
}

// Create scanlines effect - orientation-aware
float scanlines(vec2 fragCoord) {
    float scanlineFreq = uResolution.y * 0.5;
    float scanline = sin(fragCoord.y * scanlineFreq) * 0.5 + 0.5;
    
    // Audio-reactive: treble controls scanline intensity
    float trebleMod = uTreble * 0.5;
    float scanlineIntensity = uScanlineIntensity + trebleMod;
    
    return 1.0 - scanline * scanlineIntensity;
}

// Create sunset gradient (horizontal bands) - works in both orientations
vec3 sunsetGradient(float y, float aspectRatio) {
    float normalizedY = (y + 0.5);
    
    if (aspectRatio < 1.0) {
        normalizedY = normalizedY * 0.9 + 0.05;
    }
    
    float band1 = smoothstep2(0.0, 0.2, normalizedY) * (1.0 - smoothstep2(0.2, 0.4, normalizedY));
    float band2 = smoothstep2(0.2, 0.4, normalizedY) * (1.0 - smoothstep2(0.4, 0.6, normalizedY));
    float band3 = smoothstep2(0.4, 0.6, normalizedY) * (1.0 - smoothstep2(0.6, 0.8, normalizedY));
    float band4 = smoothstep2(0.6, 0.8, normalizedY) * (1.0 - smoothstep2(0.8, 1.0, normalizedY));
    float band5 = smoothstep2(0.8, 1.0, normalizedY);
    
    vec3 color = uColor10 * band1 + 
                 uColor8 * band2 + 
                 uColor6 * band3 + 
                 uColor4 * band4 + 
                 uColor2 * band5;
    
    return color;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    float aspectRatio = uResolution.x / uResolution.y;
    
    // Calculate UV coordinates (centered, aspect-corrected)
    vec2 uv = fragCoord / uResolution;
    uv = (uv - 0.5) * vec2(aspectRatio, 1.0);
    
    // Time-based animation with tempo and volume modulation
    float staticTimeOffset = 50.0;
    float tempoSpeed = 1.0;
    if (uBPM > 0.0) {
        float normalizedBPM = clamp((uBPM - 60.0) / 120.0, 0.0, 1.0);
        tempoSpeed = 1.0 + normalizedBPM * 0.5;
    }
    
    float baseTimeSpeed = 0.05 * tempoSpeed;
    float volumeModulation = (uVolume + uBass * 0.3 + uMid * 0.2 + uTreble * 0.1) * 0.1;
    float modulatedTime = (uTime + staticTimeOffset + uTimeOffset) * baseTimeSpeed + volumeModulation;
    
    // Draw perspective grid with time animation
    float grid = drawGrid(uv, aspectRatio, modulatedTime);
    
    // Add fBm noise layer for texture and depth
    vec2 noiseUV = uv * 0.3; // Scale noise for larger features
    float noiseValue = fbm2(noiseUV, modulatedTime * 0.3);
    
    // Use noise to add subtle variation to grid and background
    float noiseContribution = (noiseValue - 0.5) * 0.15; // Subtle variation
    
    // Create base color from sunset gradient
    vec3 baseColor = sunsetGradient(uv.y, aspectRatio);
    
    // Add noise-based color variation
    vec3 noiseColor = baseColor * (1.0 + noiseContribution);
    
    // Build feed value (0-1) for color system - enhanced with noise
    float feed = grid * uGlowIntensity * 0.4;
    
    // Add noise contribution to feed
    feed += noiseValue * 0.25;
    
    // Add volume contribution
    feed += uVolume * 0.25;
    
    // Add frequency-based contributions
    float freq1Active = smoothstep(0.15, 0.25, uFreq1);
    float freq2Active = smoothstep(0.15, 0.25, uFreq2);
    float freq3Active = smoothstep(0.20, 0.30, uFreq3);
    float freq4Active = smoothstep(0.25, 0.35, uFreq4);
    float freq5Active = smoothstep(0.25, 0.35, uFreq5);
    
    float freqContribution = (uFreq1 * freq1Active + 
                             uFreq2 * freq2Active + 
                             uFreq3 * freq3Active + 
                             uFreq4 * freq4Active + 
                             uFreq5 * freq5Active) * 0.1;
    feed += freqContribution;
    
    // Add mid frequency glow
    feed += uMid * 0.15;
    
    // Add ripple effects
    float beatRipple = 0.0;
    float rippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.3;
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
    feed += beatRipple * 0.3;
    
    // Clamp feed to valid range
    feed = clamp(feed, 0.0, 1.0);
    
    float t = feed;
    
    // Frequency-based threshold modification (same pattern as refraction)
    float freq1Min = 0.20;
    float freq2Min = 0.20;
    float freq3Min = 0.25;
    float freq4Min = 0.30;
    float freq5Min = 0.30;
    float freq6Min = 0.25;
    float freq7Min = 0.20;
    float freq8Min = 0.15;
    float freq9Min = 0.10;
    float freq10Min = 0.10;
    
    float freq1Active2 = smoothstep(freq1Min - 0.05, freq1Min + 0.05, uFreq1);
    float freq2Active2 = smoothstep(freq2Min - 0.05, freq2Min + 0.05, uFreq2);
    float freq3Active2 = smoothstep(freq3Min - 0.05, freq3Min + 0.05, uFreq3);
    float freq4Active2 = smoothstep(freq4Min - 0.05, freq4Min + 0.05, uFreq4);
    float freq5Active2 = smoothstep(freq5Min - 0.05, freq5Min + 0.05, uFreq5);
    float freq6Active2 = smoothstep(freq6Min - 0.05, freq6Min + 0.05, uFreq6);
    float freq7Active2 = smoothstep(freq7Min - 0.05, freq7Min + 0.05, uFreq7);
    float freq8Active2 = smoothstep(freq8Min - 0.05, freq8Min + 0.05, uFreq8);
    float freq9Active2 = smoothstep(freq9Min - 0.05, freq9Min + 0.05, uFreq9);
    float freq10Active2 = smoothstep(freq10Min - 0.05, freq10Min + 0.05, uFreq10);
    
    // Threshold distribution (same pattern as refraction)
    float transitionWidth = 0.003;
    
    float threshold1 = uThreshold1 - (uFreq1 * 0.05 * freq1Active2);
    float threshold2 = uThreshold2 - (uFreq2 * 0.08 * freq2Active2);
    float threshold3 = uThreshold3 - (uFreq3 * 0.12 * freq3Active2);
    float threshold4 = uThreshold4 - (uFreq4 * 0.20 * freq4Active2);
    float threshold5 = uThreshold5 - (uFreq5 * 0.30 * freq5Active2);
    float threshold6 = uThreshold6 - (uFreq6 * 0.35 * freq6Active2);
    float threshold7 = uThreshold7 - (uFreq7 * 0.25 * freq7Active2);
    float threshold8 = uThreshold8 - (uFreq8 * 0.30 * freq8Active2);
    float threshold9 = uThreshold9 - (uFreq9 * 0.40 * freq9Active2);
    float threshold10 = uThreshold10 - (uFreq10 * 0.50 * freq10Active2);
    
    // Color selection with smooth transitions (same pattern as refraction)
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
    
    // Select color from palette using threshold system
    vec3 color = uColor * w1 + uColor2 * w2 + uColor3 * w3 + uColor4 * w4 + uColor5 * w5 + 
                 uColor6 * w6 + uColor7 * w7 + uColor8 * w8 + uColor9 * w9 + uColor10 * (w10 + w0);
    
    // Blend with sunset gradient for depth
    vec3 gradientColor = sunsetGradient(uv.y, aspectRatio);
    color = mix(color, gradientColor, 0.35);
    
    // Add noise-based color variation
    color = mix(color, noiseColor, 0.15);
    
    // Apply enhanced grid glow with bloom effect
    float gridGlow = grid * uGlowIntensity;
    color *= (1.0 + gridGlow * 0.6);
    
    // Add ripple glow effect
    if (beatRipple > 0.1) {
        float rippleGlow = beatRipple * 0.4;
        color += baseColor * rippleGlow;
    }
    
    // Apply scanlines
    float scanlineFactor = scanlines(fragCoord);
    color *= scanlineFactor;
    
    // Volume-based brightness with better range
    float volumeBrightness = 0.75 + uVolume * 0.25;
    color *= volumeBrightness;
    
    // Add subtle vignette effect at edges
    float distFromCenter = length(uv) / length(vec2(aspectRatio, 1.0));
    float vignette = 1.0 - smoothstep(0.6, 1.2, distFromCenter) * 0.15;
    color *= vignette;
    
    // Ensure uniform presence (prevent optimization)
    float uniformPresence = (uColor.r + uColor2.r + uColor3.r + uColor4.r + uColor5.r + 
                            uColor6.r + uColor7.r + uColor8.r + uColor9.r + uColor10.r) * 0.0000001;
    color += vec3(uniformPresence);
    
    // Clamp final color
    color = clamp(color, 0.0, 1.0);
    
    gl_FragColor = vec4(color, 1.0);
}
