// UniformUpdateHelper - Utility for updating shader uniforms with value caching
// Reduces boilerplate code in plugin uniform update methods

export class UniformUpdateHelper {
    /**
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Object} uniformLocations - Map of uniform names to locations
     * @param {Object} lastValues - Reference to last values cache (shared with UniformManager)
     */
    constructor(gl, uniformLocations, lastValues) {
        this.gl = gl;
        this.locations = uniformLocations;
        this.lastValues = lastValues;
    }
    
    /**
     * Update a float uniform if value has changed
     * @param {string} uniformName - Uniform name (e.g., 'uMinStringWidth')
     * @param {number} value - New value
     * @param {number} [defaultValue] - Default value if value is undefined
     * @returns {boolean} True if uniform was updated
     */
    updateFloat(uniformName, value, defaultValue) {
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
     * @param {string} uniformName - Uniform name
     * @param {number} value - New value
     * @param {number} [defaultValue] - Default value if value is undefined
     * @returns {boolean} True if uniform was updated
     */
    updateInt(uniformName, value, defaultValue) {
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
     * @param {string} uniformName - Uniform name
     * @param {number[]} value - New value [x, y]
     * @param {number[]} [defaultValue] - Default value
     * @returns {boolean} True if uniform was updated
     */
    updateVec2(uniformName, value, defaultValue) {
        const location = this.locations[uniformName];
        if (!location) return false;
        
        const finalValue = value || defaultValue || [0, 0];
        
        const lastValue = this.lastValues[uniformName];
        if (!lastValue || lastValue[0] !== finalValue[0] || lastValue[1] !== finalValue[1]) {
            this.gl.uniform2f(location, finalValue[0], finalValue[1]);
            this.lastValues[uniformName] = [finalValue[0], finalValue[1]];
            return true;
        }
        return false;
    }
    
    /**
     * Update a vec3 uniform if value has changed
     * @param {string} uniformName - Uniform name
     * @param {number[]} value - New value [x, y, z]
     * @param {number[]} [defaultValue] - Default value
     * @returns {boolean} True if uniform was updated
     */
    updateVec3(uniformName, value, defaultValue) {
        const location = this.locations[uniformName];
        if (!location) return false;
        
        const finalValue = value || defaultValue || [0, 0, 0];
        
        const lastValue = this.lastValues[uniformName];
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
     * @param {string} uniformName - Uniform name
     * @param {boolean} value - New value
     * @param {boolean} [defaultValue] - Default value
     * @returns {boolean} True if uniform was updated
     */
    updateBool(uniformName, value, defaultValue) {
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
     * @param {Object} paramMap - Map of uniform names to parameter names
     * @param {Object} parameters - Parameters object
     * @param {Object} [defaults] - Map of uniform names to default values
     * @returns {number} Number of uniforms updated
     */
    updateFloatsFromParams(paramMap, parameters, defaults = {}) {
        let updated = 0;
        Object.entries(paramMap).forEach(([uniformName, paramName]) => {
            const value = parameters[paramName];
            const defaultValue = defaults[uniformName];
            if (this.updateFloat(uniformName, value, defaultValue)) {
                updated++;
            }
        });
        return updated;
    }
    
    /**
     * Update multiple integer uniforms from a parameters object
     * @param {Object} paramMap - Map of uniform names to parameter names
     * @param {Object} parameters - Parameters object
     * @param {Object} [defaults] - Map of uniform names to default values
     * @returns {number} Number of uniforms updated
     */
    updateIntsFromParams(paramMap, parameters, defaults = {}) {
        let updated = 0;
        Object.entries(paramMap).forEach(([uniformName, paramName]) => {
            const value = parameters[paramName];
            const defaultValue = defaults[uniformName];
            if (this.updateInt(uniformName, value, defaultValue)) {
                updated++;
            }
        });
        return updated;
    }
    
    /**
     * Get parameter value with fallback chain: parameter value -> config default -> provided default
     * @param {Object} parameters - Parameters object
     * @param {string} paramName - Parameter name
     * @param {Object} config - Shader config
     * @param {*} fallbackDefault - Fallback default value
     * @returns {*} Parameter value
     */
    getParameterValue(parameters, paramName, config, fallbackDefault) {
        if (parameters[paramName] !== undefined) {
            return parameters[paramName];
        }
        const paramConfig = config?.parameters?.[paramName];
        if (paramConfig?.default !== undefined) {
            return paramConfig.default;
        }
        return fallbackDefault;
    }
}

