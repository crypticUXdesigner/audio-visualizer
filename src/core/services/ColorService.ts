// Color Service
// Centralized service for managing color operations and state

import { generateColorsFromOklch, calculateThresholds } from '../color/ColorGenerator.js';
import { normalizeColor, hexToRgb, rgbToOklch, interpolateHue } from '../color/ColorConverter.js';
import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import { COLOR_CONFIG } from '../../config/constants.js';
import type { ColorConfig, ExtendedAudioData, ColorMap } from '../../types/index.js';
import type { ColorModulator } from '../color/ColorModulator.js';
import type { ShaderManager } from '../../shaders/ShaderManager.js';

interface ColorUpdateQueueItem {
  skipFrequencyUpdate: boolean;
  audioData: ExtendedAudioData | null;
}

type ColorEvent = 'onColorsUpdated' | 'onShaderUpdated' | 'onThresholdsUpdated';

// Specific callback types for each event
type ColorsUpdatedCallback = (colors: ColorMap) => void;
type ThresholdsUpdatedCallback = (thresholds: number[]) => void;
type ShaderUpdatedCallback = (data: { colors: ColorMap; thresholds: number[] | null }) => void;

/**
 * ColorService - Manages color initialization, updates, and state
 * 
 * This service centralizes all color-related operations that were previously
 * scattered across App.js and other files. It handles:
 * - Color initialization from configuration
 * - Dynamic color updates based on audio data
 * - Color change detection and threshold management
 * - Shader color updates
 */
export class ColorService {
  colorConfig: ColorConfig;
  shaderManager: ShaderManager;
  colorModulator: ColorModulator | null;
  colors: ColorMap | null = null;
  colorsInitialized: boolean = false;
  _colorInitPromise: Promise<ColorMap> | null = null;
  _colorUpdateQueue: ColorUpdateQueueItem[] = [];
  updateCallbacks: {
    onColorsUpdated: ColorsUpdatedCallback[];
    onShaderUpdated: ShaderUpdatedCallback[];
    onThresholdsUpdated: ThresholdsUpdatedCallback[];
  };
  
  constructor(colorConfig: ColorConfig, shaderManager: ShaderManager, colorModulator: ColorModulator | null = null) {
    this.colorConfig = colorConfig;
    this.shaderManager = shaderManager;
    this.colorModulator = colorModulator;
    this.colors = null;
    this.colorsInitialized = false;
    
    // Promise-based initialization queue to handle race conditions
    this._colorInitPromise = null;
    this._colorUpdateQueue = [];
    
    // Callbacks for color updates
    this.updateCallbacks = {
      onColorsUpdated: [],
      onShaderUpdated: [],
      onThresholdsUpdated: [],
    };
  }
  
