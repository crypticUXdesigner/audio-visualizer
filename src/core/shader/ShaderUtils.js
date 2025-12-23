// WebGL Utility Functions
// Reusable WebGL helpers for shader compilation and setup

/**
 * Loads a shader source file from URL with retry mechanism
 * @param {string} url - Path to shader file
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<string>} Shader source code
 */
export async function loadShader(url, retries = 3) {
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
                console.log(`Retrying shader load (attempt ${attempt + 1}/${retries}): ${fetchUrl}`);
            } else {
                console.log(`Loading shader: ${fetchUrl}`);
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
                console.warn(`Shader load failed, retrying in ${delay}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    throw new Error(`Failed to load shader after ${retries} attempts: ${cleanUrl}. Last error: ${lastError?.message || 'Unknown error'}`);
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
 * Processes #include directives in shader source
 * Recursively loads and inlines included files
 * @param {string} source - Shader source code with #include directives
 * @param {number} retries - Number of retry attempts for loading includes
 * @param {Set<string>} included - Set of already included files (prevents circular includes)
 * @param {string} basePath - Base path of the current shader file (for relative includes)
 * @returns {Promise<string>} Shader source with includes inlined
 */
export async function processIncludes(source, retries = 3, included = new Set(), basePath = '') {
    const includeRegex = /#include\s+"([^"]+)"/g;
    let match;
    const includes = new Map();
    
    // Find all includes
    while ((match = includeRegex.exec(source)) !== null) {
        let includePath = match[1];
        const originalPath = includePath;
        
        // If include path is relative and we have a base path, resolve it
        if (!includePath.startsWith('/') && !includePath.startsWith('shaders/') && basePath) {
            // Relative path: resolve relative to base path
            const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
            includePath = baseDir + includePath;
        } else if (!includePath.startsWith('/') && !includePath.startsWith('shaders/')) {
            // Relative path without base: assume it's relative to shaders/
            includePath = 'shaders/' + includePath;
        }
        
        if (!included.has(includePath)) {
            includes.set(includePath, match[0]);
            console.log(`[processIncludes] Found include: "${originalPath}" -> "${includePath}" (base: "${basePath}")`);
        } else {
            console.log(`[processIncludes] Skipping already included: "${includePath}"`);
        }
    }
    
    // Load and replace includes
    for (const [includePath, includeDirective] of includes) {
        if (included.has(includePath)) {
            // Skip circular includes
            console.log(`[processIncludes] Removing circular include: "${includePath}"`);
            source = source.replace(includeDirective, '');
            continue;
        }
        
        included.add(includePath);
        console.log(`[processIncludes] Processing include: "${includePath}"`);
        
        try {
            const includeSource = await loadShader(includePath, retries);
            console.log(`[processIncludes] Successfully loaded: "${includePath}" (${includeSource.length} chars)`);
            
            // Recursively process includes in the included file
            const processedInclude = await processIncludes(includeSource, retries, included, includePath);
            
            // Replace the include directive with the processed source
            const escapedDirective = includeDirective.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const beforeReplace = source;
            source = source.replace(new RegExp(escapedDirective, 'g'), processedInclude);
            
            if (source === beforeReplace) {
                console.warn(`[processIncludes] WARNING: Include directive not replaced for "${includePath}"`);
                console.warn(`[processIncludes] Directive: "${includeDirective}"`);
                console.warn(`[processIncludes] Escaped: "${escapedDirective}"`);
            } else {
                console.log(`[processIncludes] Successfully replaced include: "${includePath}"`);
            }
        } catch (error) {
            // If include fails to load, remove the directive and log error
            console.error(`[processIncludes] Failed to load include: "${includePath}"`, error);
            console.error(`[processIncludes] Removing failed include directive`);
            const escapedDirective = includeDirective.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedDirective, 'g');
            const beforeRemove = source;
            source = source.replace(regex, '');
            if (source === beforeRemove) {
                // Try a simpler replacement if regex fails
                source = source.replace(includeDirective, '');
            }
            // Don't re-throw - continue processing other includes
            // This allows the shader to compile even if some includes fail
            console.warn(`[processIncludes] Continuing despite failed include: "${includePath}"`);
        }
    }
    
    // Final safety check: remove any remaining #include directives that weren't processed
    // This prevents compilation errors if something went wrong
    const remainingIncludes = source.match(/#include\s+"[^"]+"/g);
    if (remainingIncludes && remainingIncludes.length > 0) {
        console.warn(`[processIncludes] WARNING: ${remainingIncludes.length} include directives still remain after processing!`);
        console.warn(`[processIncludes] Removing remaining includes:`, remainingIncludes);
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

