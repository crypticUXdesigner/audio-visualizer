// Application-wide constants
// Centralized configuration to avoid magic numbers throughout the codebase

/**
 * Color-related constants
 */
export const COLOR_CONFIG = {
  // Minimum change in RGB values (0-1) to trigger color update
  UPDATE_THRESHOLD: 0.015,
  
  // Color transition duration in milliseconds
  TRANSITION_DURATION: 1000,
  
  // Minimum normalized value for visual continuity in waveform
  MIN_WAVEFORM_VALUE: 0.05,
};

/**
 * Audio analysis thresholds
 */
export const AUDIO_THRESHOLDS = {
  // Minimum threshold for bass frequency to trigger ripple
  BASS: 0.08,
  
  // Minimum threshold for mid frequency to trigger ripple
  MID: 0.05,
  
  // Minimum threshold for treble frequency to trigger ripple
  TREBLE: 0.05,
  
  // Minimum change required to trigger dynamic ripple
  DYNAMIC_CHANGE: 0.07,
};

/**
 * Ripple effect configuration
 */
export const RIPPLE_CONFIG = {
  // Maximum number of simultaneous ripples
  MAX_COUNT: 12,
  
  // Ripple lifetime in seconds
  LIFETIME: 2.0,
  
  // Rate limiting window in milliseconds
  RATE_LIMIT_WINDOW: 500,
  
  // Maximum ripples allowed in rate limit window
  RATE_LIMIT: 9,
  
  // Cooldown duration after hitting rate limit (milliseconds)
  COOLDOWN_DURATION: 300,
  
  // Default ripple width
  DEFAULT_WIDTH: 0.05,
};

/**
 * API configuration
 */
export const API_CONFIG = {
  // Request timeout in milliseconds
  TIMEOUT: 30000,
  
  // Batch size for API requests
  BATCH_SIZE: 50,
  
  // Base delay for retries in milliseconds
  RETRY_DELAY_BASE: 1000,
  
  // Maximum number of retries
  MAX_RETRIES: 3,
};

/**
 * UI configuration
 */
export const UI_CONFIG = {
  // Z-index values for different UI layers
  Z_INDEX: {
    ERROR_MESSAGE: 10000,
    CONTROLS: 1000,
    MODAL: 10000,
  },
  
  // Animation timing
  ANIMATION: {
    // Delay before applying preset (milliseconds)
    PRESET_APPLY_DELAY: 500,
    
    // Fade duration (milliseconds)
    FADE_DURATION: 300,
  },
  
  // Delay after initialization before loading tracks (milliseconds)
  TRACK_LOAD_DELAY: 1000,
  
  // Maximum width for error messages (pixels)
  ERROR_MESSAGE_MAX_WIDTH: 600,
  
  // Maximum width for audio error messages (pixels)
  AUDIO_ERROR_MAX_WIDTH: 500,
  
  // Auto-hide error message delay (milliseconds)
  ERROR_AUTO_HIDE_DELAY: 5000,
};

/**
 * Shader-related constants
 */
export const SHADER_CONFIG = {
  // Color mapping constants
  COLOR_MAPPING: {
    // Smoothstep range for frequency band activation
    SMOOTHSTEP_RANGE: 0.05,
    
    // Bayer dithering variation amount
    BAYER_VARIATION: 0.08,
  },
  
  // Time-based animation constants
  TIME: {
    // Base time speed multiplier
    BASE_SPEED: 0.08,
  },
  
  // Performance monitoring
  PERFORMANCE: {
    // Target frames per second
    TARGET_FPS: 60,
    
    // Number of frames to track for average
    FRAME_TIME_HISTORY: 60,
  },
};

/**
 * Adaptive rendering configuration
 * Adjusts rendering based on device capabilities
 */
export const ADAPTIVE_CONFIG = {
  // Screen width breakpoint for mobile (pixels)
  MOBILE_BREAKPOINT: 768,
  
  // Screen width breakpoint for tablet (pixels)
  TABLET_BREAKPOINT: 1024,
  
  // Band reduction factor for mobile devices
  MOBILE_BAND_REDUCTION: 0.4,
  
  // Band reduction factor for tablet devices
  TABLET_BAND_REDUCTION: 0.7,
  
  // Minimum number of bands on mobile
  MIN_MOBILE_BANDS: 12,
  
  // Minimum number of bands on tablet
  MIN_TABLET_BANDS: 16,
};

/**
 * Title display configuration
 */
export const TITLE_CONFIG = {
  // Noise animation FPS
  NOISE_FPS: 30,
  
  // Noise seed increment for smooth transitions
  NOISE_SEED_INCREMENT: 0.05,
};

