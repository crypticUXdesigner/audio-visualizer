// PerformanceMonitor - Monitors frame performance and adjusts quality
// Tracks FPS and automatically adjusts rendering quality

import { safeSentryMetric, isSentryAvailable } from '../../core/monitoring/SentryInit.js';

export class PerformanceMonitor {
    constructor(config = {}) {
        this.frameTimes = [];
        this.enabled = config.enabled ?? true;
        this.qualityLevel = config.initialQuality ?? 1.0;
        this.targetFPS = config.targetFPS ?? 30;
        this.maxResolutionWidth = config.maxResolutionWidth ?? 2560;
        this.maxResolutionHeight = config.maxResolutionHeight ?? 1440;
        this.maxDPR = config.maxDPR ?? 2.0;
        
        this.lastFrameTime = 0;
        this.frameHistorySize = 60; // Track last 60 frames
    }
    
    /**
     * Record a frame time
     * @param {number} frameTime - Frame time in milliseconds
     * @param {Function} onQualityChange - Callback when quality changes (newQuality) => void
     * @returns {Object} Performance metrics
     */
    recordFrame(frameTime, onQualityChange = null) {
        if (!this.enabled) return null;
        
        this.frameTimes.push(frameTime);
        
        // Keep only last N frames
        if (this.frameTimes.length > this.frameHistorySize) {
            this.frameTimes.shift();
        }
        
        // Check performance every N frames
        if (this.frameTimes.length === this.frameHistorySize) {
            const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameHistorySize;
            const currentFPS = 1000 / avgFrameTime;
            
            // Send metrics to Sentry
            this.sendMetrics(currentFPS, avgFrameTime);
            
            // Update debug display
            this.updateDebugDisplay(currentFPS);
            
            // Auto-adjust quality
            const previousQuality = this.qualityLevel;
            this.adjustQuality(currentFPS);
            
            // Notify if quality changed
            if (onQualityChange && previousQuality !== this.qualityLevel) {
                onQualityChange(this.qualityLevel);
            }
        }
        
        return {
            avgFPS: this.frameTimes.length > 0 
                ? 1000 / (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length)
                : 0,
            qualityLevel: this.qualityLevel
        };
    }
    
    /**
     * Adjust quality based on FPS
     * @param {number} currentFPS - Current FPS
     */
    adjustQuality(currentFPS) {
        if (currentFPS < this.targetFPS * 0.8 && this.qualityLevel > 0.5) {
            // Reduce quality
            this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
            console.log(`Performance: Reducing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
        } else if (currentFPS > this.targetFPS * 1.2 && this.qualityLevel < 1.0) {
            // Increase quality
            this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.1);
            console.log(`Performance: Increasing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
        }
    }
    
    /**
     * Send metrics to Sentry
     * @param {number} currentFPS - Current FPS
     * @param {number} avgFrameTime - Average frame time in milliseconds
     */
    sendMetrics(currentFPS, avgFrameTime) {
        if (isSentryAvailable()) {
            safeSentryMetric('render.fps', currentFPS, {
                unit: 'none',
                tags: {
                    qualityLevel: this.qualityLevel.toFixed(2),
                    targetFPS: this.targetFPS.toString(),
                },
            });
            
            safeSentryMetric('render.frameTime', avgFrameTime, {
                unit: 'millisecond',
                tags: {
                    qualityLevel: this.qualityLevel.toFixed(2),
                },
            });
        }
    }
    
    /**
     * Update debug display if in debug mode
     * @param {number} currentFPS - Current FPS
     */
    updateDebugDisplay(currentFPS) {
        if (typeof document !== 'undefined' && 
            document.documentElement.classList.contains('debug-mode')) {
            const fpsElement = document.getElementById('currentFps');
            if (fpsElement) {
                fpsElement.textContent = currentFPS.toFixed(1);
                
                // Color code based on performance
                if (currentFPS < this.targetFPS * 0.8) {
                    fpsElement.style.color = '#ff4444'; // Red if low
                } else if (currentFPS > this.targetFPS * 1.1) {
                    fpsElement.style.color = '#44ff44'; // Green if high
                } else {
                    fpsElement.style.color = '#fff'; // White if on target
                }
            }
        }
    }
    
    /**
     * Get current quality level
     * @returns {number} Quality level (0.5-1.0)
     */
    getQualityLevel() {
        return this.qualityLevel;
    }
    
    /**
     * Get performance configuration for resize calculations
     * @returns {Object} Resize configuration
     */
    getResizeConfig() {
        return {
            maxResolutionWidth: this.maxResolutionWidth,
            maxResolutionHeight: this.maxResolutionHeight,
            maxDPR: this.maxDPR,
            qualityLevel: this.qualityLevel
        };
    }
    
    /**
     * Reset performance tracking
     */
    reset() {
        this.frameTimes = [];
        this.lastFrameTime = 0;
    }
}

