# Implementation Example: Attack & Release Controls

This document shows exactly how to expose attack/release controls to the user.

## Step 1: Add Parameters to Shader Config

**File**: `src/shaders/shader-configs/background-fbm.js`

Add these to the `parameters` object (around line 100):

```javascript
parameters: {
    // ... existing parameters ...
    
    // Audio Response Controls
    volumeAttack: {
        type: 'float',
        default: 1.0/64.0,    // 64th note - very fast
        min: 1.0/256.0,       // 256th note - ultra fast
        max: 1.0/4.0,         // Quarter note - slow
        step: 1.0/256.0,
        label: 'Volume Attack'
    },
    volumeRelease: {
        type: 'float',
        default: 1.0/8.0,     // 8th note - moderate
        min: 1.0/64.0,        // 64th note - fast
        max: 1.0,             // Whole note - very slow
        step: 1.0/64.0,
        label: 'Volume Release'
    },
    frequencyAttack: {
        type: 'float',
        default: 1.0/128.0,   // 128th note - very fast
        min: 1.0/256.0,       // 256th note - ultra fast
        max: 1.0/4.0,         // Quarter note - slow
        step: 1.0/256.0,
        label: 'Frequency Attack'
    },
    frequencyRelease: {
        type: 'float',
        default: 1.0/2.0,     // Half note - moderate
        min: 1.0/64.0,        // 64th note - fast
        max: 2.0,             // Double whole note - very slow
        step: 1.0/64.0,
        label: 'Frequency Release'
    }
}
```

## Step 2: Modify TempoSmoothingConfig to Accept Dynamic Values

**File**: `src/config/tempo-smoothing-config.js`

Replace the fixed config with a class that accepts runtime parameters:

```javascript
export class TempoSmoothingConfig {
    constructor() {
        // Default values (can be overridden)
        this.volume = {
            attackNote: 1.0 / 64.0,
            releaseNote: 1.0 / 8.0,
            attackTimeFallback: 5.0,
            releaseTimeFallback: 100.0
        };
        
        this.frequencyBands = {
            attackNote: 1.0 / 128.0,
            releaseNote: 1.0 / 2.0,
            attackTimeFallback: 2.0,
            releaseTimeFallback: 100.0
        };
    }
    
    // Update volume smoothing parameters
    setVolumeSmoothing(attackNote, releaseNote) {
        this.volume.attackNote = attackNote;
        this.volume.releaseNote = releaseNote;
    }
    
    // Update frequency band smoothing parameters
    setFrequencySmoothing(attackNote, releaseNote) {
        this.frequencyBands.attackNote = attackNote;
        this.frequencyBands.releaseNote = releaseNote;
    }
}

// Create default instance (singleton pattern)
export const tempoSmoothingConfig = new TempoSmoothingConfig();

// Keep existing helper functions...
```

## Step 3: Connect Shader Parameters to AudioAnalyzer

**File**: `src/core/AudioAnalyzer.js`

Add a method to update smoothing parameters:

```javascript
// Add this method to the AudioAnalyzer class (around line 255)
/**
 * Update tempo-relative smoothing parameters
 * @param {Object} params - Smoothing parameters
 */
setSmoothingParameters(params) {
    if (params.volumeAttack !== undefined && params.volumeRelease !== undefined) {
        TempoSmoothingConfig.volume.attackNote = params.volumeAttack;
        TempoSmoothingConfig.volume.releaseNote = params.volumeRelease;
    }
    
    if (params.frequencyAttack !== undefined && params.frequencyRelease !== undefined) {
        TempoSmoothingConfig.frequencyBands.attackNote = params.frequencyAttack;
        TempoSmoothingConfig.frequencyBands.releaseNote = params.frequencyRelease;
    }
}
```

## Step 4: Pass Parameters from Main to AudioAnalyzer

**File**: `src/main.js`

In the render loop or parameter update function, add:

```javascript
// When shader parameters change, update audio analyzer
function updateAudioSmoothingFromShader() {
    const shaderParams = shaderManager.getActiveShader()?.getAllParameters();
    if (shaderParams && audioAnalyzer) {
        audioAnalyzer.setSmoothingParameters({
            volumeAttack: shaderParams.volumeAttack,
            volumeRelease: shaderParams.volumeRelease,
            frequencyAttack: shaderParams.frequencyAttack,
            frequencyRelease: shaderParams.frequencyRelease
        });
    }
}

// Call this whenever parameters change
// The ShaderParameterPanel already triggers updates, so you can hook into that
```

## Step 5: Enhanced UI Display (Optional)

**File**: `src/ui/ShaderParameterPanel.js`

