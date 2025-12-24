// Ripple Manager Module
// Handles ripple tracking, rate limiting, and data formatting for shader uniforms

import { RIPPLE_CONFIG } from '../../config/constants.js';

interface Ripple {
    startTime: number;
    centerX: number;
    centerY: number;
    intensity: number;
    width: number;
    minRadius: number;
    maxRadius: number;
    intensityMultiplier: number;
    lifetime: number;
    active: number;
}

interface RippleDataCache {
    centers: number[];
    times: number[];
    intensities: number[];
    widths: number[];
    minRadii: number[];
    maxRadii: number[];
    intensityMultipliers: number[];
    active: number[];
}

export interface RippleData {
    centers: number[];
    times: number[];
    intensities: number[];
    widths: number[];
    minRadii: number[];
    maxRadii: number[];
    intensityMultipliers: number[];
    active: number[];
    count: number;
}

export class RippleManager {
    private maxRipples: number;
    private ripples: Ripple[];
    private rippleLifetime: number;
    private rippleCreationTimes: number[];
    private rippleRateLimitWindow: number;
    private rippleRateLimit: number;
    private rippleCooldownUntil: number;
    private rippleCooldownDuration: number;
    private _rippleDataCache: RippleDataCache;
    
    constructor() {
        this.maxRipples = RIPPLE_CONFIG.MAX_COUNT;
        this.ripples = [];
        this.rippleLifetime = RIPPLE_CONFIG.LIFETIME;
        this.rippleCreationTimes = [];
        this.rippleRateLimitWindow = RIPPLE_CONFIG.RATE_LIMIT_WINDOW;
        this.rippleRateLimit = RIPPLE_CONFIG.RATE_LIMIT;
        this.rippleCooldownUntil = 0;
        this.rippleCooldownDuration = RIPPLE_CONFIG.COOLDOWN_DURATION;
        
        // Object pooling for ripple data arrays
        this._rippleDataCache = {
            centers: new Array(this.maxRipples * 2),
            times: new Array(this.maxRipples),
            intensities: new Array(this.maxRipples),
            widths: new Array(this.maxRipples),
            minRadii: new Array(this.maxRipples),
            maxRadii: new Array(this.maxRipples),
            intensityMultipliers: new Array(this.maxRipples),
            active: new Array(this.maxRipples)
        };
    }
    
    /**
     * Check if we can create a new ripple (rate limiting and cooldown)
     */
    canCreateRipple(currentTime: number): boolean {
        // Check if we're in cooldown
        if (currentTime < this.rippleCooldownUntil) {
            return false;
        }
        
        // Remove old creation times outside the window
        const windowStart = currentTime - this.rippleRateLimitWindow;
        this.rippleCreationTimes = this.rippleCreationTimes.filter(time => time > windowStart);
        
        // Check if we've hit the rate limit
        if (this.rippleCreationTimes.length >= this.rippleRateLimit) {
            // Start cooldown
            this.rippleCooldownUntil = currentTime + this.rippleCooldownDuration;
            return false;
        }
        
        return true;
    }
    
