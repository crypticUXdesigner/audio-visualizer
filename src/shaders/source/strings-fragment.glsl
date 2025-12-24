precision highp float;

#include "common/uniforms.glsl"
#include "common/noise.glsl"
#include "common/audio.glsl"
#include "common/color-mapping.glsl"
#include "common/screen-adaptation.glsl"
#include "common/constants.glsl"

// Frequency data texture
// uFrequencyTexture: LUMINANCE = left channel (swing), ALPHA = right channel (swing)
uniform sampler2D uFrequencyTexture;
// uHeightTexture: LUMINANCE = left channel (height), ALPHA = right channel (height)
uniform sampler2D uHeightTexture;

// Number of visual bands (for display)
uniform int uNumBands;
// Number of measured bands (for texture sampling)
uniform float uMeasuredBands;

// String parameters
uniform float uMinStringWidth;     // Minimum string width (pixels)
uniform float uMaxStringWidth;     // Maximum string width (pixels)
uniform float uMaxAmplitude;       // Maximum swing amplitude (0.0-1.0)
uniform float uWaveNote;           // Musical note value (fraction of bar, e.g. 1/4 = quarter note)
uniform float uStringTop;           // Top of string area (0.0-1.0)
uniform float uStringBottom;       // Bottom of string area (0.0-1.0)
uniform float uStringEndFadeMinAlpha;  // Minimum alpha at string ends (0.0-1.0)
uniform float uMaxHeight;               // Maximum height scale for bars (0.0-1.0)
uniform float uWaveCycles;             // Number of wave cycles along the string
uniform float uShowBars;               // Show frequency bars (1.0 = on, 0.0 = off)
uniform float uShowStrings;            // Show strings (1.0 = on, 0.0 = off)
uniform float uWaveAmplitude;          // Wave amplitude multiplier
uniform int uMaxStrings;               // Maximum number of strings per band
uniform float uThreshold2Strings;      // Threshold for showing 2 strings
uniform float uThreshold3Strings;      // Threshold for showing 3 strings

// Band bar height parameters
uniform float uBandMinHeight;          // Minimum bar height (0.0-1.0)
uniform float uBandMaxHeight;          // Maximum bar height (0.0-1.0)
uniform float uBandHeightCurveX1;      // Cubic bezier curve control point X1
uniform float uBandHeightCurveY1;      // Cubic bezier curve control point Y1
uniform float uBandHeightCurveX2;      // Cubic bezier curve control point X2
uniform float uBandHeightCurveY2;      // Cubic bezier curve control point Y2
uniform float uStringHeightMultiplier; // Multiplier to make strings taller than bars (>= 1.0)

// Background noise parameters
uniform float uBackgroundNoiseScale;    // Noise scale
uniform float uBackgroundNoiseIntensity; // Noise intensity (0.0-1.0)
uniform float uBackgroundNoiseAudioReactive; // Audio reactivity amount (0.0-1.0)
uniform int uBackgroundNoiseAudioSource; // Audio source (0=Volume, 1=Bass, 2=Mid, 3=Treble)
uniform float uBackgroundNoiseBrightnessCurveX1; // Cubic bezier curve X1
uniform float uBackgroundNoiseBrightnessCurveY1; // Cubic bezier curve Y1
uniform float uBackgroundNoiseBrightnessCurveX2; // Cubic bezier curve X2
uniform float uBackgroundNoiseBrightnessCurveY2; // Cubic bezier curve Y2
uniform float uBackgroundNoiseBrightnessMin; // Min brightness factor
uniform float uBackgroundNoiseBrightnessMax; // Max brightness factor
uniform float uSmoothedNoiseAudioLevel; // Smoothed audio level (from JS with attack/release)
uniform float uBackgroundNoiseTimeSpeed; // Base animation speed for background noise
uniform float uBackgroundNoiseTimeOffset; // Time offset for background noise animation
uniform float uColorTransitionWidth; // Color transition width for smoothstep (0.0-0.1)
uniform float uBarAlphaMin;  // Minimum alpha for bars (at low volume)
uniform float uBarAlphaMax;  // Maximum alpha for bars (at high volume)
uniform float uMaskCutoutIntensity;  // How much to cut out background (0-1)
uniform float uMaskExpansion;  // How much larger the mask is than the visualization
uniform float uMaskFeathering;  // Edge softness for mask (0-1)
uniform float uMaskNoiseStrength;  // Strength of animated noise on mask edges (0-1)
uniform float uMaskNoiseScale;  // Scale/frequency of noise pattern
uniform float uMaskNoiseSpeed;  // Animation speed of noise
uniform float uMaskAlphaCurveX1;  // Cubic bezier curve control point X1 for volume to alpha mapping
uniform float uMaskAlphaCurveY1;  // Cubic bezier curve control point Y1 for volume to alpha mapping
uniform float uMaskAlphaCurveX2;  // Cubic bezier curve control point X2 for volume to alpha mapping
uniform float uMaskAlphaCurveY2;  // Cubic bezier curve control point Y2 for volume to alpha mapping
uniform float uBandWidthThreshold;  // Volume threshold for width scaling (0.0-1.0)
uniform float uBandWidthMinMultiplier;  // Minimum width multiplier (at low volume, below threshold)
uniform float uBandWidthMaxMultiplier;  // Maximum width multiplier (at high volume, above threshold)
uniform float uContrast;  // Contrast adjustment (1.0 = normal, >1.0 = more contrast)
uniform float uContrastAudioReactive;  // How much audio affects contrast (0.0-1.0)
uniform int uContrastAudioSource;  // Audio source for contrast (0=Volume, 1=Bass, 2=Mid, 3=Treble)
uniform float uContrastMin;  // Minimum contrast (at quiet audio)
uniform float uContrastMax;  // Maximum contrast (at loud audio)
uniform float uSmoothedContrastAudioLevel; // Smoothed audio level for contrast (from JS with attack/release)
uniform float uGlowIntensity;  // Glow effect intensity (0 = off)
uniform float uGlowRadius;  // Glow radius in pixels

