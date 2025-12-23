// TextureManager - Centralized texture management
// Handles WebGL texture creation and updates for frequency data

export class TextureManager {
    /**
     * @param {WebGLRenderingContext} gl - WebGL context
     */
    constructor(gl) {
        this.gl = gl;
        this.textures = new Map();
    }
    
    /**
     * Create or update a frequency data texture
     * @param {Float32Array} data - Texture data (interleaved RG channels)
     * @param {number} width - Texture width (number of bands)
     * @param {string} textureKey - Key to identify the texture
     * @returns {WebGLTexture} The texture
     */
    createFrequencyTexture(data, width, textureKey) {
        const gl = this.gl;
        
        // Check for float texture support
        const floatTextureExt = gl.getExtension('OES_texture_float');
        const useFloat = !!floatTextureExt;
        
        // Get existing texture or create new one
        let texture = this.textures.get(textureKey);
        const existingTexture = !!texture;
        
        if (!texture) {
            texture = gl.createTexture();
            this.textures.set(textureKey, texture);
        }
        
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        if (useFloat) {
            // Use LUMINANCE_ALPHA format with FLOAT: LUMINANCE = left channel, ALPHA = right channel
            if (!existingTexture) {
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.LUMINANCE_ALPHA,
                    width,
                    1,
                    0,
                    gl.LUMINANCE_ALPHA,
                    gl.FLOAT,
                    data
                );
            } else {
                gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    0,
                    0, 0,
                    width,
                    1,
                    gl.LUMINANCE_ALPHA,
                    gl.FLOAT,
                    data
                );
            }
        } else {
            // Fallback: convert to UNSIGNED_BYTE (0-255 range)
            const byteData = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                byteData[i] = Math.floor(Math.max(0, Math.min(255, data[i] * 255.0)));
            }
            
            if (!existingTexture) {
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.LUMINANCE_ALPHA,
                    width,
                    1,
                    0,
                    gl.LUMINANCE_ALPHA,
                    gl.UNSIGNED_BYTE,
                    byteData
                );
            } else {
                gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    0,
                    0, 0,
                    width,
                    1,
                    gl.LUMINANCE_ALPHA,
                    gl.UNSIGNED_BYTE,
                    byteData
                );
            }
        }
        
        // Enable linear filtering for smooth interpolation
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        return texture;
    }
    
    /**
     * Bind a texture to a specific texture unit
     * @param {WebGLTexture} texture - Texture to bind
     * @param {number} textureUnit - Texture unit (0, 1, 2, etc.)
     */
    bindTexture(texture, textureUnit) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    
    /**
     * Destroy a texture
     * @param {string} textureKey - Key identifying the texture
     */
    destroyTexture(textureKey) {
        const texture = this.textures.get(textureKey);
        if (texture) {
            this.gl.deleteTexture(texture);
            this.textures.delete(textureKey);
        }
    }
    
    /**
     * Destroy all textures
     */
    destroyAll() {
        this.textures.forEach((texture) => {
            this.gl.deleteTexture(texture);
        });
        this.textures.clear();
    }
}
