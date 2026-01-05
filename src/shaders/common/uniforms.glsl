// Common Uniform Declarations
// All shaders share these uniform declarations

// Color uniforms (10-step gradient)
uniform vec3  uColor;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform vec3  uColor8;
uniform vec3  uColor9;
uniform vec3  uColor10;
uniform float uSteps;

// Screen and time uniforms
uniform vec2  uResolution;
uniform vec4  uMouse;
uniform float uTime;
uniform float uTimeOffset;
uniform float uPixelSize;
uniform float uDevicePixelRatio;  // For pixel-based calculations

// Dithering control uniforms
uniform float uDitherStrength;
uniform float uTransitionWidth;

// Audio uniforms (0.0 to 1.0)
uniform float uBass;    // Low frequencies (20-250Hz)
uniform float uMid;     // Mid frequencies (250-2000Hz)
uniform float uTreble;  // High frequencies (2000-11025Hz)
uniform float uVolume;  // Overall volume/RMS

// Frequency bands for color mapping (0.0 to 1.0)
// Standard 10-band EQ frequencies: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz
uniform float uFreq1;  // 11.3k-20k Hz (brightest/color)
uniform float uFreq2;  // 5.7k-11.3k Hz (color2)
uniform float uFreq3;  // 2.8k-5.7k Hz (color3)
uniform float uFreq4;  // 1.4k-2.8k Hz (color4)
uniform float uFreq5;  // 707-1414 Hz (color5)
uniform float uFreq6;  // 354-707 Hz (color6)
uniform float uFreq7;  // 177-354 Hz (color7)
uniform float uFreq8;  // 88-177 Hz (color8)
uniform float uFreq9;  // 44-88 Hz (color9)
uniform float uFreq10; // 20-44 Hz (darkest/color10)

// Stereo balance uniforms (-1 = left, 0 = center, 1 = right)
uniform float uBassStereo;   // Stereo balance for bass frequencies
uniform float uMidStereo;    // Stereo balance for mid frequencies
uniform float uTrebleStereo; // Stereo balance for treble frequencies

// Temporal and beat detection uniforms
uniform float uSmoothedBass;   // Smoothed bass (temporal average)
uniform float uSmoothedMid;    // Smoothed mid (temporal average)
uniform float uSmoothedTreble; // Smoothed treble (temporal average)
uniform float uPeakBass;       // Peak bass (decaying peak)
uniform float uBeatTime;       // Time since last beat (seconds, 0-2)
uniform float uBeatIntensity; // Intensity of last beat (0-1)
uniform float uBPM;           // Estimated beats per minute

// Multi-frequency ripple uniforms (kept for backward compatibility)
uniform float uBeatTimeBass;
uniform float uBeatTimeMid;
uniform float uBeatTimeTreble;
uniform float uBeatIntensityBass;
uniform float uBeatIntensityMid;
uniform float uBeatIntensityTreble;
uniform float uBeatStereoBass;  // Fixed stereo position when bass beat was detected
uniform float uBeatStereoMid;   // Fixed stereo position when mid beat was detected
uniform float uBeatStereoTreble; // Fixed stereo position when treble beat was detected

// Missing peaks (already calculated)
uniform float uPeakVolume;        // Peak volume
uniform float uPeakMid;           // Peak mid
uniform float uPeakTreble;        // Peak treble

// Raw frequency bands (unsmoothed)
uniform float uFreq1Raw;
uniform float uFreq2Raw;
uniform float uFreq3Raw;
uniform float uFreq4Raw;
uniform float uFreq5Raw;
uniform float uFreq6Raw;
uniform float uFreq7Raw;
uniform float uFreq8Raw;
uniform float uFreq9Raw;
uniform float uFreq10Raw;

// Advanced audio metrics
uniform float uFrequencySpread;  // Texture indicator
uniform float uBassOnset;         // Sudden change in bass
uniform float uMidOnset;          // Sudden change in mid
uniform float uTrebleOnset;       // Sudden change in treble

// Frequency band groupings
uniform float uLowBass;           // Grouped: freq9 + freq10
uniform float uMidBass;           // Grouped: freq7 + freq8
uniform float uLowMid;            // Grouped: freq5 + freq6
uniform float uHighMid;           // Grouped: freq3 + freq4
uniform float uPresence;          // Grouped: freq1 + freq2

// Beat timing helpers
uniform float uBeatPhase;         // Beat phase (0-1, cycles through beat period)
uniform float uBeatAnticipation; // Beat anticipation (1.0 = approaching beat)

// Energy metrics
uniform float uEnergy;            // Overall energy
uniform float uHighEnergy;         // High frequency energy
uniform float uLowEnergy;         // Low frequency energy

// Playback progress
uniform float uPlaybackProgress;  // Playback position (0.0-1.0)

// Multiple ripple tracking uniforms
// WebGL doesn't support array uniforms directly, so we use separate arrays
#define MAX_RIPPLES 16
uniform float uRippleCenterX[MAX_RIPPLES];  // X position (stereo) for each ripple
uniform float uRippleCenterY[MAX_RIPPLES];  // Y position (vertical) for each ripple
uniform float uRippleTimes[MAX_RIPPLES];    // Time since ripple started (seconds)
uniform float uRippleIntensities[MAX_RIPPLES]; // Intensity of each ripple (0-1)
uniform float uRippleWidths[MAX_RIPPLES];   // Width of ring for each ripple
uniform float uRippleMinRadii[MAX_RIPPLES]; // Minimum radius for each ripple
uniform float uRippleMaxRadii[MAX_RIPPLES]; // Maximum radius for each ripple
uniform float uRippleIntensityMultipliers[MAX_RIPPLES]; // Intensity multiplier for each ripple
uniform float uRippleActive[MAX_RIPPLES];   // 1.0 if ripple is active, 0.0 otherwise
uniform int uRippleCount;                   // Number of active ripples

