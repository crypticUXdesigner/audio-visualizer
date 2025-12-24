// ColorTransitionManager - Manages smooth color transitions
// Handles interpolation between color sets with easing

// Extract color keys constant (also used in UniformManager)
export const COLOR_KEYS = ['color', 'color2', 'color3', 'color4', 'color5', 
                          'color6', 'color7', 'color8', 'color9', 'color10'] as const;

import type { ColorMap } from '../../types/index.js';

interface ColorTransitionConfig {
    duration?: number;
    easing?: 'linear' | 'ease-out-cubic' | 'ease-in-cubic' | 'ease-in-out-cubic';
}

export class ColorTransitionManager {
    duration: number;
    easingType: 'linear' | 'ease-out-cubic' | 'ease-in-cubic' | 'ease-in-out-cubic';
    currentColors: ColorMap | null;
    previousColors: ColorMap | null;
    targetColors: ColorMap | null;
    isTransitioning: boolean;
    startTime: number;
    
    constructor(config: ColorTransitionConfig = {}) {
        this.duration = config.duration ?? 2000; // 2 seconds default
        this.easingType = config.easing ?? 'ease-out-cubic';
        this.currentColors = null;
        this.previousColors = null;
        this.targetColors = null;
        this.isTransitioning = false;
        this.startTime = 0;
    }
    
    /**
     * Get easing function value for given t (0-1)
     * @param t - Normalized time (0-1)
     * @returns Eased value (0-1)
     */
    _getEasingFunction(t: number): number {
        switch (this.easingType) {
            case 'linear':
                return t;
            case 'ease-out-cubic':
                return 1 - Math.pow(1 - t, 3);
            case 'ease-in-cubic':
                return Math.pow(t, 3);
            case 'ease-in-out-cubic':
                return t < 0.5 
                    ? 4 * t * t * t 
                    : 1 - Math.pow(-2 * t + 2, 3) / 2;
            default:
                // Default to ease-out-cubic
                return 1 - Math.pow(1 - t, 3);
        }
    }
    
    /**
     * Start a color transition
     * @param newColors - Target colors object
     * @param isFirstUpdate - If true, sets immediately without transition
     */
    startTransition(newColors: ColorMap, isFirstUpdate: boolean = false): void {
        if (!newColors) return;
        
        if (isFirstUpdate || !this.currentColors) {
            // First update: set immediately
            this.currentColors = this.cloneColors(newColors);
            this.previousColors = this.cloneColors(newColors);
            this.targetColors = this.cloneColors(newColors);
            this.isTransitioning = false;
            return;
        }
        
        // Start transition from current to new
        this.previousColors = this.cloneColors(this.currentColors);
        this.targetColors = this.cloneColors(newColors);
        this.isTransitioning = true;
        this.startTime = performance.now();
    }
    
    /**
     * Get current colors (interpolated if transitioning)
     * Returns smoothly interpolated colors during transitions using ease-out cubic easing
     * @returns Current colors object with color, color2, etc. properties, or null if not initialized
     * @example
     * const colors = colorTransitionManager.getCurrentColors();
     * // Returns { color: [1.0, 0.5, 0.2], color2: [0.3, 0.8, 0.1], ... }
     */
    getCurrentColors(): ColorMap | null {
        if (!this.isTransitioning) {
            return this.currentColors;
        }
        
        const elapsed = performance.now() - this.startTime;
        const t = Math.min(elapsed / this.duration, 1.0);
        
        // Use configured easing function
        const eased = this._getEasingFunction(t);
        
        // End transition if complete
        if (t >= 1.0) {
            this.isTransitioning = false;
            this.currentColors = this.cloneColors(this.targetColors!);
            return this.currentColors;
        }
        
        // Interpolate between previous and target
        const interpolated: ColorMap = {};
        COLOR_KEYS.forEach(key => {
            if (this.previousColors![key] && this.targetColors![key]) {
                interpolated[key] = this.lerpColor(
                    this.previousColors![key],
                    this.targetColors![key],
                    eased
                );
            }
        });
        
        this.currentColors = interpolated;
        return interpolated;
    }
    
    /**
     * Clone a colors object
     * @param colors - Colors to clone
     * @returns Cloned colors
     */
    cloneColors(colors: ColorMap): ColorMap {
        const cloned: ColorMap = {};
        COLOR_KEYS.forEach(key => {
            if (colors[key]) {
                cloned[key] = [colors[key][0], colors[key][1], colors[key][2]];
            }
        });
        return cloned;
    }
    
    /**
     * Linear interpolation between two colors
     * @param color1 - Start color [r, g, b]
     * @param color2 - End color [r, g, b]
     * @param t - Interpolation factor (0-1)
     * @returns Interpolated color [r, g, b]
     */
    lerpColor(color1: [number, number, number], color2: [number, number, number], t: number): [number, number, number] {
        return [
            color1[0] + (color2[0] - color1[0]) * t,
            color1[1] + (color2[1] - color1[1]) * t,
            color1[2] + (color2[2] - color1[2]) * t
        ];
    }
    
    /**
     * Reset to a color state
     * @param colors - Colors to reset to (optional)
     */
    reset(colors?: ColorMap): void {
        this.currentColors = colors ? this.cloneColors(colors) : null;
        this.previousColors = null;
        this.targetColors = null;
        this.isTransitioning = false;
    }
}

