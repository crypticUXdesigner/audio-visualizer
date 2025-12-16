// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { loadShader, createProgram, createQuad } from '../core/WebGLUtils.js';
import Sentry, { safeSentryMetric, isSentryAvailable } from '../core/SentryInit.js';

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
        this.baseTimeOffsetAccumulationRate = 0.5;
        this.baseTimeOffsetDecayRate = 0.3;
        this.maxTimeOffset = 10.0;
        this.targetFPS = this.parameters.targetFPS || 30;
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
        if (typeof Sentry !== 'undefined') {
            Sentry.setContext("webgl", {
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
        }
        
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
            
            // Position attribute
            a_position: gl.getAttribLocation(program, 'a_position')
        };
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
            // Update targetFPS if parameter changed
            if (name === 'targetFPS') {
                this.targetFPS = value;
            }
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
            
            if (loudnessAnimationEnabled && volume > loudnessThreshold) {
                const accumulation = volume * this.baseTimeOffsetAccumulationRate * deltaTime;
                this.timeOffset = Math.min(this.timeOffset + accumulation, this.maxTimeOffset);
            } else if (loudnessAnimationEnabled) {
                this.timeOffset = Math.max(0, this.timeOffset - this.baseTimeOffsetDecayRate * deltaTime);
            } else {
                // Loudness animation disabled: force decay to 0
                this.timeOffset = Math.max(0, this.timeOffset - this.baseTimeOffsetDecayRate * deltaTime);
            }
            
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
        
        // Set standard uniforms
        if (this.uniformLocations.uResolution) {
            gl.uniform2f(this.uniformLocations.uResolution, this.canvas.width, this.canvas.height);
        }
        if (this.uniformLocations.uTime) {
            gl.uniform1f(this.uniformLocations.uTime, currentTime);
        }
        if (this.uniformLocations.uTimeOffset) {
            gl.uniform1f(this.uniformLocations.uTimeOffset, this.timeOffset);
        }
        if (this.uniformLocations.uPixelSize) {
            const dpr = window.devicePixelRatio || 1;
            const basePixelSize = this.parameters.pixelSize || 1.0;
            // Apply animation multiplier to the configured pixel size
            const scaledPixelSize = basePixelSize * this.pixelSizeMultiplier * dpr;
            gl.uniform1f(this.uniformLocations.uPixelSize, scaledPixelSize);
        }
        if (this.uniformLocations.uSteps) {
            gl.uniform1f(this.uniformLocations.uSteps, this.parameters.steps || 5.0);
        }
        if (this.uniformLocations.uMouse) {
            gl.uniform4f(this.uniformLocations.uMouse, 0.0, 0.0, 0.0, 0.0);
        }
        if (this.uniformLocations.uShapeType) {
            gl.uniform1i(this.uniformLocations.uShapeType, 0);
        }
        
        // Set ripple effect parameters
        if (this.uniformLocations.uRippleSpeed) {
            gl.uniform1f(this.uniformLocations.uRippleSpeed, this.parameters.rippleSpeed || 0.5);
        }
        if (this.uniformLocations.uRippleWidth) {
            gl.uniform1f(this.uniformLocations.uRippleWidth, this.parameters.rippleWidth || 0.1);
        }
        if (this.uniformLocations.uRippleMinRadius) {
            gl.uniform1f(this.uniformLocations.uRippleMinRadius, this.parameters.rippleMinRadius !== undefined ? this.parameters.rippleMinRadius : 0.0);
        }
        if (this.uniformLocations.uRippleMaxRadius) {
            gl.uniform1f(this.uniformLocations.uRippleMaxRadius, this.parameters.rippleMaxRadius !== undefined ? this.parameters.rippleMaxRadius : 1.5);
        }
        if (this.uniformLocations.uRippleIntensityThreshold) {
            gl.uniform1f(this.uniformLocations.uRippleIntensityThreshold, this.parameters.rippleIntensityThreshold !== undefined ? this.parameters.rippleIntensityThreshold : 0.6);
        }
        if (this.uniformLocations.uRippleIntensity) {
            gl.uniform1f(this.uniformLocations.uRippleIntensity, this.parameters.rippleIntensity !== undefined ? this.parameters.rippleIntensity : 0.4);
        }
        
        // Set multiple ripple arrays (if available from audioData)
        if (audioData && audioData.rippleData) {
            const rippleData = audioData.rippleData;
            const maxRipples = 12;
            
            // Split centers array into separate x and y arrays
            const centerX = new Float32Array(maxRipples);
            const centerY = new Float32Array(maxRipples);
            for (let i = 0; i < maxRipples; i++) {
                centerX[i] = rippleData.centers[i * 2] || 0;
                centerY[i] = rippleData.centers[i * 2 + 1] || 0;
            }
            
            if (this.uniformLocations.uRippleCenterX) {
                gl.uniform1fv(this.uniformLocations.uRippleCenterX, centerX);
            }
            if (this.uniformLocations.uRippleCenterY) {
                gl.uniform1fv(this.uniformLocations.uRippleCenterY, centerY);
            }
            
            // Set times array
            if (this.uniformLocations.uRippleTimes) {
                const times = new Float32Array(rippleData.times || new Array(maxRipples).fill(0));
                gl.uniform1fv(this.uniformLocations.uRippleTimes, times);
            }
            
            // Set intensities array
            if (this.uniformLocations.uRippleIntensities) {
                const intensities = new Float32Array(rippleData.intensities || new Array(maxRipples).fill(0));
                gl.uniform1fv(this.uniformLocations.uRippleIntensities, intensities);
            }
            
            // Set widths array
            if (this.uniformLocations.uRippleWidths) {
                const widths = new Float32Array(rippleData.widths || new Array(maxRipples).fill(0));
                gl.uniform1fv(this.uniformLocations.uRippleWidths, widths);
            }
            
            // Set minRadii array
            if (this.uniformLocations.uRippleMinRadii) {
                const minRadii = new Float32Array(rippleData.minRadii || new Array(maxRipples).fill(0));
                gl.uniform1fv(this.uniformLocations.uRippleMinRadii, minRadii);
            }
            
            // Set maxRadii array
            if (this.uniformLocations.uRippleMaxRadii) {
                const maxRadii = new Float32Array(rippleData.maxRadii || new Array(maxRipples).fill(0));
                gl.uniform1fv(this.uniformLocations.uRippleMaxRadii, maxRadii);
            }
            
            // Set intensityMultipliers array
            if (this.uniformLocations.uRippleIntensityMultipliers) {
                const intensityMultipliers = new Float32Array(rippleData.intensityMultipliers || new Array(maxRipples).fill(0));
                gl.uniform1fv(this.uniformLocations.uRippleIntensityMultipliers, intensityMultipliers);
            }
            
            // Set active array
            if (this.uniformLocations.uRippleActive) {
                const active = new Float32Array(rippleData.active || new Array(maxRipples).fill(0));
                gl.uniform1fv(this.uniformLocations.uRippleActive, active);
            }
            
            // Set count
            if (this.uniformLocations.uRippleCount) {
                gl.uniform1i(this.uniformLocations.uRippleCount, rippleData.count || 0);
            }
        } else {
            // Set empty arrays if no ripple data
            const emptyArray = new Float32Array(16).fill(0);
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
        
        // Set color uniforms
        if (colors) {
            const colorUniforms = ['uColor', 'uColor2', 'uColor3', 'uColor4', 'uColor5', 
                                  'uColor6', 'uColor7', 'uColor8', 'uColor9', 'uColor10'];
            const colorKeys = ['color', 'color2', 'color3', 'color4', 'color5', 
                              'color6', 'color7', 'color8', 'color9', 'color10'];
            
            colorUniforms.forEach((uniformName, index) => {
                const location = this.uniformLocations[uniformName];
                const colorKey = colorKeys[index];
                if (location && colors[colorKey]) {
                    const color = colors[colorKey];
                    gl.uniform3f(location, color[0], color[1], color[2]);
                }
            });
        }
        
        // Set audio uniforms using uniform mapping
        if (audioData && this.config.uniformMapping) {
            Object.entries(this.config.uniformMapping).forEach(([uniformName, mapper]) => {
                const location = this.uniformLocations[uniformName];
                // Set uniform even if location is null (WebGL will ignore it, but ensures all mappers run)
                // This is important for ripple effects - they need to be calculated even if uniform doesn't exist
                const value = mapper(audioData, this.parameters);
                if (location !== null && location !== undefined) {
                    if (typeof value === 'number') {
                        gl.uniform1f(location, value);
                    } else if (Array.isArray(value) && value.length === 2) {
                        gl.uniform2f(location, value[0], value[1]);
                    } else if (Array.isArray(value) && value.length === 3) {
                        gl.uniform3f(location, value[0], value[1], value[2]);
                    } else if (Array.isArray(value) && value.length === 4) {
                        gl.uniform4f(location, value[0], value[1], value[2], value[3]);
                    }
                }
            });
        }
        
        // Set title texture if available
        if (this.titleTexture && this.uniformLocations.uTitleTexture) {
            const textureUnit = this.titleTexture.bindTexture(0);
            gl.uniform1i(this.uniformLocations.uTitleTexture, textureUnit);
            if (this.uniformLocations.uTitleTextureSize) {
                const size = this.titleTexture.getSize();
                gl.uniform2f(
                    this.uniformLocations.uTitleTextureSize,
                    size.width,
                    size.height
                );
            }
            // Set title scale (1.5 = 50% larger, 2.0 = 2x larger, etc.)
            if (this.uniformLocations.uTitleScale !== null && this.uniformLocations.uTitleScale !== undefined) {
                gl.uniform1f(this.uniformLocations.uTitleScale, 1.5); // Default scale: 1.5x larger
            }
            
            // Set playback progress (0.0 = start, 1.0 = end)
            if (this.uniformLocations.uPlaybackProgress !== null && this.uniformLocations.uPlaybackProgress !== undefined) {
                const playbackProgress = audioData && audioData.playbackProgress !== undefined 
                    ? audioData.playbackProgress 
                    : 0.0;
                gl.uniform1f(this.uniformLocations.uPlaybackProgress, playbackProgress);
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
                
                // Pass target screen position (0-1) to shader
                gl.uniform2f(this.uniformLocations.uTitlePositionOffset, targetX, targetY);
                
                // Set scale (now always 1.0 since we use font size instead)
                if (this.uniformLocations.uTitleScaleBottomLeft !== null && this.uniformLocations.uTitleScaleBottomLeft !== undefined) {
                    gl.uniform1f(this.uniformLocations.uTitleScaleBottomLeft, scale);
                }
            }
        } else if (this.uniformLocations.uTitleTextureSize) {
            // Set size to 0,0 if no texture to disable sampling
            gl.uniform2f(this.uniformLocations.uTitleTextureSize, 0.0, 0.0);
        }
        
        // Always set playback progress even if no texture (for consistency)
        if (this.uniformLocations.uPlaybackProgress !== null && this.uniformLocations.uPlaybackProgress !== undefined) {
            const playbackProgress = audioData && audioData.playbackProgress !== undefined 
                ? audioData.playbackProgress 
                : 0.0;
            gl.uniform1f(this.uniformLocations.uPlaybackProgress, playbackProgress);
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
            // Always use current colors reference (may have been updated)
            this.render(this._audioAnalyzer ? this._audioAnalyzer.getData() : null, this._colors);
            
            // Measure performance after rendering
            this.measurePerformance();
            
            this.renderLoopId = requestAnimationFrame(render);
        };
        
        this.renderLoopId = requestAnimationFrame(render);
    }
    
    /**
     * Update colors in the render loop without restarting
     * @param {Object} colors - New colors object
     */
    updateColors(colors) {
        this._colors = colors;
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
                    if (typeof Sentry !== 'undefined') {
                        Sentry.addBreadcrumb({
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
                    }
                } else if (currentFPS > targetFPS * 1.2 && this.qualityLevel < 1.0) {
                    // Increase quality
                    this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.1);
                    console.log(`Performance: Increasing quality to ${(this.qualityLevel * 100).toFixed(0)}% (FPS: ${currentFPS.toFixed(1)})`);
                    this.resize(); // Recalculate canvas size
                    
                    // Track quality change in Sentry
                    if (typeof Sentry !== 'undefined') {
                        Sentry.addBreadcrumb({
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

