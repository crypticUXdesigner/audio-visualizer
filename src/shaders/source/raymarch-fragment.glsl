precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"
#include "common/color-mapping.glsl"
#include "common/oklch.glsl"

// Raymarch parameters
uniform float uBaseAnimationSpeed;      // Base animation speed multiplier (0.0-5.0)
uniform float uTimeModulationStrength;  // Strength of time modulation (0.0-2.0)
uniform float uFractalIntensityStrength; // Strength of fractal deformation (0.0-3.0)
uniform float uRaymarchBaseSteps;       // Base number of raymarch steps (20.0-200.0)
uniform float uRaymarchAudioSteps;     // Additional steps from audio (0.0-100.0)
uniform float uRaymarchInvertReactivity; // 1.0 = invert (louder = less detail), 0.0 = normal
uniform float uFractalLayerModulation;  // Strength of fractal layer audio modulation (0.0-1.0)
uniform float uDepthAudioResponse;       // Strength of depth-based audio response (0.0-1.0)

// Audio reactivity enable flags (1.0 = enabled, 0.0 = disabled)
uniform float uEnableTimeModulation;      // Enable time modulation
uniform float uEnableFractalIntensity;     // Enable fractal intensity modulation
uniform float uEnableRaymarchSteps;        // Enable raymarch step audio reactivity
uniform float uEnableFractalLayers;       // Enable fractal layer modulation
uniform float uEnableDepthResponse;        // Enable depth audio response
uniform float uEnableMultiFrequency;       // Enable multi-frequency shape control
uniform float uEnableColorFrequency;      // Enable frequency-based color modulation
uniform float uEnableColorSystem;          // Enable color system (0.0 = use original blue tint)

// Smoothed audio-reactive values (calculated in JavaScript with BPM-based attack/release)
uniform float uSmoothedTimeModulation;     // Smoothed time modulation value
uniform float uSmoothedFractalIntensity;   // Smoothed fractal intensity value
uniform float uSmoothedRaymarchSteps;      // Smoothed raymarch steps value
uniform float uSmoothedFractalLayers;      // Smoothed fractal layers value
uniform float uSmoothedDepthResponse;      // Smoothed depth response value
uniform float uSmoothedMultiFrequency;     // Smoothed multi-frequency value

