// PerformanceMonitor - Monitors frame performance and adjusts quality
// Tracks FPS and automatically adjusts rendering quality

import { safeSentryMetric, isSentryAvailable } from '../../core/monitoring/SentryInit.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';

interface PerformanceMonitorConfig {
    enabled?: boolean;
    initialQuality?: number;
    targetFPS?: number;
    maxResolutionWidth?: number;
    maxResolutionHeight?: number;
    maxDPR?: number;
}

interface ResizeConfig {
    maxResolutionWidth: number;
    maxResolutionHeight: number;
    maxDPR: number;
    qualityLevel: number;
}

interface PerformanceMetrics {
    avgFPS: number;
    qualityLevel: number;
}

export class PerformanceMonitor {
    frameTimes: number[];
    enabled: boolean;
    qualityLevel: number;
    targetFPS: number;
    maxResolutionWidth: number;
    maxResolutionHeight: number;
    maxDPR: number;
    lastFrameTime: number;
    frameHistorySize: number;
    earlyCheckFrameCount: number;
    
    constructor(config: PerformanceMonitorConfig = {}) {
        this.frameTimes = [];
        this.enabled = config.enabled ?? true;
        this.qualityLevel = config.initialQuality ?? 1.0;
        this.targetFPS = config.targetFPS ?? 30;
        this.maxResolutionWidth = config.maxResolutionWidth ?? 2560;
        this.maxResolutionHeight = config.maxResolutionHeight ?? 1440;
        this.maxDPR = config.maxDPR ?? 2.0;
        
        this.lastFrameTime = 0;
        this.frameHistorySize = 30; // Track last 30 frames (reduced from 60 for faster adjustments)
        this.earlyCheckFrameCount = 10; // Early quality check after 10 frames for faster ramp-up
    }
    
    /**
     * Record a frame time
     * @param frameTime - Frame time in milliseconds
     * @param onQualityChange - Callback when quality changes (newQuality) => void
     * @returns Performance metrics
     */
    recordFrame(frameTime: number, onQualityChange: ((newQuality: number) => void) | null = null): PerformanceMetrics | null {
        if (!this.enabled) return null;
        
        this.frameTimes.push(frameTime);
        
        // Keep only last N frames
        if (this.frameTimes.length > this.frameHistorySize) {
            this.frameTimes.shift();
        }
        
        // Early quality check for faster initial ramp-up (after 10 frames, then every 5 frames)
        // Check more frequently during early frames for faster ramp-up
        if (this.frameTimes.length >= this.earlyCheckFrameCount && 
            this.frameTimes.length < this.frameHistorySize && 
            this.qualityLevel < 1.0 &&
            this.frameTimes.length % 5 === 0) { // Check every 5 frames after initial check
            const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
            const currentFPS = 1000 / avgFrameTime;
            
            // More aggressive threshold: if performance is at or above target, boost quality
            // For beefy machines, this should trigger immediately
            if (currentFPS >= this.targetFPS) {
                const previousQuality = this.qualityLevel;
                // Jump directly to full quality if performance is good
                this.qualityLevel = 1.0;
                ShaderLogger.info(`Performance: Early quality boost to 100% (FPS: ${currentFPS.toFixed(1)}, frames: ${this.frameTimes.length})`);
                
                // Notify if quality changed
                if (onQualityChange && previousQuality !== this.qualityLevel) {
                    onQualityChange(this.qualityLevel);
                }
            }
        }
        
        // Full performance check every N frames (after collecting enough data)
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
     * @param currentFPS - Current FPS
     */
    adjustQuality(currentFPS: number): void {
        if (currentFPS < this.targetFPS * 0.8 && this.qualityLevel > 0.5) {
            // Reduce quality
            this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
            ShaderLogger.info(`Performance: Reducing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
        } else if (currentFPS >= this.targetFPS && this.qualityLevel < 1.0) {
            // Increase quality more aggressively - jump to full quality if at or above target
            const previousQuality = this.qualityLevel;
            this.qualityLevel = 1.0;
            ShaderLogger.info(`Performance: Increasing quality to 100% (FPS: ${currentFPS.toFixed(1)})`);
        }
    }
    
    /**
     * Send metrics to Sentry
     * @param currentFPS - Current FPS
     * @param avgFrameTime - Average frame time in milliseconds
     */
    sendMetrics(currentFPS: number, avgFrameTime: number): void {
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
     * @param currentFPS - Current FPS
     */
    updateDebugDisplay(currentFPS: number): void {
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
     * @returns Quality level (0.5-1.0)
     */
    getQualityLevel(): number {
        return this.qualityLevel;
    }
    
    /**
     * Get performance configuration for resize calculations
     * @returns Resize configuration
     */
    getResizeConfig(): ResizeConfig {
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
    reset(): void {
        this.frameTimes = [];
        this.lastFrameTime = 0;
    }
}

