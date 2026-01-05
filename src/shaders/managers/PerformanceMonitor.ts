// PerformanceMonitor - Monitors frame performance and adjusts quality
// Tracks FPS and automatically adjusts rendering quality

import { safeSentryMetric, isSentryAvailable } from '../../core/monitoring/SentryInit.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';

interface PerformanceMonitorConfig {
    enabled?: boolean;
    initialQuality?: number;
    targetFPS?: number;
    minTargetFPS?: number;
    maxTargetFPS?: number;
    enableAdaptiveFPS?: boolean;
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
    // Circular buffer for frame times (replaces Array to avoid O(n) shift operations)
    private frameTimesBuffer: Float32Array;
    private frameTimesIndex: number = 0;
    private frameTimesCount: number = 0; // Number of valid entries in buffer
    private frameTimesSum: number = 0; // Running sum for O(1) average calculation
    
    enabled: boolean;
    qualityLevel: number;
    targetFPS: number;
    minTargetFPS: number;
    maxTargetFPS: number;
    enableAdaptiveFPS: boolean;
    maxResolutionWidth: number;
    maxResolutionHeight: number;
    maxDPR: number;
    lastFrameTime: number;
    frameHistorySize: number;
    earlyCheckFrameCount: number;
    private onTargetFPSChange: ((newTargetFPS: number) => void) | null = null;
    private consecutiveGoodFrames: number = 0;
    private consecutiveBadFrames: number = 0;
    private readonly framesNeededForUpgrade: number = 30;
    private readonly framesNeededForDowngrade: number = 15;
    private readonly fpsUpgradeThreshold: number = 1.15;
    private readonly fpsDowngradeThreshold: number = 0.85;
    
    constructor(config: PerformanceMonitorConfig = {}) {
        this.frameHistorySize = 30; // Track last 30 frames (reduced from 60 for faster adjustments)
        this.frameTimesBuffer = new Float32Array(this.frameHistorySize);
        this.frameTimesIndex = 0;
        this.frameTimesCount = 0;
        this.frameTimesSum = 0;
        
        this.enabled = config.enabled ?? true;
        
        // Detect mobile and set lower initial quality for better stability
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const defaultInitialQuality = isMobile ? 0.6 : 1.0; // Start at 60% on mobile, 100% on desktop
        this.qualityLevel = config.initialQuality ?? defaultInitialQuality;
        this.minTargetFPS = config.minTargetFPS ?? 30;
        this.maxTargetFPS = config.maxTargetFPS ?? 60;
        this.enableAdaptiveFPS = config.enableAdaptiveFPS ?? true;
        // Start at minTargetFPS, will adapt upward if performance allows
        this.targetFPS = config.targetFPS ?? this.minTargetFPS;
        this.maxResolutionWidth = config.maxResolutionWidth ?? 2560;
        this.maxResolutionHeight = config.maxResolutionHeight ?? 1440;
        this.maxDPR = config.maxDPR ?? 2.0;
        
        this.lastFrameTime = 0;
        this.earlyCheckFrameCount = 10; // Early quality check after 10 frames for faster ramp-up
    }
    
    /**
     * Set callback for when target FPS changes
     * @param callback - Callback function (newTargetFPS) => void
     */
    setTargetFPSCallback(callback: ((newTargetFPS: number) => void) | null): void {
        this.onTargetFPSChange = callback;
    }
    
