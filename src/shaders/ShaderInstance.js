// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { loadShader, createProgram, createQuad, processIncludes } from '../core/shader/ShaderUtils.js';
import { safeSetContext } from '../core/monitoring/SentryInit.js';
import { createShaderPlugin } from './plugins/pluginFactory.js';
import { UniformManager } from './managers/UniformManager.js';
import { TextureManager } from './managers/TextureManager.js';
import { UniformLocationCache } from './managers/UniformLocationCache.js';
import { TimeOffsetManager } from './managers/TimeOffsetManager.js';
import { ColorTransitionManager } from './managers/ColorTransitionManager.js';
import { PixelSizeAnimationManager } from './managers/PixelSizeAnimationManager.js';
import { PerformanceMonitor } from './managers/PerformanceMonitor.js';
import { ShaderConstants } from './config/ShaderConstants.js';
import { ShaderError, ErrorCodes } from './utils/ShaderErrors.js';

export class ShaderInstance {
    constructor(canvasId, config) {
        this.canvasId = canvasId;
        this.config = config;
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.quadBuffer = null;
        this.uniformLocations = {};
        // Initialize parameters from config defaults
        this.parameters = {};
        if (config.parameters) {
            Object.entries(config.parameters).forEach(([name, paramConfig]) => {
                this.parameters[name] = paramConfig.default !== undefined ? paramConfig.default : 0;
            });
        }
        
        this.startTime = Date.now();
        this.isInitialized = false;
        this.renderLoopId = null;
        this.lastFrameTime = 0;
        
        // Initialize managers
        this.timeOffsetManager = new TimeOffsetManager(ShaderConstants.timeOffset);
        this.colorTransitionManager = new ColorTransitionManager(ShaderConstants.colorTransition);
        this.pixelSizeAnimationManager = new PixelSizeAnimationManager(ShaderConstants.pixelSizeAnimation);
        this.performanceMonitor = new PerformanceMonitor(ShaderConstants.performance);
        
        // WebGL fallback state
        this.webglFallbackActive = false;
        
        // Object pooling for ripple data arrays (performance optimization)
        // Reuse Float32Arrays instead of allocating new ones every frame
        const maxRipples = ShaderConstants.ripples.maxCount;
        this._rippleArrays = {
            centerX: new Float32Array(maxRipples),
            centerY: new Float32Array(maxRipples),
            times: new Float32Array(maxRipples),
            intensities: new Float32Array(maxRipples),
            widths: new Float32Array(maxRipples),
            minRadii: new Float32Array(maxRipples),
            maxRadii: new Float32Array(maxRipples),
            intensityMultipliers: new Float32Array(maxRipples),
            active: new Float32Array(maxRipples)
        };
        
        // Uniform update optimization (performance optimization)
        // Track last values to avoid unnecessary WebGL calls
        this._lastUniformValues = {};
        
        // Colors reference (set by render loop or updateColors)
        this._colors = null;
        
        // Track if we've rendered with colors yet (for first render callback)
        this._hasRenderedWithColors = false;
        
        // Create shader plugin for shader-specific functionality
        this.plugin = createShaderPlugin(this, config);
        
        // Uniform manager will be initialized after WebGL context is available
        this.uniformManager = null;
    }
    
    /**
     * Set a uniform value
     * @param {string} name - Uniform name
     * @param {number|number[]} value - Uniform value (float, vec2, vec3, etc.)
     */
    setUniform(name, value) {
        if (!this.isInitialized || !this.gl || !this.program) {
            throw new ShaderError('ShaderInstance not initialized', ErrorCodes.NOT_INITIALIZED);
        }
        
        const location = this.uniformLocations[name];
        if (!location) {
            throw new ShaderError(`Uniform "${name}" not found`, ErrorCodes.UNIFORM_NOT_FOUND, { name });
        }
        
        this.gl.useProgram(this.program);
        
        if (Array.isArray(value)) {
            if (value.length === 2) {
                this.gl.uniform2f(location, value[0], value[1]);
            } else if (value.length === 3) {
                this.gl.uniform3f(location, value[0], value[1], value[2]);
            } else if (value.length === 4) {
                this.gl.uniform4f(location, value[0], value[1], value[2], value[3]);
            }
        } else {
            this.gl.uniform1f(location, value);
        }
    }
    
