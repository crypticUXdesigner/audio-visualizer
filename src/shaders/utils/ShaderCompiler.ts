// Shader Compiler
// Handles shader loading, compilation, and program creation

import { loadShader, createProgram, createQuad, processIncludes } from '../../core/shader/ShaderUtils.js';
import { UniformLocationCache } from '../managers/UniformLocationCache.js';
import { UniformManager } from '../managers/UniformManager.js';
import { TextureManager } from '../managers/TextureManager.js';
import { ShaderConstants } from '../config/ShaderConstants.js';
import { ShaderError, ErrorCodes } from './ShaderErrors.js';
import { ShaderLogger } from './ShaderLogger.js';
import type { ShaderConfig, ParameterValue } from '../../types/index.js';

export interface CompiledShaderResult {
    program: WebGLProgram;
    quadBuffer: WebGLBuffer;
    uniformLocationCache: UniformLocationCache;
    uniformLocations: Record<string, WebGLUniformLocation | number | null>;
    uniformManager: UniformManager;
    textureManager: TextureManager;
}

export class ShaderCompiler {
    /**
     * Compile and link shaders into a WebGL program
     * @param gl - WebGL rendering context
     * @param config - Shader configuration
     * @param hasDerivatives - Whether OES_standard_derivatives extension is available
     * @param lastUniformValues - Previous uniform values for optimization
     * @returns Compiled shader result with program, buffers, and managers
     * @throws ShaderError If compilation or linking fails
     */
    static async compile(
        gl: WebGLRenderingContext,
        config: ShaderConfig,
        hasDerivatives: boolean,
        lastUniformValues: Record<string, ParameterValue> = {}
    ): Promise<CompiledShaderResult> {
        try {
            // Load and compile shaders with retry
            const vertexSource = await loadShader(config.vertexPath, 3);
            let fragmentSource = await loadShader(config.fragmentPath, 3);
            
            // Process #include directives in fragment shader (pass base path for relative includes)
            fragmentSource = await processIncludes(fragmentSource, 3, new Set(), config.fragmentPath);
            
            // Replace FWIDTH macro based on extension availability
            if (hasDerivatives) {
                // Extension available - enable it and use real fwidth
                fragmentSource = '#extension GL_OES_standard_derivatives : enable\n' + fragmentSource;
                // Remove the macro definition since fwidth will work directly
                fragmentSource = fragmentSource.replace(/#define FWIDTH\(x\) fwidth\(x\)/g, '');
                // Replace all FWIDTH(...) calls with fwidth(...)
                fragmentSource = fragmentSource.replace(/FWIDTH\(/g, 'fwidth(');
            } else {
                // Extension not available - use fallback implementation
                ShaderLogger.warn('OES_standard_derivatives extension not supported - using fallback');
                // Replace the macro definition to use a constant instead of fwidth
                fragmentSource = fragmentSource.replace(/#define FWIDTH\(x\) fwidth\(x\)/g, 
                    '#define FWIDTH(x) 0.01');
                // FWIDTH(...) calls will now expand to 0.01
            }
            
            // Create program
            const program = createProgram(gl, vertexSource, fragmentSource);
            
            // Create quad
            const quadBuffer = createQuad(gl);
            
            // Cache uniform locations using UniformLocationCache
            const uniformLocationCache = new UniformLocationCache(gl, program);
            
            // Auto-discover uniforms from shader program
            uniformLocationCache.discoverUniforms();
            
            // Cache standard uniforms (known uniforms for performance)
            const standardUniforms = uniformLocationCache.cacheStandardUniforms();
            const standardAttributes = uniformLocationCache.cacheStandardAttributes();
            
            // Merge discovered and standard uniforms (discovered takes precedence)
            const uniformLocations = { 
                ...uniformLocationCache.getAllUniformLocations(), // Discovered uniforms
                ...standardUniforms, 
                ...standardAttributes 
            };
            
            // Set default threshold values
            uniformLocationCache.setDefaultThresholds([...ShaderConstants.defaultThresholds]);
            
            // Initialize uniform manager
            const uniformManager = new UniformManager(gl, uniformLocations);
            uniformManager.lastValues = lastUniformValues;
            
            // Initialize texture manager
            const textureManager = new TextureManager(gl);
            
            return {
                program,
                quadBuffer,
                uniformLocationCache,
                uniformLocations,
                uniformManager,
                textureManager
            };
        } catch (error) {
            ShaderLogger.error(`Failed to compile shader ${config.name}:`, error);
            throw new ShaderError(
                `Shader compilation failed: ${error instanceof Error ? error.message : String(error)}`,
                ErrorCodes.COMPILATION_FAILED,
                { shaderName: config.name }
            );
        }
    }
    
    /**
     * Recompile shader after context restoration
     * @param gl - WebGL rendering context
     * @param config - Shader configuration
     * @param hasDerivatives - Whether OES_standard_derivatives extension is available
     * @param oldProgram - Old program to delete
     * @param oldQuadBuffer - Old quad buffer to delete
     * @param oldTextureManager - Old texture manager to destroy
     * @param lastUniformValues - Previous uniform values for optimization
     * @returns Compiled shader result with program, buffers, and managers
     */
    static async recompile(
        gl: WebGLRenderingContext,
        config: ShaderConfig,
        hasDerivatives: boolean,
        oldProgram: WebGLProgram | null,
        oldQuadBuffer: WebGLBuffer | null,
        oldTextureManager: TextureManager | null,
        lastUniformValues: Record<string, ParameterValue> = {}
    ): Promise<CompiledShaderResult> {
        // Clean up old resources
        if (oldProgram) {
            gl.deleteProgram(oldProgram);
        }
        if (oldQuadBuffer) {
            gl.deleteBuffer(oldQuadBuffer);
        }
        if (oldTextureManager) {
            oldTextureManager.destroyAll();
        }
        
        // Compile new shader
        return this.compile(gl, config, hasDerivatives, lastUniformValues);
    }
}

