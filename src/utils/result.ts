// Result Type Utility
// Provides a functional approach to error handling without exceptions

/**
 * Result type for functional error handling
 * @template T - Success data type
 * @template E - Error type (defaults to Error)
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a successful result
 * @param data - The success data
 * @returns Result with success: true
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create an error result
 * @param error - The error
 * @returns Result with success: false
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Check if result is successful
 * @param result - The result to check
 * @returns True if result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success === true;
}

/**
 * Check if result is an error
 * @param result - The result to check
 * @returns True if result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

/**
 * Map over a successful result
 * @param result - The result to map
 * @param fn - Function to transform the data
 * @returns New result with transformed data
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.data));
  }
  return result;
}

/**
 * Map over an error result
 * @param result - The result to map
 * @param fn - Function to transform the error
 * @returns New result with transformed error
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Unwrap a result, throwing if it's an error
 * @param result - The result to unwrap
 * @returns The data if successful
 * @throws The error if unsuccessful
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.data;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 * @param result - The result to unwrap
 * @param defaultValue - Default value if result is an error
 * @returns The data if successful, or defaultValue if error
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.data;
  }
  return defaultValue;
}

