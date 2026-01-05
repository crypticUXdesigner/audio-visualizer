// UniformManager - Centralized uniform update management
// Handles all uniform updates with value caching for performance

import { COLOR_KEYS } from './ColorTransitionManager.js';
import { ShaderConstants } from '../config/ShaderConstants.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';
import { AudioReactivityManager } from './AudioReactivityManager.js';
import type { ExtendedAudioData, ShaderConfig, ParameterValue } from '../../types/index.js';
import type { ColorMap } from '../../types/index.js';

interface UniformLocations {
    [key: string]: WebGLUniformLocation | null;
}

interface LastValues {
    [key: string]: number | number[] | [number, number, number] | [number, number, number, number] | undefined;
}

interface RippleData {
    centers: number[];
    times: number[];
    intensities: number[];
    widths: number[];
    minRadii: number[];
    maxRadii: number[];
    intensityMultipliers: number[];
    active: number[];
    count: number;
}

interface RippleArrays {
    centerX: Float32Array;
    centerY: Float32Array;
    times: Float32Array;
    intensities: Float32Array;
    widths: Float32Array;
    minRadii: Float32Array;
    maxRadii: Float32Array;
    intensityMultipliers: Float32Array;
    active: Float32Array;
}

interface ColorTransition {
    isTransitioning: boolean;
}

interface UniformMapping {
    [key: string]: (audioData: ExtendedAudioData, parameters?: Record<string, ParameterValue>) => number | number[];
}

export class UniformManager {
    gl: WebGLRenderingContext;
    locations: UniformLocations;
    lastValues: LastValues;
    private audioReactivityManager: AudioReactivityManager;
    
    // Cache for uniform name conversions (paramName -> uniformName)
    private uniformNameCache: Map<string, string> = new Map();
    // Cache for enable parameter name lookups (paramName -> enableParamName | null)
    private enableParamNameCache: Map<string, string | null> = new Map();
    // Cache for base name extraction (paramName -> baseName)
    private baseNameCache: Map<string, string> = new Map();
    // Cache for smoothed uniform names (baseName -> smoothedUniformName)
    private smoothedUniformNameCache: Map<string, string> = new Map();
    
    /**
     * @param gl - WebGL context
     * @param uniformLocations - Map of uniform names to locations
     */
    constructor(gl: WebGLRenderingContext, uniformLocations: UniformLocations) {
        this.gl = gl;
        this.locations = uniformLocations;
        this.lastValues = {};
        this.audioReactivityManager = new AudioReactivityManager();
    }
    
