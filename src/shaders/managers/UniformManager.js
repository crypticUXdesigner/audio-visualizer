// UniformManager - Centralized uniform update management
// Handles all uniform updates with value caching for performance

import { COLOR_KEYS } from '../managers/ColorTransitionManager.js';

export class UniformManager {
    /**
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Object} uniformLocations - Map of uniform names to locations
     */
    constructor(gl, uniformLocations) {
        this.gl = gl;
        this.locations = uniformLocations;
        this.lastValues = {};
    }
    
    /**
     * Update standard uniforms (resolution, time, pixelSize, etc.)
     * @param {Object} params - Parameters object
     * @param {number} currentTime - Current time in seconds
     * @param {number} timeOffset - Smoothed time offset
     * @param {number} pixelSizeMultiplier - Pixel size animation multiplier
     * @param {Array<number>} resolution - [width, height]
     */
    updateStandardUniforms(params, currentTime, timeOffset, pixelSizeMultiplier, resolution) {
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        // Resolution
        if (locations.uResolution) {
            if (!lastValues.uResolution || 
                lastValues.uResolution[0] !== resolution[0] ||
                lastValues.uResolution[1] !== resolution[1]) {
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
        const basePixelSize = params.pixelSize || 1.0;
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
        
        // Steps (hardcoded)
        const stepsValue = 5.0;
        if (lastValues.uSteps !== stepsValue) {
            if (locations.uSteps) {
                gl.uniform1f(locations.uSteps, stepsValue);
                lastValues.uSteps = stepsValue;
            }
        }
        
        // Mouse (always 0,0,0,0)
        if (!lastValues.uMouse || 
            lastValues.uMouse[0] !== 0.0 ||
            lastValues.uMouse[1] !== 0.0 ||
            lastValues.uMouse[2] !== 0.0 ||
            lastValues.uMouse[3] !== 0.0) {
            if (locations.uMouse) {
                gl.uniform4f(locations.uMouse, 0.0, 0.0, 0.0, 0.0);
                lastValues.uMouse = [0.0, 0.0, 0.0, 0.0];
            }
        }
        
        // ShapeType (always 0)
        if (lastValues.uShapeType !== 0) {
            if (locations.uShapeType) {
                gl.uniform1i(locations.uShapeType, 0);
                lastValues.uShapeType = 0;
            }
        }
    }
    
    /**
     * Update parameter-based uniforms
     * @param {Object} parameters - Current parameter values
     * @param {Object} config - Shader config with parameter definitions
     */
    updateParameterUniforms(parameters, config) {
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        // Dither strength
        const ditherStrength = parameters.ditherStrength !== undefined ? parameters.ditherStrength : 3.0;
        if (lastValues.uDitherStrength !== ditherStrength) {
            if (locations.uDitherStrength) {
                gl.uniform1f(locations.uDitherStrength, ditherStrength);
                lastValues.uDitherStrength = ditherStrength;
            }
        }
        
        // Transition width
        const transitionWidth = parameters.transitionWidth !== undefined ? parameters.transitionWidth : 0.005;
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
     * @param {Object} rippleData - Ripple data from audioData
     * @param {Object} rippleArrays - Pooled arrays for ripple data
     */
    updateRippleUniforms(rippleData, rippleArrays) {
        const gl = this.gl;
        const locations = this.locations;
        
        if (rippleData) {
            const maxRipples = 12;
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
     * @param {Object} colors - Current colors object
     * @param {Function} getInterpolatedColors - Function to get interpolated colors
     * @param {Object} colorTransition - Color transition state
     */
    updateColorUniforms(colors, getInterpolatedColors, colorTransition) {
        if (!colors) return;
        
        const gl = this.gl;
        const locations = this.locations;
        const lastValues = this.lastValues;
        
        // Get interpolated colors (handles smooth transitions)
        const activeColors = getInterpolatedColors();
        
        // Generate uniform names from COLOR_KEYS
        const colorUniforms = COLOR_KEYS.map(key => `u${key.charAt(0).toUpperCase()}${key.slice(1)}`);
        
        colorUniforms.forEach((uniformName, index) => {
            const location = locations[uniformName];
            const colorKey = COLOR_KEYS[index];
            if (location && activeColors[colorKey]) {
                const color = activeColors[colorKey];
                // During transition, always update colors (they change every frame)
                // When not transitioning, only update if changed
                const lastColor = lastValues[uniformName];
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
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {Object} uniformMapping - Uniform mapping configuration
     * @param {Object} parameters - Current parameter values
     */
    updateAudioUniforms(audioData, uniformMapping, parameters) {
        if (!audioData || !uniformMapping) return;
        
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
                    valueChanged = !lastValue || lastValue[0] !== value[0] || lastValue[1] !== value[1];
                    if (valueChanged) {
                        gl.uniform2f(location, value[0], value[1]);
                        lastValues[uniformName] = [value[0], value[1]];
                    }
                } else if (Array.isArray(value) && value.length === 3) {
                    valueChanged = !lastValue || lastValue[0] !== value[0] || lastValue[1] !== value[1] || lastValue[2] !== value[2];
                    if (valueChanged) {
                        gl.uniform3f(location, value[0], value[1], value[2]);
                        lastValues[uniformName] = [value[0], value[1], value[2]];
                    }
                } else if (Array.isArray(value) && value.length === 4) {
                    valueChanged = !lastValue || lastValue[0] !== value[0] || lastValue[1] !== value[1] || lastValue[2] !== value[2] || lastValue[3] !== value[3];
                    if (valueChanged) {
                        gl.uniform4f(location, value[0], value[1], value[2], value[3]);
                        lastValues[uniformName] = [value[0], value[1], value[2], value[3]];
                    }
                }
            }
        });
    }
}
