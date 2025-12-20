precision highp float;

uniform vec2 uResolution;
uniform float uTime;

// Number of visual bands (for display)
uniform int uNumBands;
// Number of measured bands (for texture sampling)
uniform float uMeasuredBands;
uniform float uMaxHeight;
uniform float uCenterY;
uniform float uBarWidth;

// Frequency data textures
// uFrequencyTexture: LUMINANCE = left channel, ALPHA = right channel
uniform sampler2D uFrequencyTexture;
uniform sampler2D uLayer1Texture;  // Layer 1 smoothed heights
uniform sampler2D uLayer2Texture;  // Layer 2 smoothed heights
uniform sampler2D uLayer3Texture;  // Layer 3 smoothed heights

// Layer parameters
uniform float uLayer1HeightMultiplier;
uniform float uLayer2HeightMultiplier;
uniform float uLayer3HeightMultiplier;
uniform float uLayer1Opacity;
uniform float uLayer2Opacity;
uniform float uLayer3Opacity;

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

// Audio uniforms for volume-based brightness
uniform float uVolume;

// Helper function to get color based on volume
vec3 getColorForVolume(float volume) {
    // Map volume to color index (0-9)
    // Quiet (0-0.3): color7-8
    // Medium (0.3-0.7): color4-6
    // Loud (0.7-1.0): color1-3
    
    if (volume < 0.3) {
        float t = volume / 0.3;
        return mix(uColor8, uColor7, t);
    } else if (volume < 0.7) {
        float t = (volume - 0.3) / 0.4;
        return mix(uColor7, uColor4, t);
    } else {
        float t = (volume - 0.7) / 0.3;
        return mix(uColor4, uColor, t);
    }
}

// Helper function to get background color (darker, less volume-dependent)
vec3 getBackgroundColor(float volume) {
    // Background layers use darker colors
    if (volume < 0.5) {
        return uColor10;
    } else if (volume < 0.7) {
        return mix(uColor10, uColor9, (volume - 0.5) / 0.2);
    } else {
        return mix(uColor9, uColor8, (volume - 0.7) / 0.3);
    }
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    
    // Normalize coordinates: x in [0, 1], y in [0, 1]
    float x = fragCoord.x / uResolution.x;
    float y = fragCoord.y / uResolution.y;
    
    // Sample textures at x coordinate (hardware will interpolate between measured bands)
    // Texture coordinate: x maps directly to texture x, y is always 0.5 (middle of 1-pixel tall texture)
    vec2 texCoord = vec2(x, 0.5);
    
    // Sample frequency data (LUMINANCE = left, ALPHA = right)
    vec4 freqData = texture2D(uFrequencyTexture, texCoord);
    float leftValue = freqData.r;   // LUMINANCE channel = left
    float rightValue = freqData.a;  // ALPHA channel = right
    
    // Sample layer heights
    vec4 layer1Data = texture2D(uLayer1Texture, texCoord);
    vec4 layer2Data = texture2D(uLayer2Texture, texCoord);
    vec4 layer3Data = texture2D(uLayer3Texture, texCoord);
    
    float layer1Height = layer1Data.r * uLayer1HeightMultiplier;
    float layer2Height = layer2Data.r * uLayer2HeightMultiplier;
    float layer3Height = layer3Data.r * uLayer3HeightMultiplier;
    
    // Calculate bar positions
    float centerY = uCenterY;
    float maxHeight = uMaxHeight;
    
    // Left channel extends upward from center
    float leftTop = centerY + leftValue * maxHeight * layer3Height;
    float leftTop2 = centerY + leftValue * maxHeight * layer2Height;
    float leftTop1 = centerY + leftValue * maxHeight * layer1Height;
    
    // Right channel extends downward from center
    float rightBottom = centerY - rightValue * maxHeight * layer3Height;
    float rightBottom2 = centerY - rightValue * maxHeight * layer2Height;
    float rightBottom1 = centerY - rightValue * maxHeight * layer1Height;
    
    // Calculate bar boundaries (with width control)
    float bandWidth = 1.0 / float(uNumBands);
    // Find which visual band this pixel belongs to
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
    
    // Initialize color
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    
    // Render layers from back to front
    if (inBar) {
        // Layer 1 (Background Far) - Left
        if (y >= centerY && y <= leftTop1) {
            float volume = leftValue;
            vec3 layerColor = getBackgroundColor(volume);
            float layerAlpha = uLayer1Opacity;
            color = mix(color, layerColor, layerAlpha);
            alpha = max(alpha, layerAlpha);
        }
        
        // Layer 1 (Background Far) - Right
        if (y <= centerY && y >= rightBottom1) {
            float volume = rightValue;
            vec3 layerColor = getBackgroundColor(volume);
            float layerAlpha = uLayer1Opacity;
            color = mix(color, layerColor, layerAlpha);
            alpha = max(alpha, layerAlpha);
        }
        
        // Layer 2 (Background Near) - Left
        if (y >= centerY && y <= leftTop2) {
            float volume = leftValue;
            vec3 layerColor = getBackgroundColor(volume);
            float layerAlpha = uLayer2Opacity;
            color = mix(color, layerColor, layerAlpha);
            alpha = max(alpha, layerAlpha);
        }
        
        // Layer 2 (Background Near) - Right
        if (y <= centerY && y >= rightBottom2) {
            float volume = rightValue;
            vec3 layerColor = getBackgroundColor(volume);
            float layerAlpha = uLayer2Opacity;
            color = mix(color, layerColor, layerAlpha);
            alpha = max(alpha, layerAlpha);
        }
        
        // Layer 3 (Foreground) - Left
        if (y >= centerY && y <= leftTop) {
            float volume = leftValue;
            vec3 layerColor = getColorForVolume(volume);
            // Apply volume-based brightness
            float brightness = 0.5 + volume * 0.5;
            layerColor *= brightness;
            float layerAlpha = uLayer3Opacity;
            color = mix(color, layerColor, layerAlpha);
            alpha = max(alpha, layerAlpha);
        }
        
        // Layer 3 (Foreground) - Right
        if (y <= centerY && y >= rightBottom) {
            float volume = rightValue;
            vec3 layerColor = getColorForVolume(volume);
            // Apply volume-based brightness
            float brightness = 0.5 + volume * 0.5;
            layerColor *= brightness;
            float layerAlpha = uLayer3Opacity;
            color = mix(color, layerColor, layerAlpha);
            alpha = max(alpha, layerAlpha);
        }
        
        // Draw center line
        if (abs(y - centerY) < 0.002) {
            vec3 centerColor = mix(uColor9, uColor10, 0.5);
            color = mix(color, centerColor, 0.3);
            alpha = max(alpha, 0.3);
        }
    }
    
    // If no color was set, use background
    if (alpha < 0.01) {
        color = uColor10;
        alpha = 1.0;
    }
    
    gl_FragColor = vec4(color, alpha);
}
