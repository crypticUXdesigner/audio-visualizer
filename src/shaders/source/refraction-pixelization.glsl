// Refraction Pixelization Module
// Quantization/pixelization functions for refraction shader
// Extracted from refraction-fragment.glsl for better code organization

#ifndef REFRACTION_PIXELIZATION_GLSL
#define REFRACTION_PIXELIZATION_GLSL

/**
 * Quantize/pixelize a value into discrete steps
 * 
 * @param value - Input value to quantize (0.0 to 1.0)
 * @param levels - Number of quantization levels (0.0 = disabled, >0 = number of steps)
 * @returns Quantized value (0.0 to 1.0)
 */
float pixelize(float value, float levels) {
    if (levels <= 0.0) return value; // No pixelization if levels is 0 or negative
    return floor(value * levels) / levels;
}

#endif

