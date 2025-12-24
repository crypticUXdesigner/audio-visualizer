// UniformUpdateHelper - Utility for updating shader uniforms with value caching
// Reduces boilerplate code in plugin uniform update methods

interface UniformLocations {
    [key: string]: WebGLUniformLocation | null;
}

interface LastValues {
    [key: string]: number | number[] | boolean | undefined;
}

import type { ParameterDef } from '../types/shader.js';

// Import the actual ShaderConfig type instead of defining a local one
import type { ShaderConfig, ParameterValue } from '../../types/index.js';

export class UniformUpdateHelper {
    gl: WebGLRenderingContext;
    locations: UniformLocations;
    lastValues: LastValues;
    
    /**
     * @param gl - WebGL context
     * @param uniformLocations - Map of uniform names to locations
     * @param lastValues - Reference to last values cache (shared with UniformManager)
     */
    constructor(gl: WebGLRenderingContext, uniformLocations: UniformLocations, lastValues: LastValues) {
        this.gl = gl;
        this.locations = uniformLocations;
        this.lastValues = lastValues;
    }
    
    /**
     * Type guard to check if ParameterValue is a number
     * @private
     */
    private _isNumber(value: ParameterValue | undefined): value is number {
        return typeof value === 'number';
    }
    
    /**
     * Type guard to check if ParameterValue is a boolean
     * @private
     */
    private _isBoolean(value: ParameterValue | undefined): value is boolean {
        return typeof value === 'boolean';
    }
    
    /**
     * Get parameter as number with type safety
     * @private
     */
    private _getParameterAsNumber(parameters: Record<string, ParameterValue>, paramName: string): number | undefined {
        const value = parameters[paramName];
        return this._isNumber(value) ? value : undefined;
    }
    
    /**
     * Get parameter as boolean with type safety
     * @private
     */
    private _getParameterAsBoolean(parameters: Record<string, ParameterValue>, paramName: string): boolean | undefined {
        const value = parameters[paramName];
        return this._isBoolean(value) ? value : undefined;
    }
    
    /**
     * Update a float uniform if value has changed
     * @param uniformName - Uniform name (e.g., 'uMinStringWidth')
     * @param value - New value
     * @param defaultValue - Default value if value is undefined
     * @returns True if uniform was updated
     */
    updateFloat(uniformName: string, value: number | undefined, defaultValue?: number): boolean {
        const location = this.locations[uniformName];
        if (!location) return false;
        
        const finalValue = value !== undefined ? value : (defaultValue !== undefined ? defaultValue : 0);
        
        if (this.lastValues[uniformName] !== finalValue) {
            this.gl.uniform1f(location, finalValue);
            this.lastValues[uniformName] = finalValue;
            return true;
        }
        return false;
    }
    
    /**
     * Update an integer uniform if value has changed
     * @param uniformName - Uniform name
     * @param value - New value
     * @param defaultValue - Default value if value is undefined
     * @returns True if uniform was updated
     */
    updateInt(uniformName: string, value: number | undefined, defaultValue?: number): boolean {
        const location = this.locations[uniformName];
        if (!location) return false;
        
        const finalValue = value !== undefined ? value : (defaultValue !== undefined ? defaultValue : 0);
        
        if (this.lastValues[uniformName] !== finalValue) {
            this.gl.uniform1i(location, finalValue);
            this.lastValues[uniformName] = finalValue;
            return true;
        }
        return false;
    }
    
    /**
     * Update a vec2 uniform if value has changed
     * @param uniformName - Uniform name
     * @param value - New value [x, y]
     * @param defaultValue - Default value
     * @returns True if uniform was updated
     */
    updateVec2(uniformName: string, value: number[] | undefined, defaultValue?: number[]): boolean {
        const location = this.locations[uniformName];
        if (!location) return false;
        
        const finalValue = value || defaultValue || [0, 0];
        
        const lastValue = this.lastValues[uniformName] as number[] | undefined;
        if (!lastValue || lastValue[0] !== finalValue[0] || lastValue[1] !== finalValue[1]) {
            this.gl.uniform2f(location, finalValue[0], finalValue[1]);
            this.lastValues[uniformName] = [finalValue[0], finalValue[1]];
            return true;
        }
        return false;
    }
    
    /**
     * Update a vec3 uniform if value has changed
     * @param uniformName - Uniform name
     * @param value - New value [x, y, z]
     * @param defaultValue - Default value
     * @returns True if uniform was updated
     */
    updateVec3(uniformName: string, value: number[] | undefined, defaultValue?: number[]): boolean {
        const location = this.locations[uniformName];
        if (!location) return false;
        
        const finalValue = value || defaultValue || [0, 0, 0];
        
        const lastValue = this.lastValues[uniformName] as number[] | undefined;
        if (!lastValue || lastValue[0] !== finalValue[0] || 
            lastValue[1] !== finalValue[1] || lastValue[2] !== finalValue[2]) {
            this.gl.uniform3f(location, finalValue[0], finalValue[1], finalValue[2]);
            this.lastValues[uniformName] = [finalValue[0], finalValue[1], finalValue[2]];
            return true;
        }
        return false;
    }
    
