// Sentry Error Tracking Initialization
// Initialize as early as possible to catch all errors

import * as Sentry from "@sentry/browser";

// Get DSN from environment variable, fallback to hardcoded for development
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || "https://bfcbd4287d8125d0ff6994ab3f38c82b@o4509351742078976.ingest.de.sentry.io/4510545931141200";

// Flag to track if Sentry is blocked by browser extensions
let isSentryBlocked = false;

// Check if Sentry should be disabled (e.g., for development or if blocked)
const disableSentry = import.meta.env.VITE_DISABLE_SENTRY === 'true';

// Only initialize if DSN is provided and not disabled
if (sentryDsn && !disableSentry) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      // Only send PII in development for debugging
      // In production, this is false to protect user privacy
      sendDefaultPii: import.meta.env.DEV,
      
      // Enable performance monitoring - 100% of sessions
      tracesSampleRate: 1.0,
      
      // Enable Web Vitals tracking (no replay sessions)
      integrations: [
        Sentry.browserTracingIntegration(),
        // Replay integration removed - not needed
      ],
      
      // Performance monitoring options
      _experiments: {
        enableLogs: true,
      },
      
      // Handle transport errors gracefully
      beforeSend(event, hint) {
        // Check if error is due to blocked request
        if (hint.originalException && hint.originalException.message) {
          const message = hint.originalException.message.toLowerCase();
          if (message.includes('blocked') || message.includes('err_blocked_by_client')) {
            isSentryBlocked = true;
            // Don't send the event if it's just a blocked request
            return null;
          }
        }
        return event;
      },
    });
    
    // Set device context
    Sentry.setContext("device", {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    });
  } catch (error) {
    // If Sentry initialization fails, mark as blocked
    console.warn('Sentry initialization failed, metrics will be disabled:', error);
    isSentryBlocked = true;
  }
}

/**
 * Safely send metrics to Sentry, handling blocked requests gracefully
 * @param {string} name - Metric name
 * @param {number} value - Metric value
 * @param {object} options - Metric options
 */
export function safeSentryMetric(name, value, options = {}) {
  // Skip if Sentry is disabled, blocked, or unavailable
  if (disableSentry || isSentryBlocked || typeof Sentry === 'undefined' || !Sentry.metrics) {
    return;
  }
  
  try {
    Sentry.metrics.distribution(name, value, options);
  } catch (error) {
    // If metric fails, mark Sentry as blocked to prevent future attempts
    if (error && error.message && error.message.toLowerCase().includes('blocked')) {
      isSentryBlocked = true;
    }
    // Silently fail - don't log errors for blocked requests
  }
}

/**
 * Check if Sentry is blocked
 * @returns {boolean} True if Sentry is blocked
 */
export function isSentryAvailable() {
  return !disableSentry && !isSentryBlocked && typeof Sentry !== 'undefined' && Sentry.metrics;
}

/**
 * Safely create a Sentry span, handling blocked requests gracefully
 * @param {object} options - Span options
 * @param {Function} callback - Callback function
 * @returns {Promise|any} Result of callback
 */
export function safeSentrySpan(options, callback) {
  if (isSentryBlocked || typeof Sentry === 'undefined' || !Sentry.startSpan) {
    // If Sentry is blocked, just execute the callback without tracking
    return callback({ setAttribute: () => {}, setData: () => {} });
  }
  
  try {
    return Sentry.startSpan(options, callback);
  } catch (error) {
    // If span creation fails, mark Sentry as blocked and execute callback without tracking
    if (error.message && error.message.toLowerCase().includes('blocked')) {
      isSentryBlocked = true;
    }
    return callback({ setAttribute: () => {}, setData: () => {} });
  }
}

/**
 * Safely capture an exception in Sentry
 * @param {Error} error - Error to capture
 */
export function safeCaptureException(error) {
  if (isSentryBlocked || typeof Sentry === 'undefined' || !Sentry.captureException) {
    return;
  }
  
  try {
    Sentry.captureException(error);
  } catch (e) {
    // Silently fail if Sentry is blocked
    if (e.message && e.message.toLowerCase().includes('blocked')) {
      isSentryBlocked = true;
    }
  }
}

export default Sentry;

