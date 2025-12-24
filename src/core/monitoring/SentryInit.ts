// Sentry Error Tracking Initialization
// Initialize as early as possible to catch all errors

import * as Sentry from "@sentry/browser";

// Get DSN from environment variable, fallback to hardcoded for development
const sentryDsn: string = import.meta.env.VITE_SENTRY_DSN || "https://bfcbd4287d8125d0ff6994ab3f38c82b@o4509351742078976.ingest.de.sentry.io/4510545931141200";

// Flag to track if Sentry is blocked by browser extensions
let isSentryBlocked: boolean = false;

// Check if Sentry should be disabled (disabled by default in development, can be enabled via env var)
// In production, Sentry is enabled by default unless VITE_DISABLE_SENTRY is set to 'true'
const disableSentry: boolean = import.meta.env.DEV || import.meta.env.VITE_DISABLE_SENTRY === 'true';

/**
 * Completely disable Sentry client to prevent any further requests
 */
function disableSentryClient(): void {
  if (typeof Sentry === 'undefined') return;
  
  try {
    const client = Sentry.getClient();
    if (client) {
      // Disable the client
      client.getOptions().enabled = false;
      // Close the client
      if (client.close) {
        client.close();
      }
    }
  } catch (e) {
    // Ignore errors when disabling
  }
}

// Intercept console errors to filter out Sentry blocked request errors
if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  // Helper to check if message is a Sentry blocked request error
  const isSentryBlockedMessage = (message: unknown): boolean => {
    if (!message || typeof message !== 'string') return false;
    const lowerMessage = message.toLowerCase();
    return (
      (message.includes('sentry.io') || message.includes('ingest.de.sentry.io')) &&
      (lowerMessage.includes('err_blocked_by_client') || 
       lowerMessage.includes('blocked') ||
       lowerMessage.includes('failed to load resource') ||
       message.includes('net::ERR_BLOCKED_BY_CLIENT'))
    );
  };
  
  // Helper to extract message from unknown arg
  const getMessageFromArg = (arg: unknown): string => {
    if (typeof arg === 'string') return arg;
    if (arg && typeof arg === 'object' && 'message' in arg) {
      return String((arg as { message: unknown }).message);
    }
    return String(arg || '');
  };
  
  // Filter out Sentry-related blocked request errors from console
  const filterSentryErrors = (...args: unknown[]): void => {
    const message = args.map(getMessageFromArg).join(' ');
    
    // Check if this is a Sentry blocked request error
    if (isSentryBlockedMessage(message)) {
      isSentryBlocked = true;
      disableSentryClient();
      return; // Silently ignore
    }
    
    // Log other errors normally
    originalError.apply(console, args);
  };
  
  const filterSentryWarnings = (...args: unknown[]): void => {
    const message = args.map(getMessageFromArg).join(' ');
    
    // Check if this is a Sentry blocked request warning
    if (isSentryBlockedMessage(message)) {
      isSentryBlocked = true;
      disableSentryClient();
      return; // Silently ignore
    }
    
    // Log other warnings normally
    originalWarn.apply(console, args);
  };
  
  const filterSentryLogs = (...args: unknown[]): void => {
    const message = args.map(getMessageFromArg).join(' ');
    
    // Filter out Sentry blocked request logs
    if (isSentryBlockedMessage(message)) {
      isSentryBlocked = true;
      disableSentryClient();
      return; // Silently ignore
    }
    
    // Log other messages normally
    originalLog.apply(console, args);
  };
  
  // Override console methods
  console.error = filterSentryErrors;
  console.warn = filterSentryWarnings;
  console.log = filterSentryLogs;
  
  // Also intercept network errors via error event listener (capture phase)
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    const source = event.filename || ((event.target as HTMLScriptElement | HTMLImageElement | null)?.src) || '';
    const error = event.error;
    
    const errorMessage = (error && typeof error === 'object' && 'message' in error) ? String(error.message) : message || '';
    
    if (
      (message.includes('sentry.io') || source.includes('sentry.io') || errorMessage.includes('sentry.io')) &&
      (message.includes('ERR_BLOCKED_BY_CLIENT') || 
       message.includes('blocked') ||
       errorMessage.includes('ERR_BLOCKED_BY_CLIENT') ||
       errorMessage.includes('blocked'))
    ) {
      isSentryBlocked = true;
      disableSentryClient();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true); // Use capture phase to catch early
  
  // Intercept unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason) {
      const errorMessage = (reason && typeof reason === 'object' && 'message' in reason) ? String(reason.message) : String(reason) || '';
      const errorStack = (reason && typeof reason === 'object' && 'stack' in reason) ? String(reason.stack) : '';
      
      if (
        (errorMessage.includes('sentry.io') || errorStack.includes('sentry.io')) &&
        (errorMessage.includes('ERR_BLOCKED_BY_CLIENT') || 
         errorMessage.includes('blocked'))
      ) {
        isSentryBlocked = true;
        disableSentryClient();
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }, true);
}

