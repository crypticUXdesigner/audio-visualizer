// WebGL Utility Functions
// Reusable WebGL helpers for shader compilation and setup

import { ShaderError, ErrorCodes } from '../../shaders/utils/ShaderErrors.js';
import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import { removeIncludeDirective } from '../../shaders/utils/IncludeDirectiveRemover.js';
import { hasErrorDetails } from '../../utils/errorGuards.js';

/**
 * Loads a shader source file from URL with retry mechanism
 * @param {string} url - Path to shader file
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<string>} Shader source code
 */
export async function loadShader(url: string, retries: number = 3): Promise<string> {
    // Get base URL from Vite (handles both dev and production)
    const baseUrl = import.meta.env.BASE_URL || '/';
    
    // Normalize the URL: if it starts with /, remove it; otherwise use as-is
    // Then prepend base URL
    const normalizedUrl = url.startsWith('/') ? url.substring(1) : url;
    const absoluteUrl = baseUrl + normalizedUrl;
    
    // Ensure base URL doesn't have double slashes
    const cleanUrl = absoluteUrl.replace(/([^:]\/)\/+/g, '$1');
    
    // Retry logic
    let lastError = null;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            // Add cache-busting query parameter with timestamp and random to prevent browser caching
            // This ensures each request is unique and bypasses browser cache
            const cacheBuster = `?v=${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const fetchUrl = cleanUrl + cacheBuster;
            
            if (attempt > 0) {
                ShaderLogger.info(`Retrying shader load (attempt ${attempt + 1}/${retries}): ${fetchUrl}`);
            } else {
                ShaderLogger.debug(`Loading shader: ${fetchUrl}`);
            }
            
            const response = await fetch(fetchUrl, {
                cache: 'no-store' // Prevent browser caching
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Failed to load shader: ${cleanUrl} (${response.status} ${response.statusText}). Response: ${errorText.substring(0, 100)}`);
            }
            
            const text = await response.text();
            
            // Check if we got HTML instead of GLSL (common when 404 returns index.html)
            if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
                throw new Error(`Shader file returned HTML instead of GLSL. Check that ${cleanUrl} exists and is accessible. Got: ${text.substring(0, 200)}`);
            }
            
            return text;
        } catch (error) {
            lastError = error;
            // Wait before retrying (exponential backoff)
            if (attempt < retries - 1) {
                const delay = 1000 * (attempt + 1); // 1s, 2s, 3s...
                const errorMessage = error instanceof Error ? error.message : String(error);
                ShaderLogger.warn(`Shader load failed, retrying in ${delay}ms...`, errorMessage);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error');
    const error = new Error(
        `Failed to load shader after ${retries} attempts: ${cleanUrl}. Last error: ${errorMessage}`
    );
    if (hasErrorDetails(error)) {
        error.details = {
            url: cleanUrl,
            attempts: retries,
            lastError: errorMessage,
            baseUrl: baseUrl
        };
    }
    throw error;
}

/**
 * Compiles a shader from source
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} source - Shader source code
 * @param {number} type - Shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER)
 * @returns {WebGLShader} Compiled shader
 */
export function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new ShaderError(
            'Failed to create shader',
            ErrorCodes.SHADER_COMPILATION_FAILED,
            { shaderType: type === gl.VERTEX_SHADER ? 'vertex' : 'fragment' }
        );
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new ShaderError(
            `Shader compilation error: ${error}`,
            ErrorCodes.SHADER_COMPILATION_FAILED,
            { 
                shaderType: type === gl.VERTEX_SHADER ? 'vertex' : 'fragment',
                error: error 
            }
        );
    }
    
    return shader;
}

/**
 * Processes #include directives in shader source
 * Recursively loads and inlines included files
 * @param {string} source - Shader source code with #include directives
 * @param {number} retries - Number of retry attempts for loading includes
 * @param {Set<string>} included - Set of already included files (prevents circular includes)
 * @param {string} basePath - Base path of the current shader file (for relative includes)
 * @returns {Promise<string>} Shader source with includes inlined
 */
