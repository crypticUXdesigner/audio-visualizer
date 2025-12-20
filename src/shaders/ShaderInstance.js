// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { loadShader, createProgram, createQuad } from '../core/shader/ShaderUtils.js';
import { safeSentryMetric, isSentryAvailable, safeSetContext } from '../core/monitoring/SentryInit.js';
import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../config/tempoSmoothing.js';

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
        
        // Multi-layer smoothing for frequency visualizer
        this._layerSmoothing = {
            layer1: null,  // Background far
            layer2: null,  // Background near
            layer3: null   // Foreground
        };
        this._lastBandData = null;
        
        // Texture management for frequency visualizer
        this._frequencyTextures = {
            leftRight: null,   // RG texture: R=left, G=right (raw frequency data)
            layer1: null,      // Layer 1 smoothed heights
            layer2: null,      // Layer 2 smoothed heights
            layer3: null       // Layer 3 smoothed heights
        };
        this._measuredBands = 64;  // Number of bands we actually measure
        
        // Tempo-based smoothing for refraction shader
        this._refractionSmoothing = {
            smoothedVolumeScale: 0.3,      // Smoothed volume scale (0.3 to 1.0)
            smoothedFbmZoom: 1.0          // Smoothed FBM zoom factor (1.0 = normal)
        };
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
            
            // Dots shader uniforms
            uDotSpacing: gl.getUniformLocation(program, 'uDotSpacing'),
            uDotSize: gl.getUniformLocation(program, 'uDotSize'),
            uPulsationStrength: gl.getUniformLocation(program, 'uPulsationStrength'),
            uRippleDistortionStrength: gl.getUniformLocation(program, 'uRippleDistortionStrength'),
            uEnableCenterPositionOffset: gl.getUniformLocation(program, 'uEnableCenterPositionOffset'),
            uEnableUVOffset: gl.getUniformLocation(program, 'uEnableUVOffset'),
            uMovementStrength: gl.getUniformLocation(program, 'uMovementStrength'),
            uUVOffsetStrength: gl.getUniformLocation(program, 'uUVOffsetStrength'),
            
            // Refraction shader uniforms
            uOuterGridSize: gl.getUniformLocation(program, 'uOuterGridSize'),
            uInnerGridSize: gl.getUniformLocation(program, 'uInnerGridSize'),
            uPixelizeLevels: gl.getUniformLocation(program, 'uPixelizeLevels'),
            uBlurStrength: gl.getUniformLocation(program, 'uBlurStrength'),
            uOffsetStrength: gl.getUniformLocation(program, 'uOffsetStrength'),
            uCellBrightnessVariation: gl.getUniformLocation(program, 'uCellBrightnessVariation'),
            uCellAnimNote1: gl.getUniformLocation(program, 'uCellAnimNote1'),
            uCellAnimNote2: gl.getUniformLocation(program, 'uCellAnimNote2'),
            uCellAnimNote3: gl.getUniformLocation(program, 'uCellAnimNote3'),
            uDistortionStrength: gl.getUniformLocation(program, 'uDistortionStrength'),
            uDistortionSize: gl.getUniformLocation(program, 'uDistortionSize'),
            uDistortionFalloff: gl.getUniformLocation(program, 'uDistortionFalloff'),
            uDistortionPerspectiveStrength: gl.getUniformLocation(program, 'uDistortionPerspectiveStrength'),
            uDistortionEasing: gl.getUniformLocation(program, 'uDistortionEasing'),
            uSmoothedVolumeScale: gl.getUniformLocation(program, 'uSmoothedVolumeScale'),
            uSmoothedFbmZoom: gl.getUniformLocation(program, 'uSmoothedFbmZoom'),
            
            // Synthwave shader uniforms
            uGridDensity: gl.getUniformLocation(program, 'uGridDensity'),
            uPerspectiveStrength: gl.getUniformLocation(program, 'uPerspectiveStrength'),
            uScanlineIntensity: gl.getUniformLocation(program, 'uScanlineIntensity'),
            uGlowIntensity: gl.getUniformLocation(program, 'uGlowIntensity'),
            uHorizonPosition: gl.getUniformLocation(program, 'uHorizonPosition'),
            
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
            a_position: gl.getAttribLocation(program, 'a_position'),
            
            // Frequency visualizer uniforms
            uNumBands: gl.getUniformLocation(program, 'uNumBands'),
            uMeasuredBands: gl.getUniformLocation(program, 'uMeasuredBands'),
            uMaxHeight: gl.getUniformLocation(program, 'uMaxHeight'),
            uCenterY: gl.getUniformLocation(program, 'uCenterY'),
            uBarWidth: gl.getUniformLocation(program, 'uBarWidth'),
            uFrequencyTexture: gl.getUniformLocation(program, 'uFrequencyTexture'),
            uLayer1Texture: gl.getUniformLocation(program, 'uLayer1Texture'),
            uLayer2Texture: gl.getUniformLocation(program, 'uLayer2Texture'),
            uLayer3Texture: gl.getUniformLocation(program, 'uLayer3Texture'),
            uLayer1HeightMultiplier: gl.getUniformLocation(program, 'uLayer1HeightMultiplier'),
            uLayer2HeightMultiplier: gl.getUniformLocation(program, 'uLayer2HeightMultiplier'),
            uLayer3HeightMultiplier: gl.getUniformLocation(program, 'uLayer3HeightMultiplier'),
            uLayer1Opacity: gl.getUniformLocation(program, 'uLayer1Opacity'),
            uLayer2Opacity: gl.getUniformLocation(program, 'uLayer2Opacity'),
            uLayer3Opacity: gl.getUniformLocation(program, 'uLayer3Opacity')
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
        
        // Dots shader parameters - only update if changed
        if (this.uniformLocations.uDotSpacing) {
            const dotSpacing = this.parameters.dotSpacing !== undefined ? this.parameters.dotSpacing : 15.0;
            if (this._lastUniformValues.uDotSpacing !== dotSpacing) {
                gl.uniform1f(this.uniformLocations.uDotSpacing, dotSpacing);
                this._lastUniformValues.uDotSpacing = dotSpacing;
            }
        }
        
        if (this.uniformLocations.uDotSize) {
            const dotSize = this.parameters.dotSize !== undefined ? this.parameters.dotSize : 0.4;
            if (this._lastUniformValues.uDotSize !== dotSize) {
                gl.uniform1f(this.uniformLocations.uDotSize, dotSize);
                this._lastUniformValues.uDotSize = dotSize;
            }
        }
        
        if (this.uniformLocations.uPulsationStrength) {
            const pulsationStrength = this.parameters.pulsationStrength !== undefined ? this.parameters.pulsationStrength : 0.15;
            if (this._lastUniformValues.uPulsationStrength !== pulsationStrength) {
                gl.uniform1f(this.uniformLocations.uPulsationStrength, pulsationStrength);
                this._lastUniformValues.uPulsationStrength = pulsationStrength;
            }
        }
        
        if (this.uniformLocations.uRippleDistortionStrength) {
            const rippleDistortionStrength = this.parameters.rippleDistortionStrength !== undefined ? this.parameters.rippleDistortionStrength : 0.3;
            if (this._lastUniformValues.uRippleDistortionStrength !== rippleDistortionStrength) {
                gl.uniform1f(this.uniformLocations.uRippleDistortionStrength, rippleDistortionStrength);
                this._lastUniformValues.uRippleDistortionStrength = rippleDistortionStrength;
            }
        }
        
        // Dot movement control uniforms
        if (this.uniformLocations.uEnableCenterPositionOffset) {
            const enableCenterOffset = this.parameters.enableCenterPositionOffset !== undefined ? this.parameters.enableCenterPositionOffset : 1.0;
            if (this._lastUniformValues.uEnableCenterPositionOffset !== enableCenterOffset) {
                gl.uniform1f(this.uniformLocations.uEnableCenterPositionOffset, enableCenterOffset);
                this._lastUniformValues.uEnableCenterPositionOffset = enableCenterOffset;
            }
        }
        
        if (this.uniformLocations.uEnableUVOffset) {
            const enableUVOffset = this.parameters.enableUVOffset !== undefined ? this.parameters.enableUVOffset : 0.0;
            if (this._lastUniformValues.uEnableUVOffset !== enableUVOffset) {
                gl.uniform1f(this.uniformLocations.uEnableUVOffset, enableUVOffset);
                this._lastUniformValues.uEnableUVOffset = enableUVOffset;
            }
        }
        
        if (this.uniformLocations.uMovementStrength) {
            const movementStrength = this.parameters.movementStrength !== undefined ? this.parameters.movementStrength : 1.3;
            if (this._lastUniformValues.uMovementStrength !== movementStrength) {
                gl.uniform1f(this.uniformLocations.uMovementStrength, movementStrength);
                this._lastUniformValues.uMovementStrength = movementStrength;
            }
        }
        
        if (this.uniformLocations.uUVOffsetStrength) {
            const uvOffsetStrength = this.parameters.uvOffsetStrength !== undefined ? this.parameters.uvOffsetStrength : 1.0;
            if (this._lastUniformValues.uUVOffsetStrength !== uvOffsetStrength) {
                gl.uniform1f(this.uniformLocations.uUVOffsetStrength, uvOffsetStrength);
                this._lastUniformValues.uUVOffsetStrength = uvOffsetStrength;
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
        
        // Refraction shader parameters - only update if changed
        // Use config defaults as fallback to match config file
        if (this.uniformLocations.uOuterGridSize) {
            const paramConfig = this.config.parameters?.outerGridSize;
            const outerGridSize = this.parameters.outerGridSize !== undefined ? this.parameters.outerGridSize : (paramConfig?.default ?? 15.0);
            if (this._lastUniformValues.uOuterGridSize !== outerGridSize) {
                gl.uniform1f(this.uniformLocations.uOuterGridSize, outerGridSize);
                this._lastUniformValues.uOuterGridSize = outerGridSize;
            }
        }
        
        if (this.uniformLocations.uInnerGridSize) {
            const paramConfig = this.config.parameters?.innerGridSize;
            const innerGridSize = this.parameters.innerGridSize !== undefined ? this.parameters.innerGridSize : (paramConfig?.default ?? 3.0);
            if (this._lastUniformValues.uInnerGridSize !== innerGridSize) {
                gl.uniform1f(this.uniformLocations.uInnerGridSize, innerGridSize);
                this._lastUniformValues.uInnerGridSize = innerGridSize;
            }
        }
        
        if (this.uniformLocations.uBlurStrength) {
            const paramConfig = this.config.parameters?.blurStrength;
            const blurStrength = this.parameters.blurStrength !== undefined ? this.parameters.blurStrength : (paramConfig?.default ?? 18.0);
            if (this._lastUniformValues.uBlurStrength !== blurStrength) {
                gl.uniform1f(this.uniformLocations.uBlurStrength, blurStrength);
                this._lastUniformValues.uBlurStrength = blurStrength;
            }
        }
        
        if (this.uniformLocations.uOffsetStrength) {
            const paramConfig = this.config.parameters?.offsetStrength;
            const offsetStrength = this.parameters.offsetStrength !== undefined ? this.parameters.offsetStrength : (paramConfig?.default ?? 0.2);
            if (this._lastUniformValues.uOffsetStrength !== offsetStrength) {
                gl.uniform1f(this.uniformLocations.uOffsetStrength, offsetStrength);
                this._lastUniformValues.uOffsetStrength = offsetStrength;
            }
        }
        
        if (this.uniformLocations.uPixelizeLevels) {
            const paramConfig = this.config.parameters?.pixelizeLevels;
            const pixelizeLevels = this.parameters.pixelizeLevels !== undefined ? this.parameters.pixelizeLevels : (paramConfig?.default ?? 4.0);
            if (this._lastUniformValues.uPixelizeLevels !== pixelizeLevels) {
                gl.uniform1f(this.uniformLocations.uPixelizeLevels, pixelizeLevels);
                this._lastUniformValues.uPixelizeLevels = pixelizeLevels;
            }
        }
        
        if (this.uniformLocations.uCellBrightnessVariation) {
            const paramConfig = this.config.parameters?.cellBrightnessVariation;
            const cellBrightnessVariation = this.parameters.cellBrightnessVariation !== undefined ? this.parameters.cellBrightnessVariation : (paramConfig?.default ?? 0.025);
            if (this._lastUniformValues.uCellBrightnessVariation !== cellBrightnessVariation) {
                gl.uniform1f(this.uniformLocations.uCellBrightnessVariation, cellBrightnessVariation);
                this._lastUniformValues.uCellBrightnessVariation = cellBrightnessVariation;
            }
        }
        
        if (this.uniformLocations.uCellAnimNote1) {
            const paramConfig = this.config.parameters?.cellAnimNote1;
            const cellAnimNote1 = this.parameters.cellAnimNote1 !== undefined ? this.parameters.cellAnimNote1 : (paramConfig?.default ?? 4.0);
            if (this._lastUniformValues.uCellAnimNote1 !== cellAnimNote1) {
                gl.uniform1f(this.uniformLocations.uCellAnimNote1, cellAnimNote1);
                this._lastUniformValues.uCellAnimNote1 = cellAnimNote1;
            }
        }
        
        if (this.uniformLocations.uCellAnimNote2) {
            const paramConfig = this.config.parameters?.cellAnimNote2;
            const cellAnimNote2 = this.parameters.cellAnimNote2 !== undefined ? this.parameters.cellAnimNote2 : (paramConfig?.default ?? 2.0);
            if (this._lastUniformValues.uCellAnimNote2 !== cellAnimNote2) {
                gl.uniform1f(this.uniformLocations.uCellAnimNote2, cellAnimNote2);
                this._lastUniformValues.uCellAnimNote2 = cellAnimNote2;
            }
        }
        
        if (this.uniformLocations.uCellAnimNote3) {
            const paramConfig = this.config.parameters?.cellAnimNote3;
            const cellAnimNote3 = this.parameters.cellAnimNote3 !== undefined ? this.parameters.cellAnimNote3 : (paramConfig?.default ?? 1.0);
            if (this._lastUniformValues.uCellAnimNote3 !== cellAnimNote3) {
                gl.uniform1f(this.uniformLocations.uCellAnimNote3, cellAnimNote3);
                this._lastUniformValues.uCellAnimNote3 = cellAnimNote3;
            }
        }
        
        if (this.uniformLocations.uDistortionStrength) {
            const paramConfig = this.config.parameters?.distortionStrength;
            const distortionStrength = this.parameters.distortionStrength !== undefined ? this.parameters.distortionStrength : (paramConfig?.default ?? 1.0);
            if (this._lastUniformValues.uDistortionStrength !== distortionStrength) {
                gl.uniform1f(this.uniformLocations.uDistortionStrength, distortionStrength);
                this._lastUniformValues.uDistortionStrength = distortionStrength;
            }
        }
        
        if (this.uniformLocations.uDistortionSize) {
            const paramConfig = this.config.parameters?.distortionSize;
            const distortionSize = this.parameters.distortionSize !== undefined ? this.parameters.distortionSize : (paramConfig?.default ?? 1.0);
            if (this._lastUniformValues.uDistortionSize !== distortionSize) {
                gl.uniform1f(this.uniformLocations.uDistortionSize, distortionSize);
                this._lastUniformValues.uDistortionSize = distortionSize;
            }
        }
        
        if (this.uniformLocations.uDistortionFalloff) {
            const paramConfig = this.config.parameters?.distortionFalloff;
            const distortionFalloff = this.parameters.distortionFalloff !== undefined ? this.parameters.distortionFalloff : (paramConfig?.default ?? 2.0);
            if (this._lastUniformValues.uDistortionFalloff !== distortionFalloff) {
                gl.uniform1f(this.uniformLocations.uDistortionFalloff, distortionFalloff);
                this._lastUniformValues.uDistortionFalloff = distortionFalloff;
            }
        }
        
        if (this.uniformLocations.uDistortionPerspectiveStrength) {
            const paramConfig = this.config.parameters?.distortionPerspectiveStrength;
            const distortionPerspectiveStrength = this.parameters.distortionPerspectiveStrength !== undefined ? this.parameters.distortionPerspectiveStrength : (paramConfig?.default ?? 1.0);
            if (this._lastUniformValues.uDistortionPerspectiveStrength !== distortionPerspectiveStrength) {
                gl.uniform1f(this.uniformLocations.uDistortionPerspectiveStrength, distortionPerspectiveStrength);
                this._lastUniformValues.uDistortionPerspectiveStrength = distortionPerspectiveStrength;
            }
        }
        
        if (this.uniformLocations.uDistortionEasing) {
            const paramConfig = this.config.parameters?.distortionEasing;
            const distortionEasing = this.parameters.distortionEasing !== undefined ? this.parameters.distortionEasing : (paramConfig?.default ?? 1.0);
            if (this._lastUniformValues.uDistortionEasing !== distortionEasing) {
                gl.uniform1f(this.uniformLocations.uDistortionEasing, distortionEasing);
                this._lastUniformValues.uDistortionEasing = distortionEasing;
            }
        }
        
        // Synthwave shader parameters - only update if changed
        if (this.uniformLocations.uGridDensity) {
            const gridDensity = this.parameters.gridDensity !== undefined ? this.parameters.gridDensity : 8.0;
            if (this._lastUniformValues.uGridDensity !== gridDensity) {
                gl.uniform1f(this.uniformLocations.uGridDensity, gridDensity);
                this._lastUniformValues.uGridDensity = gridDensity;
            }
        }
        
        if (this.uniformLocations.uPerspectiveStrength) {
            const perspectiveStrength = this.parameters.perspectiveStrength !== undefined ? this.parameters.perspectiveStrength : 0.8;
            if (this._lastUniformValues.uPerspectiveStrength !== perspectiveStrength) {
                gl.uniform1f(this.uniformLocations.uPerspectiveStrength, perspectiveStrength);
                this._lastUniformValues.uPerspectiveStrength = perspectiveStrength;
            }
        }
        
        if (this.uniformLocations.uScanlineIntensity) {
            const scanlineIntensity = this.parameters.scanlineIntensity !== undefined ? this.parameters.scanlineIntensity : 0.3;
            if (this._lastUniformValues.uScanlineIntensity !== scanlineIntensity) {
                gl.uniform1f(this.uniformLocations.uScanlineIntensity, scanlineIntensity);
                this._lastUniformValues.uScanlineIntensity = scanlineIntensity;
            }
        }
        
        if (this.uniformLocations.uGlowIntensity) {
            const glowIntensity = this.parameters.glowIntensity !== undefined ? this.parameters.glowIntensity : 1.5;
            if (this._lastUniformValues.uGlowIntensity !== glowIntensity) {
                gl.uniform1f(this.uniformLocations.uGlowIntensity, glowIntensity);
                this._lastUniformValues.uGlowIntensity = glowIntensity;
            }
        }
        
        if (this.uniformLocations.uHorizonPosition) {
            const horizonPosition = this.parameters.horizonPosition !== undefined ? this.parameters.horizonPosition : 0.6;
            if (this._lastUniformValues.uHorizonPosition !== horizonPosition) {
                gl.uniform1f(this.uniformLocations.uHorizonPosition, horizonPosition);
                this._lastUniformValues.uHorizonPosition = horizonPosition;
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
        
        // Handle frequency visualizer multi-layer smoothing
        if (this.config.name === 'frequency-visualizer' && audioData && audioData.audioContext) {
            this.updateFrequencyVisualizerLayers(audioData, elapsed / 1000.0);
        }
        
        // Handle refraction tempo-based smoothing
        if (this.config.name === 'refraction' && audioData) {
            const deltaTime = elapsed / 1000.0;
            const bpm = audioData.estimatedBPM || 0;
            
            // Smooth volume scale (0.3 + volume * 0.7)
            const targetVolumeScale = 0.3 + (audioData.volume || 0) * 0.7;
            const feedConfig = TempoSmoothingConfig.feed;
            const feedAttackTime = getTempoRelativeTimeConstant(
                feedConfig.attackNote,
                bpm,
                feedConfig.attackTimeFallback
            );
            const feedReleaseTime = getTempoRelativeTimeConstant(
                feedConfig.releaseNote,
                bpm,
                feedConfig.releaseTimeFallback
            );
            this._refractionSmoothing.smoothedVolumeScale = applyTempoRelativeSmoothing(
                this._refractionSmoothing.smoothedVolumeScale,
                targetVolumeScale,
                deltaTime,
                feedAttackTime,
                feedReleaseTime
            );
            
            // Smooth FBM zoom factor (1.0 = normal, maxZoom = zoomed out)
            // Calculate target zoom based on recent beats with intensity-based scaling
            const maxZoom = 2.0; // Maximum zoom factor (zoomed out)
            
            // Check for recent bass or mid beats and get their intensities
            let maxBeatIntensity = 0.0;
            const bassBeatAge = audioData.beatTimeBass || 999.0;
            const midBeatAge = audioData.beatTimeMid || 999.0;
            
            // Check bass beat (primary trigger)
            if (bassBeatAge < 0.3 && audioData.beatIntensityBass > 0.5) {
                maxBeatIntensity = Math.max(maxBeatIntensity, audioData.beatIntensityBass);
            }
            
            // Check mid beat (secondary trigger)
            if (midBeatAge < 0.3 && audioData.beatIntensityMid > 0.5) {
                maxBeatIntensity = Math.max(maxBeatIntensity, audioData.beatIntensityMid);
            }
            
            // Scale zoom from 1.0 (no beat) to maxZoom (strong beat) based on intensity
            // Intensity is 0.5-1.0, so map it to 0.0-1.0 range, then scale to zoom range
            const intensityFactor = maxBeatIntensity > 0.0 
                ? (maxBeatIntensity - 0.5) / 0.5  // Map 0.5-1.0 to 0.0-1.0
                : 0.0;
            const targetZoom = 1.0 + (maxZoom - 1.0) * intensityFactor;
            
            const zoomConfig = TempoSmoothingConfig.fbmZoom;
            const zoomAttackTime = getTempoRelativeTimeConstant(
                zoomConfig.attackNote,
                bpm,
                zoomConfig.attackTimeFallback
            );
            const zoomReleaseTime = getTempoRelativeTimeConstant(
                zoomConfig.releaseNote,
                bpm,
                zoomConfig.releaseTimeFallback
            );
            this._refractionSmoothing.smoothedFbmZoom = applyTempoRelativeSmoothing(
                this._refractionSmoothing.smoothedFbmZoom,
                targetZoom,
                deltaTime,
                zoomAttackTime,
                zoomReleaseTime
            );
            
            // Set smoothed uniforms
            if (this.uniformLocations.uSmoothedVolumeScale) {
                gl.uniform1f(this.uniformLocations.uSmoothedVolumeScale, this._refractionSmoothing.smoothedVolumeScale);
            }
            if (this.uniformLocations.uSmoothedFbmZoom) {
                gl.uniform1f(this.uniformLocations.uSmoothedFbmZoom, this._refractionSmoothing.smoothedFbmZoom);
            }
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
    
    /**
     * Create or update a frequency data texture
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Float32Array} data - Texture data (interleaved RG channels)
     * @param {number} width - Texture width (number of bands)
     * @param {WebGLTexture} existingTexture - Existing texture to update, or null to create new
     * @returns {WebGLTexture} The texture
     */
    _createFrequencyTexture(gl, data, width, existingTexture = null) {
        // Check for float texture support
        const floatTextureExt = gl.getExtension('OES_texture_float');
        const useFloat = !!floatTextureExt;
        
        const texture = existingTexture || gl.createTexture();
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
     * Update multi-layer smoothing for frequency visualizer
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {number} deltaTime - Time since last frame (seconds)
     */
    updateFrequencyVisualizerLayers(audioData, deltaTime) {
        const measuredBands = this._measuredBands;  // Always measure 64 bands
        const visualBands = this.parameters.numBands || 320;  // Display 320 bands
        const bpm = audioData.estimatedBPM || 0;
        
        // Calculate configurable bands (measure 64 bands)
        let bandData;
        if (audioData.audioContext && audioData.frequencyData) {
            // Try to use AudioAnalyzer's method (from stored reference)
            if (this._audioAnalyzer && typeof this._audioAnalyzer.calculateConfigurableBands === 'function') {
                bandData = this._audioAnalyzer.calculateConfigurableBands(measuredBands);
            } else if (audioData.leftFrequencyData && audioData.rightFrequencyData) {
                // Fallback: calculate directly
                const sampleRate = audioData.audioContext?.sampleRate || 44100;
                const nyquist = sampleRate / 2;
                const binSize = nyquist / audioData.frequencyData.length;
                const hzToBin = (hz) => Math.floor(hz / binSize);
                const getAverage = (data, start, end) => {
                    let sum = 0;
                    const count = Math.min(end, data.length - 1) - start + 1;
                    if (count <= 0) return 0;
                    for (let i = start; i <= end && i < data.length; i++) {
                        sum += data[i];
                    }
                    return sum / count / 255.0;
                };
                
                const minFreq = 20;
                const maxFreq = nyquist;
                const leftBands = new Float32Array(measuredBands);
                const rightBands = new Float32Array(measuredBands);
                
                for (let i = 0; i < measuredBands; i++) {
                    const t = i / (numBands - 1);
                    const freqStart = minFreq * Math.pow(maxFreq / minFreq, t);
                    const freqEnd = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / (numBands - 1));
                    const binStart = hzToBin(freqStart);
                    const binEnd = hzToBin(freqEnd);
                    leftBands[i] = getAverage(audioData.leftFrequencyData, binStart, binEnd);
                    rightBands[i] = getAverage(audioData.rightFrequencyData, binStart, binEnd);
                }
                
                bandData = { leftBands, rightBands, numBands };
            } else {
                // No stereo data available
                return;
            }
        } else {
            return;
        }
        
        // Initialize smoothing arrays if needed (always 64 measured bands)
        if (!this._layerSmoothing.layer1 || this._layerSmoothing.layer1.length !== measuredBands) {
            this._layerSmoothing.layer1 = new Float32Array(measuredBands);
            this._layerSmoothing.layer2 = new Float32Array(measuredBands);
            this._layerSmoothing.layer3 = new Float32Array(measuredBands);
        }
        
        // Get time constants for each layer (already in seconds)
        // Layer 1 (background far): slowest
        const layer1Attack = getTempoRelativeTimeConstant(1.0 / 32.0, bpm, 300.0);
        const layer1Release = getTempoRelativeTimeConstant(1.0 / 2.0, bpm, 1500.0);
        
        // Layer 2 (background near): medium
        const layer2Attack = getTempoRelativeTimeConstant(1.0 / 64.0, bpm, 150.0);
        const layer2Release = getTempoRelativeTimeConstant(1.0 / 4.0, bpm, 800.0);
        
        // Layer 3 (foreground): fastest
        const layer3Attack = getTempoRelativeTimeConstant(1.0 / 128.0, bpm, 50.0);
        const layer3Release = getTempoRelativeTimeConstant(1.0 / 8.0, bpm, 300.0);
        
        // Smooth each band for each layer (64 measured bands)
        for (let i = 0; i < measuredBands; i++) {
            // Use max of left and right for smoothing target
            const targetValue = Math.max(bandData.leftBands[i], bandData.rightBands[i]);
            
            // Apply smoothing to each layer
            this._layerSmoothing.layer1[i] = applyTempoRelativeSmoothing(
                this._layerSmoothing.layer1[i],
                targetValue,
                deltaTime,
                layer1Attack,
                layer1Release
            );
            
            this._layerSmoothing.layer2[i] = applyTempoRelativeSmoothing(
                this._layerSmoothing.layer2[i],
                targetValue,
                deltaTime,
                layer2Attack,
                layer2Release
            );
            
            this._layerSmoothing.layer3[i] = applyTempoRelativeSmoothing(
                this._layerSmoothing.layer3[i],
                targetValue,
                deltaTime,
                layer3Attack,
                layer3Release
            );
        }
        
        // Create texture data: interleave left/right channels and layer heights
        // Format: LUMINANCE_ALPHA where LUMINANCE = left, ALPHA = right
        const leftRightData = new Float32Array(measuredBands * 2);
        const layer1Data = new Float32Array(measuredBands * 2);
        const layer2Data = new Float32Array(measuredBands * 2);
        const layer3Data = new Float32Array(measuredBands * 2);
        
        for (let i = 0; i < measuredBands; i++) {
            // Left/right raw frequency data
            leftRightData[i * 2] = bandData.leftBands[i];      // LUMINANCE = left
            leftRightData[i * 2 + 1] = bandData.rightBands[i]; // ALPHA = right
            
            // Layer heights (use same channel for both, we'll use separate textures)
            layer1Data[i * 2] = this._layerSmoothing.layer1[i];
            layer1Data[i * 2 + 1] = this._layerSmoothing.layer1[i];
            layer2Data[i * 2] = this._layerSmoothing.layer2[i];
            layer2Data[i * 2 + 1] = this._layerSmoothing.layer2[i];
            layer3Data[i * 2] = this._layerSmoothing.layer3[i];
            layer3Data[i * 2 + 1] = this._layerSmoothing.layer3[i];
        }
        
        // Create or update textures
        const gl = this.gl;
        this._frequencyTextures.leftRight = this._createFrequencyTexture(
            gl, 
            leftRightData, 
            measuredBands,
            this._frequencyTextures.leftRight
        );
        this._frequencyTextures.layer1 = this._createFrequencyTexture(
            gl, 
            layer1Data, 
            measuredBands,
            this._frequencyTextures.layer1
        );
        this._frequencyTextures.layer2 = this._createFrequencyTexture(
            gl, 
            layer2Data, 
            measuredBands,
            this._frequencyTextures.layer2
        );
        this._frequencyTextures.layer3 = this._createFrequencyTexture(
            gl, 
            layer3Data, 
            measuredBands,
            this._frequencyTextures.layer3
        );
        
        // Set texture uniforms
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._frequencyTextures.leftRight);
        if (this.uniformLocations.uFrequencyTexture) {
            gl.uniform1i(this.uniformLocations.uFrequencyTexture, 0);
        }
        
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._frequencyTextures.layer1);
        if (this.uniformLocations.uLayer1Texture) {
            gl.uniform1i(this.uniformLocations.uLayer1Texture, 1);
        }
        
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this._frequencyTextures.layer2);
        if (this.uniformLocations.uLayer2Texture) {
            gl.uniform1i(this.uniformLocations.uLayer2Texture, 2);
        }
        
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this._frequencyTextures.layer3);
        if (this.uniformLocations.uLayer3Texture) {
            gl.uniform1i(this.uniformLocations.uLayer3Texture, 3);
        }
        
        // Set uniform values
        // Set visual bands (for display)
        if (this.uniformLocations.uNumBands) {
            gl.uniform1i(this.uniformLocations.uNumBands, visualBands);
        }
        
        // Set measured bands (for texture sampling)
        if (this.uniformLocations.uMeasuredBands) {
            gl.uniform1f(this.uniformLocations.uMeasuredBands, measuredBands);
        }
        
        // Set maxHeight
        if (this.uniformLocations.uMaxHeight) {
            gl.uniform1f(this.uniformLocations.uMaxHeight, this.parameters.maxHeight || 0.4);
        }
        
        // Set centerY
        if (this.uniformLocations.uCenterY) {
            gl.uniform1f(this.uniformLocations.uCenterY, 0.5);
        }
        
        // Set barWidth
        if (this.uniformLocations.uBarWidth) {
            gl.uniform1f(this.uniformLocations.uBarWidth, this.parameters.barWidth || 0.8);
        }
        
        // Set layer parameters
        if (this.uniformLocations.uLayer1HeightMultiplier) {
            gl.uniform1f(this.uniformLocations.uLayer1HeightMultiplier, this.parameters.layer1HeightMultiplier || 1.2);
        }
        if (this.uniformLocations.uLayer2HeightMultiplier) {
            gl.uniform1f(this.uniformLocations.uLayer2HeightMultiplier, this.parameters.layer2HeightMultiplier || 1.1);
        }
        if (this.uniformLocations.uLayer3HeightMultiplier) {
            gl.uniform1f(this.uniformLocations.uLayer3HeightMultiplier, this.parameters.layer3HeightMultiplier || 1.0);
        }
        if (this.uniformLocations.uLayer1Opacity) {
            gl.uniform1f(this.uniformLocations.uLayer1Opacity, this.parameters.layer1Opacity || 0.4);
        }
        if (this.uniformLocations.uLayer2Opacity) {
            gl.uniform1f(this.uniformLocations.uLayer2Opacity, this.parameters.layer2Opacity || 0.6);
        }
        if (this.uniformLocations.uLayer3Opacity) {
            gl.uniform1f(this.uniformLocations.uLayer3Opacity, this.parameters.layer3Opacity || 1.0);
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
        
        // Clean up textures
        if (this.gl) {
            Object.values(this._frequencyTextures).forEach(texture => {
                if (texture) {
                    this.gl.deleteTexture(texture);
                }
            });
        }
        
        this.isInitialized = false;
    }
}