    /**
     * Update standard uniforms (resolution, time, pixelSize, etc.)
     * @param params - Parameters object
     * @param currentTime - Current time in seconds
     * @param timeOffset - Smoothed time offset
     * @param pixelSizeMultiplier - Pixel size animation multiplier
     * @param resolution - [width, height]
     */
    updateStandardUniforms(params: Record<string, ParameterValue>, currentTime: number, timeOffset: number, pixelSizeMultiplier: number, resolution: [number, number]): void {
        if (!params || typeof currentTime !== 'number' || !Array.isArray(resolution) || resolution.length !== 2) {
            ShaderLogger.warn('UniformManager: Invalid parameters for updateStandardUniforms', { params, currentTime, resolution });
            return;
        }
        
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        // Resolution
        if (locations.uResolution) {
            if (!lastValues.uResolution || 
                (lastValues.uResolution as number[])[0] !== resolution[0] ||
                (lastValues.uResolution as number[])[1] !== resolution[1]) {
                gl.uniform2f(locations.uResolution, resolution[0], resolution[1]);
                lastValues.uResolution = [resolution[0], resolution[1]];
            }
        }
        
        // Time (always changes)
        if (locations.uTime) {
            gl.uniform1f(locations.uTime, currentTime);
        }
        
        // TimeOffset
        if (lastValues.uTimeOffset !== timeOffset) {
            if (locations.uTimeOffset) {
                gl.uniform1f(locations.uTimeOffset, timeOffset);
                lastValues.uTimeOffset = timeOffset;
            }
        }
        
        // PixelSize
        const dpr = window.devicePixelRatio || 1;
        const basePixelSize = (params.pixelSize as number) || 1.0;
        const scaledPixelSize = basePixelSize * pixelSizeMultiplier * dpr;
        if (lastValues.uPixelSize !== scaledPixelSize) {
            if (locations.uPixelSize) {
                gl.uniform1f(locations.uPixelSize, scaledPixelSize);
                lastValues.uPixelSize = scaledPixelSize;
            }
        }
        
        // DevicePixelRatio
        if (lastValues.uDevicePixelRatio !== dpr) {
            if (locations.uDevicePixelRatio) {
                gl.uniform1f(locations.uDevicePixelRatio, dpr);
                lastValues.uDevicePixelRatio = dpr;
            }
        }
        
        // Steps (from constants)
        const stepsValue = ShaderConstants.uniforms.steps;
        if (lastValues.uSteps !== stepsValue) {
            if (locations.uSteps) {
                gl.uniform1f(locations.uSteps, stepsValue);
                lastValues.uSteps = stepsValue;
            }
        }
        
        // Mouse (from constants)
        const mouseValue = ShaderConstants.uniforms.mouse;
        if (!lastValues.uMouse || 
            (lastValues.uMouse as number[])[0] !== mouseValue[0] ||
            (lastValues.uMouse as number[])[1] !== mouseValue[1] ||
            (lastValues.uMouse as number[])[2] !== mouseValue[2] ||
            (lastValues.uMouse as number[])[3] !== mouseValue[3]) {
            if (locations.uMouse) {
                gl.uniform4f(locations.uMouse, mouseValue[0], mouseValue[1], mouseValue[2], mouseValue[3]);
                lastValues.uMouse = [...mouseValue];
            }
        }
        
        // ShapeType (from constants)
        const shapeTypeValue = ShaderConstants.uniforms.shapeType;
        if (lastValues.uShapeType !== shapeTypeValue) {
            if (locations.uShapeType) {
                gl.uniform1i(locations.uShapeType, shapeTypeValue);
                lastValues.uShapeType = shapeTypeValue;
            }
        }
    }
    
    /**
     * Update parameter-based uniforms
     * @param parameters - Current parameter values
     * @param config - Shader config with parameter definitions
     */
    updateParameterUniforms(parameters: Record<string, ParameterValue>, _config: ShaderConfig): void {
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        // Dither strength
        const ditherStrength = (parameters.ditherStrength as number) !== undefined ? (parameters.ditherStrength as number) : 3.0;
        if (lastValues.uDitherStrength !== ditherStrength) {
            if (locations.uDitherStrength) {
                gl.uniform1f(locations.uDitherStrength, ditherStrength);
                lastValues.uDitherStrength = ditherStrength;
            }
        }
        
        // Transition width
        const transitionWidth = (parameters.transitionWidth as number) !== undefined ? (parameters.transitionWidth as number) : 0.005;
        if (lastValues.uTransitionWidth !== transitionWidth) {
            if (locations.uTransitionWidth) {
                gl.uniform1f(locations.uTransitionWidth, transitionWidth);
                lastValues.uTransitionWidth = transitionWidth;
            }
        }
        
        // Note: Shader-specific parameters (like refraction) are now handled by plugins
        // via onUpdateParameterUniforms hook
    }
    
