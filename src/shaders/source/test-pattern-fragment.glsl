precision highp float;

// Include common uniforms for compatibility with ColorService
// The test pattern doesn't use these, but they need to be declared
// so ColorService can set them without errors
#include "common/uniforms.glsl"

// Convert linear to sRGB (gamma correction)
// When drawingBufferColorSpace = 'srgb', WebGL expects sRGB values
// This ensures readPixels() returns the expected 0-255 values
vec3 linearToSrgb(vec3 linear) {
    return mix(
        linear * 12.92,
        pow(linear, vec3(1.0 / 2.4)) * 1.055 - 0.055,
        step(vec3(0.0031308), linear)
    );
}

void main() {
    // Calculate UV coordinates (0.0 to 1.0)
    vec2 uv = gl_FragCoord.xy / uResolution;
    
    // Create a 4x4 color checker pattern
    // Each cell is 0.25 x 0.25 in UV space
    float cellSize = 0.25;
    int cellX = int(floor(uv.x / cellSize));
    int cellY = int(floor(uv.y / cellSize));
    
    // Define known RGB values for each cell (normalized 0.0-1.0 in LINEAR space)
    vec3 linearColor = vec3(0.0);
    
    // Row 0: Pure colors
    if (cellY == 0) {
        if (cellX == 0) linearColor = vec3(1.0, 0.0, 0.0);      // Red (255,0,0)
        else if (cellX == 1) linearColor = vec3(0.0, 1.0, 0.0);  // Green (0,255,0)
        else if (cellX == 2) linearColor = vec3(0.0, 0.0, 1.0);  // Blue (0,0,255)
        else if (cellX == 3) linearColor = vec3(1.0, 1.0, 1.0);  // White (255,255,255)
    }
    // Row 1: Grayscale
    else if (cellY == 1) {
        if (cellX == 0) linearColor = vec3(0.0, 0.0, 0.0);      // Black (0,0,0)
        else if (cellX == 1) linearColor = vec3(0.5, 0.5, 0.5);  // Gray 128 (128,128,128)
        else if (cellX == 2) linearColor = vec3(0.25, 0.25, 0.25); // Dark gray (64,64,64)
        else if (cellX == 3) linearColor = vec3(0.75, 0.75, 0.75); // Light gray (192,192,192)
    }
    // Row 2: Saturated colors
    else if (cellY == 2) {
        if (cellX == 0) linearColor = vec3(1.0, 1.0, 0.0);      // Yellow (255,255,0)
        else if (cellX == 1) linearColor = vec3(0.0, 1.0, 1.0); // Cyan (0,255,255)
        else if (cellX == 2) linearColor = vec3(1.0, 0.0, 1.0); // Magenta (255,0,255)
        else if (cellX == 3) linearColor = vec3(1.0, 0.5, 0.0); // Orange (255,128,0)
    }
    // Row 3: Mid-range colors
    else if (cellY == 3) {
        if (cellX == 0) linearColor = vec3(0.5, 0.0, 0.0);      // Dark red (128,0,0)
        else if (cellX == 1) linearColor = vec3(0.0, 0.5, 0.0); // Dark green (0,128,0)
        else if (cellX == 2) linearColor = vec3(0.0, 0.0, 0.5); // Dark blue (0,0,128)
        else if (cellX == 3) linearColor = vec3(0.5, 0.5, 0.0); // Olive (128,128,0)
    }
    
    // CRITICAL: Convert linear to sRGB for accurate color output
    // When drawingBufferColorSpace = 'srgb', WebGL expects sRGB values
    // This ensures readPixels() returns the expected 0-255 values
    vec3 color = linearToSrgb(linearColor);
    
    // CRITICAL: Reference threshold uniforms to prevent optimization
    // WebGL compilers optimize out unused uniforms, but ColorService needs to set them
    // We add a zero-offset to color (no visual effect) but keeps uniforms loaded
    color += vec3(
        (uThreshold1 + uThreshold2 + uThreshold3 + uThreshold4 + uThreshold5 +
         uThreshold6 + uThreshold7 + uThreshold8 + uThreshold9 + uThreshold10) * 0.0
    );
    
    // Output color (no alpha blending needed, alpha = 1.0)
    gl_FragColor = vec4(color, 1.0);
}