export async function processIncludes(source: string, retries: number = 3, included: Set<string> = new Set(), basePath: string = ''): Promise<string> {
    // Use a more flexible regex that can match across multiple attempts
    const includeRegex = /#include\s+"([^"]+)"/g;
    let match;
    const includes = new Map();
    const directivesToRemove = []; // Collect directives to remove after iteration
    
    // First pass: find all includes and collect ones to remove
    includeRegex.lastIndex = 0;
    while ((match = includeRegex.exec(source)) !== null) {
        let includePath = match[1];
        const originalPath = includePath;
        
        // Normalize include paths to ensure they work with loadShader
        // Paths starting with 'shaders/' are already correct (relative to root)
        if (includePath.startsWith('shaders/')) {
            // Keep as-is - loadShader will handle base URL prepending
            // No change needed
        } else if (includePath.startsWith('/')) {
            // Absolute path starting with /: remove leading slash for loadShader
            // loadShader expects paths without leading slash
            includePath = includePath.substring(1);
        } else if (includePath.startsWith('common/') || includePath.startsWith('strings/')) {
            // Paths starting with 'common/' or 'strings/' are relative to shaders/ directory
            // not relative to the current file's directory
            // This handles cases like: #include "common/constants.glsl" from strings-fragment.glsl
            includePath = 'shaders/' + includePath;
        } else if (basePath) {
            // Other relative paths: resolve relative to base path
            const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
            includePath = baseDir + includePath;
        } else {
            // Relative path without base: assume it's relative to shaders/
            includePath = 'shaders/' + includePath;
        }
        
        if (!included.has(includePath)) {
            // Store both the normalized path and original path for error reporting
            includes.set(includePath, { directive: match[0], originalPath });
            ShaderLogger.debug(`[processIncludes] Found include: "${originalPath}" -> "${includePath}" (base: "${basePath}")`);
        } else {
            // Already included - collect for removal after iteration
            ShaderLogger.debug(`[processIncludes] Marking already-included directive for removal: "${includePath}"`);
            directivesToRemove.push({
                directive: match[0],
                includePath,
                originalPath
            });
        }
    }
    
    // Remove all already-included directives using optimized utility
    for (const { directive, includePath, originalPath } of directivesToRemove) {
        source = removeIncludeDirective(source, directive, includePath, originalPath);
    }
    
    // Load and replace includes
    for (const [includePath, includeInfo] of includes) {
        const includeDirective = includeInfo.directive;
        const originalPath = includeInfo.originalPath;
        
        // Note: Already-included files are removed during the finding phase above,
        // so we shouldn't encounter them here. But keep this check as a safety measure.
        if (included.has(includePath)) {
            // This shouldn't happen if removal worked correctly above, but handle it just in case
            ShaderLogger.debug(`[processIncludes] Skipping already-included (should have been removed): "${includePath}"`);
            continue;
        }
        
        included.add(includePath);
        ShaderLogger.debug(`[processIncludes] Processing include: "${includePath}"`);
        
        try {
            const includeSource = await loadShader(includePath, retries);
            ShaderLogger.debug(`[processIncludes] Successfully loaded: "${includePath}" (${includeSource.length} chars)`);
            
            // Recursively process includes in the included file
            const processedInclude = await processIncludes(includeSource, retries, included, includePath);
            
            // Replace the include directive with the processed source
            const escapedDirective = includeDirective.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const beforeReplace = source;
            source = source.replace(new RegExp(escapedDirective, 'g'), processedInclude);
            
            if (source === beforeReplace) {
                ShaderLogger.warn(`[processIncludes] WARNING: Include directive not replaced for "${includePath}"`);
                ShaderLogger.warn(`[processIncludes] Directive: "${includeDirective}"`);
                ShaderLogger.warn(`[processIncludes] Escaped: "${escapedDirective}"`);
            } else {
                ShaderLogger.debug(`[processIncludes] Successfully replaced include: "${includePath}"`);
            }
        } catch (error) {
            // Log detailed error information
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            const errorDetails = {
                includePath,
                originalPath: originalPath,
                basePath,
                error: errorMessage,
                errorStack: errorStack
            };
            
            ShaderLogger.error(`[processIncludes] Failed to load include: "${includePath}"`, errorDetails);
            
            // Check if this is a critical include (could be determined by naming convention or config)
            // Import ShaderConstants to check critical includes
            const criticalIncludes = ['uniforms.glsl', 'constants.glsl'];
            const isCritical = criticalIncludes.some(critical => includePath.includes(critical));
            
            if (isCritical) {
                // Critical includes should fail the entire shader compilation
                throw new Error(`Critical shader include failed to load: ${includePath}. Original error: ${errorMessage}`);
            }
            
            // Non-critical includes: remove directive and continue
            ShaderLogger.warn(`[processIncludes] Removing failed include directive (non-critical): "${includePath}"`);
            const escapedDirective = includeDirective.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedDirective, 'g');
            const beforeRemove = source;
            source = source.replace(regex, '');
            if (source === beforeRemove) {
                // Try a simpler replacement if regex fails
                source = source.replace(includeDirective, '');
                if (source === beforeRemove) {
                    // Last resort: try matching just the include path part
                    ShaderLogger.warn(`[processIncludes] Regex replacement failed, trying direct string replacement`);
                    const simpleDirective = `#include "${originalPath}"`;
                    source = source.replace(simpleDirective, '');
                    if (source === beforeRemove) {
                        // Final fallback: try with normalized path
                        const normalizedDirective = `#include "${includePath}"`;
                        source = source.replace(normalizedDirective, '');
                    }
                }
            }
            // Don't re-throw - continue processing other includes
            // This allows the shader to compile even if some includes fail
            ShaderLogger.warn(`[processIncludes] Continuing despite failed include: "${includePath}"`);
        }
    }
    
    // Final safety check: remove any remaining #include directives that weren't processed
    // This prevents compilation errors if something went wrong
    const remainingIncludes = source.match(/#include\s+"[^"]+"/g);
    if (remainingIncludes && remainingIncludes.length > 0) {
        ShaderLogger.warn(`[processIncludes] WARNING: ${remainingIncludes.length} include directives still remain after processing!`);
        ShaderLogger.warn(`[processIncludes] Removing remaining includes:`, remainingIncludes);
        source = source.replace(/#include\s+"[^"]+"/g, '');
    }
    
    return source;
}

/**
 * Creates a WebGL program from vertex and fragment shader sources
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} vertexSource - Vertex shader source
 * @param {string} fragmentSource - Fragment shader source
 * @returns {WebGLProgram} Linked program
 */
export function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
    const vertexShader = compileShader(gl, vertexSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);
    
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const error = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new ShaderError(
            `Program linking error: ${error}`,
            ErrorCodes.PROGRAM_LINKING_FAILED,
            { error }
        );
    }
    
    return program;
}

/**
 * Creates a fullscreen quad buffer
 * @param {WebGLRenderingContext} gl - WebGL context
 * @returns {WebGLBuffer} Buffer containing quad vertices
 */
export function createQuad(gl: WebGLRenderingContext): WebGLBuffer {
    const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
    ]);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    return buffer;
}

