// Turbulence Functions
// Approximating fluid dynamics and flames efficiently with shaders
//
// This module provides utilities for creating turbulence effects using layered
// rotating sine waves. Based on the technique from GM Shaders:
// https://mini.gmshaders.com/p/turbulence
//
// Use cases:
// - Water/wave effects (coordinate displacement)
// - Fire effects (with upward scrolling and stretching)
// - Smoke, fog, magic effects (general fluid motion)
// - Domain warping for textures
// - Flow fields for particle systems
//
// Dependencies: common/rotation.glsl, common/constants.glsl
// Used by: shaders that need fluid-like coordinate distortion

#include "common/rotation.glsl"
#include "common/constants.glsl"

// ============================================================================
// Core Turbulence Functions
// ============================================================================

/**
 * Basic turbulence displacement
 * Returns displaced coordinates using layered rotating sine waves
 * 
 * @param pos Input coordinates (UV or world space)
 * @param time Animation time (can be modulated by audio)
 * @param scale Base frequency/scale of turbulence
 * @param octaves Number of wave layers (1-6, capped at 6 for performance)
 * @param amplitude Overall strength of displacement
 * @param speed Animation speed multiplier
 * @param freqMult Frequency multiplier per octave (lacunarity, typically 1.2-1.8)
 * @param ampDecay Amplitude decay per octave (gain, typically 0.4-0.7)
 * @returns Displaced coordinates (vec2)
 */
vec2 turbulence(vec2 pos, float time, float scale, int octaves, 
                float amplitude, float speed, float freqMult, float ampDecay) {
    // Clamp octaves to performance limit
    int numOctaves = min(octaves, 6);
    
    // Starting frequency
    float freq = scale;
    
    // Initial rotation matrix (avoid 90/45 degree angles for natural look)
    mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
    
    // Rotation increment matrix (same rotation applied each octave)
    mat2 rotInc = mat2(0.6, -0.8, 0.8, 0.6);
    
    vec2 displaced = pos;
    
    // Loop through turbulence octaves
    for (int i = 0; i < 6; ++i) {
        if (i >= numOctaves) break;
        
        // Scroll along the rotated coordinate
        float phase = freq * (displaced * rot).y + speed * time + float(i);
        
        // Add perpendicular sine wave offset
        // Amplitude scales with 1/freq to maintain consistent detail
        vec2 offset = rot[0] * sin(phase) / freq;
        displaced += amplitude * offset;
        
        // Rotate for the next octave
        rot *= rotInc;
        // Scale up frequency for the next octave
        freq *= freqMult;
        // Scale down amplitude for the next octave
        amplitude *= ampDecay;
    }
    
    return displaced;
}

/**
 * Advanced turbulence with custom rotation control
 * Allows fine-grained control over rotation behavior
 * 
 * @param pos Input coordinates
 * @param time Animation time
 * @param scale Base frequency/scale
 * @param octaves Number of wave layers (1-6)
 * @param amplitude Overall strength
 * @param speed Animation speed multiplier
 * @param freqMult Frequency multiplier per octave
 * @param ampDecay Amplitude decay per octave
 * @param initialRotation Initial rotation matrix
 * @param rotationIncrement Rotation increment per octave (in radians)
 * @returns Displaced coordinates (vec2)
 */
vec2 turbulenceAdvanced(vec2 pos, float time, float scale, int octaves,
                        float amplitude, float speed, float freqMult, float ampDecay,
                        mat2 initialRotation, float rotationIncrement) {
    int numOctaves = min(octaves, 6);
    
    float freq = scale;
    mat2 rot = initialRotation;
    mat2 rotInc = rotate2D(rotationIncrement);
    
    vec2 displaced = pos;
    
    for (int i = 0; i < 6; ++i) {
        if (i >= numOctaves) break;
        
        float phase = freq * (displaced * rot).y + speed * time + float(i);
        vec2 offset = rot[0] * sin(phase) / freq;
        displaced += amplitude * offset;
        
        rot *= rotInc;
        freq *= freqMult;
        amplitude *= ampDecay;
    }
    
    return displaced;
}

/**
 * Fire-specific turbulence variant
 * Includes upward scrolling and coordinate stretching for fire effects
 * 
 * @param pos Input coordinates
 * @param time Animation time
 * @param scale Base frequency/scale
 * @param octaves Number of wave layers (1-6)
 * @param amplitude Overall strength
 * @param speed Animation speed multiplier
 * @param freqMult Frequency multiplier per octave
 * @param ampDecay Amplitude decay per octave
 * @param scrollDir Direction for scrolling (typically vec2(0.0, 1.0) for upward)
 * @param stretch Coordinate stretching (typically vec2(0.5, 2.0) for fire: compress X, stretch Y)
 * @returns Displaced coordinates (vec2)
 */
