# How to Add a New Control (Step-by-Step)

This guide shows you exactly how to add a new user-adjustable control to your visual player.

## The Magic: Auto-Generated UI

The `ShaderParameterPanel` automatically creates UI controls for any parameter you add to your shader config. No manual UI coding needed!

---

## Example: Adding a "Glow Intensity" Control

Let's add a new control that adjusts the glow/bloom intensity of bright areas.

### Step 1: Add Parameter to Shader Config (2 minutes)

**File**: `src/shaders/shader-configs/background-fbm.js`

Find the `parameters` object and add:

```javascript
parameters: {
    pixelSize: { /* existing */ },
    steps: { /* existing */ },
    // ... other existing parameters ...
    
    // NEW PARAMETER - Add this:
    glowIntensity: {
        type: 'float',           // Type: 'float', 'color', or 'boolean'
        default: 0.5,            // Starting value
        min: 0,                  // Minimum value
        max: 2,                  // Maximum value
        step: 0.05,              // Slider step size
        label: 'Glow Intensity'  // Display name in UI
    }
}
```

**That's it!** The UI control now exists automatically. 🎉

---

### Step 2: Use the Parameter (5-10 minutes)

Now use the parameter value somewhere in your code.

#### Option A: In the Shader (GLSL)

**File**: `shaders/background-fragment.glsl`

1. **Add uniform declaration** (top of file, around line 30):
```glsl
uniform float uGlowIntensity;  // Glow intensity multiplier (0.0-2.0)
```

2. **Use it in shader code** (wherever you want glow):
```glsl
// Example: Apply glow to bright areas
if (feed > 0.8) {
    // Bright area detected - add glow
    float glowAmount = (feed - 0.8) * 5.0 * uGlowIntensity;
    finalColor += vec3(glowAmount * 0.2);  // Add white glow
}
```

#### Option B: In JavaScript

**File**: `src/main.js` or wherever you use the parameter

```javascript
// Get parameter value from shader manager
const glowIntensity = shaderManager.getParameter('glowIntensity');

// Use it to modify something
audioAnalyzer.setGlowMultiplier(glowIntensity);
```

---

### Step 3: Test It

1. **Refresh the page** (or restart dev server if needed)
2. **Open shader parameters panel** (the settings button)
3. **Look for "Glow Intensity" slider** - it's there automatically!
4. **Adjust the slider** - see changes in real-time

---

## Control Type Reference

### Float/Number Slider

```javascript
parameterName: {
    type: 'float',        // or 'number'
    default: 1.0,
    min: 0,
    max: 10,
    step: 0.1,
    label: 'My Control'
}
```

**Generated UI**: Slider with value display

---

### Color Picker

```javascript
parameterName: {
    type: 'color',
    default: '#ff5722',   // Hex color
    label: 'My Color'
}
```

**Generated UI**: HTML5 color picker

---

### Boolean Checkbox

```javascript
parameterName: {
    type: 'boolean',
    default: true,
    label: 'Enable Feature'
}
```

**Generated UI**: Checkbox

---

## Real Examples from Your Codebase

### Example 1: Pixel Size (Already Working)

```javascript
// src/shaders/shader-configs/background-fbm.js
pixelSize: { 
    type: 'float', 
    default: 0.5, 
    min: 0.5, 
    max: 5, 
    step: 0.5,
    label: 'Pixel Size'
}
```

**Usage in shader**:
```glsl
// shaders/background-fragment.glsl (line 244)
float pixelSize = uPixelSize;
```

---

### Example 2: Dither Strength (Already Working)

```javascript
// src/shaders/shader-configs/background-fbm.js
ditherStrength: {
    type: 'float',
    default: 3.0,
    min: 0,
    max: 5,
    step: 0.1,
    label: 'Dither Strength'
}
```

**Usage in shader**:
```glsl
// shaders/background-fragment.glsl (line 382)
float ditherStrength = uDitherStrength > 0.0 ? uDitherStrength : 3.0;
float bayer = (Bayer8(fragCoordCentered / uPixelSize) - 0.5) * ditherStrength;
```

---

## Advanced: Audio-Reactive Parameters

You can make parameters respond to audio data automatically.

### Add to uniformMapping

**File**: `src/shaders/shader-configs/background-fbm.js`

```javascript
uniformMapping: {
    // Existing mappings...
    
    // NEW: Make glow react to bass
    uGlowIntensity: (data) => {
        const baseGlow = this.parameters.glowIntensity || 0.5;
        const bassBoost = data?.bass || 0;
        return baseGlow + (bassBoost * 0.5);  // Bass adds up to 0.5 extra glow
    }
}
```