// Ripple effect parameters (real-time configurable)
uniform float uRippleSpeed;              // Speed of expanding ring (0.1-2.0)
uniform float uRippleWidth;               // Width of the ring (0.02-0.5)
uniform float uRippleMinRadius;          // Minimum ring radius (0.0-1.0)
uniform float uRippleMaxRadius;           // Maximum ring radius (0.0-2.0)
uniform float uRippleIntensityThreshold; // Intensity threshold for ripples (0.0-1.0)
uniform float uRippleIntensity;          // Overall ripple intensity multiplier (0.0-1.0)

// Threshold uniforms - calculated from thresholdCurve bezier
uniform float uThreshold1;  // Threshold for color1 (brightest)
uniform float uThreshold2;  // Threshold for color2
uniform float uThreshold3;  // Threshold for color3
uniform float uThreshold4;  // Threshold for color4
uniform float uThreshold5;  // Threshold for color5
uniform float uThreshold6;  // Threshold for color6
uniform float uThreshold7;  // Threshold for color7
uniform float uThreshold8;  // Threshold for color8
uniform float uThreshold9;  // Threshold for color9
uniform float uThreshold10; // Threshold for color10 (darkest)

// Recording tone curve and color adjustments (cubic bezier control points)
// Maps luminance (dark to bright) through bezier curves for fine-tuned color adjustments
uniform float uRecordingToneCurveX1;      // Tone curve (gamma replacement) control point 1 X (0.0-1.0)
uniform float uRecordingToneCurveY1;      // Tone curve (gamma replacement) control point 1 Y (0.0-1.0)
uniform float uRecordingToneCurveX2;       // Tone curve (gamma replacement) control point 2 X (0.0-1.0)
uniform float uRecordingToneCurveY2;       // Tone curve (gamma replacement) control point 2 Y (0.0-1.0)
uniform float uRecordingBrightnessCurveX1; // Brightness curve control point 1 X (0.0-1.0)
uniform float uRecordingBrightnessCurveY1; // Brightness curve control point 1 Y (0.0-1.0)
uniform float uRecordingBrightnessCurveX2; // Brightness curve control point 2 X (0.0-1.0)
uniform float uRecordingBrightnessCurveY2; // Brightness curve control point 2 Y (0.0-1.0)
uniform float uRecordingContrastCurveX1;   // Contrast curve control point 1 X (0.0-1.0)
uniform float uRecordingContrastCurveY1;   // Contrast curve control point 1 Y (0.0-1.0)
uniform float uRecordingContrastCurveX2;   // Contrast curve control point 2 X (0.0-1.0)
uniform float uRecordingContrastCurveY2;   // Contrast curve control point 2 Y (0.0-1.0)
uniform float uRecordingSaturationCurveX1; // Saturation curve control point 1 X (0.0-1.0)
uniform float uRecordingSaturationCurveY1; // Saturation curve control point 1 Y (0.0-1.0)
uniform float uRecordingSaturationCurveX2;  // Saturation curve control point 2 X (0.0-1.0)
uniform float uRecordingSaturationCurveY2; // Saturation curve control point 2 Y (0.0-1.0)
uniform float uApplyRecordingToneCurve;    // 0.0 = disabled, 1.0 = enabled (replaces gamma correction)
uniform float uApplyRecordingColorAdjustments; // 0.0 = disabled, 1.0 = enabled
uniform float uApplyRecordingBrightness;   // 0.0 = disabled, 1.0 = enabled
uniform float uApplyRecordingContrast;     // 0.0 = disabled, 1.0 = enabled
uniform float uApplyRecordingSaturation;  // 0.0 = disabled, 1.0 = enabled

// OKLCH-based color adjustments (perceptually uniform)
// Maps input values (0-1) to output values (0-1) through bezier curves
uniform float uRecordingOklchLightnessCurveX1; // Lightness curve control point 1 X (0.0-1.0)
uniform float uRecordingOklchLightnessCurveY1; // Lightness curve control point 1 Y (0.0-1.0)
uniform float uRecordingOklchLightnessCurveX2; // Lightness curve control point 2 X (0.0-1.0)
uniform float uRecordingOklchLightnessCurveY2; // Lightness curve control point 2 Y (0.0-1.0)
uniform float uRecordingOklchChromaCurveX1;    // Chroma curve control point 1 X (0.0-1.0)
uniform float uRecordingOklchChromaCurveY1;    // Chroma curve control point 1 Y (0.0-1.0)
uniform float uRecordingOklchChromaCurveX2;    // Chroma curve control point 2 X (0.0-1.0)
uniform float uRecordingOklchChromaCurveY2;    // Chroma curve control point 2 Y (0.0-1.0)
uniform float uRecordingOklchHueCurveX1;      // Hue curve control point 1 X (0.0-1.0)
uniform float uRecordingOklchHueCurveY1;      // Hue curve control point 1 Y (0.0-1.0)
uniform float uRecordingOklchHueCurveX2;      // Hue curve control point 2 X (0.0-1.0)
uniform float uRecordingOklchHueCurveY2;      // Hue curve control point 2 Y (0.0-1.0)
uniform float uApplyRecordingOklchAdjustments; // 0.0 = disabled, 1.0 = enabled
uniform float uApplyRecordingOklchLightness;   // 0.0 = disabled, 1.0 = enabled
uniform float uApplyRecordingOklchChroma;      // 0.0 = disabled, 1.0 = enabled
uniform float uApplyRecordingOklchHue;         // 0.0 = disabled, 1.0 = enabled

