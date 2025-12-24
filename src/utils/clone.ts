// Clone Utilities
// Deep cloning utility functions

/**
 * Deep clones an object, array, or primitive value
 * Handles Date objects, arrays, and nested objects
 * @param obj - Object to clone
 * @returns Deep cloned copy of the object
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as T;
    if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T;
    
    const cloned = {} as Record<string, unknown>;
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned as T;
}

