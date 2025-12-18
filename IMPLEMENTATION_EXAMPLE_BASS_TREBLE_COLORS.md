# Implementation Example: Bass & Treble Color Controls

This document shows how to add separate color controls for bass and treble frequencies.

## Overview

The current color system uses a single 10-color gradient that maps to frequency bands. We'll extend this to allow bass frequencies (low) to use different colors than treble frequencies (high).

## Approach: Frequency-Based Color Blending

We'll use two separate color gradients and blend between them based on frequency.

---

## Step 1: Extend Shader Config with Bass/Treble Colors

**File**: `src/shaders/shader-configs/background-fbm.js`

Modify the `colorConfig` section:

```javascript
// Replace the existing colorConfig with this extended version
colorConfig: {
    // Bass colors (low frequencies: 20-700 Hz)
    bass: {
        baseHue: '#2196f3',  // Blue base
        darkest: {
            lightness: 0.09,
            chroma: 0.12,
            hue: 220  // Deep blue
        },
        brightest: {
            lightness: 0.65,
            chroma: 0.18,
            hue: 200  // Bright cyan-blue
        },
        interpolationCurve: {
            lightness: [0.5, 0.1, 1.0, 0.9],
            chroma: [0.0, 0.25, 1.0, 0.75],
            hue: [0.0, 0.25, 1.0, 0.75]
        }
    },
    
    // Treble colors (high frequencies: 700-20000 Hz)
    treble: {
        baseHue: '#ffd54f',  // Yellow/gold base
        darkest: {
            lightness: 0.45,
            chroma: 0.15,
            hue: 40   // Orange
        },
        brightest: {
            lightness: 0.97,
            chroma: 0.22,
            hue: 60   // Bright yellow
        },
        interpolationCurve: {
            lightness: [0.5, 0.1, 1.0, 0.9],
            chroma: [0.0, 0.25, 1.0, 0.75],
            hue: [0.0, 0.25, 1.0, 0.75]
        }
    },
    
    // Blend zone between bass and treble (Hz)
    blendStartFreq: 500,   // Start blending at 500 Hz
    blendEndFreq: 1500     // Finish blending at 1500 Hz
}
```

## Step 2: Add User-Friendly Controls to Parameters

**File**: `src/shaders/shader-configs/background-fbm.js`

Add these to the `parameters` section:

```javascript
parameters: {
    // ... existing parameters ...
    
    // Bass Color Controls
    bassHue: {
        type: 'float',
        default: 220,
        min: 0,
        max: 360,
        step: 5,
        label: 'Bass Hue'
    },
    bassSaturation: {
        type: 'float',
        default: 0.15,
        min: 0,
        max: 0.4,
        step: 0.01,
        label: 'Bass Saturation'
    },
    bassBrightness: {
        type: 'float',
        default: 0.4,
        min: 0,
        max: 1.0,
        step: 0.05,
        label: 'Bass Brightness'
    },
    
    // Treble Color Controls
    trebleHue: {
        type: 'float',
        default: 60,
        min: 0,
        max: 360,
        step: 5,
        label: 'Treble Hue'
    },
    trebleSaturation: {
        type: 'float',
        default: 0.22,
        min: 0,
        max: 0.4,
        step: 0.01,
        label: 'Treble Saturation'
    },
    trebleBrightness: {
        type: 'float',
        default: 0.95,
        min: 0,
        max: 1.0,
        step: 0.05,
        label: 'Treble Brightness'
    },
    
    // Blend control
    colorBlendRange: {
        type: 'float',
        default: 0.3,
        min: 0.0,
        max: 1.0,
        step: 0.05,
        label: 'Bass/Treble Blend'
    }
}
```

## Step 3: Extend ColorGenerator to Support Dual Gradients

**File**: `src/core/ColorGenerator.js`

Add a new function to generate and blend two color sets:

