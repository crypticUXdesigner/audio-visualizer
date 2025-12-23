// Title Display Component
// Handles track title display with audio reactivity, noise animation, and color transitions

export class TitleDisplay {
    constructor(audioAnalyzer) {
        this.audioAnalyzer = audioAnalyzer;
        
        // Title display elements
        this.titleDisplayElement = null;
        this.titleTextElement = null;
        
        // Title display state
        this.titleDisplayState = {
            isVisible: false,
            isAnimating: false,
            hasShown: false,
            animationTimeout: null,
            updateInterval: null
        };
        
        // Title display colors
        this.titleBaseColor = null; // color3 (3rd brightest)
        this.titlePeakColor = null; // color (brightest)
        this.currentTitleColor = null; // Current interpolated color
        
        // Noise animation state
        this.noiseSeed = 0;
        this.noiseAnimationFrameId = null;
        this.noiseLastUpdate = 0;
        this.noiseFPS = 30;
        this.noiseFrameTime = 1000 / this.noiseFPS; // 33.33ms for 30fps
        this.noiseSeedIncrement = 0.05; // Very small increment for smooth transitions
    }
    
    /**
     * Initialize title display element
     */
    init() {
        this.titleDisplayElement = document.getElementById('trackTitleDisplay');
        this.titleTextElement = this.titleDisplayElement?.querySelector('.track-title-text');
        if (!this.titleDisplayElement || !this.titleTextElement) {
            console.warn('Title display elements not found');
            return;
        }
    }
    
    /**
     * Start smooth noise animation at 30fps
     */
    startNoiseAnimation() {
        if (this.noiseAnimationFrameId) {
            return; // Already running
        }
        
        const animateNoise = (currentTime) => {
            // Throttle to 30fps
            if (currentTime - this.noiseLastUpdate >= this.noiseFrameTime) {
                const noiseElement = document.getElementById('noiseTurbulence');
                if (noiseElement) {
                    // Smoothly increment seed with very small increments
                    // With numOctaves="1" and low baseFrequency, small increments create smoother transitions
                    this.noiseSeed = (this.noiseSeed + this.noiseSeedIncrement) % 100;
                    noiseElement.setAttribute('seed', this.noiseSeed);
                }
                this.noiseLastUpdate = currentTime;
            }
            this.noiseAnimationFrameId = requestAnimationFrame(animateNoise);
        };
        
        this.noiseAnimationFrameId = requestAnimationFrame(animateNoise);
    }
    
    /**
     * Stop noise animation
     */
    stopNoiseAnimation() {
        if (this.noiseAnimationFrameId) {
            cancelAnimationFrame(this.noiseAnimationFrameId);
            this.noiseAnimationFrameId = null;
        }
    }
    
