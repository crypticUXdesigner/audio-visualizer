// Parameter Helper Utilities
// Common patterns for shader parameter definitions

/**
 * Create a note-based timing parameter (musical note duration)
 * @param {string} name - Parameter name
 * @param {number} defaultNote - Default note value (e.g., 1/16 for 16th note)
 * @param {string} label - Display label
 * @returns {Object} Parameter configuration
 */
export function createNoteParameter(name, defaultNote, label) {
    return {
        type: 'float',
        default: defaultNote,
        min: 1.0 / 256.0,
        max: 1.0 / 1.0,
        step: 1.0 / 256.0,
        label: label || name
    };
}

/**
 * Create a cubic bezier curve parameter pair (X and Y)
 * @param {string} baseName - Base parameter name (will create baseNameX1, baseNameY1, etc.)
 * @param {number} defaultX - Default X value
 * @param {number} defaultY - Default Y value
 * @param {string} label - Display label prefix
 * @returns {Object} Object with X1, Y1, X2, Y2 parameters
 */
export function createCurveParameters(baseName, defaultX1, defaultY1, defaultX2, defaultY2, label) {
    return {
        [`${baseName}X1`]: {
            type: 'float',
            default: defaultX1,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: `${label} X1`
        },
        [`${baseName}Y1`]: {
            type: 'float',
            default: defaultY1,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: `${label} Y1`
        },
        [`${baseName}X2`]: {
            type: 'float',
            default: defaultX2,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: `${label} X2`
        },
        [`${baseName}Y2`]: {
            type: 'float',
            default: defaultY2,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: `${label} Y2`
        }
    };
}

/**
 * Create a min/max parameter pair
 * @param {string} baseName - Base parameter name
 * @param {number} defaultMin - Default minimum value
 * @param {number} defaultMax - Default maximum value
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number} step - Step size
 * @param {string} label - Display label prefix
 * @returns {Object} Object with Min and Max parameters
 */
export function createMinMaxParameters(baseName, defaultMin, defaultMax, min, max, step, label) {
    return {
        [`${baseName}Min`]: {
            type: 'float',
            default: defaultMin,
            min: min,
            max: max,
            step: step,
            label: `${label} Min`
        },
        [`${baseName}Max`]: {
            type: 'float',
            default: defaultMax,
            min: min,
            max: max,
            step: step,
            label: `${label} Max`
        }
    };
}

/**
 * Create a toggle parameter (0.0 or 1.0)
 * @param {string} name - Parameter name
 * @param {boolean} defaultEnabled - Default enabled state
 * @param {string} label - Display label
 * @returns {Object} Parameter configuration
 */
export function createToggleParameter(name, defaultEnabled, label) {
    return {
        [name]: {
            type: 'float',
            default: defaultEnabled ? 1.0 : 0.0,
            min: 0.0,
            max: 1.0,
            step: 1.0,
            label: label || name
        }
    };
}

/**
 * Flatten nested parameter objects into a flat structure
 * This allows logical grouping while maintaining flat structure for the UI
 * @param {Object} groupedParams - Object with nested parameter groups
 * @returns {Object} Flattened parameters object
 */
export function flattenParameters(groupedParams) {
    const flattened = {};
    
    function flatten(obj, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}_${key}` : key;
            
            if (value && typeof value === 'object' && !value.type && !Array.isArray(value)) {
                // Nested object - recurse
                flatten(value, newKey);
            } else {
                // Parameter definition - add to flattened object
                flattened[newKey] = value;
            }
        }
    }
    
    flatten(groupedParams);
    return flattened;
}