Now your glow intensity slider sets the base level, but bass adds extra glow on top!

---

## Common Patterns

### Pattern 1: Static Visual Parameter
```javascript
// Shader config
pixelSize: { type: 'float', default: 1.0, min: 0.5, max: 5, step: 0.5 }

// Shader GLSL
uniform float uPixelSize;
float size = uPixelSize;
```

### Pattern 2: Audio-Reactive Parameter
```javascript
// Shader config
glowIntensity: { type: 'float', default: 0.5, min: 0, max: 2, step: 0.05 }

// Uniform mapping
uGlowIntensity: (data) => {
    const base = this.parameters.glowIntensity || 0.5;
    return base * (1.0 + data.volume * 0.5);  // +50% when loud
}
```

### Pattern 3: Boolean Toggle
```javascript
// Shader config
enableEffect: { type: 'boolean', default: true }

// Shader GLSL
uniform float uEnableEffect;  // Note: booleans become floats (0.0 or 1.0)
if (uEnableEffect > 0.5) {
    // Effect enabled
}
```

---

## Debugging New Parameters

### Problem: Parameter not showing in UI

**Check**:
1. Is it in the `parameters` object?
2. Does it have `type`, `default`, and `label` fields?
3. Did you refresh the page?

### Problem: Parameter shows but doesn't do anything

**Check**:
1. Did you add the uniform to the shader?
2. Did you add uniform mapping (if using audio data)?
3. Is the shader using the uniform variable?
4. Check browser console for WebGL errors

### Problem: Slider moves but value doesn't update

**Check**:
1. Is the uniform name spelled correctly? (`uParameterName`)
2. Are you reading the parameter in the shader?
3. Try adding a console.log to see if value changes:
   ```javascript
   console.log('Parameter value:', shaderManager.getParameter('parameterName'));
   ```

---

## Best Practices

### Naming Conventions
- **Config parameter**: `camelCase` (e.g., `glowIntensity`)
- **Shader uniform**: `uCamelCase` (e.g., `uGlowIntensity`)
- **Label**: Title Case (e.g., `'Glow Intensity'`)

### Value Ranges
- **Intensities**: 0-1 or 0-2
- **Hues**: 0-360 (degrees)
- **Saturation/Chroma**: 0-0.4 (OKLCH)
- **Lightness**: 0-1
- **Sizes**: 0.5-5 (relative to screen)
- **Speeds**: 0.1-2 (multipliers)

### Step Sizes
- **Fine control**: 0.01-0.05
- **Medium control**: 0.1
- **Coarse control**: 0.5-1
- **Hue**: 5° (gives 72 steps around color wheel)

### Default Values
- Choose the "best looking" default
- Users can always adjust
- Save defaults in config for consistency

---

## Quick Reference: Adding Controls

| Want to add... | Type | Min | Max | Step | Example |
|----------------|------|-----|-----|------|---------|
| Intensity/Strength | float | 0 | 1 or 2 | 0.05 | Glow, blur, distortion |
| Size/Scale | float | 0.1 | 5 | 0.1 | Pixel size, zoom |
| Speed/Rate | float | 0.1 | 2 | 0.05 | Animation speed |
| Hue/Color | float | 0 | 360 | 5 | Color wheel position |
| Saturation | float | 0 | 0.4 | 0.01 | Color intensity (OKLCH) |
| Lightness | float | 0 | 1 | 0.05 | Brightness |
| Enable/Disable | boolean | - | - | - | Toggle features on/off |
| Color picker | color | - | - | - | Full color selection |

---

## Template: Copy & Paste

```javascript
// ADD TO: src/shaders/shader-configs/background-fbm.js
// In the parameters object:

myNewControl: {
    type: 'float',              // Change: 'float', 'color', or 'boolean'
    default: 1.0,               // Change: your default value
    min: 0,                     // Change: minimum value
    max: 2,                     // Change: maximum value
    step: 0.1,                  // Change: slider step size
    label: 'My New Control'     // Change: display name
}
```

```glsl
// ADD TO: shaders/background-fragment.glsl
// Near the top with other uniforms:

uniform float uMyNewControl;  // Description of what it does

// Later in code:
float value = uMyNewControl;
// ... use value ...
```

---

## 🎉 You're Done!

The UI control is now live and ready to use. The `ShaderParameterPanel` handles all the UI generation, value updates, and saving automatically.

**No manual UI code needed!** ✨