    /**
     * Record a frame time
     * @param frameTime - Frame time in milliseconds
     * @param onQualityChange - Callback when quality changes (newQuality) => void
     * @returns Performance metrics
     */
    recordFrame(frameTime: number, onQualityChange: ((newQuality: number) => void) | null = null): PerformanceMetrics | null {
        if (!this.enabled) return null;
        
        // Circular buffer: remove old value from sum if buffer is full
        if (this.frameTimesCount >= this.frameHistorySize) {
            const oldValue = this.frameTimesBuffer[this.frameTimesIndex];
            this.frameTimesSum -= oldValue;
        } else {
            this.frameTimesCount++;
        }
        
        // Add new value to circular buffer
        this.frameTimesBuffer[this.frameTimesIndex] = frameTime;
        this.frameTimesSum += frameTime;
        
        // Advance index (circular)
        this.frameTimesIndex = (this.frameTimesIndex + 1) % this.frameHistorySize;
        
        // Calculate average using pre-calculated sum (O(1) instead of O(n))
        const avgFrameTime = this.frameTimesSum / this.frameTimesCount;
        const currentFPS = 1000 / avgFrameTime;
        
        // Early quality check for faster initial ramp-up (after 10 frames, then every 5 frames)
        // Check more frequently during early frames for faster ramp-up
        if (this.frameTimesCount >= this.earlyCheckFrameCount && 
            this.frameTimesCount < this.frameHistorySize && 
            this.qualityLevel < 1.0 &&
            this.frameTimesCount % 5 === 0) { // Check every 5 frames after initial check
            // More aggressive threshold: if performance is at or above target, boost quality
            // For beefy machines, this should trigger immediately
            if (currentFPS >= this.targetFPS) {
                const previousQuality = this.qualityLevel;
                // Jump directly to full quality if performance is good
                this.qualityLevel = 1.0;
                ShaderLogger.info(`Performance: Early quality boost to 100% (FPS: ${currentFPS.toFixed(1)}, frames: ${this.frameTimesCount})`);
                
                // Notify if quality changed
                if (onQualityChange && previousQuality !== this.qualityLevel) {
                    onQualityChange(this.qualityLevel);
                }
            }
        }
        
        // Full performance check every N frames (after collecting enough data)
        if (this.frameTimesCount === this.frameHistorySize) {
            // Send metrics to Sentry
            this.sendMetrics(currentFPS, avgFrameTime);
            
            // Update debug display
            this.updateDebugDisplay(currentFPS);
            
            // Auto-adjust quality
            const previousQuality = this.qualityLevel;
            this.adjustQuality(currentFPS);
            
            // Adjust target FPS based on performance
            this.adjustTargetFPS(currentFPS);
            
            // Notify if quality changed
            if (onQualityChange && previousQuality !== this.qualityLevel) {
                onQualityChange(this.qualityLevel);
            }
        }
        
        return {
            avgFPS: this.frameTimesCount > 0 ? currentFPS : 0,
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
     * Adjust target FPS based on performance
     * Upgrades to higher FPS if performance is consistently good
     * Downgrades to lower FPS if performance drops
     * @param currentFPS - Current achieved FPS
     */
    private adjustTargetFPS(currentFPS: number): void {
        if (!this.enableAdaptiveFPS) return;
        
        const targetFPSThreshold = this.targetFPS * this.fpsUpgradeThreshold;
        const minFPSThreshold = this.targetFPS * this.fpsDowngradeThreshold;
        
        // Check if we should upgrade to higher FPS
        if (this.targetFPS < this.maxTargetFPS && currentFPS >= targetFPSThreshold) {
            this.consecutiveGoodFrames++;
            this.consecutiveBadFrames = 0;
            
            if (this.consecutiveGoodFrames >= this.framesNeededForUpgrade) {
                const previousTargetFPS = this.targetFPS;
                // Upgrade to next tier (30 -> 60)
                this.targetFPS = this.maxTargetFPS;
                this.consecutiveGoodFrames = 0;
                
                ShaderLogger.info(
                    `Performance: Upgrading target FPS from ${previousTargetFPS} to ${this.targetFPS} ` +
                    `(achieved: ${currentFPS.toFixed(1)} FPS)`
                );
                
                // Notify callback
                if (this.onTargetFPSChange) {
                    this.onTargetFPSChange(this.targetFPS);
                }
            }
        }
        // Check if we should downgrade to lower FPS
        else if (this.targetFPS > this.minTargetFPS && currentFPS < minFPSThreshold) {
            this.consecutiveBadFrames++;
            this.consecutiveGoodFrames = 0;
            
            if (this.consecutiveBadFrames >= this.framesNeededForDowngrade) {
                const previousTargetFPS = this.targetFPS;
                // Downgrade to minimum
                this.targetFPS = this.minTargetFPS;
                this.consecutiveBadFrames = 0;
                
                ShaderLogger.info(
                    `Performance: Downgrading target FPS from ${previousTargetFPS} to ${this.targetFPS} ` +
                    `(achieved: ${currentFPS.toFixed(1)} FPS)`
                );
                
                // Notify callback
                if (this.onTargetFPSChange) {
                    this.onTargetFPSChange(this.targetFPS);
                }
            }
        }
        // Reset counters if performance is in acceptable range
        else {
            // Only reset if we're not already at the target threshold
            if (currentFPS >= minFPSThreshold && currentFPS < targetFPSThreshold) {
                // Performance is acceptable, reset counters gradually
                this.consecutiveGoodFrames = Math.max(0, this.consecutiveGoodFrames - 1);
                this.consecutiveBadFrames = Math.max(0, this.consecutiveBadFrames - 1);
            }
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
            const targetFpsElement = document.getElementById('targetFps');
            
            if (fpsElement) {
                fpsElement.textContent = currentFPS.toFixed(1);
                
                // Color code based on performance relative to current target
                if (currentFPS < this.targetFPS * 0.8) {
                    fpsElement.style.color = '#ff4444'; // Red if low
                } else if (currentFPS > this.targetFPS * 1.1) {
                    fpsElement.style.color = '#44ff44'; // Green if high
                } else {
                    fpsElement.style.color = '#fff'; // White if on target
                }
            }
            
            // Update target FPS display
            if (targetFpsElement) {
                targetFpsElement.textContent = this.targetFPS.toString();
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
        this.frameTimesBuffer.fill(0);
        this.frameTimesIndex = 0;
        this.frameTimesCount = 0;
        this.frameTimesSum = 0;
        this.lastFrameTime = 0;
        this.consecutiveGoodFrames = 0;
        this.consecutiveBadFrames = 0;
        // Reset to minimum target FPS on reset
        this.targetFPS = this.minTargetFPS;
    }
}

