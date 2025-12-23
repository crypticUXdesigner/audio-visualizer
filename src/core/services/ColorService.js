// Color Service
// Centralized service for managing color operations and state

import { generateColorsFromOklch, normalizeColor, calculateThresholds } from '../color/ColorGenerator.js';
import { COLOR_CONFIG } from '../../config/constants.js';

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
  constructor(colorConfig, shaderManager, colorModulator = null) {
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
  async initializeColors(skipFrequencyUpdate = false, audioData = null) {
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
  async _doInitializeColors(skipFrequencyUpdate = false, audioData = null) {
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
      const thresholds = calculateThresholds(thresholdCurve, 10);
      
      // Update shader manager with colors
      this._updateShaderColors(newColors, configToUse, thresholds);
      
      // Emit callbacks
      this._emit('onColorsUpdated', newColors);
      this._emit('onThresholdsUpdated', thresholds);
      
      console.log('Colors initialized/updated:', Object.keys(this.colors).length, 'colors');
      
      return newColors;
    } catch (error) {
      console.error('Error initializing colors:', error);
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
  updateDynamicColors(audioData) {
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
  updateColorConfig(newConfig) {
    this.colorConfig = { ...this.colorConfig, ...newConfig };
    if (this.colorModulator) {
      this.colorModulator.setBaseConfig(this.colorConfig);
    }
  }
  
  /**
   * Get current colors
   * 
   * @returns {Object|null} Current colors object or null if not initialized
   */
  getColors() {
    return this.colors;
  }
  
  /**
   * Check if colors are initialized
   * 
   * @returns {boolean} True if colors have been initialized
   */
  areColorsInitialized() {
    return this.colorsInitialized;
  }
  
  /**
   * Register callback for color update events
   * 
   * @param {string} event - Event name ('onColorsUpdated', 'onShaderUpdated', 'onThresholdsUpdated')
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (this.updateCallbacks[event]) {
      this.updateCallbacks[event].push(callback);
    }
  }
  
  /**
   * Remove callback for color update events
   * 
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.updateCallbacks[event]) {
      const index = this.updateCallbacks[event].indexOf(callback);
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
  _updateShaderColors(colors, config = null, thresholds = null) {
    if (this.shaderManager) {
      this.shaderManager.setColors(colors);
      
      // Update thresholds if provided
      if (thresholds && this.shaderManager.activeShader) {
        this._setShaderThresholds(thresholds);
      } else if (config && this.shaderManager.activeShader) {
        // Calculate thresholds from config
        const thresholdCurve = config.thresholdCurve || [0.2, 0.2, 1.0, 0.7];
        const calculatedThresholds = calculateThresholds(thresholdCurve, 10);
        this._setShaderThresholds(calculatedThresholds);
      }
      
      this._emit('onShaderUpdated', { colors, thresholds });
    }
  }
  
  /**
   * Set shader threshold uniforms
   * @private
   */
  _setShaderThresholds(thresholds) {
    const shader = this.shaderManager.activeShader;
    if (!shader) return;
    
    for (let i = 0; i < thresholds.length; i++) {
      shader.setUniform(`uThreshold${i + 1}`, thresholds[i]);
    }
  }
  
  /**
   * Map generated colors (color1-color10) to standard format (color, color2-color10)
   * @private
   */
  _mapGeneratedColors(generatedColors) {
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
  _colorsChanged(newColors) {
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
  _emit(event, data) {
    if (this.updateCallbacks[event]) {
      this.updateCallbacks[event].forEach(cb => {
        try {
          cb(data);
        } catch (error) {
          console.error(`Error in color service callback for ${event}:`, error);
        }
      });
    }
  }
}

