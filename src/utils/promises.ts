// Promise Utilities
// Helper functions for promise handling, timeouts, and retries

/**
 * Wrap a promise with a timeout
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message (optional)
 * @returns Promise that rejects if timeout is exceeded
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${errorMessage} (${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

/**
 * Retry a promise-returning function
 * @param fn - Function that returns a promise
 * @param maxRetries - Maximum number of retries
 * @param delayMs - Delay between retries in milliseconds
 * @param backoff - Whether to use exponential backoff (default: false)
 * @returns Promise that resolves with the result or rejects after all retries
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  backoff = false
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const delay = backoff ? delayMs * Math.pow(2, attempt) : delayMs;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Execute multiple promises and return results for all (successful and failed)
 * @param promises - Array of promises to execute
 * @returns Array of Results, one for each promise
 */
export async function allSettledWithResults<T>(
  promises: Promise<T>[]
): Promise<Array<import('./result.js').Result<T, Error>>> {
  const { ok, err } = await import('./result.js');
  const results = await Promise.allSettled(promises);
  
  return results.map(result => {
    if (result.status === 'fulfilled') {
      return ok(result.value);
    } else {
      return err(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
    }
  });
}

/**
 * Delay execution for a specified time
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