    /**
     * Update ripple effect uniforms
     * @param rippleData - Ripple data from audioData
     * @param rippleArrays - Pooled arrays for ripple data
     */
    updateRippleUniforms(rippleData: RippleData | null, rippleArrays: RippleArrays): void {
        const gl = this.gl;
        const locations = this.locations;
        
        if (rippleData) {
            const maxRipples = ShaderConstants.ripples.maxCount;
            const { centerX, centerY, times, intensities, widths, minRadii, maxRadii, intensityMultipliers, active } = rippleArrays;
            
            // Zero out arrays
            centerX.fill(0);
            centerY.fill(0);
            times.fill(0);
            intensities.fill(0);
            widths.fill(0);
            minRadii.fill(0);
            maxRadii.fill(0);
            intensityMultipliers.fill(0);
            active.fill(0);
            
            // Split centers array into separate x and y arrays
            for (let i = 0; i < maxRipples; i++) {
                const idx = i * 2;
                centerX[i] = rippleData.centers[idx] || 0;
                centerY[i] = rippleData.centers[idx + 1] || 0;
            }
            
            // Fill arrays from ripple data
            const rippleTimes = rippleData.times || [];
            const rippleIntensities = rippleData.intensities || [];
            const rippleWidths = rippleData.widths || [];
            const rippleMinRadii = rippleData.minRadii || [];
            const rippleMaxRadii = rippleData.maxRadii || [];
            const rippleIntensityMultipliers = rippleData.intensityMultipliers || [];
            const rippleActive = rippleData.active || [];
            
            for (let i = 0; i < maxRipples; i++) {
                times[i] = rippleTimes[i] || 0;
                intensities[i] = rippleIntensities[i] || 0;
                widths[i] = rippleWidths[i] || 0;
                minRadii[i] = rippleMinRadii[i] || 0;
                maxRadii[i] = rippleMaxRadii[i] || 0;
                intensityMultipliers[i] = rippleIntensityMultipliers[i] || 0;
                active[i] = rippleActive[i] || 0;
            }
            
            // Update ripple arrays (always update - they change every frame)
            if (locations.uRippleCenterX) gl.uniform1fv(locations.uRippleCenterX, centerX);
            if (locations.uRippleCenterY) gl.uniform1fv(locations.uRippleCenterY, centerY);
            if (locations.uRippleTimes) gl.uniform1fv(locations.uRippleTimes, times);
            if (locations.uRippleIntensities) gl.uniform1fv(locations.uRippleIntensities, intensities);
            if (locations.uRippleWidths) gl.uniform1fv(locations.uRippleWidths, widths);
            if (locations.uRippleMinRadii) gl.uniform1fv(locations.uRippleMinRadii, minRadii);
            if (locations.uRippleMaxRadii) gl.uniform1fv(locations.uRippleMaxRadii, maxRadii);
            if (locations.uRippleIntensityMultipliers) gl.uniform1fv(locations.uRippleIntensityMultipliers, intensityMultipliers);
            if (locations.uRippleActive) gl.uniform1fv(locations.uRippleActive, active);
            if (locations.uRippleCount) gl.uniform1i(locations.uRippleCount, rippleData.count || 0);
        } else {
            // Set empty arrays if no ripple data
            const emptyArray = rippleArrays.centerX;
            emptyArray.fill(0);
            if (locations.uRippleCenterX) gl.uniform1fv(locations.uRippleCenterX, emptyArray);
            if (locations.uRippleCenterY) gl.uniform1fv(locations.uRippleCenterY, emptyArray);
            if (locations.uRippleTimes) gl.uniform1fv(locations.uRippleTimes, emptyArray);
            if (locations.uRippleIntensities) gl.uniform1fv(locations.uRippleIntensities, emptyArray);
            if (locations.uRippleActive) gl.uniform1fv(locations.uRippleActive, emptyArray);
            if (locations.uRippleCount) gl.uniform1i(locations.uRippleCount, 0);
        }
        
        // Update ripple constants (hardcoded values)
        const rippleConstants = [
            { name: 'uRippleSpeed', value: 0.3 },
            { name: 'uRippleWidth', value: 0.1 },
            { name: 'uRippleMinRadius', value: 0.15 },
            { name: 'uRippleMaxRadius', value: 3.0 },
            { name: 'uRippleIntensityThreshold', value: 0.75 },
            { name: 'uRippleIntensity', value: 0.25 }
        ];
        
        rippleConstants.forEach(({ name, value }) => {
            if (this.lastValues[name] !== value) {
                if (locations[name]) {
                    gl.uniform1f(locations[name], value);
                    this.lastValues[name] = value;
                }
            }
        });
    }
    