// Only initialize if DSN is provided and not disabled
if (sentryDsn && !disableSentry && !isSentryBlocked) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      // Only send PII in development for debugging
      // In production, this is false to protect user privacy
      sendDefaultPii: import.meta.env.DEV,
      
      // Disable transaction tracking - only using Sentry for error logging and performance metrics
      tracesSampleRate: 0,
      
      // No integrations needed - only using for error logging and metrics
      integrations: [],
      
      // Performance monitoring options
      _experiments: {
        enableLogs: true,
      },
      
      // Custom transport that completely prevents requests if blocked
      transport: (options) => {
        // If already blocked, return a no-op transport
        if (isSentryBlocked) {
          return {
            send: async () => Promise.resolve({ statusCode: 200 }),
            flush: async () => Promise.resolve(true),
          };
        }
        
        const defaultTransport = Sentry.makeFetchTransport(options);
        
        return {
          ...defaultTransport,
          send: async (request) => {
            // Check if blocked before sending
            if (isSentryBlocked) {
              return Promise.resolve({ statusCode: 200 });
            }
            
            try {
              return await defaultTransport.send(request);
            } catch (error) {
              // Check if error is due to blocked request
              const errorObj = error as { message?: string; name?: string; stack?: string } | null;
              const errorMessage = errorObj?.message || String(error) || '';
              const errorName = errorObj?.name || '';
              const errorStack = errorObj?.stack || '';
              const errorString = String(error);
              
              // Check various forms of blocked request errors
              const isBlocked = (
                errorMessage.toLowerCase().includes('blocked') ||
                errorMessage.toLowerCase().includes('err_blocked_by_client') ||
                errorName.toLowerCase().includes('blocked') ||
                errorMessage.includes('net::ERR_BLOCKED_BY_CLIENT') ||
                errorStack.includes('ERR_BLOCKED_BY_CLIENT') ||
                errorString.toLowerCase().includes('blocked') ||
                errorString.includes('ERR_BLOCKED_BY_CLIENT')
              );
              
              if (isBlocked) {
                // Mark Sentry as blocked and disable it completely
                isSentryBlocked = true;
                disableSentryClient();
                // Return a resolved promise to prevent errors from bubbling up
                return Promise.resolve({ statusCode: 200 });
              }
              // Re-throw other errors
              throw error;
            }
          },
        };
      },
      
      // Handle transport errors gracefully
      beforeSend(event, hint) {
        // If blocked, don't send anything
        if (isSentryBlocked) {
          return null;
        }
        
        // Check if error is due to blocked request
        if (hint.originalException && typeof hint.originalException === 'object' && 'message' in hint.originalException) {
          const message = String(hint.originalException.message).toLowerCase();
          if (message.includes('blocked') || message.includes('err_blocked_by_client')) {
            isSentryBlocked = true;
            disableSentryClient();
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
    
    // Add global error handler for unhandled promise rejections from Sentry
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        // Check if the rejection is from a Sentry request
        const reason = event.reason;
        if (reason) {
          const errorObj = reason as { message?: string; stack?: string } | null;
          const errorMessage = errorObj?.message || String(reason) || '';
          const errorStack = errorObj?.stack || '';
          
          // Check if it's a blocked Sentry request
          if (
            errorMessage.includes('sentry.io') ||
            errorMessage.includes('ingest.de.sentry.io') ||
            errorStack.includes('sentry.io') ||
            errorMessage.toLowerCase().includes('err_blocked_by_client') ||
            errorMessage.toLowerCase().includes('blocked')
          ) {
            // Mark Sentry as blocked and disable it
            isSentryBlocked = true;
            disableSentryClient();
            event.preventDefault(); // Prevent default error logging
            event.stopPropagation();
          }
        }
      }, true);
    }
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
export function safeSentryMetric(name: string, value: number, options: Record<string, unknown> = {}): void {
  // Skip if Sentry is disabled, blocked, or unavailable
  if (disableSentry || isSentryBlocked || typeof Sentry === 'undefined' || !Sentry.metrics) {
    return;
  }
  
  try {
    Sentry.metrics.distribution(name, value, options);
  } catch (error) {
    // If metric fails, mark Sentry as blocked to prevent future attempts
    const errorObj = error as { message?: string } | null;
    if (errorObj?.message && errorObj.message.toLowerCase().includes('blocked')) {
      isSentryBlocked = true;
    }
    // Silently fail - don't log errors for blocked requests
  }
}

