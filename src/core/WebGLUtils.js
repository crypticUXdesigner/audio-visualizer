// WebGL Utility Functions
// Reusable WebGL helpers for shader compilation and setup

/**
 * Loads a shader source file from URL
 * @param {string} url - Path to shader file
 * @returns {Promise<string>} Shader source code
 */
export async function loadShader(url) {
    // Get base URL from Vite (handles both dev and production)
    const baseUrl = import.meta.env.BASE_URL || '/';
    
    // Normalize the URL: if it starts with /, remove it; otherwise use as-is
    // Then prepend base URL
    const normalizedUrl = url.startsWith('/') ? url.substring(1) : url;
    const absoluteUrl = baseUrl + normalizedUrl;
    
    // Ensure base URL doesn't have double slashes
    const cleanUrl = absoluteUrl.replace(/([^:]\/)\/+/g, '$1');
    
    // Add cache-busting query parameter with timestamp and random to prevent browser caching
    // This ensures each request is unique and bypasses browser cache
    const cacheBuster = `?v=${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fetchUrl = cleanUrl + cacheBuster;
    
    console.log(`Loading shader: ${fetchUrl}`);
    
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
}

/**
 * Compiles a shader from source
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} source - Shader source code
 * @param {number} type - Shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER)
 * @returns {WebGLShader} Compiled shader
 */
export function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation error: ${error}`);
    }
    
    return shader;
}

/**
 * Creates a WebGL program from vertex and fragment shader sources
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {string} vertexSource - Vertex shader source
 * @param {string} fragmentSource - Fragment shader source
 * @returns {WebGLProgram} Linked program
 */
export function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = compileShader(gl, vertexSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);
    
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const error = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program linking error: ${error}`);
    }
    
    return program;
}

/**
 * Creates a fullscreen quad buffer
 * @param {WebGLRenderingContext} gl - WebGL context
 * @returns {WebGLBuffer} Buffer containing quad vertices
 */
export function createQuad(gl) {
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

