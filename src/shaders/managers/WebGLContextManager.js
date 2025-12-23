// WebGLContextManager - Manages WebGL context creation and canvas setup
// Handles WebGL context initialization, fallback UI, and resize operations

import { ShaderError, ErrorCodes } from '../utils/ShaderErrors.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';
import { safeSetContext } from '../../core/monitoring/SentryInit.js';

export class WebGLContextManager {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = null;
        this.gl = null;
        this.ext = null;
        this.webglFallbackActive = false;
        this.onContextLost = null; // Callback for context lost
        this.onContextRestored = null; // Callback for context restored
        this._contextLostHandler = null;
        this._contextRestoredHandler = null;
    }
    
    /**
     * Initialize WebGL context
     * @returns {Promise<boolean>} True if WebGL context was successfully created, false if fallback is active
     */
    async initialize() {
        this.canvas = document.getElementById(this.canvasId);
        if (!this.canvas) {
            throw new ShaderError(
                `Canvas with id "${this.canvasId}" not found`,
                ErrorCodes.CANVAS_NOT_FOUND,
                { canvasId: this.canvasId }
            );
        }
        
        // Get WebGL context with fallback support
        const contextAttributes = {
            alpha: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            antialias: false,
            depth: false,
            stencil: false,
            failIfMajorPerformanceCaveat: false
        };
        
        // Try WebGL2 first, then WebGL1, then experimental-webgl
        this.gl = this.canvas.getContext('webgl2', contextAttributes) ||
                  this.canvas.getContext('webgl', contextAttributes) ||
                  this.canvas.getContext('experimental-webgl', contextAttributes);
        
        if (!this.gl) {
            // WebGL not supported - show fallback UI
            ShaderLogger.error('WebGL not supported on this device');
            this.showWebGLFallback();
            this.webglFallbackActive = true;
            return false; // Don't continue initialization
        }
        
        // Set WebGL context info as Sentry context
        safeSetContext("webgl", {
            vendor: this.gl.getParameter(this.gl.VENDOR),
            renderer: this.gl.getParameter(this.gl.RENDERER),
            version: this.gl.getParameter(this.gl.VERSION),
            maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),
            maxViewportDims: this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS),
            maxVertexAttribs: this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS),
            maxVertexTextureImageUnits: this.gl.getParameter(this.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
            maxTextureImageUnits: this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS),
            maxFragmentUniformVectors: this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_VECTORS),
            maxVertexUniformVectors: this.gl.getParameter(this.gl.MAX_VERTEX_UNIFORM_VECTORS),
            extensions: this.gl.getSupportedExtensions(),
        });
        
        // Enable extensions
        this.ext = this.gl.getExtension('OES_standard_derivatives');
        
        // Set up context lost/restored handlers
        this._contextLostHandler = (event) => {
            event.preventDefault();
            ShaderLogger.error('WebGL context lost - attempting recovery');
            this.webglFallbackActive = true;
            if (this.onContextLost) {
                this.onContextLost();
            }
        };
        
        this._contextRestoredHandler = () => {
            ShaderLogger.info('WebGL context restored - reinitializing');
            this.webglFallbackActive = false;
            // Re-get context with same attributes
            const contextAttributes = {
                alpha: false,
                premultipliedAlpha: false,
                preserveDrawingBuffer: false,
                antialias: false,
                depth: false,
                stencil: false,
                failIfMajorPerformanceCaveat: false
            };
            this.gl = this.canvas.getContext('webgl2', contextAttributes) ||
                      this.canvas.getContext('webgl', contextAttributes) ||
                      this.canvas.getContext('experimental-webgl', contextAttributes);
            if (this.gl) {
                this.ext = this.gl.getExtension('OES_standard_derivatives');
                if (this.onContextRestored) {
                    this.onContextRestored();
                }
            }
        };
        
        this.canvas.addEventListener('webglcontextlost', this._contextLostHandler);
        this.canvas.addEventListener('webglcontextrestored', this._contextRestoredHandler);
        
        return true;
    }
    
    /**
     * Clean up context managers and remove event listeners
     */
    destroy() {
        if (this.canvas && this._contextLostHandler) {
            this.canvas.removeEventListener('webglcontextlost', this._contextLostHandler);
        }
        if (this.canvas && this._contextRestoredHandler) {
            this.canvas.removeEventListener('webglcontextrestored', this._contextRestoredHandler);
        }
        this._contextLostHandler = null;
        this._contextRestoredHandler = null;
        this.onContextLost = null;
        this.onContextRestored = null;
    }
    
    /**
     * Show fallback UI when WebGL is not supported
     */
    showWebGLFallback() {
        if (!this.canvas) return;
        
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        
        // Set canvas size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        
        // Draw fallback message
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const message = 'WebGL is not supported on this device.\nPlease use a modern browser with WebGL support.';
        const lines = message.split('\n');
        const lineHeight = 32;
        const startY = this.canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, this.canvas.width / 2, startY + index * lineHeight);
        });
        
        ShaderLogger.error('WebGL fallback UI displayed');
    }
    
    /**
     * Resize the canvas and update viewport
     * Applies performance-based resolution capping and quality scaling
     * @param {Object} resizeConfig - Resize configuration from PerformanceMonitor
     */
    resize(resizeConfig) {
        if (!this.canvas || !this.gl) return;
        
        // Cap devicePixelRatio for performance
        const dpr = Math.min(window.devicePixelRatio || 1, resizeConfig.maxDPR);
        
        // Cap viewport dimensions for performance
        const viewportWidth = Math.min(document.documentElement.clientWidth, resizeConfig.maxResolutionWidth);
        const viewportHeight = Math.min(document.documentElement.clientHeight, resizeConfig.maxResolutionHeight);
        
        // Apply quality scaling
        const scaledDPR = dpr * resizeConfig.qualityLevel;
        const newWidth = Math.floor(viewportWidth * scaledDPR);
        const newHeight = Math.floor(viewportHeight * scaledDPR);
        
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.canvas.style.width = viewportWidth + 'px';
        this.canvas.style.height = viewportHeight + 'px';
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
}

