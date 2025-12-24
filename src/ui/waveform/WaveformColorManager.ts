// Waveform Color Manager
// Handles color parsing, interpolation, and transitions for waveform visualization

import { COLOR_CONFIG } from '../../config/constants.js';
import type { ColorMap } from '../../types/index.js';

export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Manages color transitions and interpolation for waveform visualization
 */
export class WaveformColorManager {
  // Target colors (what we're transitioning to)
  targetWaveColor: string;
  targetProgressColor: string;
  targetCursorColor: string;
  
  // Current colors (what's being displayed)
  currentWaveColor: ColorRGBA;
  currentProgressColor: ColorRGBA;
  currentCursorColor: ColorRGBA;
  
  // Transition state
  colorTransitionDuration: number;
  colorTransitionStartTime: number | null;
  colorTransitionProgress: number;
  startWaveColor: ColorRGBA;
  startProgressColor: ColorRGBA;
  startCursorColor: ColorRGBA;
  
  constructor() {
    // Visual settings (will be overridden by CSS tokens)
    const defaultWaveColor = 'rgba(255, 255, 255, 0.3)';
    const defaultProgressColor = 'rgba(255, 255, 255, 0.9)';
    const defaultCursorColor = 'rgba(255, 255, 255, 1.0)';
    
    // Color transition
    this.targetWaveColor = defaultWaveColor;
    this.targetProgressColor = defaultProgressColor;
    this.targetCursorColor = defaultCursorColor;
    this.currentWaveColor = { r: 255, g: 255, b: 255, a: 0.3 };
    this.currentProgressColor = { r: 255, g: 255, b: 255, a: 0.9 };
    this.currentCursorColor = { r: 255, g: 255, b: 255, a: 1.0 };
    this.colorTransitionDuration = COLOR_CONFIG.TRANSITION_DURATION;
    this.colorTransitionStartTime = null;
    this.colorTransitionProgress = 1; // 0 to 1 (1 = complete)
    this.startWaveColor = { r: 255, g: 255, b: 255, a: 0.3 };
    this.startProgressColor = { r: 255, g: 255, b: 255, a: 0.9 };
    this.startCursorColor = { r: 255, g: 255, b: 255, a: 1.0 };
  }
  
  /**
   * Parse RGBA string to color object
   * @param rgbaString - RGBA string (e.g., "rgba(255, 255, 255, 0.3)")
   * @returns Color object with r, g, b, a properties
   */
  parseRGBA(rgbaString: string): ColorRGBA {
    const match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
        a: match[4] ? parseFloat(match[4]) : 1.0
      };
    }
    return { r: 255, g: 255, b: 255, a: 1.0 };
  }
  
  /**
   * Interpolate colors smoothly with fixed transition duration
   */
  interpolateColors(): void {
    // Parse target colors
    const targetWave = this.parseRGBA(this.targetWaveColor);
    const targetProgress = this.parseRGBA(this.targetProgressColor);
    const targetCursor = this.parseRGBA(this.targetCursorColor);
    
    // Check if we need to start a new transition
    const colorsChanged = 
      Math.abs(targetWave.r - this.currentWaveColor.r) > 1 ||
      Math.abs(targetWave.g - this.currentWaveColor.g) > 1 ||
      Math.abs(targetWave.b - this.currentWaveColor.b) > 1 ||
      Math.abs(targetProgress.r - this.currentProgressColor.r) > 1 ||
      Math.abs(targetProgress.g - this.currentProgressColor.g) > 1 ||
      Math.abs(targetProgress.b - this.currentProgressColor.b) > 1 ||
      Math.abs(targetCursor.r - this.currentCursorColor.r) > 1 ||
      Math.abs(targetCursor.g - this.currentCursorColor.g) > 1 ||
      Math.abs(targetCursor.b - this.currentCursorColor.b) > 1;
    
    if (colorsChanged && this.colorTransitionProgress >= 1) {
      // Start new transition
      this.colorTransitionStartTime = Date.now();
      this.colorTransitionProgress = 0;
      
      // Store starting colors
      this.startWaveColor = { ...this.currentWaveColor };
      this.startProgressColor = { ...this.currentProgressColor };
      this.startCursorColor = { ...this.currentCursorColor };
    }
    
    // Update transition progress
    if (this.colorTransitionProgress < 1 && this.colorTransitionStartTime) {
      const elapsed = Date.now() - this.colorTransitionStartTime;
      this.colorTransitionProgress = Math.min(1, elapsed / this.colorTransitionDuration);
      
      // Use easing function for smooth transition (ease-in-out)
      const t = this.colorTransitionProgress;
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      
      // Interpolate wave color
      this.currentWaveColor.r = this.startWaveColor.r + (targetWave.r - this.startWaveColor.r) * eased;
      this.currentWaveColor.g = this.startWaveColor.g + (targetWave.g - this.startWaveColor.g) * eased;
      this.currentWaveColor.b = this.startWaveColor.b + (targetWave.b - this.startWaveColor.b) * eased;
      this.currentWaveColor.a = this.startWaveColor.a + (targetWave.a - this.startWaveColor.a) * eased;
      
      // Interpolate progress color
      this.currentProgressColor.r = this.startProgressColor.r + (targetProgress.r - this.startProgressColor.r) * eased;
      this.currentProgressColor.g = this.startProgressColor.g + (targetProgress.g - this.startProgressColor.g) * eased;
      this.currentProgressColor.b = this.startProgressColor.b + (targetProgress.b - this.startProgressColor.b) * eased;
      this.currentProgressColor.a = this.startProgressColor.a + (targetProgress.a - this.startProgressColor.a) * eased;
      
      // Interpolate cursor color
      this.currentCursorColor.r = this.startCursorColor.r + (targetCursor.r - this.startCursorColor.r) * eased;
      this.currentCursorColor.g = this.startCursorColor.g + (targetCursor.g - this.startCursorColor.g) * eased;
      this.currentCursorColor.b = this.startCursorColor.b + (targetCursor.b - this.startCursorColor.b) * eased;
      this.currentCursorColor.a = this.startCursorColor.a + (targetCursor.a - this.startCursorColor.a) * eased;
    }
  }
  
  /**
   * Set colors from color map
   * @param colors - Color map with color values
   */
  setColors(colors: ColorMap): void {
    if (colors && colors.color) {
      // Use the primary color from the theme
      const rgb = colors.color;
      
      // Set target colors (will be interpolated smoothly)
      this.targetProgressColor = `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, 1.0)`;
      this.targetCursorColor = `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, 1.0)`;
      
      // Use a dimmer version for inactive waveform
      this.targetWaveColor = `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, 0.3)`;
    }
  }
  
  /**
   * Get current wave color as RGBA string
   */
  getWaveColorRGBA(): string {
    const c = this.currentWaveColor;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
  }
  
  /**
   * Get current progress color as RGBA string
   */
  getProgressColorRGBA(): string {
    const c = this.currentProgressColor;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
  }
  
  /**
   * Get current cursor color
   */
  getCursorColor(): ColorRGBA {
    return this.currentCursorColor;
  }
}