    /**
     * Calculate adaptive number of bands based on screen width
     * Reduces bands on mobile devices to maintain visual style
     * @param {number} baseNumBands - Base number of bands from config
     * @returns {number} Adaptive number of bands
     */
    getAdaptiveNumBands(baseNumBands) {
        if (typeof window === 'undefined') {
            return baseNumBands; // Server-side or no window object
        }
        
        const screenWidth = window.innerWidth || document.documentElement.clientWidth || 1920;
        
        // On mobile (typically < 768px), reduce bands significantly to maintain visual impact
        if (screenWidth < 768) {
            // Reduce to ~12-16 bands on mobile for better visual style
            return Math.max(12, Math.floor(baseNumBands * 0.5));
        }
        
        // On tablets (768-1024px), slightly reduce
        if (screenWidth < 1024) {
            return Math.max(16, Math.floor(baseNumBands * 0.75));
        }
        
        // Desktop: use full count
        return baseNumBands;
    }
    
    
    async init() {
        if (this.isInitialized) {
            console.warn(`ShaderInstance ${this.config.name} already initialized`);
            return;
        }
        
        this.canvas = document.getElementById(this.canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas with id "${this.canvasId}" not found`);
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
            console.error('WebGL not supported on this device');
            this.showWebGLFallback();
            this.webglFallbackActive = true;
            return; // Don't continue initialization
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
        const hasDerivatives = !!this.ext;
        
        // Load and compile shaders with retry
        const vertexSource = await loadShader(this.config.vertexPath, 3);
        let fragmentSource = await loadShader(this.config.fragmentPath, 3);
        
        // Process #include directives in fragment shader (pass base path for relative includes)
        fragmentSource = await processIncludes(fragmentSource, 3, new Set(), this.config.fragmentPath);
        
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
            console.warn('OES_standard_derivatives extension not supported - using fallback');
            // Replace the macro definition to use a constant instead of fwidth
            fragmentSource = fragmentSource.replace(/#define FWIDTH\(x\) fwidth\(x\)/g, 
                '#define FWIDTH(x) 0.01');
            // FWIDTH(...) calls will now expand to 0.01
        }
        
        // Create program
        this.program = createProgram(this.gl, vertexSource, fragmentSource);
        
        // Create quad
        this.quadBuffer = createQuad(this.gl);
        
        // Cache uniform locations using UniformLocationCache
        this.uniformLocationCache = new UniformLocationCache(this.gl, this.program);
        const standardUniforms = this.uniformLocationCache.cacheStandardUniforms();
        const standardAttributes = this.uniformLocationCache.cacheStandardAttributes();
        this.uniformLocations = { ...standardUniforms, ...standardAttributes };
        
        // Set default threshold values
        this.uniformLocationCache.setDefaultThresholds(ShaderConstants.defaultThresholds);
        
        // Initialize uniform manager
        this.uniformManager = new UniformManager(this.gl, this.uniformLocations);
        this.uniformManager.lastValues = this._lastUniformValues;
        
        // Initialize texture manager
        this.textureManager = new TextureManager(this.gl);
        
        // Setup resize handler
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Call custom init hook if provided
        if (this.config.onInit) {
            this.config.onInit(this);
        }
        
        // Call plugin init hook
        if (this.plugin) {
            this.plugin.onInit();
        }
        
        // Set loudness controls for time offset manager
        if (typeof window !== 'undefined' && window._loudnessControls) {
            this.timeOffsetManager.setLoudnessControls(window._loudnessControls);
        }
        
        this.isInitialized = true;
        console.log(`ShaderInstance ${this.config.name} initialized`);
    }
    
    resize() {
        if (!this.canvas || !this.gl) return;
        
        const resizeConfig = this.performanceMonitor.getResizeConfig();
        
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
        
        // Update resolution uniform if program is ready
        if (this.program && this.uniformLocations.uResolution) {
            this.gl.useProgram(this.program);
            this.gl.uniform2f(this.uniformLocations.uResolution, this.canvas.width, this.canvas.height);
        }
        
    }
    
    setParameter(name, value) {
        if (!this.isInitialized) {
            throw new ShaderError('ShaderInstance not initialized', ErrorCodes.NOT_INITIALIZED);
        }
        
        if (!this.config.parameters || !(name in this.config.parameters)) {
            throw new ShaderError(`Parameter "${name}" not found`, ErrorCodes.INVALID_PARAMETER, { name });
        }
        
        this.parameters[name] = value;
        return true;
    }
    
    getParameter(name) {
        return this.parameters[name];
    }
    
    getAllParameters() {
        return { ...this.parameters };
    }
    render(audioData = null, colors = null) {
        if (!this.isInitialized || !this.gl || !this.program) return;
        
        const now = Date.now();
        const elapsed = now - this.lastFrameTime;
        const targetFrameInterval = 1000 / this.performanceMonitor.targetFPS;
        
        if (elapsed < targetFrameInterval) {
            return; // Skip frame to maintain target FPS
        }
        
        // Update lastFrameTime
        this.lastFrameTime = now;
        
        const gl = this.gl;
        const currentTime = (Date.now() - this.startTime) / 1000.0;
        const deltaTime = elapsed / 1000.0;
        
        // Update managers
        this.timeOffsetManager.update(audioData, deltaTime);
        
        // Update pixel size animation
        if (audioData && audioData.volume !== undefined) {
            const volume = audioData.volume || 0;
            const currentTimeMs = Date.now();
            this.pixelSizeAnimationManager.update(volume, currentTime, currentTimeMs);
        } else {
            // Update animation timing even without audio
            this.pixelSizeAnimationManager.update(0, currentTime, Date.now());
        }
        
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.useProgram(this.program);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        // Update uniforms using UniformManager
        if (this.uniformManager) {
            const resolution = [this.canvas.width, this.canvas.height];
            
            // Update standard uniforms
            this.uniformManager.updateStandardUniforms(
                this.parameters,
                currentTime,
                this.timeOffsetManager.getSmoothedOffset(),
                this.pixelSizeAnimationManager.getMultiplier(),
                resolution
            );
            
            // Update parameter uniforms
            this.uniformManager.updateParameterUniforms(this.parameters, this.config);
            
            // Update plugin-specific parameter uniforms
            if (this.plugin) {
                this.plugin.onUpdateParameterUniforms(this.parameters, this.config, this.uniformManager);
            }
            
            // Update ripple uniforms
            this.uniformManager.updateRippleUniforms(
                audioData?.rippleData,
                this._rippleArrays
            );
            
            // Update color uniforms
            this.uniformManager.updateColorUniforms(
                colors,
                () => this.colorTransitionManager.getCurrentColors(),
                { isTransitioning: this.colorTransitionManager.isTransitioning }
            );
            
            // Update audio uniforms
            this.uniformManager.updateAudioUniforms(
                audioData,
                this.config.uniformMapping,
                this.parameters
            );
        }
        
        // Call plugin hooks for shader-specific updates
        // Update textures (frequency textures, etc.)
        if (this.plugin && audioData) {
            this.plugin.onUpdateTextures(audioData, deltaTime);
        }
        
        // Update smoothing (tempo-based smoothing)
        if (this.plugin && audioData) {
            this.plugin.updateSmoothing(audioData, deltaTime);
        }
        
        // Update plugin-specific uniforms
        if (this.plugin) {
            this.plugin.onUpdateUniforms(audioData, colors, deltaTime);
        }
        
        // Audio uniforms are now handled by UniformManager above
        // Setup quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const positionLocation = this.uniformLocations.a_position;
        if (positionLocation !== null && positionLocation !== undefined) {
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        }
        
        gl.disable(gl.BLEND);
        
        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Notify on first render with colors
        if (colors && !this._hasRenderedWithColors) {
            this._hasRenderedWithColors = true;
            if (this._shaderManager && this._shaderManager.onFirstColorUpdate) {
                console.log('First frame rendered with colors - triggering callback');
                this._shaderManager.onFirstColorUpdate();
            }
        }
        
        // Call custom render hook if provided
        if (this.config.onRender) {
            this.config.onRender(this, audioData);
        }
    }
    
    startRenderLoop(audioAnalyzer, colors) {
        // Stop existing loop if running
        if (this.renderLoopId) {
            this.stopRenderLoop();
        }
        
        // Store references for render loop
        this._audioAnalyzer = audioAnalyzer;
        this._colors = colors;
        
        const render = () => {
            if (this.webglFallbackActive) {
                // Skip rendering if WebGL fallback is active
                this.renderLoopId = requestAnimationFrame(render);
                return;
            }
            
            if (this._audioAnalyzer) {
                this._audioAnalyzer.update();
            }
            
            // Get audio data
            const audioData = this._audioAnalyzer ? this._audioAnalyzer.getData() : null;
            
            // Update dynamic colors if callback is set (called before render)
            if (audioData && this._shaderManager && this._shaderManager.colorUpdateCallback) {
                this._shaderManager.colorUpdateCallback(audioData);
                // Colors may have been updated, refresh reference
                if (this._shaderManager.colors) {
                    this._colors = this._shaderManager.colors;
                }
            }
            
            // Always use current colors reference (may have been updated)
            const frameStartTime = Date.now();
            const previousFrameTime = this.lastFrameTime;
            this.render(audioData, this._colors);
            
            // Measure performance after rendering
            if (previousFrameTime > 0) {
                const elapsed = frameStartTime - previousFrameTime;
                this.performanceMonitor.recordFrame(elapsed, (newQuality) => {
                    // Quality changed, trigger resize
                    this.resize();
                });
            }
            
            this.renderLoopId = requestAnimationFrame(render);
        };
        
        this.renderLoopId = requestAnimationFrame(render);
    }
    
    /**
     * Update colors in the render loop without restarting
     * Starts a smooth transition from current colors to new colors
     * @param {Object} colors - New colors object
     */
    updateColors(colors) {
        if (!colors) return;
        
        const isFirstColorUpdate = !this._colors || !this.colorTransitionManager.currentColors;
        this._colors = colors;
        this.colorTransitionManager.startTransition(colors, isFirstColorUpdate);
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
        
        console.error('WebGL fallback UI displayed');
    }
    
    stopRenderLoop() {
        if (this.renderLoopId) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
    }
    
    destroy() {
        this.stopRenderLoop();
        
        // Call plugin destroy hook
        if (this.plugin) {
            this.plugin.onDestroy();
        }
        
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
        }
        
        if (this.gl && this.quadBuffer) {
            this.gl.deleteBuffer(this.quadBuffer);
        }
        
        // Clean up textures
        if (this.textureManager) {
            this.textureManager.destroyAll();
        }
        
        this.isInitialized = false;
    }
}