    /**
     * Add a new ripple to the tracking system
     */
    addRipple(startTime: number, stereoPos: number, intensity: number, bandType: string = 'mid'): boolean {
        // Check rate limiting and cooldown
        if (!this.canCreateRipple(startTime)) {
            return false;
        }
        
        // Remove expired ripples first
        this.updateRipples(startTime);
        
        // If we're at max capacity, remove the oldest ripple
        if (this.ripples.length >= this.maxRipples) {
            this.ripples.shift();
        }
        
        // Track creation time for rate limiting
        this.rippleCreationTimes.push(startTime);
        
        // Set vertical position based on frequency band
        let centerY = 0.0;
        let rippleWidth = 0.05;
        let rippleMinRadius = 0.0;
        let baseMaxRadius = 1.3;
        let intensityMultiplier = 0.8;
        
        if (bandType === 'bass') {
            const bassBaseY = -0.15;
            const bassMaxY = -0.4;
            centerY = bassBaseY + (bassMaxY - bassBaseY) * intensity;
            rippleWidth = 0.15;
            intensityMultiplier = 0.65;
            baseMaxRadius = 0.88;
        } else if (bandType === 'treble') {
            centerY = 0.25;
            rippleWidth = 0.07;
            rippleMinRadius = 0.0;
            baseMaxRadius = 0.5;
            intensityMultiplier = 0.55;
        }
        
        // Make maxRadius intensity-dependent
        let rippleMaxRadius = baseMaxRadius * (0.5 + intensity * 0.5);
        
        // Calculate dynamic lifetime based on when wave reaches maxRadius
        const rippleSpeed = 0.3;
        const radiusRange = rippleMaxRadius - rippleMinRadius;
        const timeToReachMax = radiusRange / rippleSpeed;
        const rippleLifetime = timeToReachMax + 0.1;
        
        // Add new ripple
        this.ripples.push({
            startTime: startTime,
            centerX: stereoPos,
            centerY: centerY,
            intensity: intensity,
            width: rippleWidth,
            minRadius: rippleMinRadius,
            maxRadius: rippleMaxRadius,
            intensityMultiplier: intensityMultiplier,
            lifetime: rippleLifetime,
            active: 1.0
        });
        
        return true;
    }
    
    /**
     * Update ripple states and remove expired ones
     */
    updateRipples(currentTime: number): void {
        this.ripples = this.ripples.filter(ripple => {
            const age = (currentTime - ripple.startTime) / 1000.0;
            const lifetime = ripple.lifetime !== undefined ? ripple.lifetime : this.rippleLifetime;
            if (age > lifetime) {
                return false;
            }
            return true;
        });
    }
    
    /**
     * Get ripple data as arrays for shader uniforms
     */
    getRippleData(currentTime: number): RippleData {
        // Update ripples to remove expired ones
        this.updateRipples(currentTime);
        
        // Reuse cached arrays
        const centers = this._rippleDataCache.centers;
        const times = this._rippleDataCache.times;
        const intensities = this._rippleDataCache.intensities;
        const widths = this._rippleDataCache.widths;
        const minRadii = this._rippleDataCache.minRadii;
        const maxRadii = this._rippleDataCache.maxRadii;
        const intensityMultipliers = this._rippleDataCache.intensityMultipliers;
        const active = this._rippleDataCache.active;
        
        // Zero out arrays
        for (let i = 0; i < this.maxRipples * 2; i++) {
            centers[i] = 0;
        }
        for (let i = 0; i < this.maxRipples; i++) {
            times[i] = 0;
            intensities[i] = 0;
            widths[i] = 0;
            minRadii[i] = 0;
            maxRadii[i] = 0;
            intensityMultipliers[i] = 0;
            active[i] = 0;
        }
        
        // Fill with active ripple data
        this.ripples.forEach((ripple, index) => {
            if (index >= this.maxRipples) return;
            
            const age = (currentTime - ripple.startTime) / 1000.0;
            
            centers[index * 2] = ripple.centerX;
            centers[index * 2 + 1] = ripple.centerY;
            times[index] = age;
            intensities[index] = ripple.intensity;
            widths[index] = ripple.width || 0.1;
            minRadii[index] = ripple.minRadius !== undefined ? ripple.minRadius : 0.0;
            maxRadii[index] = ripple.maxRadius !== undefined ? ripple.maxRadius : 1.5;
            intensityMultipliers[index] = ripple.intensityMultiplier !== undefined ? ripple.intensityMultiplier : 1.0;
            active[index] = 1.0;
        });
        
        return {
            centers,
            times,
            intensities,
            widths,
            minRadii,
            maxRadii,
            intensityMultipliers,
            active,
            count: this.ripples.length
        };
    }
    
    /**
     * Reset all ripples
     */
    reset(): void {
        this.ripples = [];
        this.rippleCreationTimes = [];
        this.rippleCooldownUntil = 0;
    }
}

