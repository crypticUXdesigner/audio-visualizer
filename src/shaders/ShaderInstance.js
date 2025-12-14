// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { loadShader, createProgram, createQuad } from '../core/WebGLUtils.js';

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
        
        // Get WebGL context
        const contextAttributes = {
            alpha: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            antialias: false,
            depth: false,
            stencil: false,
            failIfMajorPerformanceCaveat: false
        };
        
        this.gl = this.canvas.getContext('webgl', contextAttributes) || 
                  this.canvas.getContext('webgl');
        
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }
        
        // Enable extensions
        this.ext = this.gl.getExtension('OES_standard_derivatives');
        if (!this.ext) {
            console.warn('OES_standard_derivatives extension not supported');
        }
        
        // Load and compile shaders
        const vertexSource = await loadShader(this.config.vertexPath);
        let fragmentSource = await loadShader(this.config.fragmentPath);
        
        // Add extension directive if available
        if (this.ext) {
            fragmentSource = '#extension GL_OES_standard_derivatives : enable\n' + fragmentSource;
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
            uRippleActive: gl.getUniformLocation(program, 'uRippleActive'),
            uRippleCount: gl.getUniformLocation(program, 'uRippleCount'),
            
            // Position attribute
            a_position: gl.getAttribLocation(program, 'a_position')
        };
    }
    
    resize() {
        if (!this.canvas || !this.gl) return;
        
        const dpr = window.devicePixelRatio || 1;
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const newWidth = viewportWidth * dpr;
        const newHeight = viewportHeight * dpr;
        
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
    
    render(audioData = null, colors = null) {
        if (!this.isInitialized || !this.gl || !this.program) return;
        
        const now = Date.now();
        const elapsed = now - this.lastFrameTime;
        const targetFrameInterval = 1000 / this.targetFPS;
        
        if (elapsed < targetFrameInterval) {
            return; // Skip frame to maintain target FPS
        }
        
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
            gl.uniform1f(this.uniformLocations.uPixelSize, this.parameters.pixelSize || 1.0);
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
            const maxRipples = 16;
            
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
            if (this._audioAnalyzer) {
                this._audioAnalyzer.update();
            }
            // Always use current colors reference (may have been updated)
            this.render(this._audioAnalyzer ? this._audioAnalyzer.getData() : null, this._colors);
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

