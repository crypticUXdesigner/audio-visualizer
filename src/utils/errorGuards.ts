// Error type guard utilities
// Provides type-safe error handling

/**
 * Type guard to check if value is an Error instance
 */
export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

/**
 * Type guard to check if error has details property
 */
export function hasErrorDetails(error: unknown): error is Error & { details?: unknown } {
    return isError(error) && 'details' in error;
}

