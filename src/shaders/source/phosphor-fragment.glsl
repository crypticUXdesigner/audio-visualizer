precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"
#include "common/color-mapping.glsl"
#include "common/audio.glsl"

// Parameter uniforms
uniform float uEnableColorSystem;      // Enable color system (0.0 = use original colors)
uniform float uEnableColorFrequency;    // Enable frequency-based color modulation

// Static configuration
uniform float uSphereRadius;          // Base sphere radius

// Audio reactive enable flags
uniform float uEnableAnimationSpeed;   // Enable animation speed reactivity
uniform float uEnableVectorFieldSpeed; // Enable vector field speed reactivity
uniform float uEnableSphereRadius;    // Enable sphere radius reactivity
uniform float uEnableVectorFieldComplexity; // Enable vector field complexity reactivity
uniform float uEnableGlowIntensity;   // Enable glow intensity reactivity
uniform float uEnableBrightness;      // Enable brightness reactivity
uniform float uEnableRaymarchSteps;   // Enable raymarch steps reactivity

// Audio reactive strength parameters (already modulated by audio system)
uniform float uAnimationSpeedStrength;      // Animation speed strength (audio-reactive to volume)
uniform float uVectorFieldSpeedStrength;    // Vector field speed strength (audio-reactive to mid)
uniform float uSphereRadiusStrength;        // Sphere radius strength (audio-reactive to bass)
uniform float uVectorFieldComplexityStrength; // Vector field complexity (audio-reactive to beats, inverted)
uniform float uGlowIntensityStrength;       // Glow intensity (audio-reactive to treble)
uniform float uBrightnessStrength;          // Brightness (audio-reactive to treble)
uniform float uRaymarchStepsStrength;       // Raymarch steps (audio-reactive to volume, inverted)

// Distortion shape controls (audio-reactive)
uniform float uEnableVectorFieldFrequencyX; // Enable frequency X reactivity
uniform float uEnableVectorFieldFrequencyY; // Enable frequency Y reactivity
uniform float uEnableVectorFieldFrequencyZ; // Enable frequency Z reactivity
uniform float uEnableVectorFieldAmplitude;   // Enable amplitude reactivity
uniform float uEnableVectorFieldRadialStrength; // Enable radial strength reactivity
uniform float uEnableVectorFieldHarmonicAmplitude; // Enable harmonic amplitude reactivity
uniform float uEnableVectorFieldDistanceContribution; // Enable distance contribution reactivity

uniform float uVectorFieldFrequencyX;       // Base frequency X (audio-reactive to bass)
uniform float uVectorFieldFrequencyY;       // Base frequency Y (audio-reactive to mid)
uniform float uVectorFieldFrequencyZ;       // Base frequency Z (audio-reactive to treble)
uniform float uVectorFieldAmplitude;        // Overall distortion amplitude
uniform float uVectorFieldRadialStrength;   // Radial variation strength
uniform float uVectorFieldHarmonicAmplitude; // Harmonic layer amplitude
uniform float uVectorFieldDistanceContribution; // Distance field contribution

// Manual tanh implementation for GLSL ES 1.0 compatibility
// tanh(x) = (exp(2*x) - 1) / (exp(2*x) + 1)
float tanh(float x) {
    // Handle large values to prevent overflow
    if (x > 10.0) return 1.0;
    if (x < -10.0) return -1.0;
    
    float exp2x = exp(2.0 * x);
    return (exp2x - 1.0) / (exp2x + 1.0);
}