    /**
     * Update a boolean uniform (as float: 0.0 or 1.0) if value has changed
     * @param uniformName - Uniform name
     * @param value - New value
     * @param defaultValue - Default value
     * @returns True if uniform was updated
     */
    updateBool(uniformName: string, value: boolean | undefined, defaultValue?: boolean): boolean {
        const location = this.locations[uniformName];
        if (!location) return false;
        
        const finalValue = value !== undefined ? value : (defaultValue !== undefined ? defaultValue : false);
        const floatValue = finalValue ? 1.0 : 0.0;
        
        if (this.lastValues[uniformName] !== floatValue) {
            this.gl.uniform1f(location, floatValue);
            this.lastValues[uniformName] = floatValue;
            return true;
        }
        return false;
    }
    
    /**
     * Update multiple float uniforms from a parameters object
     * @param paramMap - Map of uniform names to parameter names
     * @param parameters - Parameters object
     * @param defaults - Map of uniform names to default values
     * @returns Number of uniforms updated
     */
    updateFloatsFromParams(paramMap: Record<string, string>, parameters: Record<string, ParameterValue>, defaults: Record<string, number> = {}): number {
        let updated = 0;
        Object.entries(paramMap).forEach(([uniformName, paramName]) => {
            const value = this._getParameterAsNumber(parameters, paramName);
            const defaultValue = defaults[uniformName];
            if (this.updateFloat(uniformName, value, defaultValue)) {
                updated++;
            }
        });
        return updated;
    }
    
    /**
     * Update multiple integer uniforms from a parameters object
     * @param paramMap - Map of uniform names to parameter names
     * @param parameters - Parameters object
     * @param defaults - Map of uniform names to default values
     * @returns Number of uniforms updated
     */
    updateIntsFromParams(paramMap: Record<string, string>, parameters: Record<string, ParameterValue>, defaults: Record<string, number> = {}): number {
        let updated = 0;
        Object.entries(paramMap).forEach(([uniformName, paramName]) => {
            const value = this._getParameterAsNumber(parameters, paramName);
            const defaultValue = defaults[uniformName];
            if (this.updateInt(uniformName, value, defaultValue)) {
                updated++;
            }
        });
        return updated;
    }
    
    /**
     * Get parameter value with fallback chain: parameter value -> config default -> provided default
     * @param parameters - Parameters object
     * @param paramName - Parameter name
     * @param config - Shader config
     * @param fallbackDefault - Fallback default value
     * @returns Parameter value
     */
    getParameterValue<T>(parameters: Record<string, ParameterValue>, paramName: string, config: ShaderConfig, fallbackDefault: T): T {
        const value = parameters[paramName];
        if (value !== undefined) {
            // Type assertion needed here because T could be number or boolean
            // but we know ParameterValue is number | boolean
            return value as T;
        }
        const paramConfig = config?.parameters?.[paramName];
        if (paramConfig?.default !== undefined) {
            // ParameterConfig.default is number, which is compatible with T when T is number
            return paramConfig.default as T;
        }
        return fallbackDefault;
    }
    
    /**
     * Update uniforms from a parameter definition array
     * Reduces boilerplate in plugin uniform update methods
     * @param paramDefs - Parameter definitions
     * @param parameters - Current parameter values
     * @param config - Shader config (for fallback defaults)
     * @returns Number of uniforms updated
     * @example
     * const params = [
     *   { name: 'uOuterGridSize', param: 'outerGridSize', default: 15.0, type: 'float' },
     *   { name: 'uInnerGridSize', param: 'innerGridSize', default: 3.0, type: 'float' }
     * ];
     * const updated = helper.updateFromParamDefs(params, shaderInstance.parameters, config);
     */
    updateFromParamDefs(paramDefs: ParameterDef[], parameters: Record<string, ParameterValue>, config: ShaderConfig = {}): number {
        let updated = 0;
        paramDefs.forEach(({ name, param, default: defaultValue, type = 'float' }) => {
            const paramConfig = config.parameters?.[param];
            const value = parameters[param] !== undefined 
                ? parameters[param] 
                : (paramConfig?.default ?? defaultValue);
            
            let wasUpdated = false;
            switch (type) {
                case 'float':
                    wasUpdated = this.updateFloat(name, this._isNumber(value) ? value : undefined, typeof defaultValue === 'number' ? defaultValue : undefined);
                    break;
                case 'int':
                    wasUpdated = this.updateInt(name, this._isNumber(value) ? value : undefined, typeof defaultValue === 'number' ? defaultValue : undefined);
                    break;
                case 'bool':
                    wasUpdated = this.updateBool(name, this._isBoolean(value) ? value : undefined, typeof defaultValue === 'boolean' ? defaultValue : undefined);
                    break;
                default:
                    // Unknown type - skip
                    break;
            }
            if (wasUpdated) updated++;
        });
        return updated;
    }
}

