// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { loadShader, createProgram, createQuad, processIncludes } from '../core/shader/ShaderUtils.js';
import { createShaderPlugin } from './plugins/pluginFactory.js';
import { UniformManager } from './managers/UniformManager.js';
import { TextureManager } from './managers/TextureManager.js';
import { UniformLocationCache } from './managers/UniformLocationCache.js';
import { TimeOffsetManager } from './managers/TimeOffsetManager.js';
import { ColorTransitionManager } from './managers/ColorTransitionManager.js';
import { PixelSizeAnimationManager } from './managers/PixelSizeAnimationManager.js';
import { PerformanceMonitor } from './managers/PerformanceMonitor.js';
import { WebGLContextManager } from './managers/WebGLContextManager.js';
import { ShaderConstants } from './config/ShaderConstants.js';
import { ShaderError, ErrorCodes } from './utils/ShaderErrors.js';
import { ShaderLogger } from './utils/ShaderLogger.js';
import { safeCaptureException } from '../core/monitoring/SentryInit.js';

export class ShaderInstance {
    constructor(canvasId, config) {
        this.canvasId = canvasId;
        this.config = config;
        this.webglContext = new WebGLContextManager(canvasId);
        this.canvas = null; // Will be set from webglContext after initialization
        this.gl = null; // Will be set from webglContext after initialization
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
        
        this.startTime = performance.now();
        this.isInitialized = false;
        this.renderLoopId = null;
        this.lastFrameTime = 0;
        
        // Resize handler reference for cleanup
        this._resizeHandler = null;
        
        // Initialize managers
        this.timeOffsetManager = new TimeOffsetManager(ShaderConstants.timeOffset);
        this.colorTransitionManager = new ColorTransitionManager(ShaderConstants.colorTransition);
        this.pixelSizeAnimationManager = new PixelSizeAnimationManager(ShaderConstants.pixelSizeAnimation);
        this.performanceMonitor = new PerformanceMonitor(ShaderConstants.performance);
        
        // WebGL fallback state (managed by WebGLContextManager)
        this.webglFallbackActive = false; // Will be set by webglContext
        
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
        const adaptive = ShaderConstants.adaptive;
        
        // On mobile (typically < 768px), reduce bands significantly to maintain visual impact
        if (screenWidth < adaptive.mobileBreakpoint) {
            // Reduce to ~12-16 bands on mobile for better visual style
            return Math.max(
                adaptive.minMobileBands, 
                Math.floor(baseNumBands * adaptive.mobileBandReduction)
            );
        }
        
        // On tablets (768-1024px), slightly reduce
        if (screenWidth < adaptive.tabletBreakpoint) {
            return Math.max(
                adaptive.minTabletBands, 
                Math.floor(baseNumBands * adaptive.tabletBandReduction)
            );
        }
        
        // Desktop: use full count
        return baseNumBands;
    }
    
