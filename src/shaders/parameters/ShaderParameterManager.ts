// Shader Parameter Manager
// Handles parameter validation, setting, and getting for shader instances

import { ShaderError, ErrorCodes } from '../utils/ShaderErrors.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';
import type { ShaderConfig } from '../../types/index.js';
import type { BaseShaderPlugin } from '../plugins/BaseShaderPlugin.js';
import type { ParameterValue } from '../../types/shader.js';

export interface ShaderParameterContext {
    isInitialized: boolean;
    config: ShaderConfig;
    parameters: Record<string, ParameterValue>;
    plugin: BaseShaderPlugin | null;
}

export class ShaderParameterManager {
    /**
     * Set a shader parameter value
     * @param context - Parameter context with shader state
     * @param name - Parameter name
     * @param value - Parameter value
     * @returns True if parameter was set successfully
     * @throws ShaderError If shader is not initialized or parameter is invalid
     */
    static setParameter(
        context: ShaderParameterContext,
        name: string,
        value: ParameterValue
    ): boolean {
        const { isInitialized, config, parameters, plugin } = context;

        if (!isInitialized) {
            throw new ShaderError('ShaderInstance not initialized', ErrorCodes.NOT_INITIALIZED);
        }

        if (!config.parameters || !(name in config.parameters)) {
            throw new ShaderError(
                `Parameter "${name}" not found`, 
                ErrorCodes.INVALID_PARAMETER, 
                { 
                    name,
                    shaderName: config.name,
                    availableParameters: Object.keys(config.parameters || {})
                }
            );
        }

        const paramConfig = config.parameters[name];

        // Type validation
        if (paramConfig.type === 'int' && !Number.isInteger(value)) {
            throw new ShaderError(`Parameter "${name}" must be an integer`, ErrorCodes.INVALID_PARAMETER, { name, value });
        }
        if (paramConfig.type === 'float' && typeof value !== 'number') {
            throw new ShaderError(`Parameter "${name}" must be a number`, ErrorCodes.INVALID_PARAMETER, { name, value });
        }

        // Range validation with clamping
        let finalValue = value as number;
        if (paramConfig.min !== undefined && finalValue < paramConfig.min) {
            ShaderLogger.warn(`Parameter "${name}" value ${finalValue} below minimum ${paramConfig.min}, clamping`);
            finalValue = paramConfig.min;
        }
        if (paramConfig.max !== undefined && finalValue > paramConfig.max) {
            ShaderLogger.warn(`Parameter "${name}" value ${finalValue} above maximum ${paramConfig.max}, clamping`);
            finalValue = paramConfig.max;
        }

        const oldValue = parameters[name];
        parameters[name] = finalValue;

        // Call plugin hook for parameter changes
        if (plugin && typeof plugin.onParameterChange === 'function') {
            plugin.onParameterChange(name, oldValue, finalValue);
        }

        return true;
    }

    /**
     * Get a shader parameter value
     * @param parameters - Parameters object
     * @param name - Parameter name
     * @returns Parameter value, or undefined if not found
     */
    static getParameter(
        parameters: Record<string, ParameterValue>,
        name: string
    ): ParameterValue | undefined {
        return parameters[name];
    }

    /**
     * Get all shader parameters as a copy
     * @param parameters - Parameters object
     * @returns Copy of all parameter values
     */
    static getAllParameters(
        parameters: Record<string, ParameterValue>
    ): Record<string, ParameterValue> {
        return { ...parameters };
    }

    /**
     * Initialize parameters from config defaults
     * @param config - Shader configuration
     * @returns Initialized parameters object
     */
    static initializeParameters(config: ShaderConfig): Record<string, ParameterValue> {
        const parameters: Record<string, ParameterValue> = {};
        if (config.parameters) {
            Object.entries(config.parameters).forEach(([name, paramConfig]) => {
                parameters[name] = paramConfig.default !== undefined ? paramConfig.default : 0;
            });
        }
        return parameters;
    }
}

