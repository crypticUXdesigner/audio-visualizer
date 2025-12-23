precision highp float;

#include "common/uniforms.glsl"
#include "common/color-mapping.glsl"

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

#define PI 3.14159265359

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / uResolution;
    
    // Convert to polar coordinates relative to center
    vec2 center = vec2(uCenterX, uCenterY);
    vec2 toPixel = uv - center;
    float angle = atan(toPixel.y, toPixel.x);
    float dist = length(toPixel);
    
    // Determine which arc (left or right)
    // Left arc: -PI (180°) to 0° (bottom = low freq, top = high freq)
    // Right arc: 0° to PI (180°) (bottom = low freq, top = high freq)
    bool isLeftArc = (angle >= -PI && angle <= 0.0);
    bool isRightArc = (angle >= 0.0 && angle <= PI);
    
    // Initialize with background color
    vec3 finalColor = uColor10;
    float finalAlpha = 1.0;
    
    if (isLeftArc || isRightArc) {
        // Map angle to band index
        float bandIndex;
        if (isLeftArc) {
            // Left: -PI (180°) → band 0 (low freq), 0° → band numBands-1 (high freq)
            bandIndex = (1.0 - (angle + PI) / PI) * (float(uNumBands) - 1.0);
        } else {
            // Right: 0° → band 0 (low freq), PI (180°) → band numBands-1 (high freq)
            bandIndex = (angle / PI) * (float(uNumBands) - 1.0);
        }
        
        // Clamp band index to valid range
        bandIndex = clamp(bandIndex, 0.0, float(uNumBands) - 1.0);
        
        // Sample frequency texture
        // Map band index to texture coordinate (0.0 to 1.0)
        float bandX = (bandIndex + 0.5) / float(uNumBands);
        vec2 texCoord = vec2(bandX, 0.5);
        vec4 freqData = texture2D(uFrequencyTexture, texCoord);
        
        // Get volume for appropriate channel
        float volume = isLeftArc ? freqData.r : freqData.a;
        
        // Calculate target radius based on volume
        float targetRadius = uBaseRadius + volume * uMaxRadiusOffset;
        
        // Check if pixel is inside the arc shape
        // Use smoothstep for anti-aliasing at the edge
        float edgeSmooth = 0.002; // Small smoothing for anti-aliasing
        float insideFactor = smoothstep(targetRadius + edgeSmooth, targetRadius - edgeSmooth, dist);
        
        if (insideFactor > 0.0) {
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
            vec3 arcColor = mapNoiseToColor(
                volume,  // Use volume (amplitude) for color mapping
                threshold1, threshold2, threshold3, threshold4, threshold5,
                threshold6, threshold7, threshold8, threshold9, threshold10,
                uColorTransitionWidth
            );
            
            // Blend with background based on inside factor
            finalColor = mix(finalColor, arcColor, insideFactor);
        }
    }
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}