    /**
     * Validate that all managers are initialized
     * @throws {ShaderError} If managers are not initialized
     */
    _validateManagers() {
        if (!this.uniformManager || !this.timeOffsetManager || 
            !this.pixelSizeAnimationManager || !this.colorTransitionManager ||
            !this.performanceMonitor) {
            throw new ShaderError(
                'Managers not initialized',
                ErrorCodes.NOT_INITIALIZED,
                {
                    shaderName: this.config.name,
                    uniformManager: !!this.uniformManager,
                    timeOffsetManager: !!this.timeOffsetManager,
                    pixelSizeAnimationManager: !!this.pixelSizeAnimationManager,
                    colorTransitionManager: !!this.colorTransitionManager,
                    performanceMonitor: !!this.performanceMonitor
                }
            );
        }
    }
    
    
    /**
     * Initialize the shader instance
     * Loads and compiles shaders, sets up WebGL context, initializes managers
     * @throws {Error} If canvas element is not found
     * @throws {Error} If shader compilation or linking fails
     * @returns {Promise<void>}
     */
    async init() {
        if (this.isInitialized) {
            ShaderLogger.warn(`ShaderInstance ${this.config.name} already initialized`);
            return;
        }
        
        try {
            // Get WebGL context from manager
            const initialized = await this.webglContext.initialize();
            if (!initialized) {
                this.webglFallbackActive = this.webglContext.webglFallbackActive;
                return; // Don't continue initialization
            }
            
            // Set up context lost/restored handlers
            this.webglContext.onContextLost = () => {
                this._onContextLost();
            };
            this.webglContext.onContextRestored = () => {
                this._onContextRestored();
            };
            
            // Get references from context manager
            this.gl = this.webglContext.gl;
            this.canvas = this.webglContext.canvas;
            this.ext = this.webglContext.ext;
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
                ShaderLogger.warn('OES_standard_derivatives extension not supported - using fallback');
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
            
            // Auto-discover uniforms from shader program
            this.uniformLocationCache.discoverUniforms();
            
            // Cache standard uniforms (known uniforms for performance)
            const standardUniforms = this.uniformLocationCache.cacheStandardUniforms();
            const standardAttributes = this.uniformLocationCache.cacheStandardAttributes();
            
            // Merge discovered and standard uniforms (discovered takes precedence)
            this.uniformLocations = { 
                ...this.uniformLocationCache.getAllUniformLocations(), // Discovered uniforms
                ...standardUniforms, 
                ...standardAttributes 
            };
            
            // Set default threshold values
            this.uniformLocationCache.setDefaultThresholds(ShaderConstants.defaultThresholds);
            
            // Initialize uniform manager
            this.uniformManager = new UniformManager(this.gl, this.uniformLocations);
            this.uniformManager.lastValues = this._lastUniformValues;
            
            // Initialize texture manager
            this.textureManager = new TextureManager(this.gl);
            
            // Setup resize handler
            this.resize();
            this._resizeHandler = () => this.resize();
            window.addEventListener('resize', this._resizeHandler);
            
            // Call custom init hook if provided
            if (this.config.onInit) {
                this.config.onInit(this);
            }
            
            // Call plugin init hook
            if (this.plugin) {
                this.plugin.onInit();
            }
            
            // Loudness controls should be injected via ShaderManager or App
            // This is handled externally, not via global window object
            
            this.isInitialized = true;
            ShaderLogger.info(`ShaderInstance ${this.config.name} initialized`);
        } catch (error) {
            ShaderLogger.error(`Failed to initialize shader ${this.config.name}:`, error);
            this.webglFallbackActive = true;
            
            // Show fallback UI
            if (this.webglContext) {
                this.webglContext.showWebGLFallback();
            }
            
            // Don't throw - allow app to continue in degraded mode
            safeCaptureException(error);
            return;
        }
    }
    
    /**
     * Handle WebGL context lost event
     */
    _onContextLost() {
        ShaderLogger.warn(`ShaderInstance ${this.config.name}: WebGL context lost`);
        this.stopRenderLoop();
        this.webglFallbackActive = true;
    }
    
    /**
     * Handle WebGL context restored event
     */
    async _onContextRestored() {
        ShaderLogger.info(`ShaderInstance ${this.config.name}: WebGL context restored, reinitializing`);
        await this._reinitializeAfterContextRestore();
    }
    
