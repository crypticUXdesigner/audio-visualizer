# User Controls Roadmap
## Summary of Controls Ready for User Exposure

This document outlines the controls that could be exposed to users for real-time adjustment of the visual player.

---

## ✅ Already Exposed (Ready to Use)

These parameters are already defined in the shader config and can be adjusted via the UI:

### 1. **Pixel Size**
- **Location**: `src/shaders/shader-configs/background-fbm.js` (lines 13-20)
- **Current Range**: 0.5 - 5.0
- **Default**: 0.5
- **Description**: Controls the size of each "pixel" in the visualization
- **Status**: ✅ Fully working, exposed in shader parameter panel

### 2. **Dither Strength**
- **Location**: `src/shaders/shader-configs/background-fbm.js` (lines 85-92)
- **Shader Uniform**: `uDitherStrength` (background-fragment.glsl line 26, 382)
- **Current Range**: 0 - 5.0
- **Default**: 3.0
- **Description**: Controls the intensity of Bayer matrix dithering
- **Status**: ✅ Fully working, exposed in shader parameter panel

### 3. **Transition Smoothness/Thickness**
- **Location**: `src/shaders/shader-configs/background-fbm.js` (lines 93-100)
- **Shader Uniform**: `uTransitionWidth` (background-fragment.glsl line 27, 497)
- **Current Range**: 0.005 - 0.1
- **Default**: 0.005
- **Description**: Controls the smoothness of color transitions (lower = sharper, higher = softer)
- **Status**: ✅ Fully working, exposed in shader parameter panel

---

## 🔧 Needs UI Exposure

These parameters exist in the code but aren't exposed to the UI yet:

### 4. **Attack and Release (Audio Smoothing)**
- **Location**: `src/config/tempo-smoothing-config.js`
- **Current Implementation**: Fixed values defined per feature (volume, frequency bands, etc.)
- **Current Values**:
  - **Volume Attack**: 1/64th note (very fast)
  - **Volume Release**: 1/8th note (moderate)
  - **Frequency Attack**: 1/128th note (very fast)
  - **Frequency Release**: 1/2 note (moderate)
  
**What needs to be done:**
```javascript
// Add to shader config parameters:
volumeAttackSpeed: {
    type: 'float',
    default: 1.0/64.0,  // Musical note fraction
    min: 1.0/256.0,     // Very fast (256th note)
    max: 1.0/4.0,       // Slow (quarter note)
    step: 1.0/256.0,
    label: 'Volume Attack Speed'
},
volumeReleaseSpeed: {
    type: 'float',
    default: 1.0/8.0,
    min: 1.0/64.0,
    max: 1.0,           // Whole note (very slow)
    step: 1.0/64.0,
    label: 'Volume Release Speed'
},
frequencyAttackSpeed: {
    type: 'float',
    default: 1.0/128.0,
    min: 1.0/256.0,
    max: 1.0/4.0,
    step: 1.0/256.0,
    label: 'Frequency Attack Speed'
},
frequencyReleaseSpeed: {
    type: 'float',
    default: 1.0/2.0,
    min: 1.0/64.0,
    max: 2.0,
    step: 1.0/64.0,
    label: 'Frequency Release Speed'
}
```

**Implementation Steps:**
1. Modify `TempoSmoothingConfig` to accept dynamic values
2. Pass parameter values from shader config to AudioAnalyzer
3. Add UI controls to ShaderParameterPanel

---

## 🎨 Needs Design & Implementation

### 5. **Colors for Bass and Treble**

**Current System**: 
- 10 colors interpolated via OKLCH color space
- Single color gradient from dark (bass) to bright (treble)
- Located in: `src/config/color-presets.js` and `src/core/ColorGenerator.js`

**Proposed Implementation**:

#### Option A: Separate Bass/Treble Color Schemes
Allow users to define different color palettes for bass vs treble frequencies:

```javascript
// In shader config:
colorConfig: {
    bass: {
        baseHue: '#1a5fb4',  // Blue tones for bass
        darkest: { lightness: 0.05, chroma: 0.1, hue: 220 },
        brightest: { lightness: 0.5, chroma: 0.15, hue: 240 }
    },
    treble: {
        baseHue: '#f6d32d',  // Yellow tones for treble
        darkest: { lightness: 0.5, chroma: 0.15, hue: 240 },
        brightest: { lightness: 0.97, chroma: 0.2, hue: 60 }
    },
    midBlendRange: 0.3  // How much to blend between bass/treble colors
}
```

#### Option B: Simpler Hue Offset Controls
Add hue rotation based on frequency band:

```javascript
// In shader config:
bassHueShift: {
    type: 'float',
    default: 0,
    min: -180,
    max: 180,
    step: 5,
    label: 'Bass Hue Shift (degrees)'
},
trebleHueShift: {
    type: 'float',
    default: 0,
    min: -180,
    max: 180,
    step: 5,
    label: 'Treble Hue Shift (degrees)'
}
```

**Implementation Steps:**
1. Extend `ColorGenerator.js` to support frequency-based color mapping
2. Modify shader to apply different colors based on frequency band
3. Add color picker or hue slider controls to UI
4. Update `generateColorsFromOklch()` to interpolate between bass/treble colors

---

## 📋 Implementation Priority

### Immediate (Easy Wins):
1. ✅ Pixel Size - Already done
2. ✅ Dither Strength - Already done  
3. ✅ Transition Smoothness - Already done

### Short Term (Medium Complexity):
4. 🔧 Attack and Release - Requires parameter plumbing
   - Estimated effort: 2-3 hours
   - Files to modify: 3-4 files

### Medium Term (Higher Complexity):
5. 🎨 Bass/Treble Colors - Requires color system redesign
   - Estimated effort: 4-6 hours
   - Files to modify: 5-6 files
   - Design decision needed: Option A vs Option B

---

## 🎛️ Additional Controls Worth Considering

Based on the codebase analysis, here are other parameters that could be exposed:

### Visual Parameters:
- **Ripple Speed** (0.1-2.0) - Already in config
- **Ripple Width** (0.02-0.5) - Already in config
- **Ripple Intensity** (0-1.0) - Already in config
- **Target FPS** (15-60) - Performance control

### Audio Analysis:
- **Bass Threshold** (0-1.0) - Sensitivity for bass beat detection
- **Mid Threshold** (0-1.0) - Sensitivity for mid beat detection
- **Treble Threshold** (0-1.0) - Sensitivity for treble beat detection
- **Stereo Emphasis** (0.5-1.0) - How much to emphasize stereo differences

### Color System:
- **Color Steps** (2-10) - Number of discrete color levels
- **Chroma Intensity** (0-0.4) - Color saturation
- **Lightness Range** (0-1.0) - Brightness range

---

## 🚀 Quick Start Guide

### To expose an existing parameter:
1. Ensure it's in `shader-configs/background-fbm.js` parameters section
2. The `ShaderParameterPanel` will automatically create a UI control
3. Test by adjusting the slider in the UI

### To add a new parameter:
1. Add to shader config `parameters` section
2. Add uniform in shader (.glsl file) if needed
3. Add uniform mapping in config if using audio data
4. ShaderParameterPanel will auto-generate the control

### To modify attack/release:
1. Create dynamic parameters in shader config
2. Modify `TempoSmoothingConfig` to accept runtime values
3. Pass values from shader config to `AudioAnalyzer.update()`

---

## 📝 Notes

- All slider controls use the existing `ShaderParameterPanel` system
- Color controls may need custom UI elements (color pickers)
- Attack/release controls would benefit from musical note labels (e.g., "1/16th note")
- Consider grouping related controls in collapsible sections
- Save/load presets functionality already exists

## Current File Structure

```
src/
├── config/
│   ├── color-presets.js          # Color palette definitions
│   ├── tempo-smoothing-config.js # Attack/release settings
│   └── track-registry.js
├── core/
│   ├── AudioAnalyzer.js          # Audio analysis (attack/release used here)
│   └── ColorGenerator.js         # Color generation (OKLCH conversions)
├── shaders/
│   └── shader-configs/
│       └── background-fbm.js     # Main shader config (controls defined here)
└── ui/
    └── ShaderParameterPanel.js   # Auto-generates UI controls
```

