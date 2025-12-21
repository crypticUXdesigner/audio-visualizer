precision highp float;

// Include common code
#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"
#include "common/color-mapping.glsl"
#include "common/ripples.glsl"
#include "common/screen-adaptation.glsl"

// Synthwave-specific uniforms
uniform float uGridDensity;
uniform float uPerspectiveStrength;
uniform float uScanlineIntensity;
uniform float uGlowIntensity;
uniform float uHorizonPosition;

// Shader-specific constants
#define FBM_OCTAVES     5
#define FBM_LACUNARITY  1.4
#define FBM_GAIN        0.6
#define FBM_SCALE       0.8

// Synthwave-specific functions
// Smooth step with better falloff
float smoothstep2(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
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
    float aspectRatio = getAspectRatio();
    
    // Calculate UV coordinates (centered, aspect-corrected)
    vec2 uv = fragCoord / uResolution;
    uv = (uv - 0.5) * vec2(aspectRatio, 1.0);
    
    // Time-based animation with tempo and volume modulation
    // Synthwave uses slightly different tempo speed calculation (0.5 multiplier instead of 1.0)
    // and different volume modulation weights, so we'll calculate it manually
    float staticTimeOffset = 50.0;
    float tempoSpeed = 1.0;
    if (uBPM > 0.0) {
        float normalizedBPM = clamp((uBPM - 60.0) / 120.0, 0.0, 1.0);
        tempoSpeed = 1.0 + normalizedBPM * 0.5; // Synthwave uses 0.5 multiplier
    }
    
    float baseTimeSpeed = 0.05 * tempoSpeed;
    // Synthwave uses different volume modulation weights: (uVolume + uBass * 0.3 + uMid * 0.2 + uTreble * 0.1) * 0.1
    // The shared function uses: (uVolume + uBass * 0.3 + uMid * 0.2 + uTreble * 0.1) * volumeSensitivity
    // So we'll calculate it manually to match synthwave's specific behavior
    float volumeSensitivity = 0.0;
    if (uVolume > 0.0) {
        float lowVolumeRange = 0.3;
        if (uVolume < lowVolumeRange) {
            volumeSensitivity = 2.0 - (uVolume / lowVolumeRange);
        } else {
            float highVolumeT = (uVolume - lowVolumeRange) / (1.0 - lowVolumeRange);
            volumeSensitivity = 1.0 - (highVolumeT * 0.7);
        }
    } else {
        volumeSensitivity = 2.0;
    }
    float volumeModulation = (uVolume + uBass * 0.3 + uMid * 0.2 + uTreble * 0.1) * volumeSensitivity;
    float modulatedTime = (uTime + staticTimeOffset + uTimeOffset) * baseTimeSpeed + volumeModulation * 0.1; // Synthwave uses 0.1 multiplier
    
    // Draw perspective grid with time animation
    float grid = drawGrid(uv, aspectRatio, modulatedTime);
    
    // Add fBm noise layer for texture and depth
    vec2 noiseUV = uv * 0.3; // Scale noise for larger features
    float noiseValue = fbm2_standard(noiseUV, modulatedTime * 0.3, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
    
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
    
    // Add frequency-based contributions (using simplified active states for feed calculation)
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
    
    // Calculate frequency active states using shared function
    float freq1Active2, freq2Active2, freq3Active2, freq4Active2, freq5Active2;
    float freq6Active2, freq7Active2, freq8Active2, freq9Active2, freq10Active2;
    calculateFrequencyActiveStates(
        freq1Active2, freq2Active2, freq3Active2, freq4Active2, freq5Active2,
        freq6Active2, freq7Active2, freq8Active2, freq9Active2, freq10Active2
    );
    
    // Calculate thresholds using shared function (WITH frequency modulation for synthwave)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    // Synthwave doesn't use bayer dithering in color mapping, so pass 0.0
    calculateFrequencyThresholds(
        0.0,  // No bayer dithering for synthwave
        freq1Active2, freq2Active2, freq3Active2, freq4Active2, freq5Active2,
        freq6Active2, freq7Active2, freq8Active2, freq9Active2, freq10Active2,
        true,  // useFrequencyModulation = true for synthwave (frequency affects thresholds)
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
    
    // Clamp final color
    color = clamp(color, 0.0, 1.0);
    
    gl_FragColor = vec4(color, 1.0);
}