// Glitch effect parameters - configurable column count with automatic randomization
uniform float uGlitchColumnCount;      // Number of columns (configurable)
uniform float uGlitchRandomSeed;       // Seed for randomization (change to re-randomize)
uniform float uGlitchFlipProbability;  // Probability of flipping (0.0-1.0)
uniform float uGlitchIntensity;         // Overall glitch intensity (0.0-1.0)
uniform float uGlitchBlurAmount;       // Blur amount (0.0-1.0)
uniform float uGlitchPixelSize;        // Pixelization size (0.0 = off, >0.0 = pixel size)

// Include utility modules
#include "strings/math-utils.glsl"
#include "strings/band-utils.glsl"
#include "strings/effects.glsl"
#include "strings/background.glsl"
#include "strings/bars.glsl"
#include "strings/strings.glsl"
#include "strings/post-processing.glsl"

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / uResolution;
    
    // ============================================
    // BACKGROUND NOISE PATTERN
    // ============================================
    vec3 baseBackground;
    vec3 backgroundNoiseColor;
    float threshold1, threshold2, threshold3, threshold4, threshold5;
    float threshold6, threshold7, threshold8, threshold9, threshold10;
    
    vec3 finalBackground = calculateBackgroundNoise(
        uv, uTime, baseBackground, backgroundNoiseColor,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10
    );
    
    // ============================================
    // BAND CALCULATION
    // ============================================
    int band;
    bool isLeftSide;
    getBandFromUV(uv, band, isLeftSide);
    
    float leftLevel = 0.0;
    float rightLevel = 0.0;
    
    if (isLeftSide) {
        leftLevel = sampleBandFrequencyLevel(band, true, uFrequencyTexture);
        rightLevel = 0.0;
    } else {
        leftLevel = 0.0;
        rightLevel = sampleBandFrequencyLevel(band, false, uFrequencyTexture);
    }
    
    // ============================================
    // CALCULATE FREQUENCY VISUALIZATION MASK
    // ============================================
    float visualizationMask = 0.0;
    
    // Calculate mask for bars
    if (uShowBars > 0.5) {
        visualizationMask = max(visualizationMask, calculateBarMask(uv, band, isLeftSide, leftLevel, rightLevel));
    }
    
    // Apply mask to background noise
    finalBackground = applyMaskToBackground(baseBackground, backgroundNoiseColor, visualizationMask);
    
    // ============================================
    // RENDER VISUALIZATION
    // ============================================
    // Initialize with background color (now includes noise and mask)
    vec3 finalColor = finalBackground;
    float finalAlpha = 0.0;
    
    // 1. DRAW FREQUENCY LEVEL BARS (behind strings)
    finalColor = renderBars(uv, band, isLeftSide, leftLevel, rightLevel, finalColor);
    
    // 2. DRAW STRINGS (on top of bars)
    finalColor = renderStrings(
        uv, band, isLeftSide, leftLevel, rightLevel,
        threshold1, threshold2, threshold3, threshold4, threshold5,
        threshold6, threshold7, threshold8, threshold9, threshold10,
        finalColor, finalAlpha
    );
    
    // Ensure we have some color
    if (finalAlpha < 0.01) {
        finalColor = finalBackground;
        finalAlpha = 1.0;
    }
    
    // ============================================
    // POST-PROCESSING: CONTRAST AND GLOW
    // ============================================
    vec3 processedColor = applyPostProcessing(finalColor);
    
    gl_FragColor = vec4(processedColor, finalAlpha);
}

