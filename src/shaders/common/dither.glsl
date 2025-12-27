// Dithering Module
// Provides Bayer matrix functions for ordered dithering
// Used by arc and heightmap shaders to reduce color banding

#ifndef DITHER_GLSL
#define DITHER_GLSL

/**
 * Bayer2 - 2x2 Bayer matrix dithering
 * 
 * Generates a dithering threshold value for a 2x2 Bayer matrix.
 * This is the base function used by Bayer4 and Bayer8.
 * 
 * @param a - Input coordinate (typically pixel position / pixel size)
 * @returns Dithering threshold value in range [0.0, 1.0)
 */
float Bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2. + a.y * a.y * .75);
}

/**
 * Bayer4 - 4x4 Bayer matrix dithering
 * 
 * Generates a dithering threshold value for a 4x4 Bayer matrix.
 * Combines two 2x2 matrices with weighted blending.
 * 
 * @param a - Input coordinate (typically pixel position / pixel size)
 * @returns Dithering threshold value in range [0.0, 1.0)
 */
#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))

/**
 * Bayer8 - 8x8 Bayer matrix dithering
 * 
 * Generates a dithering threshold value for an 8x8 Bayer matrix.
 * Combines 4x4 and 2x2 matrices with weighted blending.
 * This is the most commonly used dithering function.
 * 
 * @param a - Input coordinate (typically pixel position / pixel size)
 * @returns Dithering threshold value in range [0.0, 1.0)
 */
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

#endif // DITHER_GLSL

