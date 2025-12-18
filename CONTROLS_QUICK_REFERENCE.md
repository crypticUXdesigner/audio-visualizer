# Controls Quick Reference

Quick reference for all user-exposed controls in the visual player.

## ✅ Currently Working (Already in UI)

These controls are fully functional and accessible via the Shader Parameters panel:

| Control | Range | Default | Description | Location |
|---------|-------|---------|-------------|----------|
| **Pixel Size** | 0.5 - 5.0 | 0.5 | Size of visual "pixels" | Shader config ✅ |
| **Dither Strength** | 0 - 5.0 | 3.0 | Intensity of dithering effect | Shader config ✅ |
| **Transition Smoothness** | 0.005 - 0.1 | 0.005 | Softness of color edges | Shader config ✅ |
| **Steps** | 2 - 10 | 5 | Number of color levels | Shader config ✅ |
| **Ripple Speed** | 0.1 - 2.0 | 0.3 | Speed of beat ripples | Shader config ✅ |
| **Ripple Width** | 0.02 - 0.5 | 0.1 | Thickness of ripple rings | Shader config ✅ |
| **Ripple Min Radius** | 0 - 1.0 | 0.15 | Starting size of ripples | Shader config ✅ |
| **Ripple Max Radius** | 0.1 - 3.0 | 3.0 | Maximum size of ripples | Shader config ✅ |
| **Ripple Threshold** | 0 - 1.0 | 0.75 | Beat sensitivity | Shader config ✅ |
| **Ripple Intensity** | 0 - 1.0 | 0.25 | Brightness of ripples | Shader config ✅ |

---

## 🔧 Ready to Expose (Code Exists, Not in UI)

These parameters exist in the code but need UI controls:

### Attack & Release (Audio Response)

| Control | Range | Default | File |
|---------|-------|---------|------|
| **Volume Attack** | 1/256 - 1/4 note | 1/64 note | tempo-smoothing-config.js |
| **Volume Release** | 1/64 - 1 note | 1/8 note | tempo-smoothing-config.js |
| **Frequency Attack** | 1/256 - 1/4 note | 1/128 note | tempo-smoothing-config.js |
| **Frequency Release** | 1/64 - 2 notes | 1/2 note | tempo-smoothing-config.js |

**Implementation Status**: Need to add to shader config parameters  
**Effort**: 2-3 hours  
**Guide**: See `IMPLEMENTATION_EXAMPLE_ATTACK_RELEASE.md`

### Beat Detection Thresholds

| Control | Range | Default | File |
|---------|-------|---------|------|
| **Bass Threshold** | 0 - 1.0 | 0.08 | AudioAnalyzer.js line 112 |
| **Mid Threshold** | 0 - 1.0 | 0.05 | AudioAnalyzer.js line 113 |
| **Treble Threshold** | 0 - 1.0 | 0.05 | AudioAnalyzer.js line 114 |
| **Stereo Emphasis** | 0.5 - 1.0 | 0.7 | AudioAnalyzer.js line 118 |

**Implementation Status**: Need to add to shader config parameters  
**Effort**: 1-2 hours

---

## 🎨 Needs Implementation

These require new code to be written:

### Bass & Treble Colors

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| **Bass Hue** | 0° - 360° | 220° | Color for low frequencies |
| **Bass Saturation** | 0 - 0.4 | 0.15 | Color intensity for bass |
| **Bass Brightness** | 0 - 1.0 | 0.4 | Lightness for bass |
| **Treble Hue** | 0° - 360° | 60° | Color for high frequencies |
| **Treble Saturation** | 0 - 0.4 | 0.22 | Color intensity for treble |
| **Treble Brightness** | 0 - 1.0 | 0.95 | Lightness for treble |
| **Color Blend** | 0 - 1.0 | 0.3 | Smoothness of bass/treble transition |

**Implementation Status**: Needs dual gradient system  
**Effort**: 4-6 hours  
**Guide**: See `IMPLEMENTATION_EXAMPLE_BASS_TREBLE_COLORS.md`

---

## 🎛️ Control Presets

Instead of individual sliders, you could offer presets:

### Audio Response Presets
- **Snappy**: Ultra-fast attack/release (electronic, EDM)
- **Balanced**: Default settings (pop, rock)
- **Smooth**: Slow attack/release (classical, ambient)
- **Lazy**: Very slow response (drone, experimental)

### Color Presets (Already Exist)
- Ocean Depths (cyan)
- Lava Flow (red-orange)
- Forest Canopy (green)
- Twilight (purple)
- Solar Flare (yellow-orange)
- Deep Space (dark blue)
- Electric Dreams (cyan-magenta)

---

## 📊 Parameter Impact Chart

| Parameter | Visual Impact | Performance Impact | Difficulty |
|-----------|---------------|-------------------|------------|
| Pixel Size | High | Medium | Easy ✅ |
| Dither Strength | High | Low | Easy ✅ |
| Transition Smoothness | Medium | Low | Easy ✅ |
| Attack/Release | Medium | Low | Medium 🔧 |
| Beat Thresholds | High | Low | Medium 🔧 |
| Bass/Treble Colors | Very High | Low | Hard 🎨 |

---

## 🚀 Implementation Priority

### Phase 1: Quick Wins (Already Done ✅)
- [x] Pixel Size
- [x] Dither Strength  
- [x] Transition Smoothness
- [x] All ripple controls

### Phase 2: Audio Response (2-3 hours 🔧)
- [ ] Attack/Release controls
- [ ] Beat detection thresholds
- [ ] Stereo emphasis control

### Phase 3: Advanced Colors (4-6 hours 🎨)
- [ ] Bass/Treble separate color controls
- [ ] Frequency-aware color mapping
- [ ] Color preset system for bass/treble

---

## 💡 User-Friendly Grouping

For the UI, group related controls:

### Visual Style
- Pixel Size
- Dither Strength
- Transition Smoothness
- Steps (color levels)

### Beat Response  
- Ripple Speed
- Ripple Width
- Ripple Intensity
- Ripple Min/Max Radius
- Beat Threshold

### Audio Dynamics
- Volume Attack/Release
- Frequency Attack/Release
- Audio Response Preset (dropdown)

### Color System
- Color Preset (dropdown)
- Bass Hue/Saturation/Brightness
- Treble Hue/Saturation/Brightness
- Bass/Treble Blend

### Beat Detection
- Bass Threshold
- Mid Threshold  
- Treble Threshold
- Stereo Emphasis

---

## 🎯 Recommended Next Steps

1. **For immediate UX improvement**: Group existing controls better in the UI
2. **For audio responsiveness**: Implement attack/release controls
3. **For visual variety**: Implement bass/treble color controls
4. **For fine-tuning**: Add beat detection threshold controls

---

## 📝 Usage Examples

### Electronic/EDM Track
```
Pixel Size: 1.0
Dither Strength: 4.0
Ripple Speed: 0.4
Audio Response: Snappy
Colors: Fire & Ice (red bass, cyan treble)
```

### Classical/Ambient
```
Pixel Size: 2.0
Dither Strength: 2.0
Ripple Speed: 0.2
Audio Response: Smooth
Colors: Ocean Depths (deep blue bass, light cyan treble)
```

### Rock/Pop
```
Pixel Size: 1.5
Dither Strength: 3.0
Ripple Speed: 0.3
Audio Response: Balanced
Colors: Default (cyan gradient)
```

---

## 🔍 Finding Controls in Code

Quick lookup for where parameters are defined:

- **Shader visuals**: `src/shaders/shader-configs/background-fbm.js`
- **Audio analysis**: `src/core/AudioAnalyzer.js`
- **Color system**: `src/core/ColorGenerator.js`
- **Smoothing**: `src/config/tempo-smoothing-config.js`
- **UI**: `src/ui/ShaderParameterPanel.js`
- **Presets**: `src/config/color-presets.js`

---

## 📚 Documentation Files

- `CONTROLS_ROADMAP.md` - Full overview of all controls
- `IMPLEMENTATION_EXAMPLE_ATTACK_RELEASE.md` - How to add attack/release
- `IMPLEMENTATION_EXAMPLE_BASS_TREBLE_COLORS.md` - How to add bass/treble colors
- `CONTROLS_QUICK_REFERENCE.md` - This file