void main() {
    vec3 FC = gl_FragCoord.xyz;
    vec2 r = uResolution;
    
    // Calculate animation speed with audio reactivity
    // uAnimationSpeedStrength is already audio-reactive (modulated by bass)
    float baseSpeed = uEnableAnimationSpeed > 0.5 ? uAnimationSpeedStrength : 0.3;
    
    // Calculate BPM-adjusted speed for main animation
    float tempoSpeed = calculateTempoSpeed(uBPM);
    float adjustedBaseSpeed = baseSpeed * tempoSpeed;
    
    // Calculate time with BPM adjustment (for main animation)
    float t = uTime * adjustedBaseSpeed;
    
    // Calculate vector field speed independently with audio reactivity
    // uVectorFieldSpeedStrength is already audio-reactive (modulated by treble)
    float vectorFieldSpeed = uEnableVectorFieldSpeed > 0.5 ? uVectorFieldSpeedStrength : 0.3;
    
    // Calculate BPM-adjusted speed for vector field (independent from main animation)
    float vectorFieldTempoSpeed = calculateTempoSpeed(uBPM);
    float adjustedVectorFieldSpeed = vectorFieldSpeed * vectorFieldTempoSpeed;
    
    // Calculate vector field time independently
    float vectorFieldTime = uTime * adjustedVectorFieldSpeed;
    
    // Calculate sphere radius with bass reactivity
    // uSphereRadiusStrength is already audio-reactive (modulated by bass)
    float sphereRadius = uSphereRadius;
    if (uEnableSphereRadius > 0.5) {
        sphereRadius += uSphereRadiusStrength;
    }
    
    vec4 o = vec4(0.0);
    
    float z = 0.0;
    float d = 1.0;
    
    // Calculate raymarch steps with audio reactivity (inverted - quieter = more steps)
    // uRaymarchStepsStrength is already audio-reactive (modulated by volume, inverted)
    float maxSteps = uEnableRaymarchSteps > 0.5 ? uRaymarchStepsStrength : 60.0;
    maxSteps = clamp(maxSteps, 20.0, 200.0);
    
    // Use constant maximum for loop bound (GLSL requirement)
    // Break early if we exceed desired steps
    for(float i = 0.0; i < 200.0; i++) {
        // Early break if we've reached the desired step count
        if (i >= maxSteps) break;
        
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        
        // Vector field frequencies with audio reactivity
        float freqX = uEnableVectorFieldFrequencyX > 0.5 ? uVectorFieldFrequencyX : 4.0;
        float freqY = uEnableVectorFieldFrequencyY > 0.5 ? uVectorFieldFrequencyY : 2.0;
        float freqZ = uEnableVectorFieldFrequencyZ > 0.5 ? uVectorFieldFrequencyZ : 0.0;
        vec3 frequencies = vec3(freqX, freqY, freqZ);
        
        // Radial strength with audio reactivity
        float radialStrength = uEnableVectorFieldRadialStrength > 0.5 ? uVectorFieldRadialStrength : 8.0;
        
        vec3 a = normalize(cos(frequencies + vectorFieldTime - d * radialStrength));
        p.z += 5.0;
        
        // Distortion amplitude with audio reactivity
        float amplitude = uEnableVectorFieldAmplitude > 0.5 ? uVectorFieldAmplitude : 1.0;
        a = a * dot(a, p) - cross(a, p) * amplitude;
        
        // Vector field complexity with audio reactivity (inverted - quieter = more complex)
        // uVectorFieldComplexityStrength is always used (static when disabled, audio-reactive when enabled)
        // When audio-reactive: high beats = low complexity, low beats = high complexity
        float complexity = uVectorFieldComplexityStrength;
        complexity = clamp(complexity, 1.0, 20.0);
        
        // Harmonic amplitude with audio reactivity
        float harmonicAmp = uEnableVectorFieldHarmonicAmplitude > 0.5 ? uVectorFieldHarmonicAmplitude : 1.0;
        
        // Use constant maximum for loop bound (GLSL requirement)
        for(float j = 1.0; j < 20.0; j++) {
            // Early break if we've reached the desired complexity
            if (j >= complexity) break;
            a += sin(a * j + vectorFieldTime).yzx / j * harmonicAmp;
        }
        
        // Distance contribution with audio reactivity
        float distContrib = uEnableVectorFieldDistanceContribution > 0.5 ? uVectorFieldDistanceContribution : 0.04;
        
        // Use dynamic sphere radius
        d = 0.05 * abs(length(p) - sphereRadius) + distContrib * abs(a.y);
        
        // Apply glow intensity and brightness with audio reactivity
        // uGlowIntensityStrength and uBrightnessStrength are already audio-reactive (modulated by treble)
        float glowIntensity = uEnableGlowIntensity > 0.5 ? uGlowIntensityStrength : 0.2;
        float brightness = uEnableBrightness > 0.5 ? uBrightnessStrength : 1.0;
        float glowMultiplier = glowIntensity * brightness;
        
        o += (cos(d / 0.1 + vec4(0.0, 2.0, 4.0, 0.0)) + 1.0) / d * z * glowMultiplier;
        z += d;
    }
    
    // Check if color system is enabled
    if (uEnableColorSystem > 0.5) {
        // Normalize accumulated value to 0-1 range for color mapping
        float normalizedValue = tanh(length(o.rgb) / 1e4);
        
        // Calculate frequency thresholds for color mapping
        float threshold1, threshold2, threshold3, threshold4, threshold5;
        float threshold6, threshold7, threshold8, threshold9, threshold10;
        calculateAllFrequencyThresholds(
            0.0,  // No bayer dithering
            uEnableColorFrequency > 0.5,  // Frequency modulation if enabled
            threshold1, threshold2, threshold3, threshold4, threshold5,
            threshold6, threshold7, threshold8, threshold9, threshold10
        );
        
        // Map to color using smooth interpolation
        float transitionWidth = uTransitionWidth > 0.0 ? uTransitionWidth : 0.005;
        vec3 color = mapNoiseToColorSmooth(
            normalizedValue,
            threshold1, threshold2, threshold3, threshold4, threshold5,
            threshold6, threshold7, threshold8, threshold9, threshold10,
            transitionWidth
        );
        
        gl_FragColor = vec4(color, 1.0);
    } else {
        // Original output (component-wise tanh)
        o = vec4(tanh(o.x / 1e4), tanh(o.y / 1e4), tanh(o.z / 1e4), tanh(o.w / 1e4));
        gl_FragColor = o;
    }
}

