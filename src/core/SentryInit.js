// Sentry Error Tracking Initialization
// Initialize as early as possible to catch all errors

import * as Sentry from "@sentry/browser";

// Get DSN from environment variable, fallback to hardcoded for development
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || "https://bfcbd4287d8125d0ff6994ab3f38c82b@o4509351742078976.ingest.de.sentry.io/4510545931141200";

// Only initialize if DSN is provided
if (sentryDsn) {
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
}

export default Sentry;

