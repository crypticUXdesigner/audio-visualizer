// Storage utility with error handling
// Provides safe wrappers for localStorage operations

import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';

/**
 * Safely get an item from localStorage
 * @param key - Storage key
 * @param defaultValue - Default value if key doesn't exist or storage is unavailable
 * @returns The stored value or defaultValue
 */
export function safeGetItem(key: string, defaultValue: string | null = null): string | null {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch (e) {
        // localStorage may be unavailable in private browsing mode or disabled
        const error = e as Error;
        ShaderLogger.warn(`localStorage.getItem("${key}") failed:`, error.message);
        return defaultValue;
    }
}

/**
 * Safely set an item in localStorage
 * @param key - Storage key
 * @param value - Value to store
 * @returns True if successful, false otherwise
 */
export function safeSetItem(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        // localStorage may be unavailable in private browsing mode or disabled
        const error = e as Error;
        ShaderLogger.warn(`localStorage.setItem("${key}") failed:`, error.message);
        return false;
    }
}

/**
 * Safely remove an item from localStorage
 * @param key - Storage key
 * @returns True if successful, false otherwise
 */
export function safeRemoveItem(key: string): boolean {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        const error = e as Error;
        ShaderLogger.warn(`localStorage.removeItem("${key}") failed:`, error.message);
        return false;
    }
}

