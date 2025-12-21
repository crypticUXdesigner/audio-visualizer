precision highp float;

#include "common/noise.glsl"

uniform vec2 uResolution;
uniform float uTime;

// Mode: 0 = bars, 1 = curve
uniform int uMode;

// Number of visual bands (for display)
uniform int uNumBands;
// Number of measured bands (for texture sampling)
uniform float uMeasuredBands;
uniform float uMaxHeight;
uniform float uCenterY;
uniform float uBarWidth;

// Curve mode parameters
uniform float uBlurStrength;
uniform float uPixelizeLevels;
uniform float uPostBlurStrength;  // Full-screen blur strength
uniform float uNoiseStrength;     // Noise intensity (0.0 = no noise)

// Frequency data texture
// uFrequencyTexture: LUMINANCE = left channel, ALPHA = right channel
uniform sampler2D uFrequencyTexture;
// Layer textures (for bar mode layers and curve mode raw values)
uniform sampler2D uLayer1Texture;  // Layer 1 smoothed heights (bar mode) or raw values (curve mode)
uniform sampler2D uLayer2Texture;  // Layer 2 smoothed heights (bar mode)
uniform sampler2D uLayer3Texture;  // Layer 3 smoothed heights (bar mode)

// Color uniforms (10 colors from brightest to darkest)
uniform vec3 uColor;   // Brightest (color1)
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform vec3 uColor8;
uniform vec3 uColor9;
uniform vec3 uColor10; // Darkest

// Helper function to get color based on level (0.0 = dark, 1.0 = bright)
vec3 getColorForLevel(float level) {
    // Map level to color index (0-9)
    // Low (0-0.2): color10-9
    // Medium-low (0.2-0.4): color9-8
    // Medium (0.4-0.6): color8-7
    // Medium-high (0.6-0.8): color7-5
    // High (0.8-1.0): color5-1
    
    level = clamp(level, 0.0, 1.0);
    
    if (level < 0.2) {
        float t = level / 0.2;
        return mix(uColor10, uColor9, t);
    } else if (level < 0.4) {
        float t = (level - 0.2) / 0.2;
        return mix(uColor9, uColor8, t);
    } else if (level < 0.6) {
        float t = (level - 0.4) / 0.2;
        return mix(uColor8, uColor7, t);
    } else if (level < 0.8) {
        float t = (level - 0.6) / 0.2;
        return mix(uColor7, uColor5, t);
    } else {
        float t = (level - 0.8) / 0.2;
        return mix(uColor5, uColor, t);
    }
}

// Sample frequency with smooth interpolation (for curve mode)
// channel: 0 = left (LUMINANCE/r), 1 = right (ALPHA/a)
float sampleFrequencySmooth(sampler2D tex, float x, int channel) {
    // Get texture size info
    float texWidth = uMeasuredBands;
    float texelSize = 1.0 / texWidth;
    
    // Clamp x to valid texture range [0, 1]
    x = clamp(x, 0.0, 1.0);
    
    // Find surrounding samples for smooth interpolation
    // Texture has measuredBands pixels, so last pixel is at (texWidth - 1) / texWidth
    float pixelIndex = x * (texWidth - 1.0);
    float pixelIndex0 = floor(pixelIndex);
    float pixelIndex1 = min(pixelIndex0 + 1.0, texWidth - 1.0);
    
    // Convert pixel indices to texture coordinates
    float x0 = pixelIndex0 / (texWidth - 1.0);
    float x1 = pixelIndex1 / (texWidth - 1.0);
    
    // Sample at boundaries
    vec2 coord0 = vec2(x0, 0.5);
    vec2 coord1 = vec2(x1, 0.5);
    
    vec4 data0 = texture2D(tex, coord0);
    vec4 data1 = texture2D(tex, coord1);
    
    float y0 = (channel == 0) ? data0.r : data0.a;
    float y1 = (channel == 0) ? data1.r : data1.a;
    
    // Smooth interpolation using smoothstep
    float t = fract(pixelIndex);
    t = t * t * (3.0 - 2.0 * t); // Smoothstep for smoother interpolation
    
    return mix(y0, y1, t);
}