  /**
   * Initialize colors from configuration
   * 
   * This method generates a color palette from the current color configuration
   * and updates all dependent systems (shaders, UI components, etc.).
   * 
   * @param {boolean} [skipFrequencyUpdate=false] - If true, skips frequency-based updates
   * @param {Object|null} [audioData=null] - Audio data for dynamic color modulation
   * @returns {Promise<Object>} Promise that resolves to the generated colors object
   * @throws {Error} If color generation fails
   */
  async initializeColors(skipFrequencyUpdate: boolean = false, audioData: ExtendedAudioData | null = null): Promise<ColorMap> {
    // If already initializing, queue this update
    if (this._colorInitPromise) {
      this._colorUpdateQueue.push({ skipFrequencyUpdate, audioData });
      return this._colorInitPromise;
    }
    
    // Create promise for this initialization
    this._colorInitPromise = this._doInitializeColors(skipFrequencyUpdate, audioData);
    
    // Process queue after completion
    try {
      const result = await this._colorInitPromise;
      this._colorInitPromise = null;
      
      // Process queued updates (only keep latest)
      if (this._colorUpdateQueue.length > 0) {
        const latest = this._colorUpdateQueue[this._colorUpdateQueue.length - 1];
        this._colorUpdateQueue = [];
        // Use setTimeout to avoid stack overflow with recursive calls
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(this.initializeColors(latest.skipFrequencyUpdate, latest.audioData));
          }, 0);
        });
      }
      
      return result;
    } catch (error) {
      this._colorInitPromise = null;
      this._colorUpdateQueue = [];
      throw error;
    }
  }
  
  /**
   * Internal method to perform actual color initialization
   * @private
   */
  async _doInitializeColors(_skipFrequencyUpdate: boolean = false, audioData: ExtendedAudioData | null = null): Promise<ColorMap> {
    try {
      // Get color config (potentially modified by color modulator)
      let configToUse = this.colorConfig;
      
      // If color modulator exists and audio data is provided, get modified config
      if (this.colorModulator && audioData) {
        configToUse = this.colorModulator.update(audioData);
      }
      
      const generatedColors = generateColorsFromOklch(configToUse);
      
      // Map color1-color10 to color, color2-color10 format
      // Always create new object to ensure reference changes (important for preset switching)
      const newColors = this._mapGeneratedColors(generatedColors);
      
      this.colors = newColors;
      this.colorsInitialized = true;
      
      // Calculate thresholds from curve
      const thresholdCurve = configToUse.thresholdCurve || [0.2, 0.2, 1.0, 0.7];
      const thresholds = calculateThresholds(thresholdCurve as [number, number, number, number], 10);
      
      // Update shader manager with colors
      this._updateShaderColors(newColors, configToUse, thresholds);
      
      // Emit callbacks
      this._emit('onColorsUpdated', newColors);
      this._emit('onThresholdsUpdated', thresholds);
      
      ShaderLogger.debug(`Colors initialized/updated: ${Object.keys(this.colors).length} colors`);
      
      return newColors;
    } catch (error) {
      ShaderLogger.error('Error initializing colors:', error);
      throw error;
    }
  }
  
  /**
   * Update dynamic colors based on audio data (called from render loop)
   * 
   * This method updates colors dynamically based on audio analysis data,
   * using the color modulator to adjust hues and intensities.
   * 
   * @param {Object} audioData - Audio analysis data from AudioAnalyzer
   */
  updateDynamicColors(audioData: ExtendedAudioData): void {
    if (!this.colorModulator || !audioData || !this.colorsInitialized) {
      return;
    }
    
    // Update color modulator with audio data
    const modifiedConfig = this.colorModulator.update(audioData);
    
    // Generate colors from modified config
    const generatedColors = generateColorsFromOklch(modifiedConfig);
    const newColors = this._mapGeneratedColors(generatedColors);
    
    // Check if colors changed significantly
    if (this._colorsChanged(newColors)) {
      this.colors = newColors;
      
      // Update shader manager with new colors
      this._updateShaderColors(newColors);
      
      // Emit callback
      this._emit('onColorsUpdated', newColors);
    }
  }
  
  /**
   * Update color configuration
   * 
   * @param {Object} newConfig - New color configuration (partial or full)
   */
  updateColorConfig(newConfig: Partial<ColorConfig>): void {
    this.colorConfig = { ...this.colorConfig, ...newConfig };
    if (this.colorModulator) {
      this.colorModulator.setBaseConfig(this.colorConfig);
    }
  }

  /**
   * Apply a color preset configuration
   * Merges preset config with current config and regenerates colors
   * 
   * @param {Object} presetConfig - Partial color configuration from preset
   * @returns {Promise<void>}
   */
  async applyPreset(presetConfig: Partial<ColorConfig>): Promise<void> {
    if (!this.colorConfig) {
      ShaderLogger.warn('Cannot apply preset: colorConfig not initialized');
      return;
    }

    // Deep merge to preserve structure
    if (presetConfig.baseHue) {
      this.colorConfig.baseHue = presetConfig.baseHue;
    }
    if (presetConfig.darkest) {
      Object.assign(this.colorConfig.darkest, presetConfig.darkest);
    }
    if (presetConfig.brightest) {
      Object.assign(this.colorConfig.brightest, presetConfig.brightest);
    }
    if (presetConfig.interpolationCurve) {
      this.colorConfig.interpolationCurve = presetConfig.interpolationCurve;
    }

    // Calculate and store actual hue values for sliders
    if (presetConfig.baseHue && presetConfig.darkest?.hueOffset !== undefined) {
      const baseRgb = hexToRgb(presetConfig.baseHue);
      const [, , baseH] = rgbToOklch(baseRgb);
      this.colorConfig.darkest.hue = interpolateHue(baseH, baseH + presetConfig.darkest.hueOffset, 1.0);
    }
    if (presetConfig.baseHue && presetConfig.brightest?.hueOffset !== undefined) {
      const baseRgb = hexToRgb(presetConfig.baseHue);
      const [, , baseH] = rgbToOklch(baseRgb);
      this.colorConfig.brightest.hue = interpolateHue(baseH, baseH + presetConfig.brightest.hueOffset, 1.0);
    }

    // Update color modulator with new config
    if (this.colorModulator) {
      this.colorModulator.setBaseConfig(this.colorConfig);
    }

    // Regenerate colors (this will update shader manager)
    try {
      await this.initializeColors();
    } catch (err) {
      ShaderLogger.error('Error initializing colors after preset change:', err);
      throw err;
    }
  }

  /**
   * Update a single color property (for slider changes)
   * 
   * @param {string} property - Property name ('hue', 'chroma', 'lightness', 'hueOffset')
   * @param {number} value - New property value
   * @param {string} target - Target range ('darkest' or 'brightest')
   * @returns {Promise<void>}
   */
  async updateColorProperty(property: string, value: number, target: 'darkest' | 'brightest'): Promise<void> {
    if (!this.colorConfig) {
      ShaderLogger.warn('Cannot update color property: colorConfig not initialized');
      return;
    }

    const targetRange = target === 'darkest' ? this.colorConfig.darkest : this.colorConfig.brightest;
    if (!targetRange) {
      ShaderLogger.warn(`Cannot update color property: ${target} range not found`);
      return;
    }

    // Update the property
    if (property === 'hue' || property === 'chroma' || property === 'lightness' || property === 'hueOffset') {
      (targetRange as Record<string, number>)[property] = value;
    }

    // Update color modulator with new config
    if (this.colorModulator) {
      this.colorModulator.setBaseConfig(this.colorConfig);
    }

    // Regenerate colors
    try {
      await this.initializeColors();
    } catch (err) {
      // Error handling is done in ColorService
      ShaderLogger.error('Error initializing colors after property change:', err);
    }
  }

  /**
   * Get current color configuration
   * 
   * @returns {Object|null} Current color configuration or null
   */
  getColorConfig(): ColorConfig | null {
    return this.colorConfig;
  }
  
  /**
   * Get current colors
   * 
   * @returns {Object|null} Current colors object or null if not initialized
   */
  getColors(): ColorMap | null {
    return this.colors;
  }
  
  /**
   * Check if colors are initialized
   * 
   * @returns {boolean} True if colors have been initialized
   */
  areColorsInitialized(): boolean {
    return this.colorsInitialized;
  }
  
  /**
   * Register callback for color update events
   * 
   * @param event - Event name ('onColorsUpdated', 'onShaderUpdated', 'onThresholdsUpdated')
   * @param callback - Callback function
   */
  on(event: 'onColorsUpdated', callback: ColorsUpdatedCallback): void;
  on(event: 'onThresholdsUpdated', callback: ThresholdsUpdatedCallback): void;
  on(event: 'onShaderUpdated', callback: ShaderUpdatedCallback): void;
  on(event: ColorEvent, callback: ColorsUpdatedCallback | ThresholdsUpdatedCallback | ShaderUpdatedCallback): void {
    if (this.updateCallbacks[event]) {
      this.updateCallbacks[event].push(callback as never);
    }
  }
  
  /**
   * Remove callback for color update events
   * 
   * @param event - Event name
   * @param callback - Callback function to remove
   */
  off(event: 'onColorsUpdated', callback: ColorsUpdatedCallback): void;
  off(event: 'onThresholdsUpdated', callback: ThresholdsUpdatedCallback): void;
  off(event: 'onShaderUpdated', callback: ShaderUpdatedCallback): void;
  off(event: ColorEvent, callback: ColorsUpdatedCallback | ThresholdsUpdatedCallback | ShaderUpdatedCallback): void {
    if (this.updateCallbacks[event]) {
      const index = this.updateCallbacks[event].indexOf(callback as never);
      if (index > -1) {
        this.updateCallbacks[event].splice(index, 1);
      }
    }
  }
  
  // Private helper methods
  
  /**
   * Update shader colors and thresholds
   * @private
   */
  _updateShaderColors(colors: ColorMap, config: ColorConfig | null = null, thresholds: number[] | null = null): void {
    if (this.shaderManager) {
      this.shaderManager.setColors(colors);
      
      // Update thresholds if provided
      if (thresholds && this.shaderManager.activeShader) {
        this._setShaderThresholds(thresholds);
      } else if (config && this.shaderManager.activeShader) {
        // Calculate thresholds from config
        const thresholdCurve = config.thresholdCurve || [0.2, 0.2, 1.0, 0.7];
        const calculatedThresholds = calculateThresholds(thresholdCurve as [number, number, number, number], 10);
        this._setShaderThresholds(calculatedThresholds);
      }
      
      this._emit('onShaderUpdated', { colors, thresholds });
    }
  }
  
  /**
   * Set shader threshold uniforms
   * @private
   */
  _setShaderThresholds(thresholds: number[]): void {
    const shader = this.shaderManager.activeShader;
    if (!shader || !shader.isInitialized) return;
    
    // Check if threshold uniforms exist (some shaders like grayscott don't use them)
    const hasThresholdUniforms = shader.uniformLocations && 
      shader.uniformLocations['uThreshold1'] !== null && 
      shader.uniformLocations['uThreshold1'] !== undefined;
    
    if (!hasThresholdUniforms) {
      // Shader doesn't use threshold uniforms, skip setting them
      return;
    }
    
    for (let i = 0; i < thresholds.length; i++) {
      const uniformName = `uThreshold${i + 1}`;
      // Double-check each uniform exists before setting
      if (shader.uniformLocations && 
          shader.uniformLocations[uniformName] !== null && 
          shader.uniformLocations[uniformName] !== undefined) {
        try {
          shader.setUniform(uniformName, thresholds[i]);
        } catch (error) {
          // Silently ignore missing uniform errors for threshold uniforms
          // Some shaders (like grayscott) don't use the color system
        }
      }
    }
  }
  
  /**
   * Map generated colors (color1-color10) to standard format (color, color2-color10)
   * @private
   */
  _mapGeneratedColors(generatedColors: Record<string, [number, number, number]>): ColorMap {
    return {
      color: normalizeColor(generatedColors.color1),
      color2: normalizeColor(generatedColors.color2),
      color3: normalizeColor(generatedColors.color3),
      color4: normalizeColor(generatedColors.color4),
      color5: normalizeColor(generatedColors.color5),
      color6: normalizeColor(generatedColors.color6),
      color7: normalizeColor(generatedColors.color7),
      color8: normalizeColor(generatedColors.color8),
      color9: normalizeColor(generatedColors.color9),
      color10: normalizeColor(generatedColors.color10),
    };
  }
  
  /**
   * Check if colors have changed significantly
   * @private
   */
  _colorsChanged(newColors: ColorMap): boolean {
    if (!this.colors) return true;
    
    const threshold = COLOR_CONFIG.UPDATE_THRESHOLD;
    for (const key in newColors) {
      if (!this.colors[key] ||
          Math.abs(this.colors[key][0] - newColors[key][0]) > threshold ||
          Math.abs(this.colors[key][1] - newColors[key][1]) > threshold ||
          Math.abs(this.colors[key][2] - newColors[key][2]) > threshold) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Emit event to registered callbacks
   * @private
   */
  _emit(event: 'onColorsUpdated', data: ColorMap): void;
  _emit(event: 'onThresholdsUpdated', data: number[]): void;
  _emit(event: 'onShaderUpdated', data: { colors: ColorMap; thresholds: number[] | null }): void;
  _emit(event: ColorEvent, data?: ColorMap | number[] | { colors: ColorMap; thresholds: number[] | null }): void {
    const callbacks = this.updateCallbacks[event];
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          // Type-safe callback invocation based on event type
          if (event === 'onColorsUpdated' && this._isColorMap(data)) {
            (cb as ColorsUpdatedCallback)(data);
          } else if (event === 'onThresholdsUpdated' && Array.isArray(data) && data.every(v => typeof v === 'number')) {
            (cb as ThresholdsUpdatedCallback)(data as number[]);
          } else if (event === 'onShaderUpdated' && data && typeof data === 'object' && 'colors' in data) {
            (cb as ShaderUpdatedCallback)(data as { colors: ColorMap; thresholds: number[] | null });
          }
        } catch (error) {
          ShaderLogger.error(`Error in color service callback for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Type guard for ColorMap
   * @private
   */
  _isColorMap(data: unknown): data is ColorMap {
    return data !== null && typeof data === 'object' && !Array.isArray(data);
  }
}

