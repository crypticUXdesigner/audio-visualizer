// ShaderInstance - Manages a single shader instance
// Handles WebGL context, program, uniforms, and rendering for one shader

import { createShaderPlugin } from './plugins/pluginFactory.js';
import { TimeOffsetManager } from './managers/TimeOffsetManager.js';
import { ColorTransitionManager } from './managers/ColorTransitionManager.js';
import { PixelSizeAnimationManager } from './managers/PixelSizeAnimationManager.js';
import { PerformanceMonitor } from './managers/PerformanceMonitor.js';
import { WebGLContextManager } from './managers/WebGLContextManager.js';
import { ShaderConstants } from './config/ShaderConstants.js';
import { ShaderError, ErrorCodes } from './utils/ShaderErrors.js';
import { ShaderLogger } from './utils/ShaderLogger.js';
import { RenderLoop } from './utils/RenderLoop.js';
import { EventListenerManager } from '../utils/eventListenerManager.js';
import { ShaderParameterManager, type ShaderParameterContext } from './parameters/ShaderParameterManager.js';
import { ShaderInitializer, type ShaderInitContext } from './initialization/ShaderInitializer.js';
import type { ExtendedAudioData, ShaderConfig } from '../types/index.js';
import type { BaseShaderPlugin } from './plugins/BaseShaderPlugin.js';
import type { AudioAnalyzer } from '../core/audio/AudioAnalyzer.js';
import type { ShaderManager } from './ShaderManager.js';
import type { UniformManager } from './managers/UniformManager.js';
import type { TextureManager } from './managers/TextureManager.js';
import type { UniformLocationCache } from './managers/UniformLocationCache.js';
import type { Colors } from '../types/webgl.js';
import type { RippleArrays, LastUniformValues, UniformLocations, ParameterValue } from '../types/shader.js';

interface ShaderConfigWithHooks extends Omit<ShaderConfig, 'plugin' | 'onInit' | 'onRender'> {
    onInit?: (instance: ShaderInstance) => void;
    onRender?: (instance: ShaderInstance, audioData: ExtendedAudioData | null) => void;
    plugin?: new (instance: ShaderInstance, config: ShaderConfig) => BaseShaderPlugin;
}

export class ShaderInstance {
    canvasId: string;
    config: ShaderConfigWithHooks;
    webglContext: WebGLContextManager;
    canvas: HTMLCanvasElement | null;
    gl: WebGLRenderingContext | null;
    ext: OES_standard_derivatives | null;
    program: WebGLProgram | null;
    quadBuffer: WebGLBuffer | null;
    uniformLocations: UniformLocations;
    parameters: Record<string, ParameterValue>;
    startTime: number;
    isInitialized: boolean;
    lastFrameTime: number;
    eventListenerManager: EventListenerManager;
    renderLoop: RenderLoop;
    timeOffsetManager: TimeOffsetManager;
    colorTransitionManager: ColorTransitionManager;
    pixelSizeAnimationManager: PixelSizeAnimationManager;
    performanceMonitor: PerformanceMonitor;
    webglFallbackActive: boolean;
    _rippleArrays: RippleArrays;
    _lastUniformValues: LastUniformValues;
    _hasRenderedWithColors: boolean;
    plugin: BaseShaderPlugin | null;
    uniformManager: UniformManager | null;
    textureManager: TextureManager | null;
    uniformLocationCache: UniformLocationCache | null;
    _shaderManager: ShaderManager | null;
    