    /**
     * Reinitialize shader after WebGL context restoration
     */
    async _reinitializeAfterContextRestore() {
        if (!this.webglContext || !this.webglContext.gl) {
            return false;
        }
        
        try {
            // Re-get context references
            this.gl = this.webglContext.gl;
            this.canvas = this.webglContext.canvas;
            this.ext = this.webglContext.ext;
            const hasDerivatives = !!this.ext;
            
            // Reload and recompile shaders
            const vertexSource = await loadShader(this.config.vertexPath, 3);
            let fragmentSource = await loadShader(this.config.fragmentPath, 3);
            fragmentSource = await processIncludes(fragmentSource, 3, new Set(), this.config.fragmentPath);
            
            // Handle derivatives extension
            if (hasDerivatives) {
                fragmentSource = '#extension GL_OES_standard_derivatives : enable\n' + fragmentSource;
                fragmentSource = fragmentSource.replace(/#define FWIDTH\(x\) fwidth\(x\)/g, '');
                fragmentSource = fragmentSource.replace(/FWIDTH\(/g, 'fwidth(');
            } else {
                fragmentSource = fragmentSource.replace(/#define FWIDTH\(x\) fwidth\(x\)/g, 
                    '#define FWIDTH(x) 0.01');
            }
            
            // Recreate program
            if (this.program) {
                this.gl.deleteProgram(this.program);
            }
            this.program = createProgram(this.gl, vertexSource, fragmentSource);
            
            // Recreate quad buffer
            if (this.quadBuffer) {
                this.gl.deleteBuffer(this.quadBuffer);
            }
            this.quadBuffer = createQuad(this.gl);
            
            // Reinitialize uniform locations
            this.uniformLocationCache = new UniformLocationCache(this.gl, this.program);
            this.uniformLocationCache.discoverUniforms();
            const standardUniforms = this.uniformLocationCache.cacheStandardUniforms();
            const standardAttributes = this.uniformLocationCache.cacheStandardAttributes();
            this.uniformLocations = { 
                ...this.uniformLocationCache.getAllUniformLocations(),
                ...standardUniforms, 
                ...standardAttributes 
            };
            this.uniformLocationCache.setDefaultThresholds(ShaderConstants.defaultThresholds);
            
            // Reinitialize managers
            this.uniformManager = new UniformManager(this.gl, this.uniformLocations);
            this.uniformManager.lastValues = this._lastUniformValues;
            
            // Reinitialize texture manager
            if (this.textureManager) {
                this.textureManager.destroyAll();
            }
            this.textureManager = new TextureManager(this.gl);
            
            // Call plugin reinit hook
            if (this.plugin && typeof this.plugin.onContextRestored === 'function') {
                this.plugin.onContextRestored();
            }
            
            // Restart render loop if it was running
            this.webglFallbackActive = false;
            if (this._audioAnalyzer && this._colors) {
                this.startRenderLoop(this._audioAnalyzer, this._colors);
            }
            
            ShaderLogger.info(`ShaderInstance ${this.config.name} reinitialized after context restore`);
            return true;
        } catch (error) {
            ShaderLogger.error('Failed to restore WebGL context:', error);
            this.webglFallbackActive = true;
            // Ensure fallback UI is shown if context restoration fails
            if (this.webglContext) {
                this.webglContext.showWebGLFallback();
            }
            return false;
        }
    }
    
    /**
     * Resize the canvas and update viewport
     * Applies performance-based resolution capping and quality scaling
     */
    resize() {
        if (!this.canvas || !this.gl) return;
        
        const resizeConfig = this.performanceMonitor.getResizeConfig();
        
        // Use WebGLContextManager for resize
        this.webglContext.resize(resizeConfig);
        
        // Update canvas references (in case they changed)
        this.canvas = this.webglContext.canvas;
        
        // Update resolution uniform if program is ready
        if (this.program && this.uniformLocations.uResolution) {
            this.gl.useProgram(this.program);
            this.gl.uniform2f(this.uniformLocations.uResolution, this.canvas.width, this.canvas.height);
        }
        
        // Call plugin resize hook
        if (this.plugin && typeof this.plugin.onResize === 'function') {
            this.plugin.onResize(this.canvas.width, this.canvas.height);
        }
    }
    
    /**
     * Set a shader parameter value
     * @param {string} name - Parameter name
     * @param {*} value - Parameter value
     * @returns {boolean} True if parameter was set successfully
     * @throws {ShaderError} If shader is not initialized or parameter is invalid
     */
    setParameter(name, value) {
        if (!this.isInitialized) {
            throw new ShaderError('ShaderInstance not initialized', ErrorCodes.NOT_INITIALIZED);
        }
        
        if (!this.config.parameters || !(name in this.config.parameters)) {
            throw new ShaderError(
                `Parameter "${name}" not found`, 
                ErrorCodes.INVALID_PARAMETER, 
                { 
                    name,
                    shaderName: this.config.name,
                    availableParameters: Object.keys(this.config.parameters || {})
                }
            );
        }
        
        const paramConfig = this.config.parameters[name];
        
        // Type validation
        if (paramConfig.type === 'int' && !Number.isInteger(value)) {
            throw new ShaderError(`Parameter "${name}" must be an integer`, ErrorCodes.INVALID_PARAMETER, { name, value });
        }
        if (paramConfig.type === 'float' && typeof value !== 'number') {
            throw new ShaderError(`Parameter "${name}" must be a number`, ErrorCodes.INVALID_PARAMETER, { name, value });
        }
        
        // Range validation with clamping
        let finalValue = value;
        if (paramConfig.min !== undefined && finalValue < paramConfig.min) {
            ShaderLogger.warn(`Parameter "${name}" value ${finalValue} below minimum ${paramConfig.min}, clamping`);
            finalValue = paramConfig.min;
        }
        if (paramConfig.max !== undefined && finalValue > paramConfig.max) {
            ShaderLogger.warn(`Parameter "${name}" value ${finalValue} above maximum ${paramConfig.max}, clamping`);
            finalValue = paramConfig.max;
        }
        
        const oldValue = this.parameters[name];
        this.parameters[name] = finalValue;
        
        // Call plugin hook for parameter changes
        if (this.plugin && typeof this.plugin.onParameterChange === 'function') {
            this.plugin.onParameterChange(name, oldValue, finalValue);
        }
        
        return true;
    }
    
    /**
     * Get a shader parameter value
     * @param {string} name - Parameter name
     * @returns {*} Parameter value, or undefined if not found
     */
    getParameter(name) {
        return this.parameters[name];
    }
    
    /**
     * Get all shader parameters as a copy
     * @returns {Object} Copy of all parameter values
     */
    getAllParameters() {
        return { ...this.parameters };
    }
    
    /**
     * Render a single frame
     * Updates uniforms, textures, and draws the shader
     * @param {Object|null} audioData - Audio data from AudioAnalyzer (optional)
     * @param {Object|null} colors - Color values (optional)
     */
    render(audioData = null, colors = null) {
        if (!this.isInitialized || !this.gl || !this.program) return;
        
        // Validate managers are initialized
        try {
            this._validateManagers();
        } catch (error) {
            ShaderLogger.warn('ShaderInstance: Managers not initialized, skipping render', error.details);
            return;
        }
        
        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        const targetFrameInterval = 1000 / this.performanceMonitor.targetFPS;
        
        // Update lastFrameTime BEFORE skip check to prevent timing drift
        if (elapsed < targetFrameInterval) {
            return; // Skip frame to maintain target FPS
        }
        this.lastFrameTime = now;
        
        const gl = this.gl;
        const currentTime = (performance.now() - this.startTime) / 1000.0;
        const deltaTime = elapsed / 1000.0;
        
        // Update managers
        this.timeOffsetManager.update(audioData, deltaTime);
        
        // Update pixel size animation
        if (audioData && audioData.volume !== undefined) {
            const volume = audioData.volume || 0;
            const currentTimeMs = performance.now();
            this.pixelSizeAnimationManager.update(volume, currentTime, currentTimeMs);
        } else {
            // Update animation timing even without audio
            this.pixelSizeAnimationManager.update(0, currentTime, performance.now());
        }
        
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.useProgram(this.program);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        // Update uniforms using UniformManager (managers already checked above)
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
            this.config?.uniformMapping,
            this.parameters
        );
        
        // Call plugin hooks for shader-specific updates
        // Update textures (frequency textures, etc.)
        if (this.plugin && audioData && typeof this.plugin.onUpdateTextures === 'function') {
            this.plugin.onUpdateTextures(audioData, deltaTime);
        }
        
        // Update smoothing (tempo-based smoothing)
        if (this.plugin && audioData && typeof this.plugin.updateSmoothing === 'function') {
            this.plugin.updateSmoothing(audioData, deltaTime);
        }
        
        // Update plugin-specific uniforms
        if (this.plugin && typeof this.plugin.onUpdateUniforms === 'function') {
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
                ShaderLogger.debug('First frame rendered with colors - triggering callback');
                this._shaderManager.onFirstColorUpdate();
            }
        }
        
        // Call custom render hook if provided
        if (this.config.onRender) {
            this.config.onRender(this, audioData);
        }
    }
    
