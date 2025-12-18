// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { loadShader, createProgram, createQuad } from '../core/WebGLUtils.js';
import Sentry, { safeSentryMetric, isSentryAvailable, safeSetContext, safeAddBreadcrumb } from '../core/SentryInit.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../config/tempo-smoothing-config.js';

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
        
        // Title texture
        this.titleTexture = null;
        
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
        
        // Get uniform locations
        this.cacheUniformLocations();
        
        // Setup resize handler
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Call custom init hook if provided
        if (this.config.onInit) {
            this.config.onInit(this);
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
    
    cacheUniformLocations() {
        const gl = this.gl;
        const program = this.program;
        
        // Standard uniforms
        this.uniformLocations = {
            uResolution: gl.getUniformLocation(program, 'uResolution'),
            uTime: gl.getUniformLocation(program, 'uTime'),
            uTimeOffset: gl.getUniformLocation(program, 'uTimeOffset'),
            uPixelSize: gl.getUniformLocation(program, 'uPixelSize'),
            uSteps: gl.getUniformLocation(program, 'uSteps'),
            uMouse: gl.getUniformLocation(program, 'uMouse'),
            uShapeType: gl.getUniformLocation(program, 'uShapeType'),
            
            // Dithering controls
            uDitherStrength: gl.getUniformLocation(program, 'uDitherStrength'),
            uTransitionWidth: gl.getUniformLocation(program, 'uTransitionWidth'),
            
            // Colors
            uColor: gl.getUniformLocation(program, 'uColor'),
            uColor2: gl.getUniformLocation(program, 'uColor2'),
            uColor3: gl.getUniformLocation(program, 'uColor3'),
            uColor4: gl.getUniformLocation(program, 'uColor4'),
            uColor5: gl.getUniformLocation(program, 'uColor5'),
            uColor6: gl.getUniformLocation(program, 'uColor6'),
            uColor7: gl.getUniformLocation(program, 'uColor7'),
            uColor8: gl.getUniformLocation(program, 'uColor8'),
            uColor9: gl.getUniformLocation(program, 'uColor9'),
            uColor10: gl.getUniformLocation(program, 'uColor10'),
            
            // Audio uniforms
            uBass: gl.getUniformLocation(program, 'uBass'),
            uMid: gl.getUniformLocation(program, 'uMid'),
            uTreble: gl.getUniformLocation(program, 'uTreble'),
            uVolume: gl.getUniformLocation(program, 'uVolume'),
            
            // Frequency bands
            uFreq1: gl.getUniformLocation(program, 'uFreq1'),
            uFreq2: gl.getUniformLocation(program, 'uFreq2'),
            uFreq3: gl.getUniformLocation(program, 'uFreq3'),
            uFreq4: gl.getUniformLocation(program, 'uFreq4'),
            uFreq5: gl.getUniformLocation(program, 'uFreq5'),
            uFreq6: gl.getUniformLocation(program, 'uFreq6'),
            uFreq7: gl.getUniformLocation(program, 'uFreq7'),
            uFreq8: gl.getUniformLocation(program, 'uFreq8'),
            uFreq9: gl.getUniformLocation(program, 'uFreq9'),
            uFreq10: gl.getUniformLocation(program, 'uFreq10'),
            
            // Stereo
            uBassStereo: gl.getUniformLocation(program, 'uBassStereo'),
            uMidStereo: gl.getUniformLocation(program, 'uMidStereo'),
            uTrebleStereo: gl.getUniformLocation(program, 'uTrebleStereo'),
            
            // Temporal and beat
            uSmoothedBass: gl.getUniformLocation(program, 'uSmoothedBass'),
            uSmoothedMid: gl.getUniformLocation(program, 'uSmoothedMid'),
            uSmoothedTreble: gl.getUniformLocation(program, 'uSmoothedTreble'),
            uPeakBass: gl.getUniformLocation(program, 'uPeakBass'),
            uBeatTime: gl.getUniformLocation(program, 'uBeatTime'),
            uBeatIntensity: gl.getUniformLocation(program, 'uBeatIntensity'),
            uBPM: gl.getUniformLocation(program, 'uBPM'),
            
            // Multi-frequency beat
            uBeatTimeBass: gl.getUniformLocation(program, 'uBeatTimeBass'),
            uBeatTimeMid: gl.getUniformLocation(program, 'uBeatTimeMid'),
            uBeatTimeTreble: gl.getUniformLocation(program, 'uBeatTimeTreble'),
            uBeatIntensityBass: gl.getUniformLocation(program, 'uBeatIntensityBass'),
            uBeatIntensityMid: gl.getUniformLocation(program, 'uBeatIntensityMid'),
            uBeatIntensityTreble: gl.getUniformLocation(program, 'uBeatIntensityTreble'),
            uBeatStereoBass: gl.getUniformLocation(program, 'uBeatStereoBass'),
            uBeatStereoMid: gl.getUniformLocation(program, 'uBeatStereoMid'),
            uBeatStereoTreble: gl.getUniformLocation(program, 'uBeatStereoTreble'),
            
            // Ripple effect parameters
            uRippleSpeed: gl.getUniformLocation(program, 'uRippleSpeed'),
            uRippleWidth: gl.getUniformLocation(program, 'uRippleWidth'),
            uRippleMinRadius: gl.getUniformLocation(program, 'uRippleMinRadius'),
            uRippleMaxRadius: gl.getUniformLocation(program, 'uRippleMaxRadius'),
            uRippleIntensityThreshold: gl.getUniformLocation(program, 'uRippleIntensityThreshold'),
            uRippleIntensity: gl.getUniformLocation(program, 'uRippleIntensity'),
            
            // Multiple ripple arrays
            uRippleCenterX: gl.getUniformLocation(program, 'uRippleCenterX'),
            uRippleCenterY: gl.getUniformLocation(program, 'uRippleCenterY'),
            uRippleTimes: gl.getUniformLocation(program, 'uRippleTimes'),
            uRippleIntensities: gl.getUniformLocation(program, 'uRippleIntensities'),
            uRippleWidths: gl.getUniformLocation(program, 'uRippleWidths'),
            uRippleMinRadii: gl.getUniformLocation(program, 'uRippleMinRadii'),
            uRippleMaxRadii: gl.getUniformLocation(program, 'uRippleMaxRadii'),
            uRippleIntensityMultipliers: gl.getUniformLocation(program, 'uRippleIntensityMultipliers'),
            uRippleActive: gl.getUniformLocation(program, 'uRippleActive'),
            uRippleCount: gl.getUniformLocation(program, 'uRippleCount'),
            
            // Title texture
            uTitleTexture: gl.getUniformLocation(program, 'uTitleTexture'),
            uTitleTextureSize: gl.getUniformLocation(program, 'uTitleTextureSize'),
            uTitleScale: gl.getUniformLocation(program, 'uTitleScale'),
            uTitleScaleBottomLeft: gl.getUniformLocation(program, 'uTitleScaleBottomLeft'),
            uPlaybackProgress: gl.getUniformLocation(program, 'uPlaybackProgress'),
            uTitlePositionOffset: gl.getUniformLocation(program, 'uTitlePositionOffset'),
            
            // Threshold uniforms (calculated from thresholdCurve bezier)
            uThreshold1: gl.getUniformLocation(program, 'uThreshold1'),
            uThreshold2: gl.getUniformLocation(program, 'uThreshold2'),
            uThreshold3: gl.getUniformLocation(program, 'uThreshold3'),
            uThreshold4: gl.getUniformLocation(program, 'uThreshold4'),
            uThreshold5: gl.getUniformLocation(program, 'uThreshold5'),
            uThreshold6: gl.getUniformLocation(program, 'uThreshold6'),
            uThreshold7: gl.getUniformLocation(program, 'uThreshold7'),
            uThreshold8: gl.getUniformLocation(program, 'uThreshold8'),
            uThreshold9: gl.getUniformLocation(program, 'uThreshold9'),
            uThreshold10: gl.getUniformLocation(program, 'uThreshold10'),
            
            // Position attribute
            a_position: gl.getAttribLocation(program, 'a_position')
        };
        
        // Set default threshold values (will be overridden when colors are initialized)
        // Using default curve [0.2, 0.2, 1.0, 0.7]
        const defaultThresholds = [0.9800, 0.9571, 0.9054, 0.8359, 0.7528, 0.6577, 0.5499, 0.4270, 0.2800, 0.0138];
        gl.useProgram(program);
        defaultThresholds.forEach((threshold, index) => {
            const uniformName = `uThreshold${index + 1}`;
            const location = this.uniformLocations[uniformName];
            if (location) {
                gl.uniform1f(location, threshold);
            }
        });
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
        
        // Resize title texture to match canvas (async, but don't wait)
        if (this.titleTexture && typeof this.titleTexture.resize === 'function') {
            this.titleTexture.resize(this.canvas.width, this.canvas.height).catch(err => {
                console.warn('TitleTexture resize error:', err);
            });
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
    
    setTitleTexture(titleTexture) {
        this.titleTexture = titleTexture;
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
            
            // Get loudness controls (backward compatibility)
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
        
        // Set standard uniforms (with optimization: only update when values change)
        const resolution = [this.canvas.width, this.canvas.height];
        if (!this._lastUniformValues.uResolution || 
            this._lastUniformValues.uResolution[0] !== resolution[0] ||
            this._lastUniformValues.uResolution[1] !== resolution[1]) {
            if (this.uniformLocations.uResolution) {
                gl.uniform2f(this.uniformLocations.uResolution, resolution[0], resolution[1]);
                this._lastUniformValues.uResolution = resolution;
            }
        }
        
        // Time always changes, so always update
        if (this.uniformLocations.uTime) {
            gl.uniform1f(this.uniformLocations.uTime, currentTime);
        }
        
        // TimeOffset - use smoothed value to reduce jitter
        const newTimeOffset = this.smoothedTimeOffset;
        if (this._lastUniformValues.uTimeOffset !== newTimeOffset) {
            if (this.uniformLocations.uTimeOffset) {
                gl.uniform1f(this.uniformLocations.uTimeOffset, newTimeOffset);
                this._lastUniformValues.uTimeOffset = newTimeOffset;
            }
        }
        
        // PixelSize - only update if changed
        const dpr = window.devicePixelRatio || 1;
        const basePixelSize = this.parameters.pixelSize || 1.0;
        const scaledPixelSize = basePixelSize * this.pixelSizeMultiplier * dpr;
        if (this._lastUniformValues.uPixelSize !== scaledPixelSize) {
            if (this.uniformLocations.uPixelSize) {
                gl.uniform1f(this.uniformLocations.uPixelSize, scaledPixelSize);
                this._lastUniformValues.uPixelSize = scaledPixelSize;
            }
        }
        
        // Steps - hardcoded (no longer user-configurable)
        const stepsValue = 5.0;
        if (this._lastUniformValues.uSteps !== stepsValue) {
            if (this.uniformLocations.uSteps) {
                gl.uniform1f(this.uniformLocations.uSteps, stepsValue);
                this._lastUniformValues.uSteps = stepsValue;
            }
        }
        
        // Dither strength - only update if parameter changed
        const ditherStrengthValue = this.parameters.ditherStrength !== undefined ? this.parameters.ditherStrength : 3.0;
        if (this._lastUniformValues.uDitherStrength !== ditherStrengthValue) {
            if (this.uniformLocations.uDitherStrength) {
                gl.uniform1f(this.uniformLocations.uDitherStrength, ditherStrengthValue);
                this._lastUniformValues.uDitherStrength = ditherStrengthValue;
            }
        }
        
        // Transition width - only update if parameter changed
        const transitionWidthValue = this.parameters.transitionWidth !== undefined ? this.parameters.transitionWidth : 0.005;
        if (this._lastUniformValues.uTransitionWidth !== transitionWidthValue) {
            if (this.uniformLocations.uTransitionWidth) {
                gl.uniform1f(this.uniformLocations.uTransitionWidth, transitionWidthValue);
                this._lastUniformValues.uTransitionWidth = transitionWidthValue;
            }
        }
        
        // Mouse - always 0,0,0,0, but check if we need to update
        if (!this._lastUniformValues.uMouse || 
            this._lastUniformValues.uMouse[0] !== 0.0 ||
            this._lastUniformValues.uMouse[1] !== 0.0 ||
            this._lastUniformValues.uMouse[2] !== 0.0 ||
            this._lastUniformValues.uMouse[3] !== 0.0) {
            if (this.uniformLocations.uMouse) {
                gl.uniform4f(this.uniformLocations.uMouse, 0.0, 0.0, 0.0, 0.0);
                this._lastUniformValues.uMouse = [0.0, 0.0, 0.0, 0.0];
            }
        }
        
        // ShapeType - always 0, but check if we need to update
        if (this._lastUniformValues.uShapeType !== 0) {
            if (this.uniformLocations.uShapeType) {
                gl.uniform1i(this.uniformLocations.uShapeType, 0);
                this._lastUniformValues.uShapeType = 0;
            }
        }
        
        // Set ripple effect parameters - hardcoded (no longer user-configurable)
        const rippleSpeed = 0.3;
        if (this._lastUniformValues.uRippleSpeed !== rippleSpeed) {
            if (this.uniformLocations.uRippleSpeed) {
                gl.uniform1f(this.uniformLocations.uRippleSpeed, rippleSpeed);
                this._lastUniformValues.uRippleSpeed = rippleSpeed;
            }
        }
        
        const rippleWidth = 0.1;
        if (this._lastUniformValues.uRippleWidth !== rippleWidth) {
            if (this.uniformLocations.uRippleWidth) {
                gl.uniform1f(this.uniformLocations.uRippleWidth, rippleWidth);
                this._lastUniformValues.uRippleWidth = rippleWidth;
            }
        }
        
        const rippleMinRadius = 0.15;
        if (this._lastUniformValues.uRippleMinRadius !== rippleMinRadius) {
            if (this.uniformLocations.uRippleMinRadius) {
                gl.uniform1f(this.uniformLocations.uRippleMinRadius, rippleMinRadius);
                this._lastUniformValues.uRippleMinRadius = rippleMinRadius;
            }
        }
        
        const rippleMaxRadius = 3.0;
        if (this._lastUniformValues.uRippleMaxRadius !== rippleMaxRadius) {
            if (this.uniformLocations.uRippleMaxRadius) {
                gl.uniform1f(this.uniformLocations.uRippleMaxRadius, rippleMaxRadius);
                this._lastUniformValues.uRippleMaxRadius = rippleMaxRadius;
            }
        }
        
        const rippleIntensityThreshold = 0.75;
        if (this._lastUniformValues.uRippleIntensityThreshold !== rippleIntensityThreshold) {
            if (this.uniformLocations.uRippleIntensityThreshold) {
                gl.uniform1f(this.uniformLocations.uRippleIntensityThreshold, rippleIntensityThreshold);
                this._lastUniformValues.uRippleIntensityThreshold = rippleIntensityThreshold;
            }
        }
        
        const rippleIntensity = 0.25;
        if (this._lastUniformValues.uRippleIntensity !== rippleIntensity) {
            if (this.uniformLocations.uRippleIntensity) {
                gl.uniform1f(this.uniformLocations.uRippleIntensity, rippleIntensity);
                this._lastUniformValues.uRippleIntensity = rippleIntensity;
            }
        }
        
        // Set multiple ripple arrays (if available from audioData)
        // Use pooled arrays instead of creating new ones (performance optimization)
        if (audioData && audioData.rippleData) {
            const rippleData = audioData.rippleData;
            const maxRipples = 12;
            
            // Reuse pooled arrays
            const centerX = this._rippleArrays.centerX;
            const centerY = this._rippleArrays.centerY;
            const times = this._rippleArrays.times;
            const intensities = this._rippleArrays.intensities;
            const widths = this._rippleArrays.widths;
            const minRadii = this._rippleArrays.minRadii;
            const maxRadii = this._rippleArrays.maxRadii;
            const intensityMultipliers = this._rippleArrays.intensityMultipliers;
            const active = this._rippleArrays.active;
            
            // Zero out arrays first
            centerX.fill(0);
            centerY.fill(0);
            times.fill(0);
            intensities.fill(0);
            widths.fill(0);
            minRadii.fill(0);
            maxRadii.fill(0);
            intensityMultipliers.fill(0);
            active.fill(0);
            
            // Split centers array into separate x and y arrays
            for (let i = 0; i < maxRipples; i++) {
                const idx = i * 2;
                centerX[i] = rippleData.centers[idx] || 0;
                centerY[i] = rippleData.centers[idx + 1] || 0;
            }
            
            // Fill arrays from ripple data
            const rippleTimes = rippleData.times || [];
            const rippleIntensities = rippleData.intensities || [];
            const rippleWidths = rippleData.widths || [];
            const rippleMinRadii = rippleData.minRadii || [];
            const rippleMaxRadii = rippleData.maxRadii || [];
            const rippleIntensityMultipliers = rippleData.intensityMultipliers || [];
            const rippleActive = rippleData.active || [];
            
            for (let i = 0; i < maxRipples; i++) {
                times[i] = rippleTimes[i] || 0;
                intensities[i] = rippleIntensities[i] || 0;
                widths[i] = rippleWidths[i] || 0;
                minRadii[i] = rippleMinRadii[i] || 0;
                maxRadii[i] = rippleMaxRadii[i] || 0;
                intensityMultipliers[i] = rippleIntensityMultipliers[i] || 0;
                active[i] = rippleActive[i] || 0;
            }
            
            // Always update ripple arrays (they change every frame)
            if (this.uniformLocations.uRippleCenterX) {
                gl.uniform1fv(this.uniformLocations.uRippleCenterX, centerX);
            }
            if (this.uniformLocations.uRippleCenterY) {
                gl.uniform1fv(this.uniformLocations.uRippleCenterY, centerY);
            }
            if (this.uniformLocations.uRippleTimes) {
                gl.uniform1fv(this.uniformLocations.uRippleTimes, times);
            }
            if (this.uniformLocations.uRippleIntensities) {
                gl.uniform1fv(this.uniformLocations.uRippleIntensities, intensities);
            }
            if (this.uniformLocations.uRippleWidths) {
                gl.uniform1fv(this.uniformLocations.uRippleWidths, widths);
            }
            if (this.uniformLocations.uRippleMinRadii) {
                gl.uniform1fv(this.uniformLocations.uRippleMinRadii, minRadii);
            }
            if (this.uniformLocations.uRippleMaxRadii) {
                gl.uniform1fv(this.uniformLocations.uRippleMaxRadii, maxRadii);
            }
            if (this.uniformLocations.uRippleIntensityMultipliers) {
                gl.uniform1fv(this.uniformLocations.uRippleIntensityMultipliers, intensityMultipliers);
            }
            if (this.uniformLocations.uRippleActive) {
                gl.uniform1fv(this.uniformLocations.uRippleActive, active);
            }
            if (this.uniformLocations.uRippleCount) {
                gl.uniform1i(this.uniformLocations.uRippleCount, rippleData.count || 0);
            }
        } else {
            // Set empty arrays if no ripple data (reuse pooled arrays)
            const emptyArray = this._rippleArrays.centerX; // Reuse any pooled array
            emptyArray.fill(0);
            if (this.uniformLocations.uRippleCenterX) {
                gl.uniform1fv(this.uniformLocations.uRippleCenterX, emptyArray);
            }
            if (this.uniformLocations.uRippleCenterY) {
                gl.uniform1fv(this.uniformLocations.uRippleCenterY, emptyArray);
            }
            if (this.uniformLocations.uRippleTimes) {
                gl.uniform1fv(this.uniformLocations.uRippleTimes, emptyArray);
            }
            if (this.uniformLocations.uRippleIntensities) {
                gl.uniform1fv(this.uniformLocations.uRippleIntensities, emptyArray);
            }
            if (this.uniformLocations.uRippleActive) {
                gl.uniform1fv(this.uniformLocations.uRippleActive, emptyArray);
            }
            if (this.uniformLocations.uRippleCount) {
                gl.uniform1i(this.uniformLocations.uRippleCount, 0);
            }
        }
        
        // Set color uniforms with smooth transitions
        if (colors) {
            // Get interpolated colors (handles smooth transitions)
            const activeColors = this.getInterpolatedColors();
            
            const colorUniforms = ['uColor', 'uColor2', 'uColor3', 'uColor4', 'uColor5', 
                                  'uColor6', 'uColor7', 'uColor8', 'uColor9', 'uColor10'];
            const colorKeys = ['color', 'color2', 'color3', 'color4', 'color5', 
                              'color6', 'color7', 'color8', 'color9', 'color10'];
            
            colorUniforms.forEach((uniformName, index) => {
                const location = this.uniformLocations[uniformName];
                const colorKey = colorKeys[index];
                if (location && activeColors[colorKey]) {
                    const color = activeColors[colorKey];
                    // During transition, always update colors (they change every frame)
                    // When not transitioning, only update if changed
                    const lastColor = this._lastUniformValues[uniformName];
                    const shouldUpdate = this._colorTransition.isTransitioning || 
                                       !lastColor || 
                                       lastColor[0] !== color[0] || 
                                       lastColor[1] !== color[1] || 
                                       lastColor[2] !== color[2];
                    
                    if (shouldUpdate) {
                        gl.uniform3f(location, color[0], color[1], color[2]);
                        this._lastUniformValues[uniformName] = [color[0], color[1], color[2]];
                    }
                }
            });
        }
        
        // Set audio uniforms using uniform mapping (only update when values change)
        if (audioData && this.config.uniformMapping) {
            Object.entries(this.config.uniformMapping).forEach(([uniformName, mapper]) => {
                const location = this.uniformLocations[uniformName];
                // Calculate value (mappers may have side effects, so always call)
                const value = mapper(audioData, this.parameters);
                
                if (location !== null && location !== undefined) {
                    // Check if value has changed
                    const lastValue = this._lastUniformValues[uniformName];
                    let valueChanged = true;
                    
                    if (typeof value === 'number') {
                        valueChanged = lastValue !== value;
                        if (valueChanged) {
                            gl.uniform1f(location, value);
                            this._lastUniformValues[uniformName] = value;
                        }
                    } else if (Array.isArray(value) && value.length === 2) {
                        valueChanged = !lastValue || lastValue[0] !== value[0] || lastValue[1] !== value[1];
                        if (valueChanged) {
                            gl.uniform2f(location, value[0], value[1]);
                            this._lastUniformValues[uniformName] = [value[0], value[1]];
                        }
                    } else if (Array.isArray(value) && value.length === 3) {
                        valueChanged = !lastValue || lastValue[0] !== value[0] || lastValue[1] !== value[1] || lastValue[2] !== value[2];
                        if (valueChanged) {
                            gl.uniform3f(location, value[0], value[1], value[2]);
                            this._lastUniformValues[uniformName] = [value[0], value[1], value[2]];
                        }
                    } else if (Array.isArray(value) && value.length === 4) {
                        valueChanged = !lastValue || lastValue[0] !== value[0] || lastValue[1] !== value[1] || lastValue[2] !== value[2] || lastValue[3] !== value[3];
                        if (valueChanged) {
                            gl.uniform4f(location, value[0], value[1], value[2], value[3]);
                            this._lastUniformValues[uniformName] = [value[0], value[1], value[2], value[3]];
                        }
                    }
                }
            });
        }
        
        // Set title texture if available
        if (this.titleTexture && this.uniformLocations.uTitleTexture) {
            const textureUnit = this.titleTexture.bindTexture(0);
            // Texture unit rarely changes, but check anyway
            if (this._lastUniformValues.uTitleTexture !== textureUnit) {
                gl.uniform1i(this.uniformLocations.uTitleTexture, textureUnit);
                this._lastUniformValues.uTitleTexture = textureUnit;
            }
            
            if (this.uniformLocations.uTitleTextureSize) {
                const size = this.titleTexture.getSize();
                const sizeArray = [size.width, size.height];
                const lastSize = this._lastUniformValues.uTitleTextureSize;
                if (!lastSize || lastSize[0] !== sizeArray[0] || lastSize[1] !== sizeArray[1]) {
                    gl.uniform2f(
                        this.uniformLocations.uTitleTextureSize,
                        sizeArray[0],
                        sizeArray[1]
                    );
                    this._lastUniformValues.uTitleTextureSize = sizeArray;
                }
            }
            
            // Set title scale (1.5 = 50% larger, 2.0 = 2x larger, etc.)
            const titleScale = 1.5; // Default scale: 1.5x larger
            if (this.uniformLocations.uTitleScale !== null && this.uniformLocations.uTitleScale !== undefined) {
                if (this._lastUniformValues.uTitleScale !== titleScale) {
                    gl.uniform1f(this.uniformLocations.uTitleScale, titleScale);
                    this._lastUniformValues.uTitleScale = titleScale;
                }
            }
            
            // Set playback progress (0.0 = start, 1.0 = end) - changes every frame, but optimize check
            if (this.uniformLocations.uPlaybackProgress !== null && this.uniformLocations.uPlaybackProgress !== undefined) {
                const playbackProgress = audioData && audioData.playbackProgress !== undefined 
                    ? audioData.playbackProgress 
                    : 0.0;
                if (this._lastUniformValues.uPlaybackProgress !== playbackProgress) {
                    gl.uniform1f(this.uniformLocations.uPlaybackProgress, playbackProgress);
                    this._lastUniformValues.uPlaybackProgress = playbackProgress;
                }
            }
            
            // Set title position offset and scale based on playback sequence
            if (this.uniformLocations.uTitlePositionOffset !== null && this.uniformLocations.uTitlePositionOffset !== undefined) {
                const playbackProgress = audioData && audioData.playbackProgress !== undefined 
                    ? audioData.playbackProgress 
                    : 0.0;
                
                // Sequence phases:
                // Phase 1: 0-5% - Beginning: middle left with padding
                // Phase 2: 5-8% - Transition: move position and scale (text hidden)
                // Phase 3: 8%-95% - Bottom left with padding
                // Phase 4: 95-100% - End: can show again if needed
                
                const phase1End = 0.03;      // End of beginning phase (5%)
                const phase2Start = 0.05;    // Start of transition (5%)
                const phase2End = 0.08;      // End of transition (8%)
                const phase3Start = 0.08;    // Start of bottom left phase (8%)
                const phase3End = 0.95;      // End of bottom left phase (95%)
                
                // Padding values (as fraction of screen: 0.0 = edge, 0.05 = 5% from edge)
                const leftPadding = 0.01;      // 5% padding from left edge
                const bottomPadding = 0.01;    // 5% padding from bottom edge
                
                // Target screen position (0-1 normalized)
                // x: 0.0 = left edge, 0.5 = center, 1.0 = right edge
                // y: 0.0 = top edge, 0.5 = center, 1.0 = bottom edge
                let targetX = 0.0;
                let targetY = 0.0;
                let scale = 1.0;    // Default scale for center
                let bottomLeftScale = 0.6; // Smaller scale for bottom left
                
                // Determine vertical position in texture and font size based on phase
                let verticalPositionInTexture = 0.5; // Default to center
                let fontSize = '12vh'; // Default font size for intro
                
                if (playbackProgress < phase2Start) {
                    // Phase 1: Middle left with padding
                    targetX = leftPadding;        // Left edge + padding
                    targetY = 0.5;                 // Middle vertically (0.5 = center)
                    scale = 1.0;
                    verticalPositionInTexture = 0.5; // Render at center of texture
                    fontSize = '12vh'; // Large font for intro
                } else {
                    // Phase 2+: Transition to bottom left (text may be hidden during transition)
                    // Phase 3+: Bottom left with padding
                    targetX = leftPadding;        // Left edge + padding
                    targetY = 1.0 - bottomPadding; // Bottom edge - padding
                    scale = 1.0; // No scaling needed since we change font size
                    verticalPositionInTexture = 1.0 - bottomPadding; // Render at bottom of texture
                    fontSize = '8vh'; // Smaller font for bottom left (60% of intro size)
                }
                
                // Update texture rendering position and font size (async, but don't wait)
                if (this.titleTexture) {
                    // Force update by ensuring needsUpdate is set
                    this.titleTexture.needsUpdate = true;
                    
                    // Update font size if method exists
                    if (typeof this.titleTexture.setFontSize === 'function') {
                        this.titleTexture.setFontSize(fontSize).catch(err => {
                            console.warn('TitleTexture setFontSize error:', err);
                        });
                    }
                    
                    // Update vertical position if method exists
                    if (typeof this.titleTexture.setVerticalPosition === 'function') {
                        this.titleTexture.setVerticalPosition(verticalPositionInTexture).catch(err => {
                            console.warn('TitleTexture setVerticalPosition error:', err);
                        });
                    }
                }
                
                // Pass target screen position (0-1) to shader (only update if changed)
                const positionOffset = [targetX, targetY];
                const lastPositionOffset = this._lastUniformValues.uTitlePositionOffset;
                if (!lastPositionOffset || lastPositionOffset[0] !== positionOffset[0] || lastPositionOffset[1] !== positionOffset[1]) {
                    gl.uniform2f(this.uniformLocations.uTitlePositionOffset, positionOffset[0], positionOffset[1]);
                    this._lastUniformValues.uTitlePositionOffset = positionOffset;
                }
                
                // Set scale (now always 1.0 since we use font size instead)
                if (this.uniformLocations.uTitleScaleBottomLeft !== null && this.uniformLocations.uTitleScaleBottomLeft !== undefined) {
                    if (this._lastUniformValues.uTitleScaleBottomLeft !== scale) {
                        gl.uniform1f(this.uniformLocations.uTitleScaleBottomLeft, scale);
                        this._lastUniformValues.uTitleScaleBottomLeft = scale;
                    }
                }
            }
        } else if (this.uniformLocations.uTitleTextureSize) {
            // Set size to 0,0 if no texture to disable sampling (only update if changed)
            const zeroSize = [0.0, 0.0];
            const lastSize = this._lastUniformValues.uTitleTextureSize;
            if (!lastSize || lastSize[0] !== zeroSize[0] || lastSize[1] !== zeroSize[1]) {
                gl.uniform2f(this.uniformLocations.uTitleTextureSize, zeroSize[0], zeroSize[1]);
                this._lastUniformValues.uTitleTextureSize = zeroSize;
            }
        }
        
        // Always set playback progress even if no texture (for consistency)
        if (this.uniformLocations.uPlaybackProgress !== null && this.uniformLocations.uPlaybackProgress !== undefined) {
            const playbackProgress = audioData && audioData.playbackProgress !== undefined 
                ? audioData.playbackProgress 
                : 0.0;
            if (this._lastUniformValues.uPlaybackProgress !== playbackProgress) {
                gl.uniform1f(this.uniformLocations.uPlaybackProgress, playbackProgress);
                this._lastUniformValues.uPlaybackProgress = playbackProgress;
            }
        }
        
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
                
                // Auto-adjust quality if FPS is significantly off target
                const previousQuality = this.qualityLevel;
                if (currentFPS < targetFPS * 0.8 && this.qualityLevel > 0.5) {
                    // Reduce quality
                    this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
                    console.log(`Performance: Reducing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
                    this.resize(); // Recalculate canvas size
                    
                    // Track quality change in Sentry
                    safeAddBreadcrumb({
                        category: 'performance',
                        message: 'Quality reduced due to low FPS',
                        level: 'info',
                        data: {
                            fromQuality: previousQuality,
                            toQuality: this.qualityLevel,
                            fps: currentFPS,
                            targetFPS: targetFPS,
                        },
                    });
                } else if (currentFPS > targetFPS * 1.2 && this.qualityLevel < 1.0) {
                    // Increase quality
                    this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.1);
                    console.log(`Performance: Increasing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
                    this.resize(); // Recalculate canvas size
                    
                    // Track quality change in Sentry
                    safeAddBreadcrumb({
                        category: 'performance',
                        message: 'Quality increased due to high FPS',
                        level: 'info',
                        data: {
                            fromQuality: previousQuality,
                            toQuality: this.qualityLevel,
                            fps: currentFPS,
                            targetFPS: targetFPS,
                        },
                    });
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
        
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
        }
        
        if (this.gl && this.quadBuffer) {
            this.gl.deleteBuffer(this.quadBuffer);
        }
        
        this.isInitialized = false;
    }
}