    /**
     * Update track title text (called when track changes)
     * @param {string} title - Track title
     */
    updateTrackTitle(title) {
        if (this.titleTextElement) {
            // Remove any parentheses and their contents from the title
            const cleanedTitle = title ? title.replace(/\s*\([^)]*\)/g, '').trim() : '';
            this.titleTextElement.textContent = cleanedTitle;
        }
        // Reset state for new track
        this.hide();
        this.titleDisplayState.hasShown = false;
    }
    
    /**
     * Show title display with fade in
     */
    show() {
        if (!this.titleDisplayElement || this.titleDisplayState.isVisible || this.titleDisplayState.isAnimating) {
            return;
        }
        
        this.titleDisplayState.isAnimating = true;
        this.titleDisplayElement.classList.add('visible');
        
        // Mark as animating, then visible after transition
        setTimeout(() => {
            this.titleDisplayState.isVisible = true;
            this.titleDisplayState.isAnimating = false;
        }, 650); // Match CSS transition duration (--effects-slow)
    }
    
    /**
     * Hide title display with fade out
     */
    hide() {
        if (!this.titleDisplayElement || !this.titleDisplayState.isVisible) {
            return;
        }
        
        this.titleDisplayState.isAnimating = true;
        this.titleDisplayElement.classList.remove('visible');
        
        // Clear any pending animations
        if (this.titleDisplayState.animationTimeout) {
            clearTimeout(this.titleDisplayState.animationTimeout);
            this.titleDisplayState.animationTimeout = null;
        }
        
        // Mark as hidden after transition
        setTimeout(() => {
            this.titleDisplayState.isVisible = false;
            this.titleDisplayState.isAnimating = false;
        }, 650); // Match CSS transition duration (--effects-slow)
    }
    
    /**
     * Check if we should show title based on playback progress
     * @param {number} playbackProgress - Playback progress (0.0 to 1.0)
     * @param {number} duration - Track duration in seconds
     */
    checkTitleDisplay(playbackProgress, duration) {
        if (!this.titleDisplayElement || !duration) return;
        
        const triggerPoint = 0.70; // 70% of track
        const endThreshold = 0.95; // Don't show if within last 5%
        const showDuration = 7000; // Show for 7 seconds
        
        // Don't show if we're in the last 5% of the track
        if (playbackProgress >= endThreshold) {
            if (this.titleDisplayState.isVisible) {
                this.hide();
            }
            return;
        }
        
        // Check if we've reached 70% and haven't shown yet
        if (playbackProgress >= triggerPoint && !this.titleDisplayState.hasShown) {
            this.show();
            this.titleDisplayState.hasShown = true;
            
            // Auto-hide after showDuration
            this.titleDisplayState.animationTimeout = setTimeout(() => {
                this.hide();
            }, showDuration);
        }
    }
    
    /**
     * Set colors for title display
     * @param {Object} colors - Color object with color, color3, etc.
     */
    setColors(colors) {
        if (colors && colors.color3 && colors.color) {
            // Store base color (color3 - 3rd brightest) and peak color (color - brightest)
            this.titleBaseColor = colors.color3;
            this.titlePeakColor = colors.color;
            
            // Initialize current color if not set
            if (!this.currentTitleColor) {
                this.currentTitleColor = [...this.titleBaseColor];
            }
            
            // Update color immediately if title is visible
            this.updateTitleColor();
        }
    }
    
    /**
     * Update title color based on current interpolation
     */
    updateTitleColor() {
        if (!this.titleTextElement || !this.currentTitleColor) return;
        
        const [r, g, b] = this.currentTitleColor;
        const colorString = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.9)`;
        this.titleTextElement.style.color = colorString;
    }
    
    /**
     * Update title display with audio reactivity
     * @param {Object} audioData - Audio analysis data
     * @param {string} currentShaderName - Current shader name (optional)
     */
    updateAudioReactivity(audioData, currentShaderName = '') {
        if (!this.titleDisplayElement) return;
        
        // Only update opacity and color when title is actually visible
        if (!this.titleDisplayState.isVisible) return;
        
        // Get peak volume from audio data (0.0 to 1.0)
        const peakVolume = audioData?.peakVolume || 0;
        
        // Cubic bezier easing function
        // Maps input t (0-1) to eased output (0-1) using cubic bezier control points
        const cubicBezierEase = (t, x1, y1, x2, y2) => {
            // Binary search to find the t parameter that gives us x = input t
            let low = 0;
            let high = 1;
            let mid;
            const epsilon = 0.0001;
            const maxIterations = 20;
            
            for (let i = 0; i < maxIterations; i++) {
                mid = (low + high) / 2;
                // Calculate x-coordinate at mid
                const cx = 3 * (1 - mid) * (1 - mid) * mid * x1 + 
                           3 * (1 - mid) * mid * mid * x2 + 
                           mid * mid * mid;
                
                if (Math.abs(cx - t) < epsilon) break;
                if (cx < t) {
                    low = mid;
                } else {
                    high = mid;
                }
            }
            
            // Calculate y-coordinate at the found t
            const cy = 3 * (1 - mid) * (1 - mid) * mid * y1 + 
                       3 * (1 - mid) * mid * mid * y2 + 
                       mid * mid * mid;
            return cy;
        };
        
        // Define max opacity (0 to maxOpacity range)
        const maxOpacity = 0.15; // Adjust as needed
        
        // Get current shader name to determine minOpacity
        const minOpacity = 0.15;
        
        // Apply cubic bezier easing to peak volume
        const easedVolume = cubicBezierEase(peakVolume, 0.6, 0.0, 0.8, 1.0);
        
        // Interpolate eased volume (0-1) to opacity (minOpacity to minOpacity + maxOpacity)
        const finalOpacity = minOpacity + easedVolume * maxOpacity;
        
        // Update CSS custom property for opacity on text element
        if (this.titleTextElement) {
            this.titleTextElement.style.setProperty('--audio-opacity', finalOpacity);
        }
        
        // Update color based on peak volume
        // Interpolate between base color (color3) and peak color (color) based on eased volume
        // Use a threshold for peak color transition (e.g., 0.7 = 70% volume triggers peak color)
        if (this.titleBaseColor && this.titlePeakColor) {
            const peakColorThreshold = 0.7; // Volume threshold for peak color
            const colorMixFactor = Math.min(1.0, Math.max(0.0, (peakVolume - peakColorThreshold) / (1.0 - peakColorThreshold)));
            
            // Apply easing to color mix for smoother transition
            const easedColorMix = cubicBezierEase(colorMixFactor, 0.0, 0.0, 0.58, 1.0);
            
            // Interpolate between base and peak colors
            const newColor = [
                this.titleBaseColor[0] + (this.titlePeakColor[0] - this.titleBaseColor[0]) * easedColorMix,
                this.titleBaseColor[1] + (this.titlePeakColor[1] - this.titleBaseColor[1]) * easedColorMix,
                this.titleBaseColor[2] + (this.titlePeakColor[2] - this.titleBaseColor[2]) * easedColorMix
            ];
            
            // Smooth transition: interpolate current color toward new color
            const colorTransitionSpeed = 0.15; // How fast color transitions (0-1, higher = faster)
            this.currentTitleColor = [
                this.currentTitleColor[0] + (newColor[0] - this.currentTitleColor[0]) * colorTransitionSpeed,
                this.currentTitleColor[1] + (newColor[1] - this.currentTitleColor[1]) * colorTransitionSpeed,
                this.currentTitleColor[2] + (newColor[2] - this.currentTitleColor[2]) * colorTransitionSpeed
            ];
            
            // Update title color
            this.updateTitleColor();
        }
    }
    
    /**
     * Start title display monitoring
     */
    startMonitoring() {
        if (this.titleDisplayState.updateInterval) {
            clearInterval(this.titleDisplayState.updateInterval);
        }
        
        // Start noise animation when monitoring starts
        this.startNoiseAnimation();
        
        // Check every 100ms (same as seek update)
        this.titleDisplayState.updateInterval = setInterval(() => {
            if (!this.audioAnalyzer?.audioElement) return;
            
            const currentTime = this.audioAnalyzer.audioElement.currentTime;
            const duration = this.audioAnalyzer.audioElement.duration;
            
            if (duration && isFinite(duration)) {
                const playbackProgress = currentTime / duration;
                this.checkTitleDisplay(playbackProgress, duration);
            }
        }, 100);
    }
    
    /**
     * Stop title display monitoring
     */
    stopMonitoring() {
        if (this.titleDisplayState.updateInterval) {
            clearInterval(this.titleDisplayState.updateInterval);
            this.titleDisplayState.updateInterval = null;
        }
        
        // Stop noise animation when monitoring stops
        this.stopNoiseAnimation();
    }
    
    /**
     * Clean up and destroy the component
     */
    destroy() {
        this.stopMonitoring();
        this.stopNoiseAnimation();
        
        // Clear any pending timeouts
        if (this.titleDisplayState.animationTimeout) {
            clearTimeout(this.titleDisplayState.animationTimeout);
            this.titleDisplayState.animationTimeout = null;
        }
    }
}

