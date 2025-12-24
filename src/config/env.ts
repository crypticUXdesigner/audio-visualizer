// Environment Variable Validation
// Validates and provides type-safe access to environment variables

import { z } from 'zod';

/**
 * Environment variable schema
 */
const envSchema = z.object({
  VITE_AUDIOTOOL_API_TOKEN: z.string().optional(),
  VITE_AUDIOTOOL_CLIENT_ID: z.string().uuid().optional(),
  VITE_SENTRY_DSN: z.string().url().optional(),
  VITE_DISABLE_SENTRY: z
    .string()
    .optional()
    .transform(val => val === 'true'),
  DEV: z.boolean().optional(),
  MODE: z.string().optional(),
  BASE_URL: z.string().optional(),
});

/**
 * Validated environment variables
 * Throws error at module load if validation fails
 */
export const env = envSchema.parse({
  VITE_AUDIOTOOL_API_TOKEN: import.meta.env.VITE_AUDIOTOOL_API_TOKEN,
  VITE_AUDIOTOOL_CLIENT_ID: import.meta.env.VITE_AUDIOTOOL_CLIENT_ID,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_DISABLE_SENTRY: import.meta.env.VITE_DISABLE_SENTRY,
  DEV: import.meta.env.DEV,
  MODE: import.meta.env.MODE,
  BASE_URL: import.meta.env.BASE_URL,
});

/**
 * Get environment variable with validation
 * @param key - Environment variable key
 * @param defaultValue - Default value if not set
 * @returns The environment variable value or default
 */
export function getEnv<T extends keyof typeof env>(
  key: T,
  defaultValue?: typeof env[T]
): typeof env[T] {
  const value = env[key];
  return value !== undefined ? value : (defaultValue as typeof env[T]);
}