Add a custom formatter to show musical note names:

```javascript
// Add this helper function (around line 70)
function formatMusicalNote(value) {
    const noteNames = {
        1.0: 'whole',
        0.5: 'half',
        0.25: 'quarter',
        0.125: '8th',
        0.0625: '16th',
        0.03125: '32nd',
        0.015625: '64th',
        0.0078125: '128th',
        0.00390625: '256th'
    };
    
    // Find closest match
    let closestNote = 'custom';
    let minDiff = Infinity;
    
    for (const [fraction, name] of Object.entries(noteNames)) {
        const diff = Math.abs(value - parseFloat(fraction));
        if (diff < minDiff) {
            minDiff = diff;
            closestNote = name;
        }
    }
    
    return minDiff < 0.001 ? closestNote : value.toFixed(4);
}

// Modify the slider value display (in createParameterControl, around line 92)
slider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    
    // Use musical note formatter for attack/release parameters
    if (name.includes('Attack') || name.includes('Release')) {
        valueDisplay.textContent = formatMusicalNote(value);
    } else {
        valueDisplay.textContent = value.toFixed(config.step < 1 ? 2 : 0);
    }
    
    this.shaderManager.setParameter(name, value);
});
```

## Step 6: Alternative - Preset Buttons (User-Friendly)

Instead of exposing raw note fractions, provide preset buttons:

```javascript
// Add to shader config
audioResponsePresets: {
    snappy: {
        volumeAttack: 1.0/256.0,   // Ultra fast
        volumeRelease: 1.0/16.0,   // Fast
        frequencyAttack: 1.0/256.0,
        frequencyRelease: 1.0/8.0
    },
    balanced: {
        volumeAttack: 1.0/64.0,    // Fast
        volumeRelease: 1.0/8.0,    // Moderate
        frequencyAttack: 1.0/128.0,
        frequencyRelease: 1.0/2.0
    },
    smooth: {
        volumeAttack: 1.0/32.0,    // Moderate
        volumeRelease: 1.0/4.0,    // Slow
        frequencyAttack: 1.0/64.0,
        frequencyRelease: 1.0
    },
    lazy: {
        volumeAttack: 1.0/16.0,    // Slow
        volumeRelease: 1.0/2.0,    // Very slow
        frequencyAttack: 1.0/32.0,
        frequencyRelease: 2.0
    }
}
```

Then create preset buttons in the UI:

```javascript
// Add to ShaderParameterPanel
createAudioResponsePresetButtons() {
    const container = document.createElement('div');
    container.className = 'preset-buttons';
    container.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';
    
    const presets = {
        'Snappy': 'snappy',
        'Balanced': 'balanced',
        'Smooth': 'smooth',
        'Lazy': 'lazy'
    };
    
    Object.entries(presets).forEach(([label, presetKey]) => {
        const button = document.createElement('button');
        button.textContent = label;
        button.style.cssText = `
            flex: 1;
            padding: 8px;
            background: rgba(65, 238, 229, 0.15);
            border: 1px solid rgba(65, 238, 229, 0.3);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        
        button.addEventListener('click', () => {
            this.applyAudioResponsePreset(presetKey);
            // Visual feedback
            button.style.background = 'rgba(65, 238, 229, 0.4)';
            setTimeout(() => {
                button.style.background = 'rgba(65, 238, 229, 0.15)';
            }, 200);
        });
        
        container.appendChild(button);
    });
    
    return container;
}
```

## Testing the Implementation

Once implemented, test the controls:

1. **Fast Attack/Release**: Values should respond instantly to audio changes
2. **Slow Attack/Release**: Values should lag behind audio changes smoothly
3. **Visual Feedback**: Brightness and colors should reflect the smoothing
4. **BPM Sync**: At 120 BPM, a 1/4 note = 500ms, 1/8 note = 250ms, etc.

## Expected Behavior

- **Volume Attack**: How quickly brightness increases when sound gets louder
- **Volume Release**: How quickly brightness decreases when sound gets quieter
- **Frequency Attack**: How quickly colors change when frequencies increase
- **Frequency Release**: How quickly colors fade when frequencies decrease

## Real-World Examples

- **Electronic/EDM**: Snappy preset (fast attack, fast release)
- **Classical/Ambient**: Smooth or Lazy preset (slow attack, slow release)
- **Rock/Pop**: Balanced preset (moderate attack, moderate release)

## Notes

- Lower values (smaller fractions) = faster response
- Higher values (larger fractions) = slower response
- Attack is typically faster than release for natural feel
- BPM synchronization makes the animation feel musical