// Pixelize function (from refraction shader)
float pixelize(float value, float levels) {
    if (levels <= 0.0) return value;
    return floor(value * levels) / levels;
}

// Pixelize a color vector
vec3 pixelizeColor(vec3 color, float levels) {
    if (levels <= 0.0) return color;
    return floor(color * levels) / levels;
}

// Apply spatial blur to the curve shape by blurring frequency values
// This blurs the shape of the waveform itself
float blurCurveValue(float x, int channel, float blurRadius) {
    if (blurRadius <= 0.0) {
        return sampleFrequencySmooth(uFrequencyTexture, x, channel);
    }
    
    float aspectRatio = uResolution.x / uResolution.y;
    float blurOffsetX = blurRadius / uResolution.x;
    
    // Multi-tap blur: sample nearby x positions
    float blurredValue = sampleFrequencySmooth(uFrequencyTexture, x, channel) * 0.4;
    float weightSum = 0.4;
    
    // 4-directional blur (horizontal only, since we're blurring the curve shape)
    float offsets[4];
    offsets[0] = blurOffsetX;
    offsets[1] = -blurOffsetX;
    offsets[2] = blurOffsetX * 0.707;  // Diagonal
    offsets[3] = -blurOffsetX * 0.707;
    
    for (int i = 0; i < 4; i++) {
        float sampleX = clamp(x + offsets[i], 0.0, 1.0);
        float sampleValue = sampleFrequencySmooth(uFrequencyTexture, sampleX, channel);
        blurredValue += sampleValue * 0.15;
        weightSum += 0.15;
    }
    
    return blurredValue / weightSum;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    
    // Normalize coordinates: x in [0, 1], y in [0, 1]
    float x = fragCoord.x / uResolution.x;
    float y = fragCoord.y / uResolution.y;
    float centerY = uCenterY;
    float maxHeight = uMaxHeight;
    
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    
    if (uMode == 0) {
        // BAR MODE: Thin separate bars with level-based coloring
        
        // Sample frequency data with smooth interpolation
        vec2 texCoord = vec2(x, 0.5);
        vec4 freqData = texture2D(uFrequencyTexture, texCoord);
        float leftValue = freqData.r;   // LUMINANCE channel = left
        float rightValue = freqData.a;  // ALPHA channel = right
        
        // Calculate bar boundaries
        float bandWidth = 1.0 / float(uNumBands);
        int visualBandIndex = int(x / bandWidth);
        if (visualBandIndex >= uNumBands) visualBandIndex = uNumBands - 1;
        if (visualBandIndex < 0) visualBandIndex = 0;
        
        float bandStart = float(visualBandIndex) * bandWidth;
        float bandEnd = float(visualBandIndex + 1) * bandWidth;
        float bandCenter = (bandStart + bandEnd) * 0.5;
        float actualBandWidth = bandWidth * uBarWidth;
        float barStart = bandCenter - actualBandWidth * 0.5;
        float barEnd = bandCenter + actualBandWidth * 0.5;
        
        // Check if pixel is within bar horizontally
        bool inBar = x >= barStart && x <= barEnd;
        
        if (inBar) {
            // Left channel extends upward from center
            float leftTop = centerY + leftValue * maxHeight;
            float leftBottom = centerY;
            
            // Right channel extends downward from center
            float rightTop = centerY;
            float rightBottom = centerY - rightValue * maxHeight;
            
            // Draw left channel bar
            if (y >= leftBottom && y <= leftTop) {
                float level = leftValue;
                color = getColorForLevel(level);
                alpha = 1.0;
            }
            
            // Draw right channel bar
            if (y <= rightTop && y >= rightBottom) {
                float level = rightValue;
                color = getColorForLevel(level);
                alpha = 1.0;
            }
        }
        
        // Background
        if (alpha < 0.01) {
            color = uColor10;
            alpha = 1.0;
        }
        
    } else {
        // CURVE MODE: Single smooth surface with vertical gradient based on left/right channels
        
        // Apply blur to curve shape (blurs the waveform shape itself)
        float blurRadius = uPostBlurStrength / uResolution.x;
        float leftCurveValue = blurCurveValue(x, 0, blurRadius);
        float rightCurveValue = blurCurveValue(x, 1, blurRadius);
        
        // Apply pixelization to curve values (quantizes the waveform shape)
        if (uPixelizeLevels > 0.0) {
            leftCurveValue = pixelize(leftCurveValue, uPixelizeLevels);
            rightCurveValue = pixelize(rightCurveValue, uPixelizeLevels);
        }
        
        // Get actual (raw) frequency values for level-based coloring
        // In curve mode, raw values are stored in layer1 texture
        vec2 texCoord = vec2(x, 0.5);
        vec4 rawData = texture2D(uLayer1Texture, texCoord);
        float actualLeftValue = rawData.r;   // Raw left channel value
        float actualRightValue = rawData.a;  // Raw right channel value
        
        // Combine curves into single surface (use max to show both channels)
        float combinedCurveValue = max(leftCurveValue, rightCurveValue);
        
        // Calculate curve position (single surface extending from center)
        // Top extends upward, bottom extends downward
        float curveTop = centerY + combinedCurveValue * maxHeight;
        float curveBottom = centerY - combinedCurveValue * maxHeight;
        
        // Calculate soft edges using smoothstep (like vector curves)
        // This creates smooth, anti-aliased edges instead of hard binary edges
        float edgeSoftness = 2.0 / uResolution.y; // 2 pixels of softness for smooth edges
        
        // Calculate distance from curve edges (positive = inside, negative = outside)
        float distToTop = curveTop - y;  // Positive when y is below top
        float distToBottom = y - curveBottom;  // Positive when y is above bottom
        
        // Create smooth waveform mask with soft edges
        // Use smoothstep to create smooth falloff at edges (like vector curve anti-aliasing)
        float topMask = smoothstep(-edgeSoftness, edgeSoftness, distToTop);
        float bottomMask = smoothstep(-edgeSoftness, edgeSoftness, distToBottom);
        float waveformMask = topMask * bottomMask;
        
        if (waveformMask > 0.001) {
            // Calculate vertical position within waveform (0 = bottom, 1 = top)
            float verticalPos = (y - curveBottom) / (curveTop - curveBottom);
            verticalPos = clamp(verticalPos, 0.0, 1.0);
            
            // Get colors based on left/right channel levels
            vec3 leftColor = getColorForLevel(actualLeftValue);
            vec3 rightColor = getColorForLevel(actualRightValue);
            
            // Blend between left and right colors based on vertical position
            // Top (verticalPos = 1.0) uses more left channel
            // Bottom (verticalPos = 0.0) uses more right channel
            // Center (verticalPos = 0.5) blends equally
            float leftWeight = verticalPos;  // 1.0 at top, 0.0 at bottom
            float rightWeight = 1.0 - verticalPos;  // 0.0 at top, 1.0 at bottom
            
            // Blend colors
            color = leftColor * leftWeight + rightColor * rightWeight;
            
            // Ensure color never goes darker than uColor10 (background color)
            color = max(color, uColor10);
            
            // Apply waveform mask for smooth edges
            alpha = waveformMask;
        }
        
        // Background
        if (alpha < 0.01) {
            color = uColor10;
            alpha = 1.0;
        }
    }
    
    // Post-processing: add noise to final output (curve mode only)
    if (uMode == 1 && uNoiseStrength > 0.0) {
        vec2 noiseUV = gl_FragCoord.xy / uResolution.xy;
        float noiseValue = fbm2_standard(noiseUV, uTime * 0.1, 2.0, 3, 2.0, 0.5);
        // Apply noise as subtle color variation
        vec3 noiseColor = vec3(noiseValue);
        color = mix(color, color * (0.9 + noiseColor * 0.2), uNoiseStrength);
    }
    
    gl_FragColor = vec4(color, alpha);
}