```javascript
/**
 * Generates colors with separate bass and treble gradients
 * @param {Object} bassConfig - Bass color configuration (OKLCH)
 * @param {Object} trebleConfig - Treble color configuration (OKLCH)
 * @param {number} blendFactor - How much to blend between them (0-1)
 * @returns {Object} Object with color1-color10 as RGB arrays
 */
export function generateDualFrequencyColors(bassConfig, trebleConfig, blendFactor = 0.5) {
    // Generate bass colors (color6-color10, darker colors)
    const bassColors = generateColorsFromOklch(bassConfig);
    
    // Generate treble colors (color1-color5, brighter colors)
    const trebleColors = generateColorsFromOklch(trebleConfig);
    
    // Blend strategy:
    // - Colors 1-3 (brightest, high freq): Pure treble
    // - Colors 4-5 (mid-bright): Blend toward treble
    // - Colors 6-7 (mid-dark): Blend toward bass
    // - Colors 8-10 (darkest, low freq): Pure bass
    
    const colors = {};
    
    // Color 1-3: Pure treble (brightest)
    colors.color1 = trebleColors.color1;
    colors.color2 = trebleColors.color2;
    colors.color3 = trebleColors.color3;
    
    // Color 4-5: Treble with slight bass influence
    const blend4 = blendFactor * 0.3; // 30% bass at most
    const blend5 = blendFactor * 0.5; // 50% bass at most
    colors.color4 = blendColors(trebleColors.color4, bassColors.color4, blend4);
    colors.color5 = blendColors(trebleColors.color5, bassColors.color5, blend5);
    
    // Color 6-7: Bass with slight treble influence
    const blend6 = blendFactor * 0.5; // 50% treble at most
    const blend7 = blendFactor * 0.3; // 30% treble at most
    colors.color6 = blendColors(bassColors.color6, trebleColors.color6, blend6);
    colors.color7 = blendColors(bassColors.color7, trebleColors.color7, blend7);
    
    // Color 8-10: Pure bass (darkest)
    colors.color8 = bassColors.color8;
    colors.color9 = bassColors.color9;
    colors.color10 = bassColors.color10;
    
    return colors;
}

/**
 * Blends two RGB colors
 * @param {number[]} color1 - First RGB color [0-1]
 * @param {number[]} color2 - Second RGB color [0-1]
 * @param {number} factor - Blend factor (0=color1, 1=color2)
 * @returns {number[]} Blended RGB color [0-1]
 */
function blendColors(color1, color2, factor) {
    return [
        color1[0] * (1 - factor) + color2[0] * factor,
        color1[1] * (1 - factor) + color2[1] * factor,
        color1[2] * (1 - factor) + color2[2] * factor
    ];
}
```

## Step 4: Update ShaderInstance to Use Dual Colors

**File**: `src/shaders/ShaderInstance.js`

Modify the color generation to support both single and dual configs:

```javascript
// In the color update section (look for generateColorsFromOklch calls)
// Replace existing color generation with:

generateColors() {
    const colorConfig = this.config.colorConfig;
    
    // Check if we have separate bass/treble configs
    if (colorConfig.bass && colorConfig.treble) {
        // Dual-gradient mode
        const blendRange = this.parameters.colorBlendRange || 0.3;
        
        // Apply user parameter overrides if present
        if (this.parameters.bassHue !== undefined) {
            colorConfig.bass.brightest.hue = this.parameters.bassHue;
            colorConfig.bass.darkest.hue = this.parameters.bassHue - 20; // Slightly darker hue
        }
        if (this.parameters.bassSaturation !== undefined) {
            colorConfig.bass.brightest.chroma = this.parameters.bassSaturation;
        }
        if (this.parameters.bassBrightness !== undefined) {
            colorConfig.bass.brightest.lightness = this.parameters.bassBrightness;
        }
        
        if (this.parameters.trebleHue !== undefined) {
            colorConfig.treble.brightest.hue = this.parameters.trebleHue;
            colorConfig.treble.darkest.hue = this.parameters.trebleHue - 20;
        }
        if (this.parameters.trebleSaturation !== undefined) {
            colorConfig.treble.brightest.chroma = this.parameters.trebleSaturation;
        }
        if (this.parameters.trebleBrightness !== undefined) {
            colorConfig.treble.brightest.lightness = this.parameters.trebleBrightness;
        }
        
        return generateDualFrequencyColors(
            colorConfig.bass,
            colorConfig.treble,
            blendRange
        );
    } else {
        // Single gradient mode (backward compatible)
        return generateColorsFromOklch(colorConfig);
    }
}
```

## Step 5: Color Preset Examples

**File**: `src/config/color-presets.js`

Add bass/treble color presets:

```javascript
export const colorPresets = [
    // ... existing presets ...
    
    {
        name: 'Ocean Depths',
        config: {
            bass: {
                baseHue: '#0d47a1',  // Deep blue
                darkest: { lightness: 0.08, chroma: 0.15, hue: 230 },
                brightest: { lightness: 0.55, chroma: 0.18, hue: 200 },
                interpolationCurve: {
                    lightness: [0.5, 0.1, 1.0, 0.9],
                    chroma: [0.0, 0.25, 1.0, 0.75],
                    hue: [0.0, 0.25, 1.0, 0.75]
                }
            },
            treble: {
                baseHue: '#00e5ff',  // Cyan
                darkest: { lightness: 0.55, chroma: 0.18, hue: 200 },
                brightest: { lightness: 0.97, chroma: 0.25, hue: 190 },
                interpolationCurve: {
                    lightness: [0.5, 0.1, 1.0, 0.9],
                    chroma: [0.0, 0.25, 1.0, 0.75],
                    hue: [0.0, 0.25, 1.0, 0.75]
                }
            }
        }
    },
    
    {
        name: 'Fire & Ice',
        config: {
            bass: {
                baseHue: '#ff5722',  // Deep orange/red
                darkest: { lightness: 0.12, chroma: 0.18, hue: 20 },
                brightest: { lightness: 0.60, chroma: 0.22, hue: 30 },
                interpolationCurve: {
                    lightness: [0.5, 0.1, 1.0, 0.9],
                    chroma: [0.0, 0.25, 1.0, 0.75],
                    hue: [0.0, 0.25, 1.0, 0.75]
                }
            },
            treble: {
                baseHue: '#00bcd4',  // Bright cyan
                darkest: { lightness: 0.50, chroma: 0.15, hue: 190 },
                brightest: { lightness: 0.95, chroma: 0.20, hue: 200 },
                interpolationCurve: {
                    lightness: [0.5, 0.1, 1.0, 0.9],
                    chroma: [0.0, 0.25, 1.0, 0.75],
                    hue: [0.0, 0.25, 1.0, 0.75]
                }
            }
        }
    },
    
    {
        name: 'Forest Canopy',
        config: {
            bass: {
                baseHue: '#1b5e20',  // Dark green
                darkest: { lightness: 0.10, chroma: 0.12, hue: 135 },
                brightest: { lightness: 0.50, chroma: 0.16, hue: 145 },
                interpolationCurve: {
                    lightness: [0.5, 0.1, 1.0, 0.9],
                    chroma: [0.0, 0.25, 1.0, 0.75],
                    hue: [0.0, 0.25, 1.0, 0.75]
                }
            },
            treble: {
                baseHue: '#ffeb3b',  // Bright yellow
                darkest: { lightness: 0.50, chroma: 0.20, hue: 80 },
                brightest: { lightness: 0.96, chroma: 0.25, hue: 90 },
                interpolationCurve: {
                    lightness: [0.5, 0.1, 1.0, 0.9],
                    chroma: [0.0, 0.25, 1.0, 0.75],
                    hue: [0.0, 0.25, 1.0, 0.75]
                }
            }
        }
    }
];
```

