// PixelSizeAnimationManager - Manages pixel size animation on loud triggers
// Handles rate limiting, cooldown, and animation timing

import { ShaderLogger } from '../utils/ShaderLogger.js';

interface PixelSizeAnimationConfig {
    loudTriggerThreshold?: number;
    loudTriggerChangeThreshold?: number;
    duration?: number;
    rateLimitWindow?: number;
    rateLimit?: number;
    cooldownDuration?: number;
}

export class PixelSizeAnimationManager {
    pixelSizeMultiplier: number;
    previousVolume: number;
    loudTriggerThreshold: number;
    loudTriggerChangeThreshold: number;
    pixelSizeAnimationDuration: number;
    pixelSizeAnimationStartTime: number;
    isPixelSizeAnimating: boolean;
    pixelSizeTriggerTimes: number[];
    pixelSizeRateLimitWindow: number;
    pixelSizeRateLimit: number;
    pixelSizeCooldownUntil: number;
    pixelSizeCooldownDuration: number;
    
    constructor(config: PixelSizeAnimationConfig = {}) {
        this.pixelSizeMultiplier = 1.0;
        this.previousVolume = 0.0;
        this.loudTriggerThreshold = config.loudTriggerThreshold ?? 0.25;
        this.loudTriggerChangeThreshold = config.loudTriggerChangeThreshold ?? 0.12;
        this.pixelSizeAnimationDuration = config.duration ?? 0.1; // 100ms
        this.pixelSizeAnimationStartTime = 0;
        this.isPixelSizeAnimating = false;
        
        // Rate limiting
        this.pixelSizeTriggerTimes = [];
        this.pixelSizeRateLimitWindow = config.rateLimitWindow ?? 500; // 500ms
        this.pixelSizeRateLimit = config.rateLimit ?? 4; // Max 4 triggers
        this.pixelSizeCooldownUntil = 0;
        this.pixelSizeCooldownDuration = config.cooldownDuration ?? 500; // 500ms
    }
    
    /**
     * Check if pixel size animation can be triggered
     * @param currentTimeMs - Current timestamp (milliseconds)
     * @returns True if animation can be triggered
     */
    canTriggerPixelSizeAnimation(currentTimeMs: number): boolean {
        // Check if we're in cooldown
        if (currentTimeMs < this.pixelSizeCooldownUntil) {
            return false;
        }
        
        // Remove old trigger times outside the window
        const windowStart = currentTimeMs - this.pixelSizeRateLimitWindow;
        this.pixelSizeTriggerTimes = this.pixelSizeTriggerTimes.filter(time => time > windowStart);
        
        // Check if we've hit the rate limit
        if (this.pixelSizeTriggerTimes.length >= this.pixelSizeRateLimit) {
            // Start cooldown
            this.pixelSizeCooldownUntil = currentTimeMs + this.pixelSizeCooldownDuration;
            return false;
        }
        
        return true;
    }
    
    /**
     * Update animation state based on audio volume
     * @param volume - Current volume (0-1)
     * @param currentTime - Current time in seconds
     * @param currentTimeMs - Current time in milliseconds
     */
    update(volume: number, currentTime: number, currentTimeMs: number): void {
        if (typeof volume !== 'number' || volume < 0 || volume > 1) {
            ShaderLogger.warn('PixelSizeAnimationManager: Invalid volume', { volume });
            return;
        }
        if (typeof currentTime !== 'number' || typeof currentTimeMs !== 'number') {
            ShaderLogger.warn('PixelSizeAnimationManager: Invalid time values', { currentTime, currentTimeMs });
            return;
        }
        
        // Update animation if active
        if (this.isPixelSizeAnimating) {
            const animationElapsed = currentTime - this.pixelSizeAnimationStartTime;
            
            if (animationElapsed >= this.pixelSizeAnimationDuration) {
                // Instant return to normal (no transition)
                this.pixelSizeMultiplier = 1.0;
                this.isPixelSizeAnimating = false;
            }
            // Keep multiplier at 2.0 during the duration (instant doubling, instant return)
        }
        
        // Detect loud trigger
        const volumeChange = volume - this.previousVolume;
        
        // Trigger if volume exceeds threshold AND shows significant increase AND rate limiting allows it
        if (volume > this.loudTriggerThreshold && 
            volumeChange > this.loudTriggerChangeThreshold &&
            !this.isPixelSizeAnimating &&
            this.canTriggerPixelSizeAnimation(currentTimeMs)) {
            // Start pixel size animation
            this.isPixelSizeAnimating = true;
            this.pixelSizeAnimationStartTime = currentTime;
            this.pixelSizeMultiplier = 2.0; // Double the pixel size
            
            // Track trigger time for rate limiting
            this.pixelSizeTriggerTimes.push(currentTimeMs);
        }
        
        // Update previous volume for next frame
        this.previousVolume = volume;
    }
    
    /**
     * Get current pixel size multiplier
     * @returns Multiplier (1.0 = normal, 2.0 = doubled)
     */
    getMultiplier(): number {
        return this.pixelSizeMultiplier;
    }
    
    /**
     * Reset animation state
     */
    reset(): void {
        this.pixelSizeMultiplier = 1.0;
        this.isPixelSizeAnimating = false;
        this.previousVolume = 0.0;
        this.pixelSizeTriggerTimes = [];
        this.pixelSizeCooldownUntil = 0;
    }
}