vec2 turbulenceFire(vec2 pos, float time, float scale, int octaves,
                    float amplitude, float speed, float freqMult, float ampDecay,
                    vec2 scrollDir, vec2 stretch) {
    int numOctaves = min(octaves, 6);
    
    // Apply coordinate stretching (compress horizontally, stretch vertically for fire)
    vec2 stretchedPos = pos * stretch;
    
    float freq = scale;
    mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
    mat2 rotInc = mat2(0.6, -0.8, 0.8, 0.6);
    
    vec2 displaced = stretchedPos;
    
    for (int i = 0; i < 6; ++i) {
        if (i >= numOctaves) break;
        
        // Add scrolling direction to phase
        float phase = freq * (displaced * rot).y + speed * time + float(i);
        phase += dot(scrollDir, displaced) * speed * 0.5; // Upward scrolling effect
        
        vec2 offset = rot[0] * sin(phase) / freq;
        displaced += amplitude * offset;
        
        rot *= rotInc;
        freq *= freqMult;
        amplitude *= ampDecay;
    }
    
    // Unstretch coordinates (restore original aspect ratio)
    return displaced / stretch;
}

/**
 * Scalar field turbulence
 * Returns a scalar turbulence value instead of coordinate displacement
 * Useful for heightmaps, displacement maps, or as a noise source
 * 
 * @param pos Input coordinates
 * @param time Animation time
 * @param scale Base frequency/scale
 * @param octaves Number of wave layers (1-6)
 * @param amplitude Overall strength
 * @param speed Animation speed multiplier
 * @param freqMult Frequency multiplier per octave
 * @param ampDecay Amplitude decay per octave
 * @returns Scalar turbulence value in range [-1, 1]
 */
float turbulenceScalar(vec2 pos, float time, float scale, int octaves,
                        float amplitude, float speed, float freqMult, float ampDecay) {
    int numOctaves = min(octaves, 6);
    
    float freq = scale;
    mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
    mat2 rotInc = mat2(0.6, -0.8, 0.8, 0.6);
    
    float sum = 0.0;
    float maxSum = 0.0;
    vec2 displaced = pos;
    
    for (int i = 0; i < 6; ++i) {
        if (i >= numOctaves) break;
        
        float phase = freq * (displaced * rot).y + speed * time + float(i);
        float wave = sin(phase);
        
        // Accumulate wave contribution
        sum += amplitude * wave;
        maxSum += amplitude;
        
        // Update position for next octave
        vec2 offset = rot[0] * wave / freq;
        displaced += amplitude * offset * 0.1; // Smaller offset for scalar version
        
        rot *= rotInc;
        freq *= freqMult;
        amplitude *= ampDecay;
    }
    
    // Normalize to [-1, 1] range
    if (maxSum > 0.0) {
        return sum / maxSum;
    }
    return 0.0;
}

// ============================================================================
// Preset Helper Functions
// ============================================================================

/**
 * Water turbulence preset
 * Optimized for water/wave effects with moderate settings
 */
vec2 turbulenceWater(vec2 pos, float time) {
    return turbulence(pos, time, 2.0, 6, 0.5, 0.3, 1.4, 0.6);
}

/**
 * Fire turbulence preset
 * Optimized for fire effects with upward scrolling and stretching
 */
vec2 turbulenceFirePreset(vec2 pos, float time) {
    return turbulenceFire(pos, time, 2.0, 6, 0.7, 0.5, 1.4, 0.65,
                          vec2(0.0, 1.0), vec2(0.5, 2.0));
}

/**
 * Smoke turbulence preset
 * Optimized for smoke/fog effects with slower, more subtle motion
 */
vec2 turbulenceSmoke(vec2 pos, float time) {
    return turbulence(pos, time, 1.5, 6, 0.3, 0.15, 1.5, 0.7);
}

/**
 * Magic turbulence preset
 * Optimized for magical/energy effects with more dramatic motion
 */
vec2 turbulenceMagic(vec2 pos, float time) {
    return turbulence(pos, time, 2.5, 6, 0.6, 0.4, 1.6, 0.55);
}

/**
 * Subtle turbulence preset
 * Light turbulence for background effects or texture warping
 */
vec2 turbulenceSubtle(vec2 pos, float time) {
    return turbulence(pos, time, 1.0, 4, 0.2, 0.2, 1.3, 0.7);
}

/**
 * Strong turbulence preset
 * Heavy turbulence for dramatic effects
 */
vec2 turbulenceStrong(vec2 pos, float time) {
    return turbulence(pos, time, 3.0, 6, 0.8, 0.5, 1.5, 0.5);
}

