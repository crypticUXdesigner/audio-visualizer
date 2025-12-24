// ShaderErrors - Standardized error handling for shader system

import { ShaderLogger } from './ShaderLogger.js';

export class ShaderError extends Error {
    code: string;
    details: Record<string, unknown>;
    
    constructor(message: string, code: string, details: Record<string, unknown> = {}) {
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
    INVALID_CONFIG: 'INVALID_CONFIG',
    CANVAS_NOT_FOUND: 'CANVAS_NOT_FOUND',
    SHADER_COMPILATION_FAILED: 'SHADER_COMPILATION_FAILED',
    PROGRAM_LINKING_FAILED: 'PROGRAM_LINKING_FAILED',
    TEXTURE_UNIT_EXHAUSTED: 'TEXTURE_UNIT_EXHAUSTED'
} as const;

export function handleShaderError(error: Error | ShaderError, context: string = ''): ShaderError {
    if (error instanceof ShaderError) {
        ShaderLogger.error(`[ShaderError${context ? `: ${context}` : ''}]`, error.message, error.details);
        return error;
    }
    ShaderLogger.error(`[ShaderError${context ? `: ${context}` : ''}]`, error);
    return new ShaderError(error.message, ErrorCodes.WEBGL_ERROR, { originalError: error });
}

