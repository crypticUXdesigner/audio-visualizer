// TextureManager - Centralized texture management
// Handles WebGL texture creation and updates for frequency data

import { ShaderError, ErrorCodes } from '../utils/ShaderErrors.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';

interface TextureResult {
    texture: WebGLTexture;
    unit: number;
}

export class TextureManager {
    gl: WebGLRenderingContext;
    textures: Map<string, WebGLTexture>;
    textureUnitBindings: Map<string, number>;
    textureUnitToKey: Map<number, string>;
    textureUnitUsage: Map<string, number>;
    nextAvailableUnit: number;
    maxTextureUnits: number;
    
    /**
     * @param gl - WebGL context
     */
    constructor(gl: WebGLRenderingContext) {
        this.gl = gl;
        this.textures = new Map();
        this.textureUnitBindings = new Map(); // textureKey -> textureUnit
        this.textureUnitToKey = new Map(); // textureUnit -> textureKey
        this.textureUnitUsage = new Map(); // textureKey -> lastUsedTime
        this.nextAvailableUnit = 0;
        this.maxTextureUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) || 8;
    }
    
    /**
     * Find the least recently used texture key
     * @returns LRU texture key or null if none found
     */
    findLRUTexture(): string | null {
        let oldestTime = Infinity;
        let lruKey: string | null = null;
        for (const [key, time] of this.textureUnitUsage) {
            if (time < oldestTime) {
                oldestTime = time;
                lruKey = key;
            }
        }
        return lruKey;
    }
    
    /**
     * Evict a texture from its allocated unit
     * @param textureKey - Key identifying the texture to evict
     */
    evictTexture(textureKey: string): void {
        const unit = this.textureUnitBindings.get(textureKey);
        if (unit !== undefined) {
            this.textureUnitBindings.delete(textureKey);
            this.textureUnitToKey.delete(unit);
            this.textureUnitUsage.delete(textureKey);
            // Update nextAvailableUnit to allow reuse of evicted unit
            this.nextAvailableUnit = Math.min(this.nextAvailableUnit, unit);
        }
    }
    
    /**
     * Allocate a texture unit for a texture
     * Uses LRU eviction if all units are exhausted
     * @param textureKey - Key identifying the texture
     * @returns Texture unit number
     * @throws {ShaderError} If all texture units are in use and cannot evict
     */
    allocateTextureUnit(textureKey: string): number {
        if (this.textureUnitBindings.has(textureKey)) {
            // Update usage time
            this.textureUnitUsage.set(textureKey, performance.now());
            return this.textureUnitBindings.get(textureKey)!;
        }
        
        if (this.nextAvailableUnit >= this.maxTextureUnits) {
            // Evict least recently used texture
            const lruKey = this.findLRUTexture();
            if (lruKey) {
                ShaderLogger.warn(`TextureManager: Evicting LRU texture "${lruKey}" to allocate "${textureKey}"`);
                this.evictTexture(lruKey);
            } else {
                throw new ShaderError(
                    'All texture units in use and cannot evict',
                    ErrorCodes.TEXTURE_UNIT_EXHAUSTED,
                    { maxUnits: this.maxTextureUnits, requestedKey: textureKey }
                );
            }
        }
        
        const unit = this.nextAvailableUnit++;
        this.textureUnitBindings.set(textureKey, unit);
        this.textureUnitToKey.set(unit, textureKey);
        this.textureUnitUsage.set(textureKey, performance.now());
        return unit;
    }
    
    /**
     * Create or update a frequency data texture
     * @param data - Texture data (interleaved RG channels)
     * @param width - Texture width (number of bands)
     * @param textureKey - Key to identify the texture
     * @returns { texture: WebGLTexture, unit: number }
     */
    createFrequencyTexture(data: Float32Array, width: number, textureKey: string): TextureResult {
        const gl = this.gl;
        
        // Check for float texture support
        const floatTextureExt = gl.getExtension('OES_texture_float');
        const useFloat = !!floatTextureExt;
        
        // Get existing texture or create new one
        let texture = this.textures.get(textureKey);
        const existingTexture = !!texture;
        
        if (!texture) {
            texture = gl.createTexture();
            if (!texture) {
                throw new ShaderError('Failed to create texture', ErrorCodes.WEBGL_ERROR);
            }
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
        
        // Allocate texture unit for this texture
        const unit = this.allocateTextureUnit(textureKey);
        
        return { texture, unit };
    }
    
    /**
     * Bind a texture to its allocated texture unit
     * @param texture - Texture to bind
     * @param textureKey - Key identifying the texture
     * @returns Texture unit number
     */
    bindTextureByKey(texture: WebGLTexture, textureKey: string): number {
        const unit = this.textureUnitBindings.get(textureKey);
        if (unit === undefined) {
            ShaderLogger.warn(`TextureManager: Texture key "${textureKey}" not found, allocating new unit`);
            const newUnit = this.allocateTextureUnit(textureKey);
            this.bindTexture(texture, newUnit);
            return newUnit;
        }
        // Update usage time when binding
        this.textureUnitUsage.set(textureKey, performance.now());
        this.bindTexture(texture, unit);
        return unit;
    }
    
    /**
     * Bind a texture to a specific texture unit
     * @param texture - Texture to bind
     * @param textureUnit - Texture unit (0, 1, 2, etc.)
     */
    bindTexture(texture: WebGLTexture, textureUnit: number): void {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    
    /**
     * Destroy a texture
     * @param textureKey - Key identifying the texture
     */
    destroyTexture(textureKey: string): void {
        const texture = this.textures.get(textureKey);
        if (texture) {
            this.gl.deleteTexture(texture);
            this.textures.delete(textureKey);
            this.evictTexture(textureKey); // Use evictTexture for consistent cleanup
        }
    }
    
    /**
     * Destroy all textures
     */
    destroyAll(): void {
        this.textures.forEach((texture) => {
            this.gl.deleteTexture(texture);
        });
        this.textures.clear();
        this.textureUnitBindings.clear();
        this.textureUnitToKey.clear();
        this.textureUnitUsage.clear();
        this.nextAvailableUnit = 0;
    }
}