## Step 6: UI Enhancement - Color Wheel Preview

**File**: `src/ui/ShaderParameterPanel.js`

Add a visual color wheel preview for bass/treble:

```javascript
createColorPreview(hue, saturation, brightness, label) {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 8px;';
    
    // Color swatch
    const swatch = document.createElement('div');
    swatch.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: 2px solid rgba(255, 255, 255, 0.2);
    `;
    
    // Convert OKLCH to RGB for preview
    const rgb = oklchToRgb([brightness, saturation, hue]);
    const hex = rgbToHex(rgb);
    swatch.style.backgroundColor = hex;
    
    // Label
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.6);';
    
    container.appendChild(swatch);
    container.appendChild(labelElement);
    
    return container;
}
```

## Testing the Implementation

Once implemented, you should see:

1. **Separate Bass/Treble Sliders**:
   - Bass Hue: Blue tones (180-240°)
   - Treble Hue: Yellow/warm tones (40-80°)
   
2. **Visual Feedback**:
   - Low frequencies (bass, kick drum) → Blue/cool colors
   - High frequencies (hi-hats, vocals) → Yellow/warm colors
   - Mid frequencies → Blended colors

3. **Real-Time Updates**:
   - Adjust bass hue → darkest colors change
   - Adjust treble hue → brightest colors change
   - Blend slider → controls how sharp the transition is

## Expected Behavior

- **Bass-heavy tracks**: More blue/cool colors dominate
- **Treble-heavy tracks**: More yellow/warm colors dominate
- **Balanced tracks**: Natural blend between bass and treble colors
- **Blend Range = 0**: Sharp separation (disco ball effect)
- **Blend Range = 1**: Smooth transition (gradient effect)

## Color Psychology Tips

**Bass Colors (Low Frequencies)**:
- Blue: Calming, deep, powerful
- Red: Intense, energetic, heavy
- Purple: Mysterious, rich, luxurious
- Green: Natural, grounded, steady

**Treble Colors (High Frequencies)**:
- Yellow: Bright, sharp, energetic
- Cyan: Clear, crisp, airy
- White: Pure, clean, piercing
- Orange: Warm, vibrant, lively

## Recommended Presets by Genre

- **Electronic/EDM**: Fire & Ice (red bass, cyan treble)
- **Jazz/Blues**: Ocean Depths (deep blue bass, cyan treble)
- **Classical**: Forest Canopy (green bass, yellow treble)
- **Rock/Metal**: Lava Flow (dark red bass, orange treble)
- **Ambient/Chill**: Northern Lights (purple bass, green treble)

## Advanced: Frequency-Aware Color Mapping

For even more advanced control, modify the shader to weight colors by actual frequency energy:

```glsl
// In background-fragment.glsl (around line 400)
// Calculate frequency-weighted color selection

// Bass weight (frequencies 20-700 Hz): freq6, freq7
float bassWeight = (uFreq6 + uFreq7) * 0.5;

// Treble weight (frequencies 1400+ Hz): freq1, freq2, freq3
float trebleWeight = (uFreq1 + uFreq2 + uFreq3) * 0.33;

// Normalize weights
float totalWeight = bassWeight + trebleWeight + 0.01; // Avoid division by zero
bassWeight /= totalWeight;
trebleWeight /= totalWeight;

// Shift thresholds based on frequency energy
// More bass energy → favor darker (bass) colors
// More treble energy → favor brighter (treble) colors
float colorBias = (trebleWeight - bassWeight) * 0.2; // -0.2 to +0.2 shift

// Apply bias to feed value
feed = clamp(feed + colorBias, 0.0, 1.0);
```

This makes the color selection respond dynamically to the frequency content!