/**
 * Check if Sentry is blocked
 * @returns {boolean} True if Sentry is blocked
 */
export function isSentryAvailable(): boolean {
  return !disableSentry && !isSentryBlocked && typeof Sentry !== 'undefined' && !!Sentry.metrics;
}

/**
 * Safely create a Sentry span, handling blocked requests gracefully
 * NOTE: Transaction tracking is disabled (tracesSampleRate: 0), so this is a no-op
 * Kept for API compatibility but doesn't create spans or send data
 * @param {object} options - Span options (ignored)
 * @param {Function} callback - Callback function
 * @returns {Promise|any} Result of callback
 */
export function safeSentrySpan<T>(_options: Record<string, unknown>, callback: (span: { setAttribute: (key: string, value: unknown) => void; setData: (key: string, value: unknown) => void }) => T): T {
  // Transaction tracking is disabled, so just execute callback without creating spans
  // This prevents any network requests while maintaining API compatibility
  return callback({ setAttribute: () => {}, setData: () => {} });
}

/**
 * Safely capture an exception in Sentry
 * @param {Error} error - Error to capture
 */
export function safeCaptureException(error: Error | unknown): void {
  if (isSentryBlocked || typeof Sentry === 'undefined' || !Sentry.captureException) {
    return;
  }
  
  try {
    Sentry.captureException(error);
  } catch (e) {
    // Silently fail if Sentry is blocked
    const errorObj = e as { message?: string } | null;
    if (errorObj?.message && errorObj.message.toLowerCase().includes('blocked')) {
      isSentryBlocked = true;
    }
  }
}

/**
 * Safely set context in Sentry
 * @param {string} name - Context name
 * @param {object} context - Context data
 */
export function safeSetContext(name: string, context: Record<string, unknown>): void {
  if (isSentryBlocked || typeof Sentry === 'undefined' || !Sentry.setContext) {
    return;
  }
  
  try {
    Sentry.setContext(name, context);
  } catch (e) {
    // Silently fail if Sentry is blocked
    const errorObj = e as { message?: string } | null;
    if (errorObj?.message && errorObj.message.toLowerCase().includes('blocked')) {
      isSentryBlocked = true;
    }
  }
}

/**
 * Safely add breadcrumb to Sentry
 * @param {object} breadcrumb - Breadcrumb data
 */
export function safeAddBreadcrumb(breadcrumb: Record<string, unknown>): void {
  if (isSentryBlocked || typeof Sentry === 'undefined' || !Sentry.addBreadcrumb) {
    return;
  }
  
  try {
    Sentry.addBreadcrumb(breadcrumb);
  } catch (e) {
    // Silently fail if Sentry is blocked
    const errorObj = e as { message?: string } | null;
    if (errorObj?.message && errorObj.message.toLowerCase().includes('blocked')) {
      isSentryBlocked = true;
    }
  }
}

export default Sentry;

