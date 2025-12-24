// ShaderConstants - Centralized configuration constants
// All magic numbers and configuration values in one place

export const ShaderConstants = {
    // Performance settings
    performance: {
        targetFPS: 30, // Initial target (will adapt upward if performance allows)
        minTargetFPS: 30, // Minimum target FPS
        maxTargetFPS: 60, // Maximum target FPS
        enableAdaptiveFPS: true, // Enable adaptive FPS
        maxResolutionWidth: 2560,
        maxResolutionHeight: 1440,
        maxDPR: 2.0,
        frameHistorySize: 60,
        qualityAdjustmentStep: 0.1,
        minQuality: 0.5,
        maxQuality: 1.0,
        lowFPSThreshold: 0.8, // 80% of target
        highFPSThreshold: 1.2 // 120% of target
    },
    
    // Time offset settings
    timeOffset: {
        accumulationRate: 0.5,
        decayRate: 0.3,
        maxTimeOffset: 5.0,
        accumulateThreshold: 0.12,
        decayThreshold: 0.08,
        cubicBezier: {
            x1: 0.9,
            y1: 0.0,
            x2: 0.8,
            y2: 1.0
        }
    },
    
    // Pixel size animation settings
    pixelSizeAnimation: {
        loudTriggerThreshold: 0.25,
        loudTriggerChangeThreshold: 0.12,
        duration: 0.1, // seconds
        multiplier: 2.0,
        rateLimitWindow: 500, // milliseconds
        rateLimit: 4,
        cooldownDuration: 500 // milliseconds
    },
    
    // Color transition settings
    colorTransition: {
        duration: 2000, // milliseconds
        easing: 'ease-out-cubic' // 'linear', 'ease-out-cubic', 'ease-in-cubic', 'ease-in-out-cubic'
    },
    
    // Ripple settings
    ripples: {
        maxCount: 12
    },
    
    // Uniform defaults
    uniforms: {
        steps: 5.0,
        mouse: [0.0, 0.0, 0.0, 0.0],
        shapeType: 0
    },
    
    // Default thresholds
    defaultThresholds: [0.9800, 0.9571, 0.9054, 0.8359, 0.7528, 0.6577, 0.5499, 0.4270, 0.2800, 0.0138],
    
    // Adaptive rendering settings
    adaptive: {
        mobileBreakpoint: 768, // pixels
        tabletBreakpoint: 1024, // pixels
        mobileBandReduction: 0.5, // 50% reduction
        tabletBandReduction: 0.75, // 25% reduction
        minMobileBands: 12,
        minTabletBands: 16
    },
    
    // Refraction shader specific
    refraction: {
        maxZoom: 2.0,
        zoomIntensityThreshold: 0.5,
        zoomIntensityRange: 0.5 // Maps 0.5-1.0 to 0.0-1.0
    },
    
    // Include processing
    includes: {
        criticalIncludes: ['uniforms.glsl', 'constants.glsl'],
        maxRetries: 3,
        retryDelayBase: 1000 // milliseconds
    }
} as const;