void main() {
    vec3 FC = gl_FragCoord.xyz;
    vec2 r = uResolution;
    
    // Base animation speed and time modulation
    float timeMod = uBaseAnimationSpeed;
    if (uEnableTimeModulation > 0.5) {
        // Apply audio-reactive modulation on top of base speed
        // Use smoothed value (calculated in JavaScript with attack/release)
        timeMod = uBaseAnimationSpeed * (1.0 + uSmoothedTimeModulation);
    }
    float t = uTime * timeMod;
    
    vec4 o = vec4(0.0);
    vec3 p = vec3(0.0);
    float z = 0.0;
    float f = 0.0;
    
    // Raymarch step count: reacts to volume with invert option (if enabled)
    float maxSteps = uRaymarchBaseSteps;
    if (uEnableRaymarchSteps > 0.5) {
        // Use smoothed value (calculated in JavaScript with attack/release)
        maxSteps = uRaymarchBaseSteps + uSmoothedRaymarchSteps;
    }
    maxSteps = clamp(maxSteps, 20.0, 200.0);
    
    // Use constant loop bound (200 max) with early break
    for(float i = 0.0; i < 200.0; i++) {
        // Early break if we've reached the desired step count
        if (i >= maxSteps) break;
        // Distance field calculation
        float shapeMod = 3.0 - 0.2 * z - max(p, -p * 0.4).y;
        f = max(shapeMod, -shapeMod * 0.5);
        f = 0.02 + 0.1 * f;
        z += f;
        o += f / z;
        
        // Initialize position for inner loop
        p = z * normalize(FC.rgb * 2.0 - r.xyy);
        f = 0.5;
        p.x *= f;
        
        // Fractal intensity: deformation strength reacts to bass (if enabled)
        float fractalStrength = 1.0;
        if (uEnableFractalIntensity > 0.5) {
            // Use smoothed value (calculated in JavaScript with attack/release)
            fractalStrength = 1.0 + uSmoothedFractalIntensity;
        }
        
        // Fractal layer modulation: more layers on treble (if enabled)
        float activeLayers = 9.0;
        if (uEnableFractalLayers > 0.5) {
            // Use smoothed value (calculated in JavaScript with attack/release)
            activeLayers = 9.0 + uSmoothedFractalLayers;
        }
        activeLayers = clamp(activeLayers, 3.0, 18.0);
        
        // Inner loop: fractal iteration with audio reactivity
        // Use constant loop bound (18 max) with early break
        for(float j = 0.0; j < 18.0; j++) {
            // Early break if we've reached the desired layer count
            if (j >= activeLayers) break;
            f += 1.0;
            
            // Depth-based audio response: stronger near camera (if enabled)
            float depthMod = 1.0;
            if (uEnableDepthResponse > 0.5 && uDepthAudioResponse > 0.0) {
                // Use smoothed value (calculated in JavaScript with attack/release)
                depthMod = 1.0 + uSmoothedDepthResponse * (1.0 - z / 10.0);
                depthMod = clamp(depthMod, 0.5, 2.0);
            }
            
            // Multi-frequency shape control (if enabled)
            float freqMod = 1.0;
            if (uEnableMultiFrequency > 0.5) {
                // Use smoothed value (calculated in JavaScript with attack/release)
                // Modulates oscillation frequency based on bass (strength already applied in plugin)
                freqMod = 1.0 + uSmoothedMultiFrequency;
            }
            
            p += sin(p.yzx * f * freqMod - t / 4.0) / f * fractalStrength * depthMod;
        }
    }
    
    // Apply original processing first (preserves visual structure)
    o = smoothstep(4.0, 7.0, o / vec4(0.7, 0.8, 1.0, 1.0));
    
    // Color output: use color system as tint or original orange/yellow tint
    if (uEnableColorSystem > 0.5) {
        // Extract luminance from processed result to determine tint strength
        float luminance = dot(o.rgb, vec3(0.299, 0.587, 0.114));
        float raymarchValue = clamp(luminance, 0.0, 1.0);
        
        // Calculate thresholds with frequency modulation (if enabled)
        float threshold1, threshold2, threshold3, threshold4, threshold5;
        float threshold6, threshold7, threshold8, threshold9, threshold10;
        bool useFrequencyModulation = uEnableColorFrequency > 0.5;
        calculateAllFrequencyThresholds(
            0.0,  // No dithering
            useFrequencyModulation, // useFrequencyModulation based on enable flag
            threshold1, threshold2, threshold3, threshold4, threshold5,
            threshold6, threshold7, threshold8, threshold9, threshold10
        );
        
        // Interpolate hue and saturation (chroma) directly in OKLCH space for continuous transitions
        // Convert all colors to OKLCH for smooth interpolation
        vec3 color1Oklch = rgbToOklch(uColor);
        vec3 color2Oklch = rgbToOklch(uColor2);
        vec3 color3Oklch = rgbToOklch(uColor3);
        vec3 color4Oklch = rgbToOklch(uColor4);
        vec3 color5Oklch = rgbToOklch(uColor5);
        vec3 color6Oklch = rgbToOklch(uColor6);
        vec3 color7Oklch = rgbToOklch(uColor7);
        vec3 color8Oklch = rgbToOklch(uColor8);
        vec3 color9Oklch = rgbToOklch(uColor9);
        vec3 color10Oklch = rgbToOklch(uColor10);
        
        // Find which two colors to interpolate between (same logic as mapNoiseToColorSmooth)
        float t = clamp(raymarchValue, 0.0, 1.0);
        float smoothTransitionWidth = 0.005 * 20.0;
        
        vec3 lowerOklch, upperOklch;
        float lowerThreshold, upperThreshold;
        
        if (t >= threshold1) {
            upperOklch = color1Oklch;
            lowerOklch = color1Oklch;
            upperThreshold = threshold1;
            lowerThreshold = threshold1;
        } else if (t < threshold10) {
            upperOklch = color10Oklch;
            lowerOklch = color10Oklch;
            upperThreshold = threshold10;
            lowerThreshold = threshold10;
        } else if (t >= threshold2 && t < threshold1) {
            upperOklch = color1Oklch;
            lowerOklch = color2Oklch;
            upperThreshold = threshold1;
            lowerThreshold = threshold2;
        } else if (t >= threshold3 && t < threshold2) {
            upperOklch = color2Oklch;
            lowerOklch = color3Oklch;
            upperThreshold = threshold2;
            lowerThreshold = threshold3;
        } else if (t >= threshold4 && t < threshold3) {
            upperOklch = color3Oklch;
            lowerOklch = color4Oklch;
            upperThreshold = threshold3;
            lowerThreshold = threshold4;
        } else if (t >= threshold5 && t < threshold4) {
            upperOklch = color4Oklch;
            lowerOklch = color5Oklch;
            upperThreshold = threshold4;
            lowerThreshold = threshold5;
        } else if (t >= threshold6 && t < threshold5) {
            upperOklch = color5Oklch;
            lowerOklch = color6Oklch;
            upperThreshold = threshold5;
            lowerThreshold = threshold6;
        } else if (t >= threshold7 && t < threshold6) {
            upperOklch = color6Oklch;
            lowerOklch = color7Oklch;
            upperThreshold = threshold6;
            lowerThreshold = threshold7;
        } else if (t >= threshold8 && t < threshold7) {
            upperOklch = color7Oklch;
            lowerOklch = color8Oklch;
            upperThreshold = threshold7;
            lowerThreshold = threshold8;
        } else if (t >= threshold9 && t < threshold8) {
            upperOklch = color8Oklch;
            lowerOklch = color9Oklch;
            upperThreshold = threshold8;
            lowerThreshold = threshold9;
        } else { // t >= threshold10 && t < threshold9
            upperOklch = color9Oklch;
            lowerOklch = color10Oklch;
            upperThreshold = threshold9;
            lowerThreshold = threshold10;
        }
        
        // Smooth interpolation in OKLCH space
        float range = upperThreshold - lowerThreshold;
        float smoothT = 0.5;
        if (range > 0.001) {
            float transitionZone = smoothTransitionWidth;
            float extendedRange = range + transitionZone * 2.0;
            float extendedLocalT = (t - lowerThreshold + transitionZone) / extendedRange;
            smoothT = smoothstep(0.0, 1.0, extendedLocalT);
        }
        
        // Interpolate chroma and hue in OKLCH space (continuous saturation and hue)
        float interpolatedChroma = mix(lowerOklch.y, upperOklch.y, smoothT);
        
        // Interpolate hue with proper circular wrapping (shortest path around color wheel)
        float h1 = lowerOklch.z;
        float h2 = upperOklch.z;
        // Normalize hues to [0, 360)
        h1 = mod(h1 + 360.0, 360.0);
        h2 = mod(h2 + 360.0, 360.0);
        // Calculate difference and take shortest path
        float diff = h2 - h1;
        if (abs(diff) > 180.0) {
            // Take the shorter path around the circle
            diff = diff - sign(diff) * 360.0;
        }
        float interpolatedHue = mod(h1 + diff * smoothT + 360.0, 360.0);
        
        // Preserve original luminance, apply interpolated hue and saturation
        vec3 originalOklch = rgbToOklch(o.rgb);
        float originalLightness = originalOklch.x;
        
        // Safety check: if chroma is very small, hue is undefined - use lower color's hue
        if (interpolatedChroma < 0.001) {
            interpolatedHue = lowerOklch.z;
        }
        
        // Clamp chroma to prevent invalid values
        interpolatedChroma = clamp(interpolatedChroma, 0.0, 0.5);
        
        // Create new color with original lightness, interpolated chroma and hue
        vec3 newOklch = vec3(originalLightness, interpolatedChroma, interpolatedHue);
        vec3 tintedColor = oklchToRgb(newOklch);
        
        // Safety check: ensure color is valid (no NaN or invalid values)
        tintedColor = clamp(tintedColor, 0.0, 1.0);
        
        gl_FragColor = vec4(tintedColor, o.a);
    } else {
        // Use original orange/yellow tint
        gl_FragColor = o;
    }
}