    /**
     * Update color uniforms with smooth transitions
     * @param colors - Current colors object
     * @param getInterpolatedColors - Function to get interpolated colors
     * @param colorTransition - Color transition state
     */
    updateColorUniforms(colors: ColorMap | null, getInterpolatedColors: () => ColorMap | null, colorTransition: ColorTransition): void {
        if (!colors) return;
        
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        // Get interpolated colors (handles smooth transitions)
        const activeColors = getInterpolatedColors();
        
        // If no active colors available, skip update (colors not initialized yet)
        if (!activeColors) return;
        
        // Generate uniform names from COLOR_KEYS
        const colorUniforms = COLOR_KEYS.map(key => `u${key.charAt(0).toUpperCase()}${key.slice(1)}`);
        
        colorUniforms.forEach((uniformName, index) => {
            const location = locations[uniformName];
            const colorKey = COLOR_KEYS[index];
            if (location && activeColors[colorKey]) {
                const color = activeColors[colorKey];
                // During transition, always update colors (they change every frame)
                // When not transitioning, only update if changed
                const lastColor = lastValues[uniformName] as [number, number, number] | undefined;
                const shouldUpdate = colorTransition.isTransitioning || 
                                   !lastColor || 
                                   lastColor[0] !== color[0] || 
                                   lastColor[1] !== color[1] || 
                                   lastColor[2] !== color[2];
                
                if (shouldUpdate) {
                    gl.uniform3f(location, color[0], color[1], color[2]);
                    lastValues[uniformName] = [color[0], color[1], color[2]];
                }
            }
        });
    }
    
    /**
     * Update audio uniforms using uniform mapping
     * @param audioData - Audio data from AudioAnalyzer
     * @param uniformMapping - Uniform mapping configuration
     * @param parameters - Current parameter values
     */
    updateAudioUniforms(audioData: ExtendedAudioData | null, uniformMapping: UniformMapping, parameters?: Record<string, ParameterValue>): void {
        if (!audioData || !uniformMapping) {
            // Log context for debugging - audio data may not be available yet
            ShaderLogger.debug('UniformManager: Cannot update audio uniforms', {
                hasAudioData: !!audioData,
                hasUniformMapping: !!uniformMapping
            });
            return;
        }
        
        if (!this.gl || !this.locations) {
            ShaderLogger.warn('UniformManager: Not initialized, cannot update audio uniforms', {
                hasGL: !!this.gl,
                hasLocations: !!this.locations
            });
            return;
        }
        
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        Object.entries(uniformMapping).forEach(([uniformName, mapper]) => {
            const location = locations[uniformName];
            // Calculate value (mappers may have side effects, so always call)
            const value = mapper(audioData, parameters);
            
            if (location !== null && location !== undefined) {
                // Check if value has changed
                const lastValue = lastValues[uniformName];
                let valueChanged = true;
                
                if (typeof value === 'number') {
                    valueChanged = lastValue !== value;
                    if (valueChanged) {
                        gl.uniform1f(location, value);
                        lastValues[uniformName] = value;
                    }
                } else if (Array.isArray(value) && value.length === 2) {
                    valueChanged = !lastValue || (lastValue as number[])[0] !== value[0] || (lastValue as number[])[1] !== value[1];
                    if (valueChanged) {
                        gl.uniform2f(location, value[0], value[1]);
                        lastValues[uniformName] = [value[0], value[1]];
                    }
                } else if (Array.isArray(value) && value.length === 3) {
                    valueChanged = !lastValue || (lastValue as number[])[0] !== value[0] || (lastValue as number[])[1] !== value[1] || (lastValue as number[])[2] !== value[2];
                    if (valueChanged) {
                        gl.uniform3f(location, value[0], value[1], value[2]);
                        lastValues[uniformName] = [value[0], value[1], value[2]];
                    }
                } else if (Array.isArray(value) && value.length === 4) {
                    valueChanged = !lastValue || (lastValue as number[])[0] !== value[0] || (lastValue as number[])[1] !== value[1] || (lastValue as number[])[2] !== value[2] || (lastValue as number[])[3] !== value[3];
                    if (valueChanged) {
                        gl.uniform4f(location, value[0], value[1], value[2], value[3]);
                        lastValues[uniformName] = [value[0], value[1], value[2], value[3]];
                    }
                }
            }
        });
    }
    
