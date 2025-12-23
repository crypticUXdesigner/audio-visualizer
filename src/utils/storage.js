// Storage utility with error handling
// Provides safe wrappers for localStorage operations

/**
 * Safely get an item from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist or storage is unavailable
 * @returns {*} The stored value or defaultValue
 */
export function safeGetItem(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch (e) {
        // localStorage may be unavailable in private browsing mode or disabled
        console.warn(`localStorage.getItem("${key}") failed:`, e.message);
        return defaultValue;
    }
}

/**
 * Safely set an item in localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {boolean} True if successful, false otherwise
 */
export function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        // localStorage may be unavailable in private browsing mode or disabled
        console.warn(`localStorage.setItem("${key}") failed:`, e.message);
        return false;
    }
}

/**
 * Safely remove an item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} True if successful, false otherwise
 */
export function safeRemoveItem(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.warn(`localStorage.removeItem("${key}") failed:`, e.message);
        return false;
    }
}