    /**
     * Start the render loop
     * Continuously renders frames using requestAnimationFrame
     * @param {AudioAnalyzer} audioAnalyzer - Audio analyzer instance
     * @param {Object|null} colors - Initial color values (optional)
     */
    startRenderLoop(audioAnalyzer, colors) {
        // Stop existing loop if running
        if (this.renderLoopId) {
            this.stopRenderLoop();
        }
        
        // Store references for render loop
        this._audioAnalyzer = audioAnalyzer;
        this._colors = colors;
        
        // Initialize colors in ColorTransitionManager if provided
        if (colors && this.colorTransitionManager) {
            const isFirstColorUpdate = !this.colorTransitionManager.currentColors;
            this.colorTransitionManager.startTransition(colors, isFirstColorUpdate);
        }
        
        const render = () => {
            if (this.webglFallbackActive || this.webglContext.webglFallbackActive) {
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
            const frameStartTime = performance.now();
            const previousFrameTime = this.lastFrameTime;
            this.render(audioData, this._colors);
            
            // Measure performance after rendering
            if (previousFrameTime > 0) {
                const elapsed = performance.now() - previousFrameTime;
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
     * @param {Object} colors - New colors object with color, color2, etc. properties
     */
    updateColors(colors) {
        if (!colors) return;
        
        const isFirstColorUpdate = !this._colors || !this.colorTransitionManager.currentColors;
        this._colors = colors;
        this.colorTransitionManager.startTransition(colors, isFirstColorUpdate);
    }
    
    
    stopRenderLoop() {
        if (this.renderLoopId) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
    }
    
    destroy() {
        this.stopRenderLoop();
        
        // Remove resize listener to prevent memory leak
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        
        // Clean up WebGL context manager
        if (this.webglContext) {
            this.webglContext.destroy();
        }
        
        // Call plugin destroy hook
        if (this.plugin) {
            this.plugin.onDestroy();
        }
        
        // Clean up managers
        if (this.timeOffsetManager) {
            this.timeOffsetManager.reset();
        }
        if (this.colorTransitionManager) {
            this.colorTransitionManager.reset();
        }
        if (this.pixelSizeAnimationManager) {
            this.pixelSizeAnimationManager.reset();
        }
        
        // Clean up WebGL resources
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }
        
        if (this.gl && this.quadBuffer) {
            this.gl.deleteBuffer(this.quadBuffer);
            this.quadBuffer = null;
        }
        
        // Clean up textures
        if (this.textureManager) {
            this.textureManager.destroyAll();
            this.textureManager = null;
        }
        
        // Clean up arrays and caches (allow garbage collection)
        this._rippleArrays = null;
        this._lastUniformValues = null;
        this.uniformLocations = null;
        this.uniformLocationCache = null;
        
        // Clear references
        this.gl = null;
        this.canvas = null;
        this._audioAnalyzer = null;
        this._colors = null;
        this._shaderManager = null;
        this.plugin = null;
        this.uniformManager = null;
        this.timeOffsetManager = null;
        this.colorTransitionManager = null;
        this.pixelSizeAnimationManager = null;
        this.performanceMonitor = null;
        this.webglContext = null;
        
        this.isInitialized = false;
    }
}