    /**
     * Get the enable parameter name for a strength parameter (cached)
     * @param paramName - Parameter name (e.g., "vectorFieldComplexityStrength")
     * @returns Enable parameter name (e.g., "enableVectorFieldComplexity") or null if not found
     */
    private getEnableParamName(paramName: string): string | null {
        // Check cache first
        if (this.enableParamNameCache.has(paramName)) {
            return this.enableParamNameCache.get(paramName)!;
        }
        
        // Pattern: [effectName]Strength -> enable[EffectName]
        let result: string | null = null;
        if (paramName.endsWith('Strength')) {
            const baseName = paramName.slice(0, -8); // Remove "Strength" suffix
            // Capitalize first letter and prepend "enable"
            result = `enable${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}`;
        }
        
        // Cache result
        this.enableParamNameCache.set(paramName, result);
        return result;
    }
    
    /**
     * Get uniform name from parameter name (cached)
     * @param paramName - Parameter name (e.g., "vectorFieldComplexityStrength")
     * @returns Uniform name (e.g., "uVectorFieldComplexityStrength")
     */
    private getUniformName(paramName: string): string {
        if (this.uniformNameCache.has(paramName)) {
            return this.uniformNameCache.get(paramName)!;
        }
        
        const uniformName = `u${paramName.charAt(0).toUpperCase()}${paramName.slice(1)}`;
        this.uniformNameCache.set(paramName, uniformName);
        return uniformName;
    }
    
    /**
     * Get base name from parameter name (cached)
     * @param paramName - Parameter name (e.g., "contrastMin" or "contrastMax")
     * @returns Base name (e.g., "contrast")
     */
    private getBaseName(paramName: string): string {
        if (this.baseNameCache.has(paramName)) {
            return this.baseNameCache.get(paramName)!;
        }
        
        const baseName = paramName.replace(/Min$|Max$/, '');
        this.baseNameCache.set(paramName, baseName);
        return baseName;
    }
    
    /**
     * Get smoothed uniform name from base name (cached)
     * @param baseName - Base name (e.g., "contrast")
     * @returns Smoothed uniform name (e.g., "uSmoothedContrastAudioLevel")
     */
    private getSmoothedUniformName(baseName: string): string {
        if (this.smoothedUniformNameCache.has(baseName)) {
            return this.smoothedUniformNameCache.get(baseName)!;
        }
        
        const baseNameCapitalized = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        const smoothedUniformName = `uSmoothed${baseNameCapitalized}AudioLevel`;
        this.smoothedUniformNameCache.set(baseName, smoothedUniformName);
        return smoothedUniformName;
    }
    
