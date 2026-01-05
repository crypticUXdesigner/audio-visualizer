// Audio Reactivity Manager
// Manages audio-reactive parameter smoothing and processing

import { getAudioValue } from '../utils/audioSourceSelector.js';
import { getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';
import { BezierSolver } from '../utils/BezierSolver.js';
import type { ExtendedAudioData } from '../../types/index.js';
import type { AudioReactivityConfig, CubicBezierCurve } from '../../types/audio-reactivity.js';

/**
 * Manages audio-reactive parameter smoothing and processing
 */
export class AudioReactivityManager {
    private smoothingStates: Map<string, number> = new Map();
    private speedAccumulations: Map<string, number> = new Map(); // For speed mode: accumulated speed values
    
    // Bezier curve cache to avoid expensive recalculations
    // Cache key: curve signature (x1,y1,x2,y2), value: Map of quantized input -> output
    private bezierCache: Map<string, Map<number, number>> = new Map();
    private readonly BEZIER_CACHE_RESOLUTION = 128; // Cache 128 quantized values per curve
    
    /**
     * Get default linear bezier curve
     */
    private getDefaultCurve(): CubicBezierCurve {
        return { x1: 0, y1: 0, x2: 1, y2: 1 };
    }
    
    /**
     * Generate cache key for bezier curve
     */
    private getBezierCacheKey(curve: CubicBezierCurve): string {
        // Round to 4 decimal places to group similar curves
        return `${curve.x1.toFixed(4)},${curve.y1.toFixed(4)},${curve.x2.toFixed(4)},${curve.y2.toFixed(4)}`;
    }
    
    /**
     * Apply cubic bezier curve to smoothed audio value with caching
     * Always calculates exact values for smoothness, but caches results for performance
     * @param value - Smoothed audio value (0-1)
     * @param curve - Cubic bezier curve configuration
     * @param cacheKey - Optional cache key for this curve (for performance)
     * @returns Eased value (0-1)
     */
    private applyBezierCurve(value: number, curve: CubicBezierCurve, cacheKey?: string): number {
        const clampedValue = Math.max(0, Math.min(1, value));
        
        // Use provided cache key or generate one
        const key = cacheKey ?? this.getBezierCacheKey(curve);
        
        // Get or create cache for this curve
        let curveCache = this.bezierCache.get(key);
        if (!curveCache) {
            curveCache = new Map();
            this.bezierCache.set(key, curveCache);
            
            // Limit total cache size (keep most recent curves)
            if (this.bezierCache.size > 10) {
                const firstKey = this.bezierCache.keys().next().value;
                this.bezierCache.delete(firstKey);
            }
        }
        
        // Quantize for cache lookup (but we'll calculate exact value)
        const quantized = Math.floor(clampedValue * this.BEZIER_CACHE_RESOLUTION) / this.BEZIER_CACHE_RESOLUTION;
        const distance = Math.abs(clampedValue - quantized);
        const threshold = 1 / (this.BEZIER_CACHE_RESOLUTION * 2); // Half step threshold
        
        // Check if we have cached values nearby that we can use for interpolation
        const cached = curveCache.get(quantized);
        if (cached !== undefined && distance < threshold) {
            // Input is very close to a cached quantized point
            // Try to interpolate with neighbor for better accuracy
            const nextQuantized = quantized + (1 / this.BEZIER_CACHE_RESOLUTION);
            const nextCached = curveCache.get(nextQuantized);
            
            if (nextCached !== undefined && clampedValue > quantized) {
                // Interpolate between two cached points for smoothness
                const t = (clampedValue - quantized) * this.BEZIER_CACHE_RESOLUTION;
                return cached + (nextCached - cached) * t;
            }
            
            // Very close to cached point - use it directly (saves calculation)
            if (distance < threshold * 0.5) {
                return cached;
            }
        }
        
        // Always calculate exact value for smooth animation
        // This ensures we get precise bezier curve results even for small input changes
        const result = BezierSolver.solve(
            clampedValue,
            curve.x1,
            curve.y1,
            curve.x2,
            curve.y2
        );
        
        // Cache the result with quantized key for future approximate lookups
        // This helps when we have similar values in the future
        curveCache.set(quantized, result);
        
        // Limit cache size per curve to prevent memory growth
        if (curveCache.size > this.BEZIER_CACHE_RESOLUTION * 2) {
            const firstKey = curveCache.keys().next().value;
            curveCache.delete(firstKey);
        }
        
        return result;
    }
    
    /**
     * Get accumulated speed for speed mode (continuous forward progression)
     * @param paramName - Parameter name (used as key for accumulation state)
     * @param audioData - Extended audio data
     * @param config - Audio reactivity configuration
     * @param deltaTime - Time since last frame (seconds)
     * @param startValue - Base speed (always applied)
     * @param targetValue - Maximum speed
     * @returns Accumulated speed value that never decreases
     */
    getAccumulatedSpeed(
        paramName: string,
        audioData: ExtendedAudioData | null,
        config: AudioReactivityConfig,
        deltaTime: number,
        startValue: number,
        targetValue: number
    ): number {
        if (!audioData) {
            // No audio: return base speed
            const stateKey = `${paramName}_speed`;
            const currentAccumulation = this.speedAccumulations.get(stateKey) || startValue;
            // Decay towards base speed if above it
            if (currentAccumulation > startValue) {
                const decayRate = 0.5; // Decay rate per second
                const newValue = Math.max(startValue, currentAccumulation - (decayRate * deltaTime));
                this.speedAccumulations.set(stateKey, newValue);
                return newValue;
            }
            return startValue;
        }
        
        // Get raw audio value
        let rawValue = getAudioValue(audioData, config.source);
        
        // Apply smoothing if attack/release specified
        if (config.attackNote || config.releaseNote) {
            const stateKey = `${paramName}_${config.source}`;
            let currentValue = this.smoothingStates.get(stateKey) || 0;
            
            const bpm = audioData.estimatedBPM || 0;
            const attackTime = config.attackNote 
                ? getTempoRelativeTimeConstant(config.attackNote, bpm, 0.01)
                : 0.01;
            const releaseTime = config.releaseNote
                ? getTempoRelativeTimeConstant(config.releaseNote, bpm, 0.1)
                : 0.1;
            
            currentValue = applyTempoRelativeSmoothing(
                currentValue,
                rawValue,
                deltaTime,
                attackTime,
                releaseTime
            );
            
            this.smoothingStates.set(stateKey, currentValue);
            rawValue = currentValue;
        }
        
        // Apply bezier curve if configured
        if (config.curve) {
            // Generate cache key once per parameter for better cache hits
            const curveCacheKey = this.getBezierCacheKey(config.curve);
            rawValue = this.applyBezierCurve(rawValue, config.curve, curveCacheKey);
        }
        
        // Calculate target speed based on audio (0-1 maps to startValue-targetValue)
        const targetSpeed = startValue + (rawValue * (targetValue - startValue));
        
        // Accumulate speed: always move towards target, but never decrease
        // This ensures continuous forward progression - speed can only increase or stay constant
        const stateKey = `${paramName}_speed`;
        let currentAccumulation = this.speedAccumulations.get(stateKey) || startValue;
        
        // Always accumulate towards target, but only allow increases
        // Use a smooth approach rate to avoid sudden jumps
        const approachRate = 3.0; // How fast to approach target (per second)
        const speedDiff = targetSpeed - currentAccumulation;
        
        // Only accumulate if target is higher than current (never decrease)
        if (targetSpeed > currentAccumulation) {
            const change = speedDiff * approachRate * deltaTime;
            currentAccumulation = Math.min(targetValue, currentAccumulation + change);
        }
        // If target is lower, keep current speed (don't decrease)
        // This ensures continuous forward progression
        
        // Ensure we never go below base speed
        currentAccumulation = Math.max(startValue, currentAccumulation);
        
        this.speedAccumulations.set(stateKey, currentAccumulation);
        return currentAccumulation;
    }
    
    /**
     * Get smoothed audio value for a parameter
     * @param paramName - Parameter name (used as key for smoothing state)
     * @param audioData - Extended audio data
     * @param config - Audio reactivity configuration
     * @param deltaTime - Time since last frame (seconds)
     * @returns Processed audio value (0-1 range for interpolation mode, or processed value for additive mode)
     */
    getSmoothedValue(
        paramName: string,
        audioData: ExtendedAudioData | null,
        config: AudioReactivityConfig,
        deltaTime: number
    ): number {
        if (!audioData) return 0;
        
        // Get raw audio value
        let rawValue = getAudioValue(audioData, config.source);
        
        // Apply smoothing if attack/release specified
        if (config.attackNote || config.releaseNote) {
            const stateKey = `${paramName}_${config.source}`;
            let currentValue = this.smoothingStates.get(stateKey) || 0;
            
            const bpm = audioData.estimatedBPM || 0;
            const attackTime = config.attackNote 
                ? getTempoRelativeTimeConstant(config.attackNote, bpm, 0.01)
                : 0.01;
            const releaseTime = config.releaseNote
                ? getTempoRelativeTimeConstant(config.releaseNote, bpm, 0.1)
                : 0.1;
            
            currentValue = applyTempoRelativeSmoothing(
                currentValue,
                rawValue,
                deltaTime,
                attackTime,
                releaseTime
            );
            
            this.smoothingStates.set(stateKey, currentValue);
            rawValue = currentValue;
        }
        
        // Apply invert (legacy support)
        if (config.invert) {
            rawValue = 1.0 - rawValue;
        }
        
        // Apply strength multiplier (legacy support)
        if (config.strength !== undefined) {
            rawValue = rawValue * config.strength;
        }
        
        // Apply bezier curve if configured (new system)
        // This applies to both additive and interpolation modes
        if (config.curve) {
            rawValue = this.applyBezierCurve(rawValue, config.curve);
        }
        
        // For interpolation mode, return 0-1 range (will be used to interpolate between min/max)
        // For additive mode, apply min/max mapping if specified (legacy)
        const mode = config.mode || 'additive';
        if (mode === 'interpolation') {
            // Return 0-1 range for interpolation
            return Math.max(0, Math.min(1, rawValue));
        } else {
            // Additive mode: apply min/max mapping if specified (legacy support)
            if (config.min !== undefined || config.max !== undefined) {
                const min = config.min ?? 0;
                const max = config.max ?? 1;
                rawValue = min + (rawValue * (max - min));
            }
            return Math.max(0, Math.min(1, rawValue));
        }
    }
    
    /**
     * Get interpolated value for interpolation mode
     * @param paramName - Parameter name
     * @param audioData - Extended audio data
     * @param config - Audio reactivity configuration
     * @param deltaTime - Time since last frame (seconds)
     * @param minValue - Minimum value for interpolation
     * @param maxValue - Maximum value for interpolation
     * @returns Interpolated value between min and max
     */
    getInterpolatedValue(
        paramName: string,
        audioData: ExtendedAudioData | null,
        config: AudioReactivityConfig,
        deltaTime: number,
        minValue: number,
        maxValue: number
    ): number {
        const audioLevel = this.getSmoothedValue(paramName, audioData, config, deltaTime);
        // Interpolate between min and max based on audio level (0-1)
        return minValue + (audioLevel * (maxValue - minValue));
    }
    
    /**
     * Reset smoothing state for a parameter
     */
    reset(paramName: string): void {
        const keysToDelete: string[] = [];
        this.smoothingStates.forEach((_value, key) => {
            if (key.startsWith(paramName)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.smoothingStates.delete(key));
        
        // Also reset speed accumulations
        const speedKeysToDelete: string[] = [];
        this.speedAccumulations.forEach((_value, key) => {
            if (key.startsWith(paramName)) {
                speedKeysToDelete.push(key);
            }
        });
        speedKeysToDelete.forEach(key => this.speedAccumulations.delete(key));
    }
    
    /**
     * Reset all smoothing states
     */
    resetAll(): void {
        this.smoothingStates.clear();
        this.speedAccumulations.clear();
        this.bezierCache.clear();
    }
}

