precision highp float;

// Define FWIDTH macro - will be replaced by JavaScript based on extension availability
// If extension is available, this will be replaced with actual fwidth() call
// If not available, this will be replaced with a constant approximation
#define FWIDTH(x) fwidth(x)

// Include common code
#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"
#include "common/color-mapping.glsl"
#include "common/ripples.glsl"
#include "common/screen-adaptation.glsl"

// Shader-specific uniforms
uniform int   uShapeType;         // 0=square 1=circle 2=tri 3=diamond
const int SHAPE_SQUARE   = 0;
const int SHAPE_CIRCLE   = 1;
const int SHAPE_TRIANGLE = 2;
const int SHAPE_DIAMOND  = 3;

// Shader-specific constants
#define FBM_OCTAVES     6
#define FBM_LACUNARITY  1.35
#define FBM_GAIN        0.65
#define FBM_SCALE       1.25          // master scale for uv (smaller = larger spots)

// Bayer matrix helpers (ordered dithering thresholds) - shader-specific
float Bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2. + a.y * a.y * .75);
}

#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

// Shape masks (shader-specific)
float maskCircle(vec2 p, float cov) {
    float r = sqrt(cov) * .25;
    float d = length(p - 0.5) - r;
    // cheap analytic AA
    float aa = 0.5 * FWIDTH(d);
    return cov * (1.0 - smoothstep(-aa, aa, d * 2.));
}

float maskTriangle(vec2 p, vec2 id, float cov) {
    bool flip = mod(id.x + id.y, 2.0) > 0.5;
    if (flip) p.x = 1.0 - p.x;
    float r = sqrt(cov);
    float d  = p.y - r*(1.0 - p.x);   // signed distance to the edge
    float aa = FWIDTH(d);             // analytic pixel width
    return cov * clamp(0.5 - d/aa, 0.0, 1.0);
}

float maskDiamond(vec2 p, float cov) {
    float r = sqrt(cov) * 0.564;
    return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
}

void main() {
    float pixelSize = uPixelSize; // Size of each pixel in the Bayer matrix
    vec2 fragCoord = gl_FragCoord.xy; // Use non-centered for cell calculation
    vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * .5; // Centered for Bayer dithering

    // Calculate the UV coordinates for the grid
    float aspectRatio = getAspectRatio();

    vec2 pixelId = floor(fragCoordCentered / pixelSize); // integer Bayer cell
    vec2 pixelUV = fract(fragCoordCentered / pixelSize); 

    float cellPixelSize =  8. * pixelSize; // 8x8 Bayer matrix
    vec2 cellId = floor(fragCoord / cellPixelSize); // integer Bayer cell (use non-centered)
    
    vec2 cellCoord = cellId * cellPixelSize;
    
    // Calculate UV properly - normalize to [0,1] range then center for fBm
    vec2 uv = cellCoord / uResolution;
    // Center UV around origin for proper fBm noise calculation
    uv = (uv - 0.5) * vec2(aspectRatio, 1.0);
    
    // Calculate stereo brightness using shared function
    float stereoBrightness = calculateStereoBrightness(
        uv, aspectRatio,
        uBassStereo, uMidStereo, uTrebleStereo,
        uBass, uMid, uTreble
    );

    // Calculate modulated time using shared function
    float staticTimeOffset = 105.0;  // Skip forward in animation
    float baseTimeSpeed = 0.08;
    float modulatedTime = calculateModulatedTime(
        uTime, uTimeOffset, uVolume,
        uBass, uMid, uTreble, uBPM,
        staticTimeOffset, baseTimeSpeed
    );
    
    // Base fBm noise pattern - provides organic spatial variation
    float feed = fbm2_standard(uv, modulatedTime, FBM_SCALE, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN);
    
    // Scale feed based on volume - quieter songs stay darker
    float volumeScale = calculateVolumeScale(uVolume);
    feed = feed * volumeScale;
    
    // Apply stereo brightness modulation (subtle)
    feed *= stereoBrightness;
    
    // Soft compression for high values (prevents washout during loud sections)
    feed = applySoftCompression(feed, 0.7, 0.3);
    
    // Multiple ripples positioned by stereo field
    float beatRipple = renderAllRipples(uv, aspectRatio, uRippleCount);
    feed = feed + beatRipple;

    // Multi-step dithering with Bayer matrix
    float ditherStrength = uDitherStrength > 0.0 ? uDitherStrength : 3.0;
    float bayer = (Bayer8(fragCoordCentered / uPixelSize) - 0.5) * ditherStrength;
    
    // Ensure feed stays in valid range
    feed = clamp(feed, 0.0, 1.0);
    
    // Calculate thresholds using shared wrapper function (with frequency modulation for heightmap)
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    calculateAllFrequencyThresholds(
        bayer,
        true,  // useFrequencyModulation = true for heightmap
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // Map to color using shared function
    float transitionWidth = uTransitionWidth > 0.0 ? uTransitionWidth : 0.005;
    vec3 color = mapNoiseToColor(
        feed,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        transitionWidth
    );
    
    float coverage = 1.0;
    gl_FragColor = vec4(color, coverage);
}
