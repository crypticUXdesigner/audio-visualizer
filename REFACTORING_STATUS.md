# Shader Refactoring Status

## ✅ Completed

### Phase 1: Infrastructure Setup
1. **Created common include files** (`src/shaders/common/`):
   - `uniforms.glsl` - All common uniform declarations (~70+ uniforms)
   - `noise.glsl` - Hash functions, vnoise, fbm variants (standard & domain-warped)
   - `audio.glsl` - Audio processing functions (volume sensitivity, tempo speed, modulated time, stereo brightness, volume scale)
   - `color-mapping.glsl` - Frequency-based color threshold system
   - `ripples.glsl` - Ripple effect utilities
   - `screen-adaptation.glsl` - Screen density and mobile helpers

2. **Updated ShaderUtils.js**:
   - Added `processIncludes()` function to recursively load and inline `#include` directives
   - Handles circular include prevention

3. **Updated ShaderInstance.js**:
   - Added `processIncludes` import
   - Modified `init()` to process includes in fragment shader before compilation (with base path for relative includes)
   - Added `uDevicePixelRatio` uniform location caching
   - Added `uDevicePixelRatio` uniform setting in `render()` method

4. **Updated Vite configuration**:
   - Modified `copyShadersPlugin` to also copy `common/` directory to `dist/shaders/common/`
   - Updated dev server middleware to serve common includes from `src/shaders/common/`
   - Handles both source shaders and common includes correctly

4. **Refactored heightmap shader** (proof of concept):
   - Replaced all uniform declarations with `#include "common/uniforms.glsl"`
   - Replaced noise functions with `#include "common/noise.glsl"`
   - Replaced audio processing logic with function calls from `common/audio.glsl`
   - Replaced color mapping logic with function calls from `common/color-mapping.glsl`
   - Replaced ripple function with `#include "common/ripples.glsl"`
   - Kept shader-specific code (Bayer matrix, shape masks, FBM constants)
   - Reduced from ~573 lines to ~220 lines (~62% reduction)

5. **Refactored refraction shader**:
   - Replaced all uniform declarations with `#include "common/uniforms.glsl"`
   - Replaced noise functions with `#include "common/noise.glsl"` (using `fbm2_standard`)
   - Replaced audio processing with `calculateModulatedTime()` from `common/audio.glsl`
   - Replaced color mapping with shared functions (`useFrequencyModulation = false` for constant thresholds)
   - Replaced ripple function with `#include "common/ripples.glsl"`
   - Replaced aspect ratio calculation with `getAspectRatio()` from `common/screen-adaptation.glsl`
   - Kept refraction-specific code (pixelize, getBeatGridBoost, applyBassEasing, applyBassDistortion, sampleNoiseWithRefraction, cell brightness variation)
   - Reduced from ~766 lines to ~532 lines (~30% reduction)

6. **Refactored dots shader**:
   - Replaced all uniform declarations with `#include "common/uniforms.glsl"`
   - Replaced noise functions with `#include "common/noise.glsl"` (using `fbm2_domainWarped` for swirly pattern)
   - Replaced audio processing with `calculateModulatedTime()` and `calculateVolumeScale()` from `common/audio.glsl`
   - Replaced color mapping with shared functions (`useFrequencyModulation = true` for frequency-based thresholds)
   - Replaced aspect ratio calculation with `getAspectRatio()` from `common/screen-adaptation.glsl`
   - Updated dot spacing to use `pixelsToNormalizedDPR()` for DPR-aware scaling (mobile optimization)
   - Kept dots-specific code (getFrequencyForPosition, calculateRippleSizeMultiplier, calculateRippleBrightness, calculateRippleMovementBoost, cubicBezierEase, swarm movement system)
   - Reduced from ~887 lines to ~650 lines (~27% reduction)

## 📋 Next Steps

### Phase 2: Complete Shader Refactoring ✅ COMPLETE
All three shaders (heightmap, refraction, dots) have been successfully refactored to use common includes.

### Phase 3: Testing & Validation
1. **Visual comparison testing**:
   - Compare before/after output pixel-by-pixel for each shader
   - Test on different screen densities (1x, 2x, 3x DPR)
   - Test on mobile devices (portrait/landscape)
   - Verify all visual effects are preserved

2. **Performance testing**:
   - Measure frame times before/after
   - Verify no performance regressions
   - Test on low-end devices

3. **Edge case testing**:
   - Test with no audio data
   - Test with extreme audio values
   - Test with missing uniforms
   - Test include path resolution

### Phase 4: Mobile Optimization
1. **Update pixel-based calculations**:
   - Dots shader: Use `pixelsToNormalizedDPR()` for dot spacing
   - Any other pixel-based values should use screen adaptation functions

2. **Mobile-specific adjustments**:
   - Test portrait/landscape transitions
   - Verify aspect ratio handling
   - Test touch interactions

## 🔧 Technical Notes

### Include Path Resolution
- Include paths are relative to the shader file location
- Example: `#include "common/uniforms.glsl"` from `shaders/heightmap-fragment.glsl` resolves to `shaders/common/uniforms.glsl`
- The `processIncludes()` function handles relative paths by resolving them based on the base shader file path
- Vite dev server serves common includes from `src/shaders/common/`
- Build process copies common directory to `dist/shaders/common/`

### GLSL Limitations Workarounds
- GLSL doesn't support array parameters in functions, so color-mapping functions use individual parameters instead of arrays
- This is slightly more verbose but maintains compatibility

### Uniform Optimization Prevention
- The `mapNoiseToColor()` function includes uniform presence calculation to prevent WebGL from optimizing out unused color uniforms
- This is critical for dynamic color systems

## 📊 Code Reduction Summary

- **Heightmap shader**: ~573 lines → ~220 lines (62% reduction)
- **Refraction shader**: ~766 lines → ~532 lines (30% reduction)
- **Dots shader**: ~887 lines → ~650 lines (27% reduction)
- **Total reduction**: ~800+ lines of duplicated code removed across all shaders
- **Maintainability**: Bug fixes and improvements now propagate to all shaders automatically

## ⚠️ Important Considerations

1. **Backward Compatibility**: All refactored shaders must produce identical visual output
2. **Testing Required**: Each shader should be tested individually after refactoring
3. **Include Order**: Includes must be in correct order (uniforms first, then functions)
4. **Shader-Specific Code**: Each shader keeps its unique visual effects intact

## 🐛 Bug Fixes

### Vite Middleware Issue (Fixed)
- **Problem**: Shader files were returning HTML instead of GLSL content
- **Cause**: Middleware registration pattern was incorrect (was returning a function instead of directly registering)
- **Solution**: Changed `configureServer` to directly register middleware on `server.middlewares.use()` instead of returning a function
- **Status**: Fixed - middleware now correctly serves shader files from `src/shaders/source/` and `src/shaders/common/`

## 🎯 Success Criteria

- [x] Common code extracted to shared includes
- [x] Include processing system working
- [x] Heightmap shader refactored and working
- [x] Refraction shader refactored and working
- [x] Dots shader refactored with DPR-aware spacing
- [ ] All shaders produce identical visual output (testing in progress)
- [ ] Mobile/screen density support verified
- [ ] Performance maintained or improved

