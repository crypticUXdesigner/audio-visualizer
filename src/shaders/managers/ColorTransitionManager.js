// ColorTransitionManager - Manages smooth color transitions
// Handles interpolation between color sets with easing

// Extract color keys constant (also used in UniformManager)
export const COLOR_KEYS = ['color', 'color2', 'color3', 'color4', 'color5', 
                          'color6', 'color7', 'color8', 'color9', 'color10'];

export class ColorTransitionManager {
    constructor(config = {}) {
        this.duration = config.duration ?? 2000; // 2 seconds default
        this.currentColors = null;
        this.previousColors = null;
        this.targetColors = null;
        this.isTransitioning = false;
        this.startTime = 0;
    }
    
    /**
     * Start a color transition
     * @param {Object} newColors - Target colors object
     * @param {boolean} isFirstUpdate - If true, sets immediately without transition
     */
    startTransition(newColors, isFirstUpdate = false) {
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
     * @returns {Object} Current colors object
     */
    getCurrentColors() {
        if (!this.isTransitioning) {
            return this.currentColors;
        }
        
        const elapsed = performance.now() - this.startTime;
        const t = Math.min(elapsed / this.duration, 1.0);
        
        // Use ease-out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - t, 3);
        
        // End transition if complete
        if (t >= 1.0) {
            this.isTransitioning = false;
            this.currentColors = this.cloneColors(this.targetColors);
            return this.currentColors;
        }
        
        // Interpolate between previous and target
        const interpolated = {};
        COLOR_KEYS.forEach(key => {
            if (this.previousColors[key] && this.targetColors[key]) {
                interpolated[key] = this.lerpColor(
                    this.previousColors[key],
                    this.targetColors[key],
                    eased
                );
            }
        });
        
        this.currentColors = interpolated;
        return interpolated;
    }
    
    /**
     * Clone a colors object
     * @param {Object} colors - Colors to clone
     * @returns {Object} Cloned colors
     */
    cloneColors(colors) {
        const cloned = {};
        COLOR_KEYS.forEach(key => {
            if (colors[key]) {
                cloned[key] = [colors[key][0], colors[key][1], colors[key][2]];
            }
        });
        return cloned;
    }
    
    /**
     * Linear interpolation between two colors
     * @param {Array} color1 - Start color [r, g, b]
     * @param {Array} color2 - End color [r, g, b]
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Array} Interpolated color [r, g, b]
     */
    lerpColor(color1, color2, t) {
        return [
            color1[0] + (color2[0] - color1[0]) * t,
            color1[1] + (color2[1] - color1[1]) * t,
            color1[2] + (color2[2] - color1[2]) * t
        ];
    }
    
    /**
     * Reset to a color state
     * @param {Object} colors - Colors to reset to (optional)
     */
    reset(colors) {
        this.currentColors = colors ? this.cloneColors(colors) : null;
        this.previousColors = null;
        this.targetColors = null;
        this.isTransitioning = false;
    }
}

