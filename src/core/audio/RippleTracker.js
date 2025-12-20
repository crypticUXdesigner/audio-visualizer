// Ripple Tracking Module
// Handles ripple tracking system, rate limiting, and ripple data arrays

export class RippleTracker {
    constructor() {
        // Multiple ripple tracking system
        // Each ripple: { startTime, centerX, centerY, intensity, active }
        this.maxRipples = 12; // Maximum number of simultaneous ripples
        this.ripples = []; // Array of active ripples
        this.rippleLifetime = 2.0; // Ripples fade out after 2 seconds
        
        // Rate limiting and cooldown system
        this.rippleCreationTimes = []; // Track when ripples were created (for rate limiting)
        this.rippleRateLimitWindow = 500; // 500ms window
        this.rippleRateLimit = 9; // Max 10 ripples in 500ms window
        this.rippleCooldownUntil = 0; // Timestamp when cooldown ends
        this.rippleCooldownDuration = 300; // 300ms cooldown after hitting rate limit
        
        // Object pooling for ripple data arrays (performance optimization)
        // Reuse arrays instead of allocating new ones every frame
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
     * @param {number} currentTime - Current timestamp (milliseconds)
     * @returns {boolean} True if ripple can be created
     */
    canCreateRipple(currentTime) {
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
     * @param {number} startTime - Timestamp when ripple started (milliseconds)
     * @param {number} stereoPos - Stereo position (-1 to 1)
     * @param {number} intensity - Intensity of the beat (0-1)
     * @param {string} bandType - Frequency band type: 'bass', 'mid', or 'treble'
     * @returns {boolean} True if ripple was created, false if rate limited
     */
    addRipple(startTime, stereoPos, intensity, bandType = 'mid') {
        // Check rate limiting and cooldown
        if (!this.canCreateRipple(startTime)) {
            return false; // Rate limited or in cooldown
        }
        
        // Remove expired ripples first
        this.updateRipples(startTime);
        
        // If we're at max capacity, remove the oldest ripple
        if (this.ripples.length >= this.maxRipples) {
            this.ripples.shift(); // Remove oldest
        }
        
        // Track creation time for rate limiting
        this.rippleCreationTimes.push(startTime);
        
        // Set vertical position based on frequency band
        // Bass: starts at 20% down from center (-0.2), intensity moves it lower (max -0.9 at 90% from top)
        // Mid: centered (0.0)
        // Treble: 20% up from center (+0.2) - 10% closer to center than before
        let centerY = 0.0;
        let rippleWidth = 0.05; // Default width
        let rippleMinRadius = 0.0; // Default min radius
        let baseMaxRadius = 1.3; // Base max radius (will be scaled by intensity)
        let intensityMultiplier = 0.8; // Default intensity multiplier
        
        if (bandType === 'bass') {
            // Base position: 20% down from center (-0.2)
            // Intensity-based offset: more intense = lower position
            // Intensity 0.0 → -0.2 (base), Intensity 1.0 → -0.9 (90% from top)
            // Formula: base + (maxOffset - base) * intensity
            const bassBaseY = -0.15; // 20% down from center
            const bassMaxY = -0.4; // 90% from top (max distance)
            centerY = bassBaseY + (bassMaxY - bassBaseY) * intensity;
            rippleWidth = 0.15; // Reduced from 0.2 (narrower rings, less prominent)
            intensityMultiplier = 0.65; // Reduced from 0.75 (less bright)
            baseMaxRadius = 0.88; // Bass base max radius (reduced for ~30% shorter lifetime)
        } else if (bandType === 'treble') {
            centerY = 0.25; // 20% up from center (10% closer than before)
            rippleWidth = 0.07; // Thinner rings
            rippleMinRadius = 0.0; // Smaller min radius
            baseMaxRadius = 0.5; // Treble base max radius (smaller)
            intensityMultiplier = 0.55; // Less intensity (60% of normal)
        }
        // else: mid stays at defaults
        
        // Make maxRadius intensity-dependent: stronger beats create larger ripples
        // Scale from 0.5x to 1.0x of base max radius based on intensity
        let rippleMaxRadius = baseMaxRadius * (0.5 + intensity * 0.5);
        
        // Calculate dynamic lifetime based on when wave reaches maxRadius
        // Ripple speed matches shader's default uRippleSpeed (0.3)
        const rippleSpeed = 0.3;
        const radiusRange = rippleMaxRadius - rippleMinRadius;
        const timeToReachMax = radiusRange / rippleSpeed;
        // Add small buffer to ensure fade completes (0.1 seconds)
        const rippleLifetime = timeToReachMax + 0.1;
        
        // Add new ripple
        this.ripples.push({
            startTime: startTime,
            centerX: stereoPos, // Will be scaled in shader
            centerY: centerY, // Vertical position based on frequency band
            intensity: intensity,
            width: rippleWidth, // Per-ripple width
            minRadius: rippleMinRadius, // Per-ripple min radius
            maxRadius: rippleMaxRadius, // Per-ripple max radius (intensity-based)
            intensityMultiplier: intensityMultiplier, // Per-ripple intensity multiplier
            lifetime: rippleLifetime, // Per-ripple dynamic lifetime
            active: 1.0
        });
        
        return true;
    }
    
    /**
     * Update ripple states and remove expired ones
     * @param {number} currentTime - Current timestamp (milliseconds)
     */
    updateRipples(currentTime) {
        this.ripples = this.ripples.filter(ripple => {
            const age = (currentTime - ripple.startTime) / 1000.0; // Age in seconds
            // Use per-ripple lifetime if available, otherwise fall back to class property
            const lifetime = ripple.lifetime !== undefined ? ripple.lifetime : this.rippleLifetime;
            if (age > lifetime) {
                return false; // Remove expired ripple
            }
            return true; // Keep active ripple
        });
    }
    
    /**
     * Get ripple data as arrays for shader uniforms
     * Returns arrays padded to maxRipples length with zeros
     * @param {number} currentTime - Current timestamp (milliseconds)
     * @returns {Object} Ripple data object with arrays
     */
    getRippleData(currentTime) {
        // Update ripples to remove expired ones
        this.updateRipples(currentTime);
        
        // Reuse cached arrays instead of creating new ones (performance optimization)
        const centers = this._rippleDataCache.centers;
        const times = this._rippleDataCache.times;
        const intensities = this._rippleDataCache.intensities;
        const widths = this._rippleDataCache.widths;
        const minRadii = this._rippleDataCache.minRadii;
        const maxRadii = this._rippleDataCache.maxRadii;
        const intensityMultipliers = this._rippleDataCache.intensityMultipliers;
        const active = this._rippleDataCache.active;
        
        // Zero out arrays first (faster than fill() for small arrays)
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
            if (index >= this.maxRipples) return; // Safety check
            
            const age = (currentTime - ripple.startTime) / 1000.0; // Age in seconds
            
            centers[index * 2] = ripple.centerX;
            centers[index * 2 + 1] = ripple.centerY;
            times[index] = age;
            intensities[index] = ripple.intensity;
            widths[index] = ripple.width || 0.1; // Default to 0.1 if not set
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
}

