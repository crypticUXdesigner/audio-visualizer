// Parameter Helper Utilities
// Common patterns for shader parameter definitions

import type { ParameterConfig } from '../../types/index.js';

/**
 * Create a note-based timing parameter (musical note duration)
 * @param name - Parameter name
 * @param defaultNote - Default note value (e.g., 1/16 for 16th note)
 * @param label - Display label
 * @returns Parameter configuration
 */
export function createNoteParameter(name: string, defaultNote: number, label?: string): ParameterConfig {
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
 * @param baseName - Base parameter name (will create baseNameX1, baseNameY1, etc.)
 * @param defaultX1 - Default X1 value
 * @param defaultY1 - Default Y1 value
 * @param defaultX2 - Default X2 value
 * @param defaultY2 - Default Y2 value
 * @param label - Display label prefix
 * @returns Object with X1, Y1, X2, Y2 parameters
 */
export function createCurveParameters(baseName: string, defaultX1: number, defaultY1: number, defaultX2: number, defaultY2: number, label: string): Record<string, ParameterConfig> {
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
 * @param baseName - Base parameter name
 * @param defaultMin - Default minimum value
 * @param defaultMax - Default maximum value
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param step - Step size
 * @param label - Display label prefix
 * @returns Object with Min and Max parameters
 */
export function createMinMaxParameters(baseName: string, defaultMin: number, defaultMax: number, min: number, max: number, step: number, label: string): Record<string, ParameterConfig> {
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
 * @param name - Parameter name
 * @param defaultEnabled - Default enabled state
 * @param label - Display label
 * @returns Parameter configuration
 */
export function createToggleParameter(name: string, defaultEnabled: boolean, label?: string): Record<string, ParameterConfig> {
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
 * @param groupedParams - Object with nested parameter groups
 * @returns Flattened parameters object
 */
export function flattenParameters(groupedParams: Record<string, unknown>): Record<string, ParameterConfig> {
    const flattened: Record<string, ParameterConfig> = {};
    
    function flatten(obj: Record<string, unknown>, prefix: string = ''): void {
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}_${key}` : key;
            
            if (value && typeof value === 'object' && !Array.isArray(value) && !('type' in value)) {
                // Nested object - recurse
                flatten(value as Record<string, unknown>, newKey);
            } else {
                // Parameter definition - add to flattened object
                flattened[newKey] = value as ParameterConfig;
            }
        }
    }
    
    flatten(groupedParams);
    return flattened;
}