    /**
     * Update parameter uniforms with audio reactivity
     * @param parameters - Current parameter values
     * @param config - Shader configuration
     * @param audioData - Extended audio data
     * @param deltaTime - Time since last frame (seconds)
     */
    updateAudioReactiveParameters(
        parameters: Record<string, ParameterValue>,
        config: ShaderConfig,
        audioData: ExtendedAudioData | null,
        deltaTime: number
    ): void {
        if (!this.gl || !this.locations || !config.parameters) return;
        
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        Object.entries(config.parameters).forEach(([paramName, paramConfig]) => {
            if (!paramConfig.audioReactive) return;
            
            // Check if this parameter has an enable flag
            // Pattern: [effectName]Strength -> enable[EffectName]
            // Examples: vectorFieldComplexityStrength -> enableVectorFieldComplexity
            //           animationSpeedStrength -> enableAnimationSpeed
            const enableParamName = this.getEnableParamName(paramName);
            if (enableParamName) {
                const enableValue = parameters[enableParamName] as number | undefined;
                const enableConfig = config.parameters?.[enableParamName];
                const enableDefault = enableConfig?.default ?? 1.0;
                const isEnabled = (enableValue ?? enableDefault) > 0.5;
                
                // Skip audio reactivity if disabled
                if (!isEnabled) return;
            }
            
            const audioConfig = paramConfig.audioReactive;
            const mode = audioConfig.mode || 'additive';
            
            if (mode === 'interpolation') {
                // Interpolation mode: Output smoothed audio level (0-1) for shader to interpolate between min/max
                // For contrast system: paramName is typically "contrastMin" or "contrastMax"
                // We only process once per min/max pair (when we encounter the Min parameter)
                
                // Extract base name (remove "Min" or "Max" suffix) - cached
                const baseName = this.getBaseName(paramName);
                
                // Only process when we encounter the Min parameter (to avoid duplicate processing)
                if (paramName.endsWith('Min')) {
                    // Set the smoothed audio level uniform (used by shader for interpolation)
                    // Format: uSmoothed{BaseName}AudioLevel (e.g., uSmoothedContrastAudioLevel) - cached
                    const smoothedUniformName = this.getSmoothedUniformName(baseName);
                    const smoothedLocation = locations[smoothedUniformName];
                    
                    if (smoothedLocation !== null && smoothedLocation !== undefined) {
                        const smoothedValue = this.audioReactivityManager.getSmoothedValue(
                            paramName,
                            audioData,
                            audioConfig,
                            deltaTime
                        );
                        const lastValue = lastValues[smoothedUniformName];
                        if (lastValue !== smoothedValue) {
                            gl.uniform1f(smoothedLocation, smoothedValue);
                            lastValues[smoothedUniformName] = smoothedValue;
                        }
                    }
                }
            } else {
                // Additive mode: Interpolate between startValue and targetValue (new system)
                // or use legacy baseValue + invert logic (backward compatibility)
                
                const smoothedValue = this.audioReactivityManager.getSmoothedValue(
                    paramName,
                    audioData,
                    audioConfig,
                    deltaTime
                );
                
                let finalValue: number;
                
                // NEW SYSTEM: Use startValue/targetValue if provided
                if (audioConfig.startValue !== undefined || audioConfig.targetValue !== undefined) {
                    const startValue = audioConfig.startValue ?? paramConfig.default ?? 0;
                    const targetValue = audioConfig.targetValue ?? paramConfig.default ?? 1;
                    
                    // Speed mode: Continuous forward progression with audio acceleration
                    // Uses accumulation to ensure speed never decreases, only increases or stays constant
                    if (audioConfig.mode === 'speed') {
                        // Use accumulated speed that never decreases
                        finalValue = this.audioReactivityManager.getAccumulatedSpeed(
                            paramName,
                            audioData,
                            audioConfig,
                            deltaTime,
                            startValue,
                            targetValue
                        );
                    } else {
                        // Standard additive mode: Interpolate between startValue and targetValue
                        // smoothedValue is already 0-1 and has bezier curve applied
                        finalValue = startValue + (smoothedValue * (targetValue - startValue));
                    }
                } else {
                    // LEGACY SYSTEM: Use baseValue + invert logic for backward compatibility
                    const baseValue = (parameters[paramName] as number) ?? paramConfig.default;
                    const min = paramConfig.min ?? 0;
                    const max = paramConfig.max ?? 1;
                    const range = max - min;
                    
                    if (audioConfig.invert) {
                        // Inverted: high audio = low value, low audio = high value
                        // Use baseValue as the maximum (silent = max detail)
                        // Map smoothedValue (0-1) to range from min to baseValue
                        // smoothedValue=0 (silent) → baseValue (max detail)
                        // smoothedValue=1 (loud) → min (min detail, controllable via min parameter)
                        const detailRange = baseValue - min;
                        finalValue = baseValue - (smoothedValue * detailRange);
                    } else {
                        // Normal: high audio = high value, low audio = low value
                        // Add modulation to base value
                        const modulationAmount = smoothedValue * range;
                        finalValue = baseValue + modulationAmount;
                    }
                }
                
                // Clamp to parameter bounds
                const min = paramConfig.min ?? 0;
                const max = paramConfig.max ?? 1;
                const clampedValue = Math.max(min, Math.min(max, finalValue));
                
                // Update uniform if location exists
                // Convert parameter name to uniform name (camelCase to uCamelCase) - cached
                const uniformName = this.getUniformName(paramName);
                const location = locations[uniformName];
                
                if (location !== null && location !== undefined) {
                    const lastValue = lastValues[uniformName];
                    if (lastValue !== clampedValue) {
                        gl.uniform1f(location, clampedValue);
                        lastValues[uniformName] = clampedValue;
                    }
                }
            }
        });
    }
}

