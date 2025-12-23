// ShaderErrors - Standardized error handling for shader system

export class ShaderError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'ShaderError';
        this.code = code;
        this.details = details;
    }
}

export const ErrorCodes = {
    NOT_INITIALIZED: 'NOT_INITIALIZED',
    INVALID_PARAMETER: 'INVALID_PARAMETER',
    UNIFORM_NOT_FOUND: 'UNIFORM_NOT_FOUND',
    WEBGL_ERROR: 'WEBGL_ERROR',
    INVALID_CONFIG: 'INVALID_CONFIG'
};

export function handleShaderError(error, context = '') {
    if (error instanceof ShaderError) {
        console.error(`[ShaderError${context ? `: ${context}` : ''}]`, error.message, error.details);
        return error;
    }
    console.error(`[ShaderError${context ? `: ${context}` : ''}]`, error);
    return new ShaderError(error.message, ErrorCodes.WEBGL_ERROR, { originalError: error });
}