    constructor(canvasId: string, config: ShaderConfigWithHooks) {
        this.canvasId = canvasId;
        this.config = config;
        this.webglContext = new WebGLContextManager(canvasId);
        this.canvas = null; // Will be set from webglContext after initialization
        this.gl = null; // Will be set from webglContext after initialization
        this.ext = null;
        this.program = null;
        this.quadBuffer = null;
        this.uniformLocations = {};
        // Initialize parameters from config defaults
        this.parameters = ShaderParameterManager.initializeParameters(config);
        
        this.startTime = performance.now();
        this.isInitialized = false;
        this.lastFrameTime = 0;
        
        // Initialize event listener manager for proper cleanup
        this.eventListenerManager = new EventListenerManager();
        
        // Initialize render loop
        this.renderLoop = new RenderLoop(this);
        
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
        
        // Track if we've rendered with colors yet (for first render callback)
        this._hasRenderedWithColors = false;
        
        // Create shader plugin for shader-specific functionality
        this.plugin = createShaderPlugin(this, config as ShaderConfig);
        
        // Uniform manager will be initialized after WebGL context is available
        this.uniformManager = null;
        this.textureManager = null;
        this.uniformLocationCache = null;
        this._shaderManager = null;
    }
    
    /**
     * Set a uniform value
     * @param name - Uniform name
     * @param value - Uniform value (float, vec2, vec3, etc.)
     */
    setUniform(name: string, value: number | number[]): void {
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
     * @param baseNumBands - Base number of bands from config
     * @returns Adaptive number of bands
     */
    getAdaptiveNumBands(baseNumBands: number): number {
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
     * @throws ShaderError If managers are not initialized
     */
    _validateManagers(): void {
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
     * @throws Error If canvas element is not found
     * @throws Error If shader compilation or linking fails
     * @returns Promise that resolves when initialization is complete
     */
    async init(): Promise<void> {
        if (this.isInitialized) {
            ShaderLogger.warn(`ShaderInstance ${this.config.name} already initialized`);
            return;
            }
            
            // Set up context lost/restored handlers
            this.webglContext.onContextLost = () => {
                this._onContextLost();
            };
            this.webglContext.onContextRestored = () => {
                this._onContextRestored();
            };
            
        const initContext: ShaderInitContext = {
            config: this.config,
            webglContext: this.webglContext,
            canvasId: this.canvasId,
            plugin: this.plugin,
            onInit: this.config.onInit,
            resize: () => this.resize(),
            eventListenerManager: this.eventListenerManager,
            renderLoop: this.renderLoop,
            lastUniformValues: this._lastUniformValues
        };
        
        const result = await ShaderInitializer.init(initContext);
        
        if (!result) {
            this.webglFallbackActive = this.webglContext.webglFallbackActive;
            return;
        }
        
        // Apply initialization results
        this.gl = result.gl;
        this.canvas = result.canvas;
        this.ext = result.ext;
        this.program = result.program;
        this.quadBuffer = result.quadBuffer;
        this.uniformLocationCache = result.uniformLocationCache;
        this.uniformLocations = result.uniformLocations;
        this.uniformManager = result.uniformManager;
        this.textureManager = result.textureManager;
        this.webglFallbackActive = result.webglFallbackActive;
        
        // Call plugin onInit() AFTER all managers are assigned
        // This ensures textureManager and uniformLocations are available
        if (this.plugin) {
            this.plugin.onInit();
        }
            
        // Call custom init hook if provided (after initialization is complete)
        if (this.config.onInit) {
            this.config.onInit(this);
        }
        
        // Ensure canvas is resized with current quality after initialization
        // This ensures quality scaling is applied from the start
        this.resize();
        
        this.isInitialized = true;
    }
    
    /**
     * Handle WebGL context lost event
     */
    _onContextLost(): void {
        ShaderLogger.warn(`ShaderInstance ${this.config.name}: WebGL context lost`);
        this.renderLoop.stop();
        this.webglFallbackActive = true;
    }
    
    /**
     * Handle WebGL context restored event
     */
    async _onContextRestored(): Promise<void> {
        ShaderLogger.info(`ShaderInstance ${this.config.name}: WebGL context restored, reinitializing`);
        await this._reinitializeAfterContextRestore();
    }
    
    /**
     * Reinitialize shader after WebGL context restoration
     */
    async _reinitializeAfterContextRestore(): Promise<boolean> {
        const initContext: ShaderInitContext = {
            config: this.config,
            webglContext: this.webglContext,
            canvasId: this.canvasId,
            plugin: this.plugin,
            onInit: this.config.onInit,
            resize: () => this.resize(),
            eventListenerManager: this.eventListenerManager,
            renderLoop: this.renderLoop,
            lastUniformValues: this._lastUniformValues
        };
        
        const result = await ShaderInitializer.reinitializeAfterContextRestore(
            initContext,
                this.program,
                this.quadBuffer,
                this.textureManager,
            this._lastUniformValues,
            this.renderLoop
            );
            
        if (result) {
            // Update all references from recompilation
            this.gl = result.gl;
            this.canvas = result.canvas;
            this.ext = result.ext;
            this.program = result.program;
            this.quadBuffer = result.quadBuffer;
            this.uniformLocationCache = result.uniformLocationCache;
            this.uniformLocations = result.uniformLocations;
            this.uniformManager = result.uniformManager;
            this.textureManager = result.textureManager;
            this.webglFallbackActive = result.webglFallbackActive;
            return true;
        } else {
            this.webglFallbackActive = true;
            return false;
        }
    }
    
    /**
     * Resize the canvas and update viewport
     * Applies performance-based resolution capping and quality scaling
     */
    resize(): void {
        if (!this.canvas || !this.gl) return;
        
        const resizeConfig = this.performanceMonitor.getResizeConfig();
        
        // Use WebGLContextManager for resize
        this.webglContext.resize(resizeConfig);
        
        // Update canvas references (in case they changed)
        this.canvas = this.webglContext.canvas;
        
        // Update resolution uniform if program is ready
        if (this.program && this.uniformLocations.uResolution) {
            this.gl.useProgram(this.program);
            this.gl.uniform2f(this.uniformLocations.uResolution, this.canvas!.width, this.canvas!.height);
        }
        
        // Call plugin resize hook
        if (this.plugin && typeof this.plugin.onResize === 'function') {
            this.plugin.onResize(this.canvas!.width, this.canvas!.height);
        }
    }
    
    /**
     * Set a shader parameter value
     * @param name - Parameter name
     * @param value - Parameter value
     * @returns True if parameter was set successfully
     * @throws ShaderError If shader is not initialized or parameter is invalid
     */
    setParameter(name: string, value: ParameterValue): boolean {
        const context: ShaderParameterContext = {
            isInitialized: this.isInitialized,
            config: this.config,
            parameters: this.parameters,
            plugin: this.plugin
        };
        return ShaderParameterManager.setParameter(context, name, value);
    }
    
    /**
     * Get a shader parameter value
     * @param name - Parameter name
     * @returns Parameter value, or undefined if not found
     */
    getParameter(name: string): ParameterValue | undefined {
        return ShaderParameterManager.getParameter(this.parameters, name);
    }
    
    /**
     * Get all shader parameters as a copy
     * @returns Copy of all parameter values
     */
    getAllParameters(): Record<string, ParameterValue> {
        return ShaderParameterManager.getAllParameters(this.parameters);
    }
    
    /**
     * Render a single frame
     * Updates uniforms, textures, and draws the shader
     * @param audioData - Audio data from AudioAnalyzer (optional)
     * @param colors - Color values (optional)
     */
    render(audioData: ExtendedAudioData | null = null, colors: Colors | null = null): void {
        if (!this.isInitialized || !this.gl || !this.program) return;
        
        // Validate managers are initialized
        try {
            this._validateManagers();
        } catch (error) {
            const details = hasErrorDetails(error) ? error.details : undefined;
            ShaderLogger.warn('ShaderInstance: Managers not initialized, skipping render', details);
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
        gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
        
        // Update uniforms using UniformManager (managers already checked above)
        const resolution: [number, number] = [this.canvas!.width, this.canvas!.height];
        
        // Update standard uniforms
        this.uniformManager!.updateStandardUniforms(
            this.parameters,
            currentTime,
            this.timeOffsetManager.getSmoothedOffset(),
            this.pixelSizeAnimationManager.getMultiplier(),
            resolution
        );
        
        // Update parameter uniforms
        this.uniformManager!.updateParameterUniforms(this.parameters, this.config as ShaderConfig);
        
        // Update plugin-specific parameter uniforms
        if (this.plugin) {
            this.plugin.onUpdateParameterUniforms(this.parameters, this.config as ShaderConfig, this.uniformManager!);
        }
        
        // Update ripple uniforms
        this.uniformManager!.updateRippleUniforms(
            audioData?.rippleData ?? null,
            this._rippleArrays
        );
        
        // Update color uniforms
        this.uniformManager!.updateColorUniforms(
            colors,
            () => this.colorTransitionManager.getCurrentColors(),
            { isTransitioning: this.colorTransitionManager.isTransitioning }
        );
        
        // Update audio uniforms
        this.uniformManager!.updateAudioUniforms(
            audioData,
            this.config?.uniformMapping ?? {},
            this.parameters
        );
        
        // Call plugin hooks for shader-specific updates
        // Update textures (frequency textures, etc.)
        // Always call onUpdateTextures to ensure textures are initialized, even without audio
        if (this.plugin && typeof this.plugin.onUpdateTextures === 'function') {
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
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer!);
        const positionLocation = this.uniformLocations.a_position;
        if (positionLocation !== null && positionLocation !== undefined && typeof positionLocation === 'number') {
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        }
        
        gl.disable(gl.BLEND);
        
        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Notify on first render with colors
        if (colors && !this._hasRenderedWithColors) {
            this._hasRenderedWithColors = true;
            if (this._shaderManager && (this._shaderManager as { onFirstColorUpdate?: () => void }).onFirstColorUpdate) {
                ShaderLogger.debug('First frame rendered with colors - triggering callback');
                (this._shaderManager as { onFirstColorUpdate: () => void }).onFirstColorUpdate();
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
     * @param audioAnalyzer - Audio analyzer instance
     * @param colors - Initial color values (optional)
     */
    startRenderLoop(audioAnalyzer: AudioAnalyzer, colors: Colors | null): void {
        // Set shader manager reference for color updates
        this.renderLoop.setShaderManager(this._shaderManager as { 
            colorUpdateCallback?: (data: ExtendedAudioData) => void;
            colors?: Colors;
            onFirstColorUpdate?: () => void;
        } | null);
        
        // Ensure canvas is resized with current quality before starting render loop
        // This ensures quality is applied immediately, not just when it changes
        this.resize();
        
        this.renderLoop.start(audioAnalyzer, colors);
    }
    
    /**
     * Update colors in the render loop without restarting
     * Starts a smooth transition from current colors to new colors
     * @param colors - New colors object with color, color2, etc. properties
     */
    updateColors(colors: Colors): void {
        this.renderLoop.updateColors(colors);
    }
    
    /**
     * Stop the render loop
     */
    stopRenderLoop(): void {
        this.renderLoop.stop();
    }
    
    destroy(): void {
        this.stopRenderLoop();
        
        // Clean up all event listeners
        this.eventListenerManager.cleanup();
        
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
        // Use explicit null assignment instead of type assertions
        this._rippleArrays = {
            centerX: new Float32Array(0),
            centerY: new Float32Array(0),
            times: new Float32Array(0),
            intensities: new Float32Array(0),
            widths: new Float32Array(0),
            minRadii: new Float32Array(0),
            maxRadii: new Float32Array(0),
            intensityMultipliers: new Float32Array(0),
            active: new Float32Array(0),
        };
        this._lastUniformValues = {};
        this.uniformLocations = {};
        this.uniformLocationCache = null;
        
        // Clear references
        this.gl = null;
        this.canvas = null;
        this._shaderManager = null;
        
        // Stop render loop
        this.renderLoop.stop();
        this.plugin = null;
        this.uniformManager = null;
        // Managers are already reset above, just clear references
        if (this.timeOffsetManager) {
            this.timeOffsetManager.reset();
        }
        if (this.colorTransitionManager) {
            this.colorTransitionManager.reset();
        }
        if (this.pixelSizeAnimationManager) {
            this.pixelSizeAnimationManager.reset();
        }
        this.performanceMonitor = null;
        this.webglContext = null;
        
        this.isInitialized = false;
    }
}

