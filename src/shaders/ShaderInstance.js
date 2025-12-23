// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { loadShader, createProgram, createQuad, processIncludes } from '../core/shader/ShaderUtils.js';
import { safeSentryMetric, isSentryAvailable, safeSetContext } from '../core/monitoring/SentryInit.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../config/tempoSmoothing.js';
import { createShaderPlugin } from './plugins/pluginFactory.js';
import { UniformManager } from './managers/UniformManager.js';
import { TextureManager } from './managers/TextureManager.js';
import { UniformLocationCache } from './managers/UniformLocationCache.js';

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
        this.timeOffset = 0.0;
        this.smoothedTimeOffset = 0.0;
        this.baseTimeOffsetAccumulationRate = 0.5;
        this.baseTimeOffsetDecayRate = 0.3;
        this.maxTimeOffset = 5.0;
        // Hysteresis thresholds to prevent rapid switching
        this.timeOffsetAccumulateThreshold = 0.12;  // Start accumulating above this
        this.timeOffsetDecayThreshold = 0.08;       // Start decaying below this
        // Cubic-bezier easing parameters for time offset accumulation
        // Maps trigger signal strength (volume, 0-1) to accumulation rate multiplier (0-1)
        // Input (x-axis): volume from trigger signal (0 = quiet, 1 = loud)
        // Output (y-axis): accumulation rate multiplier (0 = no accumulation, 1 = full accumulation)
        // 
        // Standard CSS easing curves:
        // - ease: (0.25, 0.1, 0.25, 1.0)
        // - ease-in: (0.42, 0.0, 1.0, 1.0) - weak signals have more nuance
        // - ease-out: (0.0, 0.0, 0.58, 1.0) - strong signals respond quickly
        // - ease-in-out: (0.42, 0.0, 0.58, 1.0) - balanced
        // 
        // Current curve: (0.9, 0.0, 0.8, 1.0) - weak signals have very little effect, strong signals have full effect
        this.timeOffsetCubicBezier = {
            x1: 0.9,  // First control point X
            y1: 0.0,   // First control point Y
            x2: 0.8,  // Second control point X
            y2: 1.0    // Second control point Y
        };
        // Hardcoded target FPS (no longer user-configurable)
        this.targetFPS = 30;
        this.lastFrameTime = 0;
        
        // Pixel size animation for loud triggers
        this.pixelSizeMultiplier = 1.0;
        this.previousVolume = 0.0;
        this.loudTriggerThreshold = 0.25; // Volume threshold to trigger (higher = rarer)
        this.loudTriggerChangeThreshold = 0.12; // Minimum volume increase to trigger (higher = rarer)
        this.pixelSizeAnimationDuration = 0.1; // Duration in seconds (100ms - short and instant)
        this.pixelSizeAnimationStartTime = 0;
        this.isPixelSizeAnimating = false;
        
        // Rate limiting for pixel size animation
        this.pixelSizeTriggerTimes = []; // Track when triggers occurred (for rate limiting)
        this.pixelSizeRateLimitWindow = 500; // 500ms window
        this.pixelSizeRateLimit = 4; // Max 4 triggers in 500ms window
        this.pixelSizeCooldownUntil = 0; // Timestamp when cooldown ends
        this.pixelSizeCooldownDuration = 500; // 500ms cooldown after hitting rate limit
        
        // Performance monitoring and adaptive quality
        this.frameTimes = [];
        this.performanceMonitorEnabled = true;
        this.qualityLevel = 1.0; // 1.0 = full quality, 0.5 = reduced quality
        this.maxResolutionWidth = 2560; // Cap at 1440p equivalent
        this.maxResolutionHeight = 1440;
        this.maxDPR = 2.0; // Cap devicePixelRatio at 2x
        
        // WebGL fallback state
        this.webglFallbackActive = false;
        
        // Object pooling for ripple data arrays (performance optimization)
        // Reuse Float32Arrays instead of allocating new ones every frame
        const maxRipples = 12;
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
        
        // Color transition system for smooth color changes
        this._colorTransition = {
            isTransitioning: false,
            startTime: 0,
            duration: 2000, // 2 seconds for smooth transition
            previousColors: null,
            targetColors: null,
            currentColors: null
        };
        
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
        if (!this.gl || !this.program || !this.uniformLocations[name]) {
            return;
        }
        
        this.gl.useProgram(this.program);
        const location = this.uniformLocations[name];
        
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
    
    /**
     * Cubic-bezier solver: finds t (0-1) for a given x using binary search
     * @param {number} x - Input value (0-1)
     * @param {number} x1 - First control point X
     * @param {number} y1 - First control point Y
     * @param {number} x2 - Second control point X
     * @param {number} y2 - Second control point Y
     * @returns {number} t value (0-1)
     */
    cubicBezierSolve(x, x1, y1, x2, y2) {
        // Cubic bezier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        // For x-coordinate: we need to find t such that Bx(t) = x
        // P₀ = (0,0), P₁ = (x1,y1), P₂ = (x2,y2), P₃ = (1,1)
        
        // Binary search for t
        let t0 = 0;
        let t1 = 1;
        const epsilon = 0.0001;
        const maxIterations = 20;
        
        for (let i = 0; i < maxIterations; i++) {
            const t = (t0 + t1) / 2;
            
            // Calculate x-coordinate at t
            const cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
            
            if (Math.abs(cx - x) < epsilon) {
                // Calculate y-coordinate at t
                const cy = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
                return cy;
            }
            
            if (cx < x) {
                t0 = t;
            } else {
                t1 = t;
            }
        }
        
        // Fallback: calculate y at final t
        const t = (t0 + t1) / 2;
        const cy = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
        return cy;
    }
    
    /**
     * Calculate easing factor for time offset accumulation using cubic-bezier
     * Maps trigger signal strength (volume) to accumulation rate multiplier
     * Strong signals → more accumulation (eased), weak signals → less accumulation (with nuance)
     * @param {number} volume - Trigger signal strength (0-1)
     * @returns {number} Easing factor (0-1) that multiplies accumulation rate
     */
    getTimeOffsetEasingFactor(volume) {
        // Clamp volume to 0-1 range
        const clampedVolume = Math.max(0, Math.min(1, volume));
        
        // Use cubic-bezier to map volume (0-1) to easing factor (0-1)
        // The volume is the input x, we get back the y value (easing factor)
        const easingFactor = this.cubicBezierSolve(
            clampedVolume,
            this.timeOffsetCubicBezier.x1,
            this.timeOffsetCubicBezier.y1,
            this.timeOffsetCubicBezier.x2,
            this.timeOffsetCubicBezier.y2
        );
        
        // Return the easing factor directly (0-1)
        // This will be multiplied by the accumulation rate
        return easingFactor;
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
        const defaultThresholds = [0.9800, 0.9571, 0.9054, 0.8359, 0.7528, 0.6577, 0.5499, 0.4270, 0.2800, 0.0138];
        this.uniformLocationCache.setDefaultThresholds(defaultThresholds);
        
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
        
        this.isInitialized = true;
        console.log(`ShaderInstance ${this.config.name} initialized`);
    }
    
    /**
     * Check if pixel size animation can be triggered (rate limiting and cooldown)
     * @param {number} currentTime - Current timestamp (milliseconds)
     * @returns {boolean} True if animation can be triggered
     */
    canTriggerPixelSizeAnimation(currentTime) {
        // Check if we're in cooldown
        if (currentTime < this.pixelSizeCooldownUntil) {
            return false;
        }
        
        // Remove old trigger times outside the window
        const windowStart = currentTime - this.pixelSizeRateLimitWindow;
        this.pixelSizeTriggerTimes = this.pixelSizeTriggerTimes.filter(time => time > windowStart);
        
        // Check if we've hit the rate limit
        if (this.pixelSizeTriggerTimes.length >= this.pixelSizeRateLimit) {
            // Start cooldown
            this.pixelSizeCooldownUntil = currentTime + this.pixelSizeCooldownDuration;
            return false;
        }
        
        return true;
    }
    
    
    resize() {
        if (!this.canvas || !this.gl) return;
        
        // Cap devicePixelRatio for performance
        const dpr = Math.min(window.devicePixelRatio || 1, this.maxDPR);
        
        // Cap viewport dimensions for performance
        const viewportWidth = Math.min(document.documentElement.clientWidth, this.maxResolutionWidth);
        const viewportHeight = Math.min(document.documentElement.clientHeight, this.maxResolutionHeight);
        
        // Apply quality scaling
        const scaledDPR = dpr * this.qualityLevel;
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
        if (this.config.parameters && name in this.config.parameters) {
            this.parameters[name] = value;
            return true;
        }
        return false;
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
        const targetFrameInterval = 1000 / this.targetFPS;
        
        if (elapsed < targetFrameInterval) {
            return; // Skip frame to maintain target FPS
        }
        
        // Update lastFrameTime for performance monitoring
        // Note: We use Sentry metrics (not transactions) for render performance tracking
        // to avoid creating thousands of transactions per session
        const previousFrameTime = this.lastFrameTime;
        this.lastFrameTime = now;
        
        const gl = this.gl;
        const currentTime = (Date.now() - this.startTime) / 1000.0;
        
        // Update time debt system
        if (audioData && audioData.volume !== undefined) {
            const volume = audioData.volume || 0;
            const deltaTime = elapsed / 1000.0;
            
            // Get loudness controls
            const loudnessAnimationEnabled = window._loudnessControls?.loudnessAnimationEnabled ?? true;
            const loudnessThreshold = window._loudnessControls?.loudnessThreshold ?? 0.1;
            
            if (loudnessAnimationEnabled) {
                // Use hysteresis to prevent rapid switching between accumulation and decay
                // If timeOffset is already accumulated, use lower threshold to start decaying
                // If timeOffset is near zero, use higher threshold to start accumulating
                const hysteresisThreshold = this.timeOffset > 0.01 
                    ? this.timeOffsetDecayThreshold  // If already accumulated, use lower threshold to decay
                    : this.timeOffsetAccumulateThreshold;  // If at zero, use higher threshold to accumulate
                
                if (volume > hysteresisThreshold) {
                    // Accumulate time offset with easing based on trigger signal strength
                    // Strong signals → more accumulation (eased), weak signals → less accumulation (with nuance)
                    // The easing curve maps volume (0-1) to accumulation multiplier (0-1)
                    const easingFactor = this.getTimeOffsetEasingFactor(volume);
                    const accumulation = volume * this.baseTimeOffsetAccumulationRate * deltaTime * easingFactor;
                    this.timeOffset = Math.min(this.timeOffset + accumulation, this.maxTimeOffset);
                } else {
                    // Decay time offset proportionally (slows down as it approaches zero)
                    const decayAmount = this.timeOffset * this.baseTimeOffsetDecayRate * deltaTime;
                    this.timeOffset = Math.max(0, this.timeOffset - decayAmount);
                }
            } else {
                // Loudness animation disabled: force decay to 0 (proportional)
                const decayAmount = this.timeOffset * this.baseTimeOffsetDecayRate * deltaTime;
                this.timeOffset = Math.max(0, this.timeOffset - decayAmount);
            }
            
            // Apply tempo-relative asymmetric smoothing to time offset
            const bpm = audioData.estimatedBPM || 0;
            const timeOffsetConfig = TempoSmoothingConfig.timeOffset;
            const attackTimeConstant = getTempoRelativeTimeConstant(
                timeOffsetConfig.attackNote,
                bpm,
                timeOffsetConfig.attackTimeFallback
            );
            const releaseTimeConstant = getTempoRelativeTimeConstant(
                timeOffsetConfig.releaseNote,
                bpm,
                timeOffsetConfig.releaseTimeFallback
            );
            this.smoothedTimeOffset = applyTempoRelativeSmoothing(
                this.smoothedTimeOffset,
                this.timeOffset,
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
            );
            
            // Detect loud trigger for pixel size animation
            const volumeChange = volume - this.previousVolume;
            
            // Get current time in milliseconds for rate limiting
            const currentTimeMs = Date.now();
            
            // Trigger if volume exceeds threshold AND shows significant increase AND rate limiting allows it
            if (volume > this.loudTriggerThreshold && 
                volumeChange > this.loudTriggerChangeThreshold &&
                !this.isPixelSizeAnimating &&
                this.canTriggerPixelSizeAnimation(currentTimeMs)) {
                // Start pixel size animation
                this.isPixelSizeAnimating = true;
                this.pixelSizeAnimationStartTime = currentTime;
                this.pixelSizeMultiplier = 2.0; // Double the pixel size
                
                // Track trigger time for rate limiting
                this.pixelSizeTriggerTimes.push(currentTimeMs);
            }
            
            // Update previous volume for next frame
            this.previousVolume = volume;
        } else {
            // No audio data: continue smoothing time offset (will decay if loudness animation is enabled)
            // This ensures smooth transitions even when audio stops
            // Use fallback times (BPM = 0) for tempo-relative smoothing
            const deltaTime = elapsed / 1000.0;
            const timeOffsetConfig = TempoSmoothingConfig.timeOffset;
            const attackTimeConstant = getTempoRelativeTimeConstant(
                timeOffsetConfig.attackNote,
                0,  // No BPM available
                timeOffsetConfig.attackTimeFallback
            );
            const releaseTimeConstant = getTempoRelativeTimeConstant(
                timeOffsetConfig.releaseNote,
                0,  // No BPM available
                timeOffsetConfig.releaseTimeFallback
            );
            this.smoothedTimeOffset = applyTempoRelativeSmoothing(
                this.smoothedTimeOffset,
                this.timeOffset,
                deltaTime,
                attackTimeConstant,
                releaseTimeConstant
            );
        }
        
        // Instant return to normal pixel size after short duration
        if (this.isPixelSizeAnimating) {
            const animationElapsed = currentTime - this.pixelSizeAnimationStartTime;
            
            if (animationElapsed >= this.pixelSizeAnimationDuration) {
                // Instant return to normal (no transition)
                this.pixelSizeMultiplier = 1.0;
                this.isPixelSizeAnimating = false;
            }
            // Keep multiplier at 2.0 during the duration (instant doubling, instant return)
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
                this.smoothedTimeOffset,
                this.pixelSizeMultiplier,
                resolution
            );
            
            // Update parameter uniforms
            this.uniformManager.updateParameterUniforms(this.parameters, this.config);
            
            // Update ripple uniforms
            this.uniformManager.updateRippleUniforms(
                audioData?.rippleData,
                this._rippleArrays
            );
            
            // Update color uniforms
            this.uniformManager.updateColorUniforms(
                colors,
                () => this.getInterpolatedColors(),
                this._colorTransition
            );
            
            // Update audio uniforms
            this.uniformManager.updateAudioUniforms(
                audioData,
                this.config.uniformMapping,
                this.parameters
            );
        }
        
        // Call plugin hooks for shader-specific updates
        const deltaTime = elapsed / 1000.0;
        
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
            this.render(audioData, this._colors);
            
            // Measure performance after rendering
            this.measurePerformance();
            
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
        
        const isFirstColorUpdate = !this._colors || !this._colorTransition.currentColors;
        
        // If this is the first color update or no audio is playing yet, set immediately
        if (isFirstColorUpdate) {
            this._colors = colors;
            this._colorTransition.currentColors = this.cloneColors(colors);
            this._colorTransition.previousColors = this.cloneColors(colors);
            this._colorTransition.targetColors = this.cloneColors(colors);
            // Note: Callback will fire after first render with colors (see render method)
            return;
        }
        
        // Start transition from current (possibly interpolated) colors to new colors
        this._colorTransition.previousColors = this.cloneColors(
            this._colorTransition.currentColors || this._colors
        );
        this._colorTransition.targetColors = this.cloneColors(colors);
        this._colorTransition.isTransitioning = true;
        this._colorTransition.startTime = Date.now();
        
        // Update reference for cases where transition is disabled
        this._colors = colors;
    }
    
    /**
     * Clone a colors object for interpolation
     * @param {Object} colors - Colors to clone
     * @returns {Object} Cloned colors
     */
    cloneColors(colors) {
        const cloned = {};
        const colorKeys = ['color', 'color2', 'color3', 'color4', 'color5', 
                          'color6', 'color7', 'color8', 'color9', 'color10'];
        colorKeys.forEach(key => {
            if (colors[key]) {
                cloned[key] = [colors[key][0], colors[key][1], colors[key][2]];
            }
        });
        return cloned;
    }
    
    /**
     * Interpolate between two colors
     * @param {Array} color1 - Start color [r, g, b]
     * @param {Array} color2 - End color [r, g, b]
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Array} Interpolated color [r, g, b]
     */
    lerpColor(color1, color2, t) {
        return [
            color1[0] + (color2[0] - color1[0]) * t,
            color1[1] + (color2[1] - color1[1]) * t,
            color1[2] + (color2[2] - color1[2]) * t
        ];
    }
    
    /**
     * Get interpolated colors based on current transition state
     * @returns {Object} Current colors (possibly interpolated)
     */
    getInterpolatedColors() {
        if (!this._colorTransition.isTransitioning) {
            return this._colorTransition.currentColors || this._colors;
        }
        
        const elapsed = Date.now() - this._colorTransition.startTime;
        const t = Math.min(elapsed / this._colorTransition.duration, 1.0);
        
        // Use ease-out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - t, 3);
        
        // End transition if complete
        if (t >= 1.0) {
            this._colorTransition.isTransitioning = false;
            this._colorTransition.currentColors = this.cloneColors(this._colorTransition.targetColors);
            return this._colorTransition.currentColors;
        }
        
        // Interpolate between previous and target colors
        const interpolated = {};
        const colorKeys = ['color', 'color2', 'color3', 'color4', 'color5', 
                          'color6', 'color7', 'color8', 'color9', 'color10'];
        
        colorKeys.forEach(key => {
            if (this._colorTransition.previousColors[key] && this._colorTransition.targetColors[key]) {
                interpolated[key] = this.lerpColor(
                    this._colorTransition.previousColors[key],
                    this._colorTransition.targetColors[key],
                    eased
                );
            }
        });
        
        this._colorTransition.currentColors = interpolated;
        return interpolated;
    }
    
    /**
     * Measure frame time and update performance metrics
     */
    measurePerformance() {
        if (!this.performanceMonitorEnabled) return;
        
        const now = Date.now();
        if (this.lastFrameTime > 0) {
            const frameTime = now - this.lastFrameTime;
            this.frameTimes.push(frameTime);
            
            // Keep only last 60 frames
            if (this.frameTimes.length > 60) {
                this.frameTimes.shift();
            }
            
            // Check performance every 60 frames
            if (this.frameTimes.length === 60) {
                const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / 60;
                const currentFPS = 1000 / avgFrameTime;
                const targetFPS = this.targetFPS;
                
                // Send performance metrics to Sentry (handles blocked requests gracefully)
                if (isSentryAvailable()) {
                    safeSentryMetric('render.fps', currentFPS, {
                        unit: 'none',
                        tags: {
                            qualityLevel: this.qualityLevel.toFixed(2),
                            canvasWidth: this.canvas.width.toString(),
                            canvasHeight: this.canvas.height.toString(),
                            targetFPS: targetFPS.toString(),
                        },
                    });
                    
                    safeSentryMetric('render.frameTime', avgFrameTime, {
                        unit: 'millisecond',
                        tags: {
                            qualityLevel: this.qualityLevel.toFixed(2),
                        },
                    });
                }
                
                // Update FPS display if in debug mode
                if (document.documentElement.classList.contains('debug-mode')) {
                    const fpsElement = document.getElementById('currentFps');
                    if (fpsElement) {
                        fpsElement.textContent = currentFPS.toFixed(1);
                        
                        // Color code based on performance
                        if (currentFPS < targetFPS * 0.8) {
                            fpsElement.style.color = '#ff4444'; // Red if low
                        } else if (currentFPS > targetFPS * 1.1) {
                            fpsElement.style.color = '#44ff44'; // Green if high
                        } else {
                            fpsElement.style.color = '#fff'; // White if on target
                        }
                    }
                }
                
                // Auto-adjust quality if FPS is significantly off target
                const previousQuality = this.qualityLevel;
                if (currentFPS < targetFPS * 0.8 && this.qualityLevel > 0.5) {
                    // Reduce quality
                    this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
                    console.log(`Performance: Reducing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
                    this.resize(); // Recalculate canvas size
                } else if (currentFPS > targetFPS * 1.2 && this.qualityLevel < 1.0) {
                    // Increase quality
                    this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.1);
                    console.log(`Performance: Increasing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
                    this.resize(); // Recalculate canvas size
                }
            }
        }
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

