// Video Recorder Service
// Handles video recording of WebGL visualization with audio synchronization
// Uses readPixels() + webm-muxer for accurate color reproduction
// Supports both MediaRecorder and WebCodecs API

import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import type { ShaderInstance } from '../../shaders/ShaderInstance.js';
import type { AudioAnalyzer } from '../audio/AudioAnalyzer.js';
import type { ExtendedAudioData, ColorMap } from '../../types/index.js';
import { Buffer } from 'buffer';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';
// Note: ts-ebml imports removed - metadata fixing disabled to prevent browser freezes

// Make Buffer available globally for ts-ebml
if (typeof window !== 'undefined' && !(window as any).Buffer) {
    (window as any).Buffer = Buffer;
}

/**
 * Bezier curve control points (cubic bezier)
 * Maps input (0-1) to output (0-1) through a bezier curve
 */
export interface BezierCurve {
    x1: number; // Control point 1 X (0.0-1.0)
    y1: number; // Control point 1 Y (0.0-1.0)
    x2: number; // Control point 2 X (0.0-1.0)
    y2: number; // Control point 2 Y (0.0-1.0)
}

/**
 * Recording color adjustment configuration
 * Controls tone curve and color adjustments for video recording
 */
export interface RecordingColorAdjustments {
    /** Tone curve (replaces gamma correction) - enabled by default */
    toneCurve: BezierCurve & { enabled: boolean };
    /** Brightness adjustment curve - disabled by default */
    brightness: BezierCurve & { enabled: boolean };
    /** Contrast adjustment curve - disabled by default */
    contrast: BezierCurve & { enabled: boolean };
    /** Saturation adjustment curve - disabled by default */
    saturation: BezierCurve & { enabled: boolean };
    /** OKLCH-based adjustments (perceptually uniform) - disabled by default */
    oklch?: {
        /** Lightness curve - maps input L (0-1) to output L (0-1) */
        lightness: BezierCurve & { enabled: boolean };
        /** Chroma curve - maps input C (0-1 normalized) to output C (0-1 normalized) */
        chroma: BezierCurve & { enabled: boolean };
        /** Hue curve - maps input H (0-1 normalized) to output H (0-1 normalized) */
        hue: BezierCurve & { enabled: boolean };
    };
}

export interface RecordingOptions {
    width: number;
    height: number;
    dpr: number;
    fps: number;
    audioElement: HTMLAudioElement;
    /** Optional color adjustments for recording (uses defaults if not provided) */
    colorAdjustments?: Partial<RecordingColorAdjustments>;
    /** Run color diagnostics after initialization (Phase 0 tests) */
    runDiagnostics?: boolean;
    /** Codec preference: 'vp9' | 'vp8' | 'h264' | 'av1' | 'auto' (default: 'auto') */
    codec?: 'vp9' | 'vp8' | 'h264' | 'av1' | 'auto';
    /** Force specific codec for testing (overrides codec preference) */
    codecOverride?: 'vp9' | 'vp8' | 'h264' | 'av1';
    /** Video bitrate in bits per second (default: 40000000 for 40 Mbps) */
    videoBitrate?: number;
    /** Use direct WebGL capture instead of 2D canvas (bypasses drawImage color conversion) */
    useDirectWebGLCapture?: boolean;
    /** Use WebCodecs API instead of MediaRecorder (provides explicit color space control) */
    useWebCodecs?: boolean;
}

export type RecordingState = 'idle' | 'initializing' | 'ready' | 'recording' | 'encoding' | 'complete' | 'error' | 'cancelled';

export interface RecordingProgress {
    currentFrame: number;
    totalFrames: number;
    percentage: number;
    timeElapsed: number;
    timeRemaining: number;
}

/**
 * VideoRecorder - Records WebGL visualization as video file
 * 
 * Handles:
 * - Creating offscreen recording canvas with WebGL context
 * - Cloning shader program to recording context
 * - Frame-by-frame rendering with audio synchronization
 * - Waveform compositing
 * - MediaRecorder encoding and file download
 */
export class VideoRecorder {
    private recordingCanvas: HTMLCanvasElement | null = null;
    private recordingGL: WebGLRenderingContext | null = null;
    private recordingShader: ShaderInstance | null = null;
    private mainShaderInstance: ShaderInstance | null = null;
    private audioAnalyzer: AudioAnalyzer | null = null;
    private audioElement: HTMLAudioElement | null = null;
    
    private state: RecordingState = 'idle';
    // 2D canvas for frame capture (visible, uses readPixels from WebGL)
    private captureCanvas: HTMLCanvasElement | null = null;
    private captureCtx: CanvasRenderingContext2D | null = null;
    // MediaRecorder setup (using 2D canvas stream instead of WebGL canvas)
    private mediaRecorder: MediaRecorder | null = null;
    private videoStream: MediaStream | null = null;
    private audioStream: MediaStream | null = null;
    private chunks: Blob[] = [];
    
    // WebCodecs setup (alternative to MediaRecorder)
    private videoEncoder: VideoEncoder | null = null;
    private audioEncoder: AudioEncoder | null = null;
    private videoChunks: Array<{chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata}> = [];
    private audioChunks: Array<{chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata}> = [];
    private muxer: Muxer | null = null;
    private muxerTarget: ArrayBufferTarget | null = null;
    private isWebCodecsMode: boolean = false;
    private audioContext: AudioContext | null = null;
    private audioSourceNode: MediaStreamAudioSourceNode | null = null;
    private audioProcessorNode: ScriptProcessorNode | null = null;
    private audioSampleRate: number = 44100;
    private audioChannels: number = 2;
    private videoFrameTimestamp: number = 0;
    private audioFrameTimestamp: number = 0;
    
    // Frame capture tracking
    private lastCapturedFrame: number = -1;
    // Track last render time for proper deltaTime calculation
    private lastRenderTime: number = 0;
    // Track last audio timestamp for audio-time-based deltaTime calculation
    // This is critical for correct smoothing when seeking through audio
    private lastAudioTimestamp: number | null = null;
    
    private options: RecordingOptions | null = null;
    private colorAdjustments: RecordingColorAdjustments;
    private totalFrames: number = 0;
    private currentFrame: number = 0;
    private frameInterval: number = 0;
    
    private onProgressCallback: ((progress: RecordingProgress) => void) | null = null;
    private onStateChangeCallback: ((state: RecordingState) => void) | null = null;
    private onErrorCallback: ((error: Error) => void) | null = null;
    private onCompleteCallback: ((blob: Blob) => void) | null = null;
    
    constructor() {
        // Initialize with default color adjustments
        this.colorAdjustments = VideoRecorder.getDefaultColorAdjustments();
    }
    
    /**
     * Get default color adjustment configuration
     */
    static getDefaultColorAdjustments(): RecordingColorAdjustments {
        return {
            toneCurve: {
                enabled: true,
                x1: 0.25,
                y1: 0.1,
                x2: 0.75,
                y2: 0.9
            },
            brightness: {
                enabled: false,
                x1: 0.0,
                y1: 1.0,
                x2: 1.0,
                y2: 1.0
            },
            contrast: {
                enabled: false,
                x1: 0.0,
                y1: 1.0,
                x2: 1.0,
                y2: 1.0
            },
            saturation: {
                enabled: false,
                x1: 0.0,
                y1: 1.0,
                x2: 1.0,
                y2: 1.0
            },
            oklch: {
                lightness: {
                    enabled: false,
                    x1: 0.0,
                    y1: 0.0,
                    x2: 1.0,
                    y2: 1.0
                },
                chroma: {
                    enabled: false,
                    x1: 0.0,
                    y1: 0.0,
                    x2: 1.0,
                    y2: 1.0
                },
                hue: {
                    enabled: false,
                    x1: 0.0,
                    y1: 0.0,
                    x2: 1.0,
                    y2: 1.0
                }
            }
        };
    }
    
    /**
     * Merge user color adjustments with defaults
     */
    private mergeColorAdjustments(userConfig?: Partial<RecordingColorAdjustments>): RecordingColorAdjustments {
        const defaults = VideoRecorder.getDefaultColorAdjustments();
        
        if (!userConfig) {
            return defaults;
        }
        
        return {
            toneCurve: { ...defaults.toneCurve, ...userConfig.toneCurve },
            brightness: { ...defaults.brightness, ...userConfig.brightness },
            contrast: { ...defaults.contrast, ...userConfig.contrast },
            saturation: { ...defaults.saturation, ...userConfig.saturation },
            oklch: userConfig.oklch && defaults.oklch ? {
                lightness: { ...defaults.oklch.lightness, ...userConfig.oklch.lightness },
                chroma: { ...defaults.oklch.chroma, ...userConfig.oklch.chroma },
                hue: { ...defaults.oklch.hue, ...userConfig.oklch.hue }
            } : defaults.oklch
        };
    }
    
    /**
     * Set callbacks for recording events
     */
    setCallbacks(callbacks: {
        onProgress?: (progress: RecordingProgress) => void;
        onStateChange?: (state: RecordingState) => void;
        onError?: (error: Error) => void;
        onComplete?: (blob: Blob) => void;
    }): void {
        this.onProgressCallback = callbacks.onProgress || null;
        this.onStateChangeCallback = callbacks.onStateChange || null;
        this.onErrorCallback = callbacks.onError || null;
        this.onCompleteCallback = callbacks.onComplete || null;
    }
    
    /**
     * Get current recording state
     */
    getState(): RecordingState {
        return this.state;
    }
    
    /**
     * Start recording
     * @param mainShaderInstance - Main shader instance to clone
     * @param audioAnalyzer - Audio analyzer for audio data
     * @param colors - Current color map
     * @param options - Recording options
     */
    async startRecording(
        mainShaderInstance: ShaderInstance,
        audioAnalyzer: AudioAnalyzer,
        colors: ColorMap | null,
        options: RecordingOptions
    ): Promise<void> {
        if (this.state !== 'idle') {
            throw new Error(`Cannot start recording: current state is ${this.state}`);
        }
        
        try {
            this.setState('initializing');
            this.mainShaderInstance = mainShaderInstance;
            this.audioAnalyzer = audioAnalyzer;
            this.audioElement = options.audioElement;
            this.options = options;
            
            // Merge user color adjustments with defaults
            this.colorAdjustments = this.mergeColorAdjustments(options.colorAdjustments);
            
            // Validate audio element
            if (!this.audioElement || !this.audioElement.duration || !isFinite(this.audioElement.duration)) {
                throw new Error('Audio element is not ready or has invalid duration');
            }
            
            // Calculate frame count
            const audioDuration = this.audioElement.duration; // seconds
            // Limit recording to 10 seconds maximum
            const MAX_RECORDING_DURATION = 10; // seconds
            const duration = Math.min(audioDuration, MAX_RECORDING_DURATION);
            this.frameInterval = 1000 / options.fps; // ms per frame
            // Calculate frame count based on limited duration
            this.totalFrames = Math.ceil(duration * options.fps);
            this.currentFrame = 0;
            
            if (audioDuration > MAX_RECORDING_DURATION) {
                ShaderLogger.info(`Recording limited to ${MAX_RECORDING_DURATION}s (audio: ${audioDuration.toFixed(1)}s)`);
            }
            ShaderLogger.info(`Recording: ${this.totalFrames} frames @ ${options.fps}fps (${duration.toFixed(1)}s)`);
            
            // Create offscreen canvas
            await this.createRecordingCanvas(options);
            
            // Initialize recording shader
            await this.initializeRecordingShader(mainShaderInstance, colors);
            
            // Setup encoder (MediaRecorder or WebCodecs)
            if (options.useWebCodecs) {
                // Check WebCodecs support
                if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
                    ShaderLogger.warn('WebCodecs API not supported, falling back to MediaRecorder');
                    await this.setupMediaRecorder();
                } else {
                    try {
                        await this.setupWebCodecs();
                    } catch (error) {
                        ShaderLogger.warn('WebCodecs setup failed, falling back to MediaRecorder:', error);
                        await this.setupMediaRecorder();
                    }
                }
            } else {
                await this.setupMediaRecorder();
            }
            
            // Run diagnostics if requested (Phase 0: Quick Validation Tests)
            if (options.runDiagnostics) {
                // Run diagnostics in background - don't block recording if they fail
                try {
                    await this.runColorDiagnostics();
                } catch (error) {
                    // Don't fail recording if diagnostics fail
                    ShaderLogger.warn('Color diagnostics failed (continuing with recording):', error);
                }
                
                // Also run drawImage() conversion test (Phase 5)
                // This tests if drawImage() is applying color conversion
                try {
                    // Render a test frame first so we have something to test
                    if (this.recordingShader && this.recordingGL) {
                        // Render test pattern for testing
                        await this.renderTestPattern();
                        await new Promise(resolve => requestAnimationFrame(resolve));
                        
                        // Test drawImage() conversion
                        await this.testDrawImageConversion();
                    }
                } catch (error) {
                    // Don't fail recording if diagnostics fail
                    ShaderLogger.warn('drawImage() conversion test failed:', error);
                }
            }
            
            this.setState('ready');
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            ShaderLogger.error('Failed to start recording:', err);
            this.setState('error');
            this.handleError(err);
            throw err;
        }
    }
    
    /**
     * Create offscreen recording canvas with WebGL context
     * Also creates a visible 2D canvas for frame capture (to avoid hidden canvas color issues)
     */
    private async createRecordingCanvas(options: RecordingOptions): Promise<void> {
        // Create WebGL canvas for rendering (can be hidden)
        this.recordingCanvas = document.createElement('canvas');
        this.recordingCanvas.width = options.width;
        this.recordingCanvas.height = options.height;
        
        // Set color space to sRGB
        if ('colorSpace' in this.recordingCanvas) {
            (this.recordingCanvas as any).colorSpace = 'srgb';
        }
        
        // Add WebGL canvas to DOM (hidden)
        this.recordingCanvas.style.position = 'fixed';
        this.recordingCanvas.style.top = '-9999px';
        this.recordingCanvas.style.left = '-9999px';
        this.recordingCanvas.style.width = `${options.width}px`;
        this.recordingCanvas.style.height = `${options.height}px`;
        this.recordingCanvas.style.zIndex = '-1';
        this.recordingCanvas.style.opacity = '0';
        this.recordingCanvas.style.visibility = 'hidden';
        this.recordingCanvas.style.pointerEvents = 'none';
        document.body.appendChild(this.recordingCanvas);
        
        // Only create 2D capture canvas if NOT using direct WebGL capture
        if (!options.useDirectWebGLCapture) {
            // Create visible 2D canvas for capture (uses readPixels from WebGL)
            // This avoids hidden canvas color space issues
            this.captureCanvas = document.createElement('canvas');
            this.captureCanvas.width = options.width;
            this.captureCanvas.height = options.height;
            
            // Set color space to sRGB
            if ('colorSpace' in this.captureCanvas) {
                (this.captureCanvas as any).colorSpace = 'srgb';
            }
            
            // Make capture canvas visible but off-screen (for captureStream compatibility)
            this.captureCanvas.style.position = 'fixed';
            this.captureCanvas.style.top = '-9999px';
            this.captureCanvas.style.left = '-9999px';
            this.captureCanvas.style.width = `${options.width}px`;
            this.captureCanvas.style.height = `${options.height}px`;
            this.captureCanvas.style.zIndex = '-1';
            // Keep visible (opacity 0.01) to avoid hidden canvas issues
            this.captureCanvas.style.opacity = '0.01';
            this.captureCanvas.style.pointerEvents = 'none';
            document.body.appendChild(this.captureCanvas);
            
            // Get 2D context with sRGB color space
            this.captureCtx = this.captureCanvas.getContext('2d', { 
                colorSpace: 'srgb',
                willReadFrequently: false
            });
            
            if (!this.captureCtx) {
                throw new Error('Failed to create 2D context for capture canvas');
            }
            
            // Verify canvas color space is set correctly (only log if mismatch detected)
            const captureContextAttrs = this.captureCtx.getContextAttributes?.();
            const canvasColorSpace = (this.captureCanvas as any).colorSpace || 'default';
            const contextColorSpace = captureContextAttrs?.colorSpace || 'default';
            
            // Only warn if the context colorSpace is wrong (that's what matters for rendering)
            // Canvas element colorSpace may be 'default' if browser doesn't support it, which is fine
            if (contextColorSpace !== 'srgb') {
                ShaderLogger.warn(`Capture canvas context color space is not sRGB: ${contextColorSpace} (canvas=${canvasColorSpace})`);
            } else if (canvasColorSpace !== 'srgb' && canvasColorSpace !== 'default') {
                // Only warn about canvas colorSpace if it's explicitly set to something other than srgb or default
                ShaderLogger.warn(`Capture canvas color space may be incorrect: canvas=${canvasColorSpace}, context=${contextColorSpace}`);
            }
        } else {
            ShaderLogger.info('Using direct WebGL capture - skipping 2D canvas creation');
        }
        
        ShaderLogger.info(`Recording canvas: ${this.recordingCanvas.width}x${this.recordingCanvas.height}`);
        
        // Get WebGL context with preserveDrawingBuffer
        const contextAttributes: WebGLContextAttributes = {
            alpha: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true, // CRITICAL for frame capture
            antialias: false, // Match main canvas setting for consistency
            depth: false,
            stencil: false,
            failIfMajorPerformanceCaveat: false
        };
        
        this.recordingGL = this.recordingCanvas.getContext('webgl2', contextAttributes) as WebGLRenderingContext | null ||
                          this.recordingCanvas.getContext('webgl', contextAttributes) as WebGLRenderingContext | null ||
                          this.recordingCanvas.getContext('experimental-webgl', contextAttributes) as WebGLRenderingContext | null;
        
        if (!this.recordingGL) {
            throw new Error('Failed to create WebGL context for recording');
        }
        
        // Set WebGL color space and compare with main canvas
        const isWebGL2 = this.recordingGL instanceof WebGL2RenderingContext;
        if (isWebGL2 && 'drawingBufferColorSpace' in this.recordingGL) {
            (this.recordingGL as any).drawingBufferColorSpace = 'srgb';
        }
        
        // Compare with main canvas WebGL version and color space
        if (this.mainShaderInstance?.gl) {
            const mainGL = this.mainShaderInstance.gl;
            const mainIsWebGL2 = mainGL instanceof WebGL2RenderingContext;
            
            // CRITICAL: Warn if versions don't match - this causes color space differences
            if (isWebGL2 !== mainIsWebGL2) {
                ShaderLogger.error(`WebGL version mismatch: Recording=${isWebGL2 ? 'WebGL2' : 'WebGL1'}, Main=${mainIsWebGL2 ? 'WebGL2' : 'WebGL1'} - will cause color differences`);
            } else if (isWebGL2 && mainIsWebGL2) {
                const recordingColorSpace = (this.recordingGL as any).drawingBufferColorSpace || 'default';
                const mainColorSpace = (mainGL as any).drawingBufferColorSpace || 'default';
                if (recordingColorSpace !== mainColorSpace) {
                    ShaderLogger.warn(`Color space mismatch: Recording=${recordingColorSpace}, Main=${mainColorSpace}`);
                }
            }
        }
        
        // Set viewport
        this.recordingGL.viewport(0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
    }
    
    /**
     * Initialize recording shader by cloning main shader
     */
    private async initializeRecordingShader(mainShaderInstance: ShaderInstance, colors: ColorMap | null): Promise<void> {
        if (!this.recordingGL || !this.recordingCanvas) {
            throw new Error('Recording canvas/context not initialized');
        }
        
        // For recording, we'll create a new ShaderInstance with the same config
        // but pointing to the recording canvas
        const config = mainShaderInstance.config;
        const parameters = mainShaderInstance.getAllParameters();
        const plugin = mainShaderInstance.plugin;
        
        // Create a new ShaderInstance for recording
        // Import ShaderInstance dynamically to avoid circular dependencies
        const { ShaderInstance } = await import('../../shaders/ShaderInstance.js');
        const { ShaderCompiler } = await import('../../shaders/utils/ShaderCompiler.js');
        
        // Create recording shader instance
        this.recordingShader = new ShaderInstance('recording-canvas', config);
        
        // Manually set up the recording context (bypass DOM lookup)
        this.recordingShader.webglContext.canvas = this.recordingCanvas;
        this.recordingShader.webglContext.gl = this.recordingGL;
        this.recordingShader.webglContext.ext = this.recordingGL.getExtension('OES_standard_derivatives');
        this.recordingShader.canvas = this.recordingCanvas;
        this.recordingShader.gl = this.recordingGL;
        this.recordingShader.ext = this.recordingGL.getExtension('OES_standard_derivatives');
        
        // Copy parameters directly to the parameters object (before initialization)
        if (this.recordingShader) {
            Object.keys(parameters).forEach(key => {
                if (key in this.recordingShader!.parameters) {
                    this.recordingShader!.parameters[key] = parameters[key];
                }
            });
        }
        
        // Compile shader directly (bypass ShaderInitializer which expects DOM canvas)
        const hasDerivatives = !!this.recordingShader.ext;
        const compiled = await ShaderCompiler.compile(
            this.recordingGL,
            config,
            hasDerivatives,
            parameters as Record<string, number | number[] | [number, number, number] | [number, number, number, number] | undefined>
        );
        
        // Assign compiled resources to shader instance
        this.recordingShader.program = compiled.program;
        this.recordingShader.quadBuffer = compiled.quadBuffer;
        this.recordingShader.uniformLocations = compiled.uniformLocations;
        this.recordingShader.uniformManager = compiled.uniformManager;
        this.recordingShader.textureManager = compiled.textureManager;
        this.recordingShader.uniformLocationCache = compiled.uniformLocationCache;
        this.recordingShader.isInitialized = true;
        
        // CRITICAL: Disable quality scaling for recording - always render at full quality
        // Main shader may use quality scaling based on performance, but recording should always be full quality
        this.recordingShader.performanceMonitor.qualityLevel = 1.0;
        
        // CRITICAL: Create a NEW plugin instance for recording (don't share state with main shader)
        // This ensures separate smoothing arrays, textures, and other plugin state
        if (plugin) {
            const { createShaderPlugin } = await import('../../shaders/plugins/pluginFactory.js');
            const recordingPlugin = createShaderPlugin(this.recordingShader, config);
            if (recordingPlugin) {
                this.recordingShader.plugin = recordingPlugin;
                // Initialize plugin with recording shader context
                recordingPlugin.onInit();
                
                // CRITICAL: Copy smoothing state from main plugin to recording plugin
                // This ensures attack/release values are consistent from the start
                if (typeof plugin.getSmoothingState === 'function' && 
                    typeof recordingPlugin.getSmoothingState === 'function') {
                    const mainSmoothingState = plugin.getSmoothingState();
                    const recordingSmoothingState = recordingPlugin.getSmoothingState();
                    if (mainSmoothingState && recordingSmoothingState) {
                        // Copy all smoothing values from main to recording
                        Object.keys(mainSmoothingState).forEach(key => {
                            if (key in recordingSmoothingState) {
                                const mainValue = (mainSmoothingState as any)[key];
                                // Handle Float32Array separately (need to copy, not reference)
                                if (mainValue instanceof Float32Array) {
                                    (recordingSmoothingState as any)[key] = new Float32Array(mainValue);
                                } else {
                                    (recordingSmoothingState as any)[key] = mainValue;
                                }
                            }
                        });
                    }
                }
                
                // Initialize plugin textures with current audio data to ensure textures are ready
                // This ensures frequency textures and other plugin-specific resources are initialized
                if (typeof recordingPlugin.onUpdateTextures === 'function' && this.audioAnalyzer) {
                    const initialAudioData = this.audioAnalyzer.getData();
                    if (initialAudioData) {
                        recordingPlugin.onUpdateTextures(initialAudioData, 0);
                    }
                }
            }
        }
        
        // Set canvas size and viewport
        this.recordingGL.viewport(0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
        
        // Call custom init hook if provided
        if (config.onInit) {
            config.onInit(this.recordingShader);
        }
    }
    
    /**
     * Setup MediaRecorder with 2D capture canvas and audio streams
     * Uses readPixels() approach: WebGL renders to hidden canvas, we copy to visible 2D canvas
     */
    private async setupMediaRecorder(): Promise<void> {
        if (!this.audioElement) {
            throw new Error('Audio element not available');
        }
        
        // Get supported MIME type (will be called again in setupMediaRecorder with codec preference)
        // This is just for the comment - actual call happens in setupMediaRecorder
        
        // Create video stream from appropriate canvas
        if (this.options?.useDirectWebGLCapture) {
            // Direct WebGL capture - bypass 2D canvas
            if (!this.recordingCanvas) {
                throw new Error('Recording canvas not available for direct capture');
            }
            
            ShaderLogger.info('Using direct WebGL capture stream');
            
            // Render a test frame to ensure stream is active
            if (this.recordingShader && this.recordingGL) {
                // Render a test frame with dummy data
                this.lastRenderTime = 0; // Reset render time tracking
                this.recordingShader.lastFrameTime = 0;
                const dummyAudioData: ExtendedAudioData = {
                    volume: 0.5,
                    frequencyData: new Uint8Array(256).fill(128), // Use Uint8Array to match type definition (0-255 range, 128 = 0.5 normalized)
                    rippleData: null,
                    // Required ExtendedAudioData fields
                    bass: 0.5,
                    mid: 0.5,
                    treble: 0.5,
                    freq1: 0.5,
                    freq2: 0.5,
                    freq3: 0.5,
                    freq4: 0.5,
                    freq5: 0.5,
                    freq6: 0.5,
                    freq7: 0.5,
                    freq8: 0.5,
                    freq9: 0.5,
                    freq10: 0.5,
                    bassStereo: 0.0,
                    midStereo: 0.0,
                    trebleStereo: 0.0,
                    beatStereoBass: 0.0,
                    beatStereoMid: 0.0,
                    beatStereoTreble: 0.0,
                    beatTime: 0.0,
                    beatIntensity: 0.0,
                    beatTimeBass: 0.0,
                    beatTimeMid: 0.0,
                    beatTimeTreble: 0.0,
                    beatIntensityBass: 0.0,
                    beatIntensityMid: 0.0,
                    beatIntensityTreble: 0.0,
                    estimatedBPM: 0.0,
                    peakVolume: 0.5,
                    smoothedFreq1: 0.5,
                    smoothedFreq2: 0.5,
                    smoothedFreq3: 0.5,
                    smoothedFreq4: 0.5,
                    smoothedFreq5: 0.5,
                    smoothedFreq6: 0.5,
                    smoothedFreq7: 0.5,
                    smoothedFreq8: 0.5,
                    smoothedFreq9: 0.5,
                    smoothedFreq10: 0.5,
                    smoothedBass: 0.5,
                    smoothedMid: 0.5,
                    smoothedTreble: 0.5,
                    peakBass: 0.5,
                    peakMid: 0.5,
                    peakTreble: 0.5,
                    playbackProgress: 0.0,
                    timeData: null,
                    leftFrequencyData: null,
                    rightFrequencyData: null,
                    audioContext: null,
                    frequencyBands: [],
                    stereoBalance: 0.0
                };
                const testColors = this.mainShaderInstance ? 
                    (this.mainShaderInstance as any).colorTransitionManager?.getCurrentColors() || null : null;
                this.recordingShader.render(dummyAudioData, testColors);
                this.recordingGL.finish();
                
                // Wait a frame to ensure rendering is complete
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
            
            // Create stream directly from WebGL canvas
            try {
                this.videoStream = this.recordingCanvas.captureStream(this.options!.fps);
            } catch (error) {
                ShaderLogger.warn('Direct WebGL capture failed, falling back to 2D canvas:', error);
                // Fallback to 2D canvas method
                this.options!.useDirectWebGLCapture = false;
                // Create capture canvas if it doesn't exist (reuse existing creation logic)
                if (!this.captureCanvas) {
                    this.captureCanvas = document.createElement('canvas');
                    this.captureCanvas.width = this.options!.width;
                    this.captureCanvas.height = this.options!.height;
                    
                    if ('colorSpace' in this.captureCanvas) {
                        (this.captureCanvas as any).colorSpace = 'srgb';
                    }
                    
                    this.captureCanvas.style.position = 'fixed';
                    this.captureCanvas.style.top = '-9999px';
                    this.captureCanvas.style.left = '-9999px';
                    this.captureCanvas.style.width = `${this.options!.width}px`;
                    this.captureCanvas.style.height = `${this.options!.height}px`;
                    this.captureCanvas.style.zIndex = '-1';
                    this.captureCanvas.style.opacity = '0.01';
                    this.captureCanvas.style.pointerEvents = 'none';
                    document.body.appendChild(this.captureCanvas);
                    
                    this.captureCtx = this.captureCanvas.getContext('2d', { 
                        colorSpace: 'srgb',
                        willReadFrequently: false
                    });
                    
                    if (!this.captureCtx) {
                        throw new Error('Failed to create 2D context for capture canvas fallback');
                    }
                }
                this.videoStream = this.captureCanvas.captureStream(this.options!.fps);
            }
        } else {
            // Traditional 2D canvas capture (existing code)
            if (!this.captureCanvas) {
                throw new Error('Capture canvas not available');
            }
            
            ShaderLogger.info('Using 2D canvas capture stream');
            
            // Render a test frame to initialize the capture canvas
            if (this.recordingShader && this.recordingGL && this.captureCtx) {
                // Render a test frame with dummy data
                this.lastRenderTime = 0; // Reset render time tracking
                this.recordingShader.lastFrameTime = 0;
                const dummyAudioData: ExtendedAudioData = {
                    volume: 0.5,
                    frequencyData: new Uint8Array(256).fill(128), // Use Uint8Array to match type definition (0-255 range, 128 = 0.5 normalized)
                    rippleData: null,
                    // Required ExtendedAudioData fields
                    bass: 0.5,
                    mid: 0.5,
                    treble: 0.5,
                    freq1: 0.5,
                    freq2: 0.5,
                    freq3: 0.5,
                    freq4: 0.5,
                    freq5: 0.5,
                    freq6: 0.5,
                    freq7: 0.5,
                    freq8: 0.5,
                    freq9: 0.5,
                    freq10: 0.5,
                    bassStereo: 0.0,
                    midStereo: 0.0,
                    trebleStereo: 0.0,
                    beatStereoBass: 0.0,
                    beatStereoMid: 0.0,
                    beatStereoTreble: 0.0,
                    beatTime: 0.0,
                    beatIntensity: 0.0,
                    beatTimeBass: 0.0,
                    beatTimeMid: 0.0,
                    beatTimeTreble: 0.0,
                    beatIntensityBass: 0.0,
                    beatIntensityMid: 0.0,
                    beatIntensityTreble: 0.0,
                    estimatedBPM: 0.0,
                    peakVolume: 0.5,
                    smoothedFreq1: 0.5,
                    smoothedFreq2: 0.5,
                    smoothedFreq3: 0.5,
                    smoothedFreq4: 0.5,
                    smoothedFreq5: 0.5,
                    smoothedFreq6: 0.5,
                    smoothedFreq7: 0.5,
                    smoothedFreq8: 0.5,
                    smoothedFreq9: 0.5,
                    smoothedFreq10: 0.5,
                    smoothedBass: 0.5,
                    smoothedMid: 0.5,
                    smoothedTreble: 0.5,
                    peakBass: 0.5,
                    peakMid: 0.5,
                    peakTreble: 0.5,
                    playbackProgress: 0.0,
                    timeData: null,
                    leftFrequencyData: null,
                    rightFrequencyData: null,
                    audioContext: null,
                    frequencyBands: [],
                    stereoBalance: 0.0
                };
                const testColors = this.mainShaderInstance ? 
                    (this.mainShaderInstance as any).colorTransitionManager?.getCurrentColors() || null : null;
                this.recordingShader.render(dummyAudioData, testColors);
                this.recordingGL.finish();
                
                // Copy to capture canvas
                this.captureFrame();
                
                // Wait a frame to ensure rendering is complete
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
            
            // Create video stream from 2D capture canvas (visible, better color handling)
            // Use captureStream(fps) for automatic frame sampling
            this.videoStream = this.captureCanvas.captureStream(this.options!.fps);
        }
        
        // Verify video track is available
        const videoTracks = this.videoStream.getVideoTracks();
        if (videoTracks.length === 0) {
            throw new Error('Failed to create video track from capture canvas');
        }
        
        const videoTrack = videoTracks[0];
        const videoSettings = videoTrack.getSettings();
        
        // Log video track settings for debugging
        ShaderLogger.info('Video track settings:', {
            width: videoSettings.width,
            height: videoSettings.height,
            frameRate: videoSettings.frameRate,
            colorSpace: ('colorSpace' in videoSettings ? videoSettings.colorSpace : 'unknown'),
            aspectRatio: videoSettings.aspectRatio,
        });
        
        // Check color space (only log if mismatch)
        if ('colorSpace' in videoSettings && videoSettings.colorSpace !== 'srgb') {
            ShaderLogger.warn(`Video track colorSpace: ${videoSettings.colorSpace} (expected sRGB)`);
        }
        
        // Monitor track state (only log errors)
        videoTrack.onended = () => {
            ShaderLogger.warn('Video track ended unexpectedly');
        };
        
        videoTrack.onmute = () => {
            ShaderLogger.warn('Video track muted - may prevent frame capture');
        };
        
        // Create audio stream from audio element
        // @ts-ignore - captureStream exists on HTMLAudioElement but TypeScript types may not include it
        this.audioStream = this.audioElement.captureStream();
        
        // Verify audio track is available
        const audioTracks = this.audioStream?.getAudioTracks() || [];
        if (audioTracks.length === 0) {
            ShaderLogger.warn('No audio tracks available from audio element');
        }
        
        // Combine streams
        const combinedStream = new MediaStream();
        this.videoStream?.getVideoTracks().forEach(track => combinedStream.addTrack(track));
        this.audioStream?.getAudioTracks().forEach(track => combinedStream.addTrack(track));
        
        // Get supported MIME type with codec preference and override
        const codecPreference = this.options?.codec || 'auto';
        const mimeType = this.getSupportedMimeType(codecPreference, this.options?.codecOverride);
        
        // Create MediaRecorder with enhanced options
        const videoBitrate = this.options?.videoBitrate || 40000000; // 40 Mbps default
        const mediaRecorderOptions: MediaRecorderOptions = {
            mimeType,
            videoBitsPerSecond: videoBitrate
        };
        
        // Try to set audio bitrate
        try {
            (mediaRecorderOptions as any).audioBitsPerSecond = 384000; // 384kbps stereo
        } catch (e) {
            // Silent fail - audio bitrate is optional
        }
        
        // Log MediaRecorder configuration
        ShaderLogger.info('MediaRecorder configuration:', {
            codec: mimeType,
            videoBitrate: `${(videoBitrate / 1000000).toFixed(1)} Mbps`,
            audioBitrate: '384 kbps',
        });
        
        this.mediaRecorder = new MediaRecorder(combinedStream, mediaRecorderOptions);
        
        // Setup event handlers
        this.chunks = [];
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.chunks.push(event.data);
            }
        };
        
        this.mediaRecorder.onerror = (event) => {
            const error = (event as any).error || new Error('MediaRecorder error');
            ShaderLogger.error('MediaRecorder error:', error);
            this.handleError(error);
        };
        
        this.mediaRecorder.onstop = () => {
            if (this.chunks.length === 0) {
                ShaderLogger.warn('MediaRecorder stopped with no chunks - no frames captured');
            }
            
            // Wait a bit to ensure all data chunks have been received
            setTimeout(() => {
                if (this.state === 'recording' || this.state === 'encoding') {
                    this.finalizeRecording().catch(error => {
                        ShaderLogger.error('Error in finalizeRecording:', error);
                        this.handleError(error instanceof Error ? error : new Error(String(error)));
                    });
                }
            }, 500);
        };
    }
    
    /**
     * Setup WebCodecs API for video recording with explicit color space control
     * This provides better color accuracy than MediaRecorder
     */
    private async setupWebCodecs(): Promise<void> {
        if (!this.audioElement || !this.recordingCanvas || !this.options) {
            throw new Error('Required components not available for WebCodecs setup');
        }
        
        // Check WebCodecs support
        if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
            throw new Error('WebCodecs API not supported in this browser. Use MediaRecorder instead.');
        }
        
        this.isWebCodecsMode = true;
        ShaderLogger.info('Setting up WebCodecs API for recording');
        
        // Ensure muxer is null initially
        this.muxer = null;
        
        const width = this.recordingCanvas.width;
        const height = this.recordingCanvas.height;
        const fps = this.options.fps;
        const bitrate = this.options.videoBitrate || 40000000;
        
        // Determine video codec based on preference
        const codecPreference = this.options.codec || 'auto';
        const codecOverride = this.options.codecOverride;
        
        // Map codec preference to WebCodecs codec string
        let videoCodec = 'vp09.00.10.08'; // VP9 default
        let webmCodec = 'V_VP9';
        
        if (codecOverride === 'vp8') {
            videoCodec = 'vp08.00.41.08';
            webmCodec = 'V_VP8';
        } else if (codecOverride === 'h264') {
            videoCodec = 'avc1.42E01E'; // H.264 Baseline
            // Note: H.264 in WebM is not standard, would need MP4 muxer
            ShaderLogger.warn('H.264 codec selected but WebM muxer only supports VP8/VP9. Using VP9 instead.');
            videoCodec = 'vp09.00.10.08';
            webmCodec = 'V_VP9';
        } else if (codecPreference === 'vp8') {
            videoCodec = 'vp08.00.41.08';
            webmCodec = 'V_VP8';
        }
        
        // Setup VideoEncoder with explicit color space
        this.videoEncoder = new VideoEncoder({
            output: (chunk, metadata) => {
                try {
                    // Log first 10 and last chunk timestamps for debugging
                    const chunkIndex = this.videoChunks.length;
                    if (chunkIndex < 10 || chunkIndex === 599) {
                        ShaderLogger.info(`[Timestamp Debug] Video chunk ${chunkIndex}: timestamp=${chunk.timestamp}µs, duration=${chunk.duration}µs, type=${chunk.type}`);
                    }
                    
                    // Clone chunk data using copyTo() method
                    // EncodedVideoChunk doesn't expose .data directly, use copyTo()
                    const buffer = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(buffer);
                    
                    // Clone chunk (chunks are consumed when added to muxer)
                    const clonedChunk = new EncodedVideoChunk({
                        type: chunk.type,
                        timestamp: chunk.timestamp,
                        duration: chunk.duration,
                        data: buffer.buffer // Use ArrayBuffer
                    });
                    
                    // Store chunk with metadata for proper muxing
                    // Note: metadata is often undefined for VP9 - this is normal and expected
                    // webm-muxer will handle undefined metadata correctly
                    this.videoChunks.push({ chunk: clonedChunk, metadata });
                } catch (error) {
                    ShaderLogger.error('Error cloning video chunk:', error);
                    // Don't throw - just log and continue
                }
            },
            error: (error) => {
                ShaderLogger.error('VideoEncoder error:', error);
                this.handleError(error instanceof Error ? error : new Error(String(error)));
            }
        });
        
        // Configure VideoEncoder with explicit color space (sRGB/BT.709)
        // Note: colorSpace may not be in TypeScript definitions but is supported at runtime
        this.videoEncoder.configure({
            codec: videoCodec,
            width: width,
            height: height,
            bitrate: bitrate,
            framerate: fps,
            latencyMode: 'realtime', // Use realtime mode to reduce encoding artifacts
            // KEY: Explicit color space control for accurate color reproduction
            colorSpace: {
                primaries: 'bt709',      // sRGB uses BT.709 primaries
                transfer: 'bt709',        // sRGB uses BT.709 transfer
                matrix: 'bt709',          // sRGB uses BT.709 matrix
                fullRange: false          // Limited range (16-235) - WebGL typically outputs limited range for video
            }
        } as VideoEncoderConfig);
        
        ShaderLogger.info(`VideoEncoder configured: ${videoCodec}, ${width}x${height}@${fps}fps, ${bitrate/1000000}Mbps`);
        ShaderLogger.info('Color space: BT.709 (sRGB compatible)');
        
        // Setup AudioEncoder
        this.audioEncoder = new AudioEncoder({
            output: (chunk, metadata) => {
                try {
                    // Log first 10 and last chunk timestamps for debugging
                    const chunkIndex = this.audioChunks.length;
                    if (chunkIndex < 10 || chunkIndex === 1156) {
                        ShaderLogger.info(`[Timestamp Debug] Audio chunk ${chunkIndex}: timestamp=${chunk.timestamp}µs, duration=${chunk.duration}µs`);
                    }
                    
                    // Clone chunk data using copyTo() method
                    // EncodedAudioChunk doesn't expose .data directly, use copyTo()
                    const buffer = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(buffer);
                    
                    // Clone chunk (chunks are consumed when added to muxer)
                    const clonedChunk = new EncodedAudioChunk({
                        type: chunk.type,
                        timestamp: chunk.timestamp,
                        duration: chunk.duration,
                        data: buffer.buffer // Use ArrayBuffer
                    });
                    // Store chunk with metadata for proper muxing
                    this.audioChunks.push({ chunk: clonedChunk, metadata });
                } catch (error) {
                    ShaderLogger.error('Error cloning audio chunk:', error);
                    // Don't throw - just log and continue
                }
            },
            error: (error) => {
                ShaderLogger.error('AudioEncoder error:', error);
                this.handleError(error instanceof Error ? error : new Error(String(error)));
            }
        });
        
        // Get audio context from audio element
        // We'll capture audio from the audio element's MediaStream
        // @ts-ignore - captureStream exists on HTMLAudioElement
        const audioStream = this.audioElement.captureStream();
        const audioTracks = audioStream.getAudioTracks();
        
        if (audioTracks.length === 0) {
            throw new Error('No audio tracks available from audio element');
        }
        
        // Create AudioContext to process audio
        // Note: Opus always encodes at 48kHz internally, so we use 48kHz for AudioContext
        this.audioContext = new AudioContext({ sampleRate: 48000 });
        this.audioSourceNode = this.audioContext.createMediaStreamSource(audioStream);
        
        // Get audio properties from track
        const audioSettings = audioTracks[0].getSettings();
        this.audioSampleRate = audioSettings.sampleRate || 48000;
        this.audioChannels = audioSettings.channelCount || 2;
        
        // Configure AudioEncoder
        // Opus always encodes at 48kHz internally, so we must use 48000 here
        this.audioEncoder.configure({
            codec: 'opus', // Opus codec for WebM
            sampleRate: 48000, // Opus always uses 48kHz regardless of input sample rate
            numberOfChannels: this.audioChannels,
            bitrate: 384000 // 384 kbps
        });
        
        ShaderLogger.info(`AudioEncoder configured: opus, 48000Hz, ${this.audioChannels}ch, 384kbps`);
        
        // Setup WebM muxer (must be done before starting audio processing)
        // Create ArrayBufferTarget to collect muxed data
        this.muxerTarget = new ArrayBufferTarget();
        
        try {
            // Note: webm-muxer may not directly support Color track entry configuration
            // Color space information (BT.709) should be provided via EncodedVideoChunkMetadata
            // The muxer will extract this from metadata to build the Color element in TrackEntry
            this.muxer = new Muxer({
                video: {
                    codec: webmCodec,
                    width: width,
                    height: height,
                    frameRate: fps
                    // Color track entry (BT.709) should be set via metadata, not here
                },
                audio: {
                    codec: 'A_OPUS',
                    sampleRate: 48000, // Opus in WebM always uses 48kHz, regardless of AudioEncoder input sample rate
                    numberOfChannels: this.audioChannels
                },
                streaming: false, // We'll finalize at the end
                type: 'webm', // Output as WebM
                target: this.muxerTarget,
                firstTimestampBehavior: 'offset' // Explicitly handle timestamp offset
            });
            
            ShaderLogger.info('WebM muxer initialized successfully');
            ShaderLogger.info(`Muxer instance: ${this.muxer ? 'created' : 'FAILED - still null'}`);
        } catch (error) {
            ShaderLogger.error('Failed to initialize WebM muxer:', error);
            ShaderLogger.error('Muxer error details:', {
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined
            });
            this.muxer = null; // Ensure it's null on error
            throw new Error(`WebM muxer initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Verify muxer is set
        if (!this.muxer) {
            throw new Error('Muxer was not initialized - this should not happen');
        }
        
        // Initialize timestamps
        this.videoFrameTimestamp = 0;
        this.audioFrameTimestamp = 0;
        
        // Start audio processing
        ShaderLogger.info('Starting audio processing...');
        await this.startAudioProcessing();
        ShaderLogger.info('WebCodecs setup completed successfully');
    }
    
    /**
     * Start processing audio for WebCodecs encoding
     */
    private async startAudioProcessing(): Promise<void> {
        if (!this.audioContext || !this.audioSourceNode || !this.audioEncoder) {
            ShaderLogger.warn('Audio processing not started - missing components:', {
                audioContext: !!this.audioContext,
                audioSourceNode: !!this.audioSourceNode,
                audioEncoder: !!this.audioEncoder
            });
            // Don't return - we can still record video without audio
            // But log a warning
            ShaderLogger.warn('Continuing with video-only recording (no audio)');
            return;
        }
        
        ShaderLogger.info('Audio processing components available, setting up...');
        ShaderLogger.info(`AudioContext state: ${this.audioContext.state}, sampleRate: ${this.audioContext.sampleRate}`);
        
        // Ensure AudioContext is running
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Create ScriptProcessorNode to capture audio data
        // Note: ScriptProcessorNode is deprecated but still works
        // Alternative would be AudioWorklet but that's more complex
        const bufferSize = 4096;
        this.audioProcessorNode = this.audioContext.createScriptProcessor(bufferSize, this.audioChannels, this.audioChannels);
        
        this.audioProcessorNode.onaudioprocess = (event) => {
            if (!this.audioEncoder || this.audioEncoder.state !== 'configured') {
                return;
            }
            
            // Get audio data from input
            const inputBuffer = event.inputBuffer;
            const numberOfChannels = inputBuffer.numberOfChannels;
            const numberOfFrames = inputBuffer.length;
            
            // Convert to planar format (required by AudioEncoder)
            // Planar format: [channel0_frame0, channel0_frame1, ..., channel1_frame0, channel1_frame1, ...]
            const planarData = new Float32Array(numberOfFrames * numberOfChannels);
            
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const channelData = inputBuffer.getChannelData(channel);
                for (let frame = 0; frame < numberOfFrames; frame++) {
                    planarData[frame * numberOfChannels + channel] = channelData[frame];
                }
            }
            
            // Create AudioData
            // Note: Opus always encodes at 48kHz, so we use 48000 for timestamps
            const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate: 48000, // Opus always uses 48kHz internally
                numberOfFrames: numberOfFrames,
                numberOfChannels: numberOfChannels,
                timestamp: this.audioFrameTimestamp,
                data: planarData
            });
            
            // Encode audio
            this.audioEncoder.encode(audioData);
            audioData.close();
            
            // Update timestamp (in microseconds)
            // Use 48000 to match Opus encoding rate and muxer expectations
            this.audioFrameTimestamp += (numberOfFrames / 48000) * 1000000;
        };
        
        // Connect audio processing chain
        this.audioSourceNode.connect(this.audioProcessorNode);
        this.audioProcessorNode.connect(this.audioContext.destination);
        
        ShaderLogger.info('Audio processing started');
    }
    
    /**
     * Get supported MIME type for MediaRecorder
     * Supports codec preference selection and override for testing
     */
    private getSupportedMimeType(codecPreference?: 'vp9' | 'vp8' | 'h264' | 'av1' | 'auto', codecOverride?: 'vp9' | 'vp8' | 'h264' | 'av1'): string {
        // If override is specified, use it directly (for testing)
        if (codecOverride) {
            const overrideOptions: Record<string, string[]> = {
                vp9: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
                vp8: ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'],
                h264: [
                    'video/mp4;codecs=avc1.42E01E', // Baseline
                    'video/mp4;codecs=avc1.4D001E', // Main
                    'video/mp4;codecs=avc1.64001E', // High
                    'video/webm;codecs=vp9', // Fallback
                    'video/webm;codecs=vp8',
                ],
                av1: [
                    'video/webm;codecs=av01.0.08M.08',
                    'video/webm;codecs=vp9',
                    'video/webm;codecs=vp8',
                ]
            };
            
            const types = overrideOptions[codecOverride] || [];
            for (const type of types) {
                if (MediaRecorder.isTypeSupported(type)) {
                    ShaderLogger.info(`Codec override: Selected ${type} (override: ${codecOverride})`);
                    return type;
                }
            }
            throw new Error(`Codec override ${codecOverride} not supported`);
        }
        
        const preference = codecPreference || 'auto';
        
        // Define codec options in priority order
        const codecOptions: Record<string, string[]> = {
            vp9: [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
            ],
            vp8: [
                'video/webm;codecs=vp8',
                'video/webm;codecs=vp9',
                'video/webm',
            ],
            h264: [
                'video/mp4;codecs=avc1.42E01E', // Baseline
                'video/mp4;codecs=avc1.4D001E', // Main
                'video/mp4;codecs=avc1.64001E', // High
                'video/webm;codecs=vp9', // Fallback
                'video/webm;codecs=vp8',
            ],
            av1: [
                'video/webm;codecs=av01.0.08M.08',
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
            ],
            auto: [
                'video/webm;codecs=vp9', // VP9 provides better quality than VP8, especially in dark areas
                'video/webm;codecs=vp8',
                'video/webm',
                'video/mp4;codecs=avc1.42E01E', // H.264 fallback
            ]
        };
        
        const types = codecOptions[preference] || codecOptions.auto;
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                ShaderLogger.info(`Selected codec: ${type} (preference: ${preference})`);
                return type;
            }
        }
        
        throw new Error(`No supported video codec found for preference: ${preference}`);
    }
    
    /**
     * Render all frames
     * Uses continuous render loop to keep canvas active and prevent track muting
     */
    async renderFrames(colors: ColorMap | null): Promise<void> {
        if (this.state !== 'ready') {
            throw new Error(`Cannot render frames: current state is ${this.state}`);
        }
        
        if (!this.recordingShader || !this.audioAnalyzer || !this.audioElement) {
            throw new Error('Recording not properly initialized');
        }
        
        // Check encoder based on mode
        if (this.isWebCodecsMode) {
            if (!this.videoEncoder || !this.audioEncoder) {
                throw new Error('WebCodecs encoders not properly initialized');
            }
        } else {
            if (!this.mediaRecorder) {
                throw new Error('MediaRecorder not properly initialized');
            }
        }
        
        this.setState('recording');
        
        // Start encoder based on mode
        if (this.isWebCodecsMode) {
            // WebCodecs: encoders are already configured and ready
            // Audio processing is already started in setupWebCodecs()
            ShaderLogger.info('Starting WebCodecs recording...');
        } else {
            // Start MediaRecorder FIRST, before rendering any frames
            // MediaRecorder needs to be active to capture the stream
            // Use 1 second timeslice to allow proper keyframe insertion for seeking
            this.mediaRecorder.start(1000); // Collect data every 1 second - allows proper keyframes
            
            // Small delay to ensure MediaRecorder is ready
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // CRITICAL: Ensure AudioContext is running before recording
        if (this.audioAnalyzer.audioContext) {
            if (this.audioAnalyzer.audioContext.state === 'suspended') {
                try {
                    await this.audioAnalyzer.audioContext.resume();
                } catch (error) {
                    ShaderLogger.warn('Failed to resume AudioContext:', error);
                }
            }
        }
        
        // CRITICAL: Audio MUST be playing for AudioAnalyzer to get frequency data
        const wasPlaying = !this.audioElement.paused;
        this.audioElement.currentTime = 0;
        await this.waitForSeek(this.audioElement);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (!wasPlaying) {
            try {
                await this.audioElement.play();
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                ShaderLogger.warn('Failed to start audio playback - recording may have black frames', error);
            }
        }
        
        // Determine if we should use sync mode (audio is playing)
        // After the check above, audio should now be playing
        const useSyncMode = !this.audioElement.paused;
        
        // Initialize frame tracking
        this.currentFrame = 0;
        const frameInterval = this.frameInterval; // ms per frame
        let lastFrameAdvanceTime = performance.now();
        
        // Render first frame
        await this.renderFrame(0, colors, useSyncMode);
        if (this.recordingGL) {
            this.recordingGL.finish();
        }
        
        return new Promise<void>((resolve, reject) => {
            // Continuous render loop - keeps canvas active to prevent track muting
            const renderLoop = async () => {
                try {
                    // Check if recording was cancelled
                    if (this.state === 'cancelled') {
                        if (this.isWebCodecsMode) {
                            // WebCodecs: encoders will be closed in cleanup
                        } else {
                            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                                this.mediaRecorder.stop();
                            }
                        }
                        resolve();
                        return;
                    }
                    
                    // Check if all frames are complete
                    if (this.currentFrame >= this.totalFrames - 1) {
                        // All frames rendered, finalize recording
                        if (this.isWebCodecsMode) {
                            // WebCodecs: finalize encoders and muxer
                            this.setState('encoding');
                            await this.finalizeRecording();
                        } else {
                            // MediaRecorder: stop and finalize
                            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                                this.setState('encoding');
                                
                                // Request any remaining data before stopping
                                // This ensures we get all buffered data and proper metadata
                                this.mediaRecorder.requestData();
                                
                                // Wait for data to be collected (longer wait for metadata)
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                // Request data one more time to ensure we get everything
                                this.mediaRecorder.requestData();
                                
                                // Wait longer to ensure metadata is written for seeking
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                // Final request to ensure all chunks are collected
                                this.mediaRecorder.requestData();
                                await new Promise(resolve => setTimeout(resolve, 300));
                                
                                // Stop MediaRecorder - this will trigger onstop which finalizes
                                this.mediaRecorder.stop();
                            }
                        }
                        resolve();
                        return;
                    }
                    
                    const now = performance.now();
                    const elapsed = now - lastFrameAdvanceTime;
                    
                    // Check if it's time to advance to the next frame
                    if (elapsed >= frameInterval) {
                        // Advance to next frame
                        this.currentFrame++;
                        lastFrameAdvanceTime = now;
                        
                        // Render new frame (this will also capture to 2D canvas)
                        // Use sync mode if audio is playing (don't seek, use current playback time)
                        const currentSyncMode = !this.audioElement?.paused;
                        await this.renderFrame(this.currentFrame, colors, currentSyncMode);
                        
                        // Force flush
                        if (this.recordingGL) {
                            this.recordingGL.finish();
                        }
                        
                        // Request frame capture from 2D canvas track
                        const videoTracks = this.videoStream?.getVideoTracks();
                        if (videoTracks && videoTracks.length > 0) {
                            const videoTrack = videoTracks[0];
                            if (typeof (videoTrack as any).requestFrame === 'function') {
                                (videoTrack as any).requestFrame();
                            }
                        }
                        
                        // Update progress
                        this.updateProgress();
                        
                        // Request data periodically to ensure proper chunking and keyframe insertion
                        // This is critical for making the video seekable
                        if (this.currentFrame > 0 && this.currentFrame % (this.options!.fps * 2) === 0) {
                            // Request data every 2 seconds to ensure proper chunking and keyframes
                            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                                this.mediaRecorder.requestData();
                            }
                        }
                        
                    } else {
                        // Not time to advance yet - re-render current frame to keep stream active
                        // This prevents the video track from being muted due to inactivity
                        // Skip capture since we already have this frame (saves CPU)
                        await this.renderFrame(this.currentFrame, colors, true, true); // skipCapture = true
                        
                        // Force flush
                        if (this.recordingGL) {
                            this.recordingGL.finish();
                        }
                        
                        // Request frame capture to keep stream active (reuse existing frame on capture canvas)
                        const videoTracks = this.videoStream?.getVideoTracks();
                        if (videoTracks && videoTracks.length > 0) {
                            const videoTrack = videoTracks[0];
                            if (typeof (videoTrack as any).requestFrame === 'function') {
                                (videoTrack as any).requestFrame();
                            }
                        }
                    }
                    
                    // Continue loop immediately (don't wait)
                    requestAnimationFrame(renderLoop);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    ShaderLogger.error('Error during frame rendering:', err);
                    this.setState('error');
                    this.handleError(err);
                    reject(err);
                }
            };
            
            // Start the continuous render loop
            requestAnimationFrame(renderLoop);
        });
    }
    
    /**
     * Capture a frame from WebGL canvas to 2D capture canvas
     * Uses drawImage() for hardware-accelerated copy (much faster than readPixels)
     * Note: WebGL context is set to sRGB color space, so no gamma correction needed
     */
    private captureFrame(): void {
        if (!this.recordingCanvas || !this.captureCtx || !this.captureCanvas) {
            return;
        }
        
        // Copy WebGL canvas to 2D canvas
        // Since drawingBufferColorSpace is set to 'srgb', the WebGL context
        // should already be outputting sRGB, so no gamma correction is needed
        this.captureCtx.clearRect(0, 0, this.captureCanvas.width, this.captureCanvas.height);
        this.captureCtx.drawImage(this.recordingCanvas, 0, 0);
        
        // Sample pixels to detect color space conversion issues (only on first frame, only warn if significant)
        if (this.lastCapturedFrame === 0 && this.recordingGL) {
            const centerX = Math.floor(this.recordingCanvas.width / 2);
            const centerY = Math.floor(this.recordingCanvas.height / 2);
            
            try {
                const webglPixels = new Uint8Array(4);
                this.recordingGL.readPixels(centerX, centerY, 1, 1, this.recordingGL.RGBA, this.recordingGL.UNSIGNED_BYTE, webglPixels);
                const canvasImageData = this.captureCtx.getImageData(centerX, centerY, 1, 1);
                
                const totalDiff = Math.abs(webglPixels[0] - canvasImageData.data[0]) +
                                 Math.abs(webglPixels[1] - canvasImageData.data[1]) +
                                 Math.abs(webglPixels[2] - canvasImageData.data[2]);
                
                // Warn if significant difference detected (potential color space issue)
                if (totalDiff > 6) {
                    ShaderLogger.warn(`Color space conversion detected: pixel diff=${totalDiff} (may indicate WebGL/2D canvas mismatch)`);
                }
            } catch (error) {
                // Silent fail - pixel sampling is diagnostic only
            }
        }
    }
    
    /**
     * Sync color transition manager state from main shader to recording shader
     * This ensures color transitions happen at the same time and match exactly
     */
    private syncColorTransitionState(): void {
        if (!this.mainShaderInstance || !this.recordingShader) {
            return;
        }
        
        const mainTransition = this.mainShaderInstance.colorTransitionManager;
        const recordingTransition = this.recordingShader.colorTransitionManager;
        
        if (!mainTransition || !recordingTransition) {
            return;
        }
        
        // Sync all transition state
        recordingTransition.isTransitioning = mainTransition.isTransitioning;
        recordingTransition.startTime = mainTransition.startTime;
        recordingTransition.duration = mainTransition.duration;
        recordingTransition.easingType = mainTransition.easingType;
        
        // Sync color states (clone to avoid reference issues)
        if (mainTransition.currentColors) {
            recordingTransition.currentColors = mainTransition.cloneColors(mainTransition.currentColors);
        }
        if (mainTransition.previousColors) {
            recordingTransition.previousColors = mainTransition.cloneColors(mainTransition.previousColors);
        }
        if (mainTransition.targetColors) {
            recordingTransition.targetColors = mainTransition.cloneColors(mainTransition.targetColors);
        }
    }
    
    /**
     * Render a single frame at specified timestamp
     * @param frameIndex - Frame index to render
     * @param colors - Color map to use (may be null, will use synced transition state)
     * @param syncToPlayback - If true, use current playback time instead of seeking (for when audio is playing)
     * @param skipCapture - If true, skip frame capture (for re-renders of the same frame)
     */
    private async renderFrame(frameIndex: number, colors: ColorMap | null, syncToPlayback: boolean = false, skipCapture: boolean = false): Promise<void> {
        if (!this.audioElement || !this.audioAnalyzer || !this.recordingShader) {
            throw new Error('Required components not available');
        }
        
        const targetTimestamp = (frameIndex * this.frameInterval) / 1000; // seconds
        let timestamp: number;
        let audioData: ExtendedAudioData | null;
        
        // Calculate REAL-WORLD deltaTime for smoothing (same as main render loop)
        // This ensures smoothing behavior matches the main render loop exactly
        const now = performance.now();
        const realWorldDeltaTime = this.lastRenderTime > 0 
            ? (now - this.lastRenderTime) / 1000.0 
            : this.frameInterval / 1000.0;
        
        // If syncing to playback (audio is playing), use current time instead of seeking
        // This prevents choppy audio and ensures AudioAnalyzer gets real-time data
        if (syncToPlayback) {
            // Use current playback time - AudioAnalyzer will get real-time data
            // The frame will render with whatever audio is currently playing
            // This is acceptable for recording since we're capturing in real-time
            timestamp = this.audioElement.currentTime;
            
            // Track audio timestamp for position tracking (not used for smoothing)
            this.lastAudioTimestamp = timestamp;
            
            // Update audio analyzer with REAL-WORLD deltaTime (not audio-time-based)
            // This ensures smoothing matches main render loop behavior
            this.audioAnalyzer.update(realWorldDeltaTime);
            audioData = this.audioAnalyzer.getData();
            
        } else {
            // Normal mode: seek to exact timestamp
            this.audioElement.currentTime = targetTimestamp;
            await this.waitForSeek(this.audioElement);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Ensure AudioContext is running (may have been suspended)
            if (this.audioAnalyzer.audioContext && this.audioAnalyzer.audioContext.state === 'suspended') {
                await this.audioAnalyzer.audioContext.resume();
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            this.lastAudioTimestamp = targetTimestamp;
            this.audioAnalyzer.update(realWorldDeltaTime);
            audioData = this.audioAnalyzer.getData();
            timestamp = targetTimestamp;
        }
        
        // Warn if colors are missing (only on first frame)
        if (frameIndex === 0 && !colors) {
            ShaderLogger.warn('Frame 0: colors is null');
        }
        
        // Render shader frame using the recording shader instance
        // Disable FPS throttling by setting a very high target FPS
        this.recordingShader.performanceMonitor.targetFPS = 999;
        
        // CRITICAL: Use REAL-WORLD deltaTime for shader rendering (same as main render loop)
        // This ensures plugin smoothing (onUpdateTextures) matches main render loop behavior
        const shaderDeltaTime = realWorldDeltaTime;
        
        // Set lastFrameTime so render() calculates deltaTime correctly
        // render() calculates: deltaTime = (now - lastFrameTime) / 1000.0
        // We want: deltaTime = realWorldDeltaTime
        // So: lastFrameTime = now - (realWorldDeltaTime * 1000)
        this.recordingShader.lastFrameTime = now - (shaderDeltaTime * 1000);
        
        // CRITICAL: Adjust startTime so that render() calculates currentTime correctly
        // render() uses: currentTime = (performance.now() - startTime) / 1000.0
        // We want currentTime to equal our timestamp, so:
        // timestamp = (performance.now() - startTime) / 1000.0
        // startTime = performance.now() - (timestamp * 1000)
        this.recordingShader.startTime = performance.now() - (timestamp * 1000);
        
        // Update time offset manager with current frame time
        const currentTime = timestamp; // Use actual audio timestamp
        
        // Update managers manually before render with audio-time-based deltaTime
        this.recordingShader.timeOffsetManager.update(audioData, shaderDeltaTime);
        
        // Update pixel size animation
        if (audioData && audioData.volume !== undefined) {
            const volume = audioData.volume || 0;
            this.recordingShader.pixelSizeAnimationManager.update(volume, currentTime, performance.now());
        }
        
        // NOTE: onUpdateTextures() is called by render() method (ShaderInstance.render line 516-518)
        // Do NOT call it manually here - calling it twice causes double smoothing which makes
        // frequency bands appear brighter in recordings than in the browser display
        // The render() method will handle texture updates with the correct deltaTime
        
        // Update lastRenderTime for next frame
        this.lastRenderTime = now;
        
        // Verify shader is ready
        if (!this.recordingShader.isInitialized || !this.recordingShader.gl || !this.recordingShader.program) {
            ShaderLogger.error(`Shader not ready: initialized=${this.recordingShader.isInitialized}, gl=${!!this.recordingShader.gl}, program=${!!this.recordingShader.program}`);
            throw new Error('Recording shader is not properly initialized');
        }
        
        // Verify canvas and viewport
        if (this.recordingGL && this.recordingCanvas) {
            this.recordingGL.viewport(0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
        }
        
        
        // CRITICAL: Sync color transition manager state with main shader
        // This ensures color transitions happen at the same time and match exactly
        this.syncColorTransitionState();
        
        // CRITICAL: Override window.devicePixelRatio before render to ensure UniformManager uses recording DPR
        // Store original DPR getter
        const originalDPR = window.devicePixelRatio;
        const recordingDPR = this.options!.dpr;
        
        // Check DPR mismatch (only log if significant difference)
        if (frameIndex === 0) {
            const mainDPR = originalDPR || 1.0;
            const dprRatio = recordingDPR / mainDPR;
            if (Math.abs(dprRatio - 1.0) > 0.01) {
                ShaderLogger.warn(`DPR mismatch: Main=${mainDPR}, Recording=${recordingDPR} (may affect visual appearance)`);
            }
        }
        
        // Temporarily override window.devicePixelRatio for UniformManager
        // This ensures updateStandardUniforms() uses recording DPR
        Object.defineProperty(window, 'devicePixelRatio', {
            get: () => recordingDPR,
            configurable: true,
            enumerable: true
        });
        
        try {
            // Get current colors from synced transition manager (not the static colors parameter)
            // This ensures we use the same interpolated colors as the main shader
            const currentColors = this.recordingShader.colorTransitionManager?.getCurrentColors() || colors;
            
            // Store OKLCH adjustment state for logging
            let oklchEnabled = false;
            let oklchLightnessEnabled = false;
            
            // CRITICAL: Set recording adjustment uniforms BEFORE rendering
            // This ensures they take effect during the render
            if (this.recordingGL && this.recordingShader.uniformLocations && this.recordingShader.uniformManager) {
                // Ensure program is active
                this.recordingGL.useProgram(this.recordingShader.program);
                
                // Override uDevicePixelRatio
                if (this.recordingShader.uniformLocations.uDevicePixelRatio !== null && 
                    this.recordingShader.uniformLocations.uDevicePixelRatio !== undefined) {
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uDevicePixelRatio as number,
                        recordingDPR
                    );
                    // Update UniformManager's lastValues to prevent it from resetting
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uDevicePixelRatio = recordingDPR;
                    }
                }
                
                // Override uPixelSize with recording DPR
                if (this.recordingShader.uniformLocations.uPixelSize !== null && 
                    this.recordingShader.uniformLocations.uPixelSize !== undefined) {
                    const basePixelSize = (this.recordingShader.parameters.pixelSize as number) || 1.0;
                    const pixelSizeMultiplier = this.recordingShader.pixelSizeAnimationManager.getMultiplier();
                    const scaledPixelSize = basePixelSize * pixelSizeMultiplier * recordingDPR;
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uPixelSize as number,
                        scaledPixelSize
                    );
                    // Update UniformManager's lastValues to prevent it from resetting
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uPixelSize = scaledPixelSize;
                    }
                }
                
                // Override uDitherSize to maintain consistent dithering pattern scale
                // The dithering pattern scale depends on resolution, pixel size, and DPR
                // We need to scale uDitherSize to maintain the same visual appearance
                // The shader calculates: effectivePixelSize = uPixelSize * (referenceScale / uDitherSize)
                // And uses: ditherCoord = fragCoordCentered / effectivePixelSize
                // To maintain the same visual scale, we need to account for:
                // 1. Resolution difference (affects gl_FragCoord.xy)
                // 2. DPR difference (affects uPixelSize)
                if (this.recordingShader.uniformLocations.uDitherSize !== null && 
                    this.recordingShader.uniformLocations.uDitherSize !== undefined) {
                    const baseDitherSize = (this.recordingShader.parameters.ditherSize as number) || 50.0;
                    const mainCanvas = this.mainShaderInstance?.canvas;
                    if (mainCanvas && this.mainShaderInstance) {
                        // Calculate the ratio of effective pixel sizes (pixelSize * DPR)
                        // This accounts for both resolution and DPR differences
                        const mainDPR = window.devicePixelRatio || 1.0;
                        const mainPixelSize = (this.mainShaderInstance.parameters.pixelSize as number) || 1.0;
                        const mainEffectivePixelSize = mainPixelSize * mainDPR;
                        
                        const recordingPixelSize = (this.recordingShader.parameters.pixelSize as number) || 1.0;
                        const recordingEffectivePixelSize = recordingPixelSize * recordingDPR;
                        
                        // Scale dither size to compensate for the ratio of effective pixel sizes
                        // This ensures the dithering pattern appears at the same visual scale
                        const pixelSizeRatio = mainEffectivePixelSize / recordingEffectivePixelSize;
                        const scaledDitherSize = baseDitherSize * pixelSizeRatio;
                        
                        this.recordingGL.uniform1f(
                            this.recordingShader.uniformLocations.uDitherSize as number,
                            scaledDitherSize
                        );
                        // Update UniformManager's lastValues
                        if (this.recordingShader.uniformManager.lastValues) {
                            this.recordingShader.uniformManager.lastValues.uDitherSize = scaledDitherSize;
                        }
                    } else {
                        // Fallback: use base value if main canvas not available
                        this.recordingGL.uniform1f(
                            this.recordingShader.uniformLocations.uDitherSize as number,
                            baseDitherSize
                        );
                    }
                }
                
                // Also override background dither size if it exists
                // Use the same scaling logic as main dither size to maintain consistency
                if (this.recordingShader.uniformLocations.uBackgroundDitherSize !== null && 
                    this.recordingShader.uniformLocations.uBackgroundDitherSize !== undefined) {
                    const baseBackgroundDitherSize = (this.recordingShader.parameters.backgroundDitherSize as number) || 50.0;
                    const mainCanvas = this.mainShaderInstance?.canvas;
                    if (mainCanvas && this.mainShaderInstance) {
                        // Use the same pixel size ratio calculation as main dither size
                        const mainDPR = window.devicePixelRatio || 1.0;
                        const mainPixelSize = (this.mainShaderInstance.parameters.pixelSize as number) || 1.0;
                        const mainEffectivePixelSize = mainPixelSize * mainDPR;
                        
                        const recordingPixelSize = (this.recordingShader.parameters.pixelSize as number) || 1.0;
                        const recordingEffectivePixelSize = recordingPixelSize * recordingDPR;
                        
                        const pixelSizeRatio = mainEffectivePixelSize / recordingEffectivePixelSize;
                        const scaledBackgroundDitherSize = baseBackgroundDitherSize * pixelSizeRatio;
                        
                        this.recordingGL.uniform1f(
                            this.recordingShader.uniformLocations.uBackgroundDitherSize as number,
                            scaledBackgroundDitherSize
                        );
                        if (this.recordingShader.uniformManager.lastValues) {
                            this.recordingShader.uniformManager.lastValues.uBackgroundDitherSize = scaledBackgroundDitherSize;
                        }
                    }
                }
                
                // Override uQualityLevel to ensure full quality
                if (this.recordingShader.uniformLocations.uQualityLevel !== null && 
                    this.recordingShader.uniformLocations.uQualityLevel !== undefined) {
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uQualityLevel as number,
                        1.0 // Full quality
                    );
                    // Update UniformManager's lastValues if it tracks this
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uQualityLevel = 1.0;
                    }
                }
                
                // Apply recording color adjustments from configuration
                const adjustments = this.colorAdjustments;
                
                // Tone curve (replaces gamma correction)
                if (this.recordingShader.uniformLocations.uApplyRecordingToneCurve !== null && 
                    this.recordingShader.uniformLocations.uApplyRecordingToneCurve !== undefined) {
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uApplyRecordingToneCurve as number,
                        adjustments.toneCurve.enabled ? 1.0 : 0.0
                    );
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uApplyRecordingToneCurve = adjustments.toneCurve.enabled ? 1.0 : 0.0;
                    }
                }
                
                // Set tone curve bezier control points
                this.setRecordingCurveUniform(
                    this.recordingGL, 
                    this.recordingShader, 
                    'uRecordingToneCurve', 
                    adjustments.toneCurve.x1, 
                    adjustments.toneCurve.y1, 
                    adjustments.toneCurve.x2, 
                    adjustments.toneCurve.y2
                );
                
                // Brightness/contrast/saturation adjustments
                const colorAdjustmentsEnabled = adjustments.brightness.enabled || 
                                               adjustments.contrast.enabled || 
                                               adjustments.saturation.enabled;
                
                if (this.recordingShader.uniformLocations.uApplyRecordingColorAdjustments !== null && 
                    this.recordingShader.uniformLocations.uApplyRecordingColorAdjustments !== undefined) {
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uApplyRecordingColorAdjustments as number,
                        colorAdjustmentsEnabled ? 1.0 : 0.0
                    );
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uApplyRecordingColorAdjustments = colorAdjustmentsEnabled ? 1.0 : 0.0;
                    }
                }
                
                // Set individual enabled flags for brightness, contrast, and saturation
                if (this.recordingShader.uniformLocations.uApplyRecordingBrightness !== null && 
                    this.recordingShader.uniformLocations.uApplyRecordingBrightness !== undefined) {
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uApplyRecordingBrightness as number,
                        adjustments.brightness.enabled ? 1.0 : 0.0
                    );
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uApplyRecordingBrightness = adjustments.brightness.enabled ? 1.0 : 0.0;
                    }
                }
                
                if (this.recordingShader.uniformLocations.uApplyRecordingContrast !== null && 
                    this.recordingShader.uniformLocations.uApplyRecordingContrast !== undefined) {
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uApplyRecordingContrast as number,
                        adjustments.contrast.enabled ? 1.0 : 0.0
                    );
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uApplyRecordingContrast = adjustments.contrast.enabled ? 1.0 : 0.0;
                    }
                }
                
                if (this.recordingShader.uniformLocations.uApplyRecordingSaturation !== null && 
                    this.recordingShader.uniformLocations.uApplyRecordingSaturation !== undefined) {
                    this.recordingGL.uniform1f(
                        this.recordingShader.uniformLocations.uApplyRecordingSaturation as number,
                        adjustments.saturation.enabled ? 1.0 : 0.0
                    );
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uApplyRecordingSaturation = adjustments.saturation.enabled ? 1.0 : 0.0;
                    }
                }
                
                // Set brightness curve bezier control points
                this.setRecordingCurveUniform(
                    this.recordingGL, 
                    this.recordingShader, 
                    'uRecordingBrightnessCurve', 
                    adjustments.brightness.x1, 
                    adjustments.brightness.y1, 
                    adjustments.brightness.x2, 
                    adjustments.brightness.y2
                );
                
                // Set contrast curve bezier control points
                this.setRecordingCurveUniform(
                    this.recordingGL, 
                    this.recordingShader, 
                    'uRecordingContrastCurve', 
                    adjustments.contrast.x1, 
                    adjustments.contrast.y1, 
                    adjustments.contrast.x2, 
                    adjustments.contrast.y2
                );
                
                // Set saturation curve bezier control points
                this.setRecordingCurveUniform(
                    this.recordingGL, 
                    this.recordingShader, 
                    'uRecordingSaturationCurve', 
                    adjustments.saturation.x1, 
                    adjustments.saturation.y1, 
                    adjustments.saturation.x2, 
                    adjustments.saturation.y2
                );
                
                // OKLCH-based color adjustments (perceptually uniform)
                const oklchAdjustments = adjustments.oklch;
                oklchEnabled = oklchAdjustments && (
                    oklchAdjustments.lightness.enabled || 
                    oklchAdjustments.chroma.enabled || 
                    oklchAdjustments.hue.enabled
                ) ? true : false;
                
                // Get uniform locations (try cache first, then query directly if needed)
                let oklchAdjLoc = this.recordingShader.uniformLocations.uApplyRecordingOklchAdjustments;
                let oklchLightLoc = this.recordingShader.uniformLocations.uApplyRecordingOklchLightness;
                
                // If locations aren't cached, query them directly
                if (oklchAdjLoc === null || oklchAdjLoc === undefined) {
                    oklchAdjLoc = this.recordingGL.getUniformLocation(this.recordingShader.program, 'uApplyRecordingOklchAdjustments');
                    if (oklchAdjLoc) {
                        this.recordingShader.uniformLocations.uApplyRecordingOklchAdjustments = oklchAdjLoc;
                    } else if (oklchEnabled) {
                        // Only warn if adjustments are enabled but uniform is missing
                        // Some shaders (like test-pattern) don't support recording adjustments, which is fine
                        ShaderLogger.warn('uApplyRecordingOklchAdjustments uniform location is NULL - uniform may be optimized out (adjustments enabled but shader does not support them)');
                    }
                }
                if (oklchLightLoc === null || oklchLightLoc === undefined) {
                    oklchLightLoc = this.recordingGL.getUniformLocation(this.recordingShader.program, 'uApplyRecordingOklchLightness');
                    if (oklchLightLoc) {
                        this.recordingShader.uniformLocations.uApplyRecordingOklchLightness = oklchLightLoc;
                    } else if (oklchEnabled && oklchAdjustments?.lightness?.enabled) {
                        // Only warn if lightness adjustment is enabled but uniform is missing
                        ShaderLogger.warn('uApplyRecordingOklchLightness uniform location is NULL - uniform may be optimized out (adjustment enabled but shader does not support it)');
                    }
                }
                
                if (oklchAdjLoc !== null && oklchAdjLoc !== undefined) {
                    const oklchAdjValue = oklchEnabled ? 1.0 : 0.0;
                    this.recordingGL.uniform1f(
                        oklchAdjLoc as number,
                        oklchAdjValue
                    );
                    if (this.recordingShader.uniformManager.lastValues) {
                        this.recordingShader.uniformManager.lastValues.uApplyRecordingOklchAdjustments = oklchAdjValue;
                    }
                }
                
                if (oklchAdjustments) {
                    // Set individual enabled flags for OKLCH adjustments
                    if (oklchLightLoc !== null && oklchLightLoc !== undefined) {
                        oklchLightnessEnabled = oklchAdjustments.lightness.enabled;
                        const lightnessValue = oklchLightnessEnabled ? 1.0 : 0.0;
                        this.recordingGL.uniform1f(
                            oklchLightLoc as number,
                            lightnessValue
                        );
                        if (this.recordingShader.uniformManager.lastValues) {
                            this.recordingShader.uniformManager.lastValues.uApplyRecordingOklchLightness = lightnessValue;
                        }
                    }
                    
                    if (this.recordingShader.uniformLocations.uApplyRecordingOklchChroma !== null && 
                        this.recordingShader.uniformLocations.uApplyRecordingOklchChroma !== undefined) {
                        this.recordingGL.uniform1f(
                            this.recordingShader.uniformLocations.uApplyRecordingOklchChroma as number,
                            oklchAdjustments.chroma.enabled ? 1.0 : 0.0
                        );
                        if (this.recordingShader.uniformManager.lastValues) {
                            this.recordingShader.uniformManager.lastValues.uApplyRecordingOklchChroma = oklchAdjustments.chroma.enabled ? 1.0 : 0.0;
                        }
                    }
                    
                    if (this.recordingShader.uniformLocations.uApplyRecordingOklchHue !== null && 
                        this.recordingShader.uniformLocations.uApplyRecordingOklchHue !== undefined) {
                        this.recordingGL.uniform1f(
                            this.recordingShader.uniformLocations.uApplyRecordingOklchHue as number,
                            oklchAdjustments.hue.enabled ? 1.0 : 0.0
                        );
                        if (this.recordingShader.uniformManager.lastValues) {
                            this.recordingShader.uniformManager.lastValues.uApplyRecordingOklchHue = oklchAdjustments.hue.enabled ? 1.0 : 0.0;
                        }
                    }
                    
                    // Set OKLCH curve bezier control points
                    this.setRecordingCurveUniform(
                        this.recordingGL, 
                        this.recordingShader, 
                        'uRecordingOklchLightnessCurve', 
                        oklchAdjustments.lightness.x1, 
                        oklchAdjustments.lightness.y1, 
                        oklchAdjustments.lightness.x2, 
                        oklchAdjustments.lightness.y2
                    );
                    
                    this.setRecordingCurveUniform(
                        this.recordingGL, 
                        this.recordingShader, 
                        'uRecordingOklchChromaCurve', 
                        oklchAdjustments.chroma.x1, 
                        oklchAdjustments.chroma.y1, 
                        oklchAdjustments.chroma.x2, 
                        oklchAdjustments.chroma.y2
                    );
                    
                    this.setRecordingCurveUniform(
                        this.recordingGL, 
                        this.recordingShader, 
                        'uRecordingOklchHueCurve', 
                        oklchAdjustments.hue.x1, 
                        oklchAdjustments.hue.y1, 
                        oklchAdjustments.hue.x2, 
                        oklchAdjustments.hue.y2
                    );
                }
            }
            
            // Render the frame (all uniforms are already set above)
            this.recordingShader.render(audioData, currentColors);
        } finally {
            // Always restore original DPR
            Object.defineProperty(window, 'devicePixelRatio', {
                get: () => originalDPR,
                configurable: true,
                enumerable: true
            });
        }
        
        // Encode frame based on recording mode
        if (this.isWebCodecsMode) {
            // WebCodecs mode: encode video frame directly from canvas
            if (!skipCapture && frameIndex !== this.lastCapturedFrame && this.videoEncoder && this.recordingCanvas) {
                await this.encodeVideoFrame(frameIndex);
                this.lastCapturedFrame = frameIndex;
            }
        } else {
            // MediaRecorder mode: capture to 2D canvas if NOT using direct WebGL capture
            if (!this.options?.useDirectWebGLCapture) {
                // CRITICAL: Copy frame from WebGL canvas to 2D capture canvas
                // This ensures accurate color reproduction and avoids hidden canvas issues
                // Only capture when frame actually changes (not on re-renders to keep stream active)
                if (!skipCapture && frameIndex !== this.lastCapturedFrame) {
                    this.captureFrame(); // Synchronous now - much faster with drawImage()
                    this.lastCapturedFrame = frameIndex;
                }
            } else {
                // Direct WebGL capture - just track frame number
                if (!skipCapture) {
                    this.lastCapturedFrame = frameIndex;
                }
            }
        }
        
    }
    
    /**
     * Encode a video frame using WebCodecs VideoEncoder
     */
    private async encodeVideoFrame(frameIndex: number): Promise<void> {
        if (!this.videoEncoder || !this.recordingCanvas || !this.options) {
            return;
        }
        
        if (this.videoEncoder.state !== 'configured') {
            ShaderLogger.warn('VideoEncoder not configured, skipping frame encoding');
            return;
        }
        
        // Calculate timestamp in microseconds
        const frameDuration = 1000000 / this.options.fps; // microseconds per frame
        const timestamp = frameIndex * frameDuration;
        
        // Log first 10 frames to verify timestamp calculation
        if (frameIndex < 10 || frameIndex === 599) {
            ShaderLogger.info(`[Timestamp Debug] VideoFrame ${frameIndex}: timestamp=${timestamp}µs, duration=${frameDuration}µs`);
        }
        
        // Create VideoFrame from canvas
        const frame = new VideoFrame(this.recordingCanvas, {
            timestamp: timestamp,
            duration: frameDuration
        });
        
        // Encode frame
        this.videoEncoder.encode(frame);
        
        // Close frame to release resources
        frame.close();
        
        // Update timestamp for next frame
        this.videoFrameTimestamp = timestamp + frameDuration;
    }
    
    /**
     * Set recording curve uniform (helper for bezier curve control points)
     */
    private setRecordingCurveUniform(
        gl: WebGLRenderingContext,
        shader: ShaderInstance,
        baseName: string,
        x1: number,
        y1: number,
        x2: number,
        y2: number
    ): void {
        const locations = shader.uniformLocations;
        const lastValues = shader.uniformManager?.lastValues;
        
        const uniforms = [
            { name: `${baseName}X1`, value: x1 },
            { name: `${baseName}Y1`, value: y1 },
            { name: `${baseName}X2`, value: x2 },
            { name: `${baseName}Y2`, value: y2 }
        ];
        
        for (const uniform of uniforms) {
            let location = (locations as any)[uniform.name];
            // If location not cached, query it directly
            if ((location === null || location === undefined) && shader.program) {
                location = gl.getUniformLocation(shader.program, uniform.name);
                if (location) {
                    (locations as any)[uniform.name] = location;
                }
            }
            
            if (location !== null && location !== undefined) {
                gl.uniform1f(location, uniform.value);
                if (lastValues) {
                    (lastValues as any)[uniform.name] = uniform.value;
                }
            }
        }
    }
    
    /**
     * Wait for audio seek to complete
     */
    private waitForSeek(audioElement: HTMLAudioElement, timeout: number = 500): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Audio seek timeout'));
            }, timeout);
            
            const onSeeked = () => {
                clearTimeout(timeoutId);
                audioElement.removeEventListener('seeked', onSeeked);
                resolve();
            };
            
            audioElement.addEventListener('seeked', onSeeked, { once: true });
        });
    }
    
    /**
     * Update progress and notify callback
     */
    private updateProgress(): void {
        const progress: RecordingProgress = {
            currentFrame: this.currentFrame,
            totalFrames: this.totalFrames,
            percentage: (this.currentFrame / this.totalFrames) * 100,
            timeElapsed: this.currentFrame * this.frameInterval,
            timeRemaining: (this.totalFrames - this.currentFrame) * this.frameInterval
        };
        
        if (this.onProgressCallback) {
            this.onProgressCallback(progress);
        }
    }
    
    /**
     * Finalize recording and create blob
     * Fixes WebM metadata to make video seekable using ts-ebml
     */
    private async finalizeRecording(): Promise<void> {
        if (this.isWebCodecsMode) {
            // WebCodecs mode: flush encoders and finalize muxer
            await this.finalizeWebCodecsRecording();
            return;
        }
        
        // MediaRecorder mode
        if (this.chunks.length === 0) {
            const error = new Error('No recording data available. MediaRecorder may not have captured any frames.');
            ShaderLogger.error('Recording finalization failed:', error);
            this.handleError(error);
            return;
        }
        
        const codecPreference = this.options?.codec || 'auto';
        const mimeType = this.getSupportedMimeType(codecPreference);
        const blob = new Blob(this.chunks, { type: mimeType });
        const blobSize = blob.size;
        this.chunks = [];
        
        if (blobSize === 0) {
            const error = new Error('Recording blob is empty. No video data was captured.');
            ShaderLogger.error('Recording finalization failed:', error);
            this.handleError(error);
            return;
        }
        
        // CRITICAL: Trigger download immediately with original blob
        // Metadata fixing is disabled to prevent browser freeze
        // The original blob from MediaRecorder is playable, just may not be seekable
        this.setState('complete');
        
        if (this.onCompleteCallback) {
            // Trigger download immediately - don't wait for metadata fix
            this.onCompleteCallback(blob);
        }
        
        ShaderLogger.info(`Recording completed: ${(blobSize / 1024 / 1024).toFixed(2)} MB`);
        
        // Attempt metadata fix in background (non-blocking, optional)
        this.fixWebMMetadataInBackground(blob).catch(() => {
            // Silent fail - metadata fix is optional
        });
        
        // Cleanup after completion to reset state for next recording
        // Use setTimeout to ensure callback completes first (blob download starts)
        setTimeout(() => {
            this.cleanup();
        }, 500);
    }
    
    /**
     * Finalize WebCodecs recording: flush encoders and create final video blob
     */
    private async finalizeWebCodecsRecording(): Promise<void> {
        ShaderLogger.info('Finalizing WebCodecs recording...');
        
        // Stop audio processing
        if (this.audioProcessorNode) {
            this.audioProcessorNode.disconnect();
            this.audioProcessorNode = null;
        }
        
        if (this.audioSourceNode) {
            this.audioSourceNode.disconnect();
            this.audioSourceNode = null;
        }
        
        // Flush video encoder
        if (this.videoEncoder && this.videoEncoder.state === 'configured') {
            ShaderLogger.info('Flushing video encoder...');
            await this.videoEncoder.flush();
            ShaderLogger.info(`Video encoder flushed: ${this.videoChunks.length} chunks`);
        }
        
        // Flush audio encoder
        if (this.audioEncoder && this.audioEncoder.state === 'configured') {
            ShaderLogger.info('Flushing audio encoder...');
            await this.audioEncoder.flush();
            ShaderLogger.info(`Audio encoder flushed: ${this.audioChunks.length} chunks`);
        }
        
        // Finalize muxer
        if (!this.muxer) {
            ShaderLogger.error('Muxer is null at finalization - attempting to create fallback muxer');
            ShaderLogger.error(`Video chunks: ${this.videoChunks.length}, Audio chunks: ${this.audioChunks.length}`);
            ShaderLogger.error(`isWebCodecsMode: ${this.isWebCodecsMode}, options: ${!!this.options}, canvas: ${!!this.recordingCanvas}`);
            
            // Try to create muxer as fallback (shouldn't be necessary but helps recover)
            try {
                if (this.options && this.recordingCanvas) {
                    const width = this.recordingCanvas.width;
                    const height = this.recordingCanvas.height;
                    const fps = this.options.fps;
                    // Create new target for fallback
                    this.muxerTarget = new ArrayBufferTarget();
                    this.muxer = new Muxer({
                        video: {
                            codec: 'V_VP9',
                            width: width,
                            height: height,
                            frameRate: fps
                        },
                        audio: {
                            codec: 'A_OPUS',
                            sampleRate: this.audioSampleRate || 44100,
                            numberOfChannels: this.audioChannels || 2
                        },
                        streaming: false,
                        type: 'webm',
                        target: this.muxerTarget,
                        firstTimestampBehavior: 'offset' // Explicitly handle timestamp offset
                    });
                    ShaderLogger.info('Fallback muxer created successfully');
                } else {
                    throw new Error('Cannot create fallback muxer - missing options or canvas');
                }
            } catch (fallbackError) {
                const error = new Error('Muxer not initialized and fallback creation failed');
                ShaderLogger.error('WebCodecs finalization failed:', error);
                ShaderLogger.error('Fallback muxer creation error:', fallbackError);
                ShaderLogger.error('Fallback error details:', {
                    errorType: fallbackError instanceof Error ? fallbackError.constructor.name : typeof fallbackError,
                    errorMessage: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                    hasOptions: !!this.options,
                    hasCanvas: !!this.recordingCanvas,
                    audioSampleRate: this.audioSampleRate,
                    audioChannels: this.audioChannels
                });
                this.handleError(error);
                return;
            }
        }
        
        // Verify muxer is now set
        if (!this.muxer) {
            const error = new Error('Muxer is still null after fallback attempt');
            ShaderLogger.error('WebCodecs finalization failed:', error);
            this.handleError(error);
            return;
        }
        
        // Add chunks to muxer - let muxer handle interleaving based on timestamps
        // CRITICAL: Do NOT convert timestamps - webm-muxer expects microseconds (WebCodecs format)
        // Either omit timestamp parameter (muxer reads chunk.timestamp) or pass chunk.timestamp directly
        ShaderLogger.info(`Adding ${this.videoChunks.length} video chunks and ${this.audioChunks.length} audio chunks to muxer...`);
        ShaderLogger.info(`Video chunks with metadata: ${this.videoChunks.filter(c => c.metadata).length}/${this.videoChunks.length}`);
        ShaderLogger.info(`Audio chunks with metadata: ${this.audioChunks.filter(c => c.metadata).length}/${this.audioChunks.length}`);
        
        // Check that first video chunk is a keyframe
        if (this.videoChunks.length > 0) {
            const firstVideoChunk = this.videoChunks[0].chunk;
            if (firstVideoChunk.type !== 'key') {
                ShaderLogger.warn('First video chunk is not a keyframe - this may cause playback issues');
                const firstKeyframe = this.videoChunks.find(c => c.chunk.type === 'key');
                if (firstKeyframe) {
                    ShaderLogger.info('Found keyframe, but it\'s not first - file may still be playable');
                } else {
                    ShaderLogger.warn('No keyframe found in video chunks - file may not be playable');
                }
            } else {
                ShaderLogger.info('First video chunk is a keyframe ✓');
            }
        }
        
        try {
            // Calculate the last video frame timestamp to trim audio to match video duration
            const lastVideoTimestamp = this.videoChunks.length > 0 
                ? this.videoChunks[this.videoChunks.length - 1].chunk.timestamp + 
                  (this.videoChunks[this.videoChunks.length - 1].chunk.duration || 0)
                : 0;
            
            // Add video chunks - let muxer read timestamps from chunk.timestamp (microseconds)
            // Pass metadata as-is (undefined is fine - webm-muxer handles it)
            for (const { chunk, metadata } of this.videoChunks) {
                // Let muxer read timestamp from chunk.timestamp (microseconds) - don't convert!
                this.muxer.addVideoChunk(
                    chunk,
                    metadata  // Pass undefined if not present, not empty object
                );
            }
            
            // Add audio chunks - trim to match video duration to prevent sync issues
            // Only include audio chunks that fall within the video timeline
            let audioChunksAdded = 0;
            for (const { chunk, metadata } of this.audioChunks) {
                // Only add audio chunks up to the last video frame timestamp
                if (chunk.timestamp <= lastVideoTimestamp) {
                    this.muxer.addAudioChunk(
                        chunk,
                        metadata  // Pass undefined if not present, not empty object
                    );
                    audioChunksAdded++;
                }
            }
            
            if (audioChunksAdded < this.audioChunks.length) {
                ShaderLogger.info(`Trimmed audio chunks: ${this.audioChunks.length} total, ${audioChunksAdded} added (trimmed ${this.audioChunks.length - audioChunksAdded} chunks beyond video duration)`);
            }
            
            ShaderLogger.info('All chunks added to muxer successfully');
        } catch (error) {
            ShaderLogger.error('Error adding chunks to muxer:', error);
            throw error;
        }
        
        ShaderLogger.info('Finalizing WebM muxer...');
        this.muxer.finalize();
        
        // Give the target a moment to finish writing (webm-muxer writes asynchronously)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the buffer from the target
        if (!this.muxerTarget) {
            const error = new Error('WebCodecs recording: muxer target is null');
            ShaderLogger.error('WebCodecs finalization failed:', error);
            this.handleError(error);
            return;
        }
        
        const buffer = this.muxerTarget.buffer;
        if (!buffer || buffer.byteLength === 0) {
            const error = new Error('WebCodecs recording: muxed buffer is empty');
            ShaderLogger.error('WebCodecs finalization failed:', error);
            this.handleError(error);
            return;
        }
        
        const blob = new Blob([buffer], { type: 'video/webm;codecs=vp9,opus' });
        
        if (!blob || blob.size === 0) {
            const error = new Error('WebCodecs recording blob is empty');
            ShaderLogger.error('WebCodecs finalization failed:', error);
            this.handleError(error);
            return;
        }
        
        const blobSize = blob.size;
        ShaderLogger.info(`WebCodecs recording completed: ${(blobSize / 1024 / 1024).toFixed(2)} MB`);
        ShaderLogger.info(`Video chunks: ${this.videoChunks.length}, Audio chunks: ${this.audioChunks.length}`);
        ShaderLogger.info(`Blob type: ${blob.type}, size: ${blobSize} bytes`);
        
        // Validate blob is valid WebM by checking it starts with WebM header
        // WebM files start with: 0x1A 0x45 0xDF 0xA3
        const headerCheck = new Uint8Array(buffer.slice(0, 4));
        const webmHeader = [0x1A, 0x45, 0xDF, 0xA3];
        const isValidWebM = headerCheck.length === 4 && 
            headerCheck[0] === webmHeader[0] && 
            headerCheck[1] === webmHeader[1] && 
            headerCheck[2] === webmHeader[2] && 
            headerCheck[3] === webmHeader[3];
        
        if (!isValidWebM) {
            ShaderLogger.warn('WebM header validation failed - file may still be valid but structure differs');
            ShaderLogger.warn(`First 4 bytes: ${Array.from(headerCheck).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        } else {
            ShaderLogger.info('WebM header validation passed');
        }
        
        // Trigger completion callback
        this.setState('complete');
        
        if (this.onCompleteCallback) {
            this.onCompleteCallback(blob);
        }
        
        // Cleanup after completion
        setTimeout(() => {
            this.cleanup();
        }, 500);
    }
    
    /**
     * Fix WebM metadata in background (non-blocking, optional)
     * This runs after download is triggered to avoid blocking
     * Currently disabled to prevent browser freezes - original blob is playable
     */
    private async fixWebMMetadataInBackground(_blob: Blob): Promise<void> {
        // Skip metadata fixing - it's causing browser freezes
        // The original blob from MediaRecorder is playable, just may not be seekable
        return;
    }
    
    /**
     * Cancel recording
     */
    cancelRecording(): void {
        if (this.state === 'recording' || this.state === 'encoding') {
            this.setState('cancelled');
            
            if (this.isWebCodecsMode) {
                // Stop WebCodecs encoders
                if (this.videoEncoder && this.videoEncoder.state !== 'closed') {
                    this.videoEncoder.close();
                }
                if (this.audioEncoder && this.audioEncoder.state !== 'closed') {
                    this.audioEncoder.close();
                }
            } else {
                // Stop MediaRecorder
                if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                }
            }
            
            this.cleanup();
        }
    }
    
    /**
     * Stop recording (called when all frames are rendered)
     */
    async stopRecording(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            if (this.state === 'complete') {
                // Already complete, return existing blob
                const codecPreference = this.options?.codec || 'auto';
        const mimeType = this.getSupportedMimeType(codecPreference);
        const blob = new Blob(this.chunks, { type: mimeType });
                resolve(blob);
                return;
            }
            
            // Set up one-time callback
            const originalCallback = this.onCompleteCallback;
            this.onCompleteCallback = (blob) => {
                if (originalCallback) originalCallback(blob);
                resolve(blob);
            };
            
            this.onErrorCallback = (error) => {
                reject(error);
            };
            
            // If recording, wait for completion
            // If not recording, finalize immediately
            if (this.state === 'recording' && this.mediaRecorder) {
                this.setState('encoding');
                this.mediaRecorder.stop();
            } else {
                this.finalizeRecording();
            }
        });
    }
    
    /**
     * Set recording state and notify callback
     */
    private setState(state: RecordingState): void {
        this.state = state;
        if (this.onStateChangeCallback) {
            this.onStateChangeCallback(state);
        }
    }
    
    /**
     * Handle errors
     */
    private handleError(error: Error): void {
        ShaderLogger.error('VideoRecorder error:', error);
        if (this.onErrorCallback) {
            this.onErrorCallback(error);
        }
    }
    
    /**
     * Run comprehensive color diagnostics (Phase 0: Quick Validation Tests)
     * Automatically runs test pattern, pixel comparison, and color accuracy tests
     * @returns Diagnostic results
     */
    async runColorDiagnostics(): Promise<{
        testPatternRendered: boolean;
        pixelComparison: ReturnType<VideoRecorder['compareWebGLPixels']>;
        colorAccuracy: Awaited<ReturnType<VideoRecorder['testKnownColorAccuracy']>>;
        colorSpaceSettings: ReturnType<VideoRecorder['checkWebGLColorSpaceSettings']>;
        capturePipeline: Awaited<ReturnType<VideoRecorder['compareCapturePipeline']>>;
        liveStreamTest: Awaited<ReturnType<VideoRecorder['testCaptureStreamLiveVideo']>>;
        liveStream2DTest: Awaited<ReturnType<VideoRecorder['testCaptureStream2DCanvas']>>;
    }> {
        ShaderLogger.info('=== Starting Color Diagnostics (Phase 0) ===');
        
        try {
            // 0. Check color space settings first
            ShaderLogger.info('Step 0: Checking WebGL color space settings...');
            const colorSpaceSettings = this.checkWebGLColorSpaceSettings();
            
            // 1. Render test pattern
            ShaderLogger.info('Step 1: Rendering test pattern...');
            await this.renderTestPattern();
            await new Promise(resolve => requestAnimationFrame(resolve)); // Wait for rendering
            
            // 2. Compare WebGL pixels
            ShaderLogger.info('Step 2: Comparing WebGL pixels...');
            const pixelComparison = this.compareWebGLPixels();
            
            // 3. Test known color accuracy
            ShaderLogger.info('Step 3: Testing known color accuracy...');
            const colorAccuracy = await this.testKnownColorAccuracy();
            
            // 4. Compare capture pipeline (WebGL → Capture Canvas)
            ShaderLogger.info('Step 4: Comparing capture pipeline (WebGL → Capture Canvas)...');
            const capturePipeline = await this.compareCapturePipeline();
            
            // 5. Test captureStream() → Live Video Element (Expert's Test 2.2)
            ShaderLogger.info('Step 5: Testing captureStream() → Live Video Element (WebGL direct)...');
            const liveStreamTest = await this.testCaptureStreamLiveVideo();
            
            // 6. Test captureStream() on 2D canvas (populated via readPixels + putImageData)
            ShaderLogger.info('Step 6: Testing captureStream() → Live Video Element (2D canvas via readPixels)...');
            const liveStream2DTest = await this.testCaptureStream2DCanvas();
            
            // Summary
            ShaderLogger.info('=== Color Diagnostics Summary ===');
            ShaderLogger.info(`Color Space Match: ${colorSpaceSettings.match ? '✓ PASS' : '✗ FAIL'}`);
            ShaderLogger.info(`WebGL Pixel Match: ${pixelComparison.matches ? '✓ PASS' : '✗ FAIL'}`);
            ShaderLogger.info(`Color Accuracy: ${colorAccuracy.passed ? '✓ PASS' : '✗ FAIL'}`);
            ShaderLogger.info(`Capture Pipeline: ${capturePipeline.matches ? '✓ PASS' : '✗ FAIL'}`);
            ShaderLogger.info(`Live Stream Test (WebGL): ${liveStreamTest.matches ? '✓ PASS' : '✗ FAIL'}`);
            ShaderLogger.info(`Live Stream Test (2D Canvas): ${liveStream2DTest.matches ? '✓ PASS' : '✗ FAIL'}`);
            
            // Compare WebGL direct vs 2D canvas captureStream results
            if (!liveStreamTest.matches && liveStream2DTest.matches) {
                ShaderLogger.warn('→ captureStream() on WebGL canvas has issues, but 2D canvas works correctly');
                ShaderLogger.warn('→ Solution: Use readPixels() + putImageData() + 2D canvas → captureStream()');
            } else if (!liveStreamTest.matches && !liveStream2DTest.matches) {
                ShaderLogger.warn('→ captureStream() has color issues on both WebGL and 2D canvases');
                ShaderLogger.warn('→ Problem is in captureStream() itself, not canvas type');
                ShaderLogger.warn('→ May need WebCodecs API or other workaround');
            } else if (liveStreamTest.matches && !liveStream2DTest.matches) {
                ShaderLogger.warn('→ Unexpected: 2D canvas captureStream() has issues but WebGL does not');
            }
            
            if (colorSpaceSettings.match && pixelComparison.matches && colorAccuracy.passed && capturePipeline.matches && liveStreamTest.matches && liveStream2DTest.matches) {
                ShaderLogger.info('✓ All diagnostics passed - WebGL rendering is identical');
                ShaderLogger.info('→ If color differences exist, they are in MediaRecorder encoding/decoding');
            } else {
                ShaderLogger.warn('✗ Some diagnostics failed - investigate differences');
                if (!colorSpaceSettings.match) {
                    ShaderLogger.warn('→ Color space mismatch detected - this is likely the root cause');
                } else if (!capturePipeline.matches) {
                    ShaderLogger.warn('→ drawImage() conversion is introducing color differences');
                    ShaderLogger.warn(`→ Average difference: ${capturePipeline.averageDiff.toFixed(2)} pixels`);
                } else if (!liveStreamTest.matches || !liveStream2DTest.matches) {
                    ShaderLogger.warn('→ captureStream() is introducing color differences');
                    ShaderLogger.warn('→ Problem is in canvas → MediaStream path, not MediaRecorder encoding');
                } else {
                    ShaderLogger.warn('→ Check shader state, uniforms, and WebGL context settings');
                }
            }
            
            ShaderLogger.info('=== Color Diagnostics Complete ===');
            ShaderLogger.info('Note: Live stream test video elements are left visible for manual comparison');
            ShaderLogger.info('Close them manually or they will be cleaned up on next recording');
            
            // Cleanup test pattern resources (but leave live stream videos for comparison)
            this.cleanupTestPattern();
            
            return {
                testPatternRendered: true,
                pixelComparison,
                colorAccuracy,
                colorSpaceSettings,
                capturePipeline,
                liveStreamTest,
                liveStream2DTest
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            ShaderLogger.error('Color diagnostics failed:', err);
            // Cleanup on error
            this.cleanupTestPattern();
            throw err;
        }
    }
    
    /**
     * Render test pattern on both main and recording contexts
     * Uses a temporary offscreen canvas for main context to avoid interfering with active visualization
     * Used for Phase 0: Quick Validation Tests
     * @returns Promise that resolves when test pattern is rendered
     */
    async renderTestPattern(): Promise<void> {
        if (!this.mainShaderInstance || !this.recordingGL || !this.recordingCanvas) {
            throw new Error('Recording not initialized. Call startRecording() first or ensure contexts are available.');
        }
        
        try {
            // Import test pattern config
            const testPatternConfig = await import('../../shaders/configs/test-pattern.js');
            const { ShaderInstance } = await import('../../shaders/ShaderInstance.js');
            const { ShaderCompiler } = await import('../../shaders/utils/ShaderCompiler.js');
            
            // Get main canvas and context for reference (we'll create a temporary canvas)
            const mainCanvas = this.mainShaderInstance.canvas;
            const mainGL = this.mainShaderInstance.gl;
            
            if (!mainCanvas || !mainGL) {
                throw new Error('Main shader canvas/context not available');
            }
            
            // Create temporary offscreen canvas for main context test
            // This avoids interfering with the active visualization
            const mainTestCanvas = document.createElement('canvas');
            mainTestCanvas.width = mainCanvas.width;
            mainTestCanvas.height = mainCanvas.height;
            
            // Create WebGL context for temporary canvas (match main context settings)
            const mainTestGL = mainTestCanvas.getContext('webgl2', {
                alpha: false,
                premultipliedAlpha: false,
                preserveDrawingBuffer: true,
                antialias: false,
                depth: false,
                stencil: false
            }) as WebGLRenderingContext | null ||
            mainTestCanvas.getContext('webgl', {
                alpha: false,
                premultipliedAlpha: false,
                preserveDrawingBuffer: true,
                antialias: false,
                depth: false,
                stencil: false
            }) as WebGLRenderingContext | null;
            
            if (!mainTestGL) {
                throw new Error('Failed to create WebGL context for main test canvas');
            }
            
            // Set color space to match
            if (mainTestGL instanceof WebGL2RenderingContext && 'drawingBufferColorSpace' in mainTestGL) {
                (mainTestGL as any).drawingBufferColorSpace = 'srgb';
            }
            
            // Create test pattern shader for main test context
            const mainTestShader = new ShaderInstance('main-test-canvas', testPatternConfig.default as any);
            mainTestShader.webglContext.canvas = mainTestCanvas;
            mainTestShader.webglContext.gl = mainTestGL;
            mainTestShader.canvas = mainTestCanvas;
            mainTestShader.gl = mainTestGL;
            
            // Compile main test shader
            const hasDerivatives = !!mainTestGL.getExtension('OES_standard_derivatives');
            const mainCompiled = await ShaderCompiler.compile(
                mainTestGL,
                testPatternConfig.default as any,
                hasDerivatives,
                {}
            );
            
            mainTestShader.program = mainCompiled.program;
            mainTestShader.quadBuffer = mainCompiled.quadBuffer;
            mainTestShader.uniformLocations = mainCompiled.uniformLocations;
            mainTestShader.uniformManager = mainCompiled.uniformManager;
            mainTestShader.isInitialized = true;
            
            // Create test pattern shader for recording context
            const recordingTestShader = new ShaderInstance('recording-canvas', testPatternConfig.default as any);
            recordingTestShader.webglContext.canvas = this.recordingCanvas;
            recordingTestShader.webglContext.gl = this.recordingGL;
            recordingTestShader.canvas = this.recordingCanvas;
            recordingTestShader.gl = this.recordingGL;
            
            // Compile recording test shader
            const recordingHasDerivatives = !!this.recordingGL.getExtension('OES_standard_derivatives');
            const recordingCompiled = await ShaderCompiler.compile(
                this.recordingGL,
                testPatternConfig.default as any,
                recordingHasDerivatives,
                {}
            );
            
            recordingTestShader.program = recordingCompiled.program;
            recordingTestShader.quadBuffer = recordingCompiled.quadBuffer;
            recordingTestShader.uniformLocations = recordingCompiled.uniformLocations;
            recordingTestShader.uniformManager = recordingCompiled.uniformManager;
            recordingTestShader.isInitialized = true;
            
            // Render test pattern on main test context
            mainTestGL.viewport(0, 0, mainTestCanvas.width, mainTestCanvas.height);
            mainTestGL.useProgram(mainTestShader.program);
            
            // Set resolution uniform
            const mainResLoc = mainTestGL.getUniformLocation(mainTestShader.program, 'uResolution');
            if (mainResLoc) {
                mainTestGL.uniform2f(mainResLoc, mainTestCanvas.width, mainTestCanvas.height);
            }
            
            // Bind and draw
            mainTestGL.bindBuffer(mainTestGL.ARRAY_BUFFER, mainTestShader.quadBuffer);
            const mainPosLoc = mainTestGL.getAttribLocation(mainTestShader.program, 'a_position');
            mainTestGL.enableVertexAttribArray(mainPosLoc);
            mainTestGL.vertexAttribPointer(mainPosLoc, 2, mainTestGL.FLOAT, false, 0, 0);
            mainTestGL.clearColor(0.0, 0.0, 0.0, 1.0);
            mainTestGL.clear(mainTestGL.COLOR_BUFFER_BIT);
            mainTestGL.drawArrays(mainTestGL.TRIANGLES, 0, 6);
            mainTestGL.finish();
            
            // Render test pattern on recording context
            this.recordingGL.viewport(0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
            this.recordingGL.useProgram(recordingTestShader.program);
            
            // Set resolution uniform
            const recordingResLoc = this.recordingGL.getUniformLocation(recordingTestShader.program, 'uResolution');
            if (recordingResLoc) {
                this.recordingGL.uniform2f(recordingResLoc, this.recordingCanvas.width, this.recordingCanvas.height);
            }
            
            // Bind and draw
            this.recordingGL.bindBuffer(this.recordingGL.ARRAY_BUFFER, recordingTestShader.quadBuffer);
            const recordingPosLoc = this.recordingGL.getAttribLocation(recordingTestShader.program, 'a_position');
            this.recordingGL.enableVertexAttribArray(recordingPosLoc);
            this.recordingGL.vertexAttribPointer(recordingPosLoc, 2, this.recordingGL.FLOAT, false, 0, 0);
            this.recordingGL.clearColor(0.0, 0.0, 0.0, 1.0);
            this.recordingGL.clear(this.recordingGL.COLOR_BUFFER_BIT);
            this.recordingGL.drawArrays(this.recordingGL.TRIANGLES, 0, 6);
            this.recordingGL.finish();
            
            // Store test canvas and context for pixel reading
            (this as any)._mainTestCanvas = mainTestCanvas;
            (this as any)._mainTestGL = mainTestGL;
            (this as any)._mainTestShader = mainTestShader;
            
            ShaderLogger.info('Test pattern rendered on both contexts');
            
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            ShaderLogger.error('Failed to render test pattern:', err);
            // Cleanup on error
            this.cleanupTestPattern();
            throw err;
        }
    }
    
    /**
     * Test drawImage() color conversion
     * Compares WebGL readPixels() directly vs 2D canvas getImageData() after drawImage()
     * This identifies if drawImage() applies gamma correction or color space conversion
     * Used for Phase 5: Canvas Conversion Analysis
     * @returns Test results showing conversion differences
     */
    async testDrawImageConversion(): Promise<{
        hasConversion: boolean;
        differences: Array<{
            colorName: string;
            webgl: [number, number, number, number];
            canvas: [number, number, number, number];
            diff: [number, number, number, number];
            totalDiff: number;
        }>;
        summary: {
            maxDiff: number;
            avgDiff: number;
            perChannelAvg: [number, number, number];
            saturatedColorsAffected: boolean;
            neutralColorsAffected: boolean;
        };
    }> {
        // If using direct WebGL capture, this test is not applicable
        if (this.options?.useDirectWebGLCapture) {
            ShaderLogger.info('Direct WebGL capture mode - drawImage() test not applicable');
            ShaderLogger.info('Direct WebGL capture bypasses drawImage() entirely');
            return {
                hasConversion: false,
                differences: [],
                summary: {
                    maxDiff: 0,
                    avgDiff: 0,
                    perChannelAvg: [0, 0, 0],
                    saturatedColorsAffected: false,
                    neutralColorsAffected: false
                }
            };
        }
        
        if (!this.recordingGL || !this.recordingCanvas || !this.captureCtx || !this.captureCanvas) {
            throw new Error('Recording not initialized. Call startRecording() first.');
        }
        
        // Ensure test pattern is rendered first
        const mainTestGL = (this as any)._mainTestGL as WebGLRenderingContext | null;
        if (!mainTestGL) {
            // Test pattern not rendered yet, render it now
            await this.renderTestPattern();
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        
        // Ensure we have a frame captured to 2D canvas
        // Render test pattern on recording context if needed
        await this.renderTestPattern();
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Capture the frame to 2D canvas using drawImage()
        this.captureFrame();
        
        ShaderLogger.info('Testing drawImage() color conversion...');
        ShaderLogger.info('This test compares WebGL readPixels() vs 2D canvas getImageData() after drawImage()');
        
        // Sample points in normalized coordinates (0-1) for test pattern cells
        const testPoints: Array<{
            name: string;
            uv: [number, number];
            expected: [number, number, number]; // RGB 0-255
        }> = [
            { name: 'Red (1,1)', uv: [0.125, 0.125], expected: [255, 0, 0] },
            { name: 'Green (1,2)', uv: [0.375, 0.125], expected: [0, 255, 0] },
            { name: 'Blue (1,3)', uv: [0.625, 0.125], expected: [0, 0, 255] },
            { name: 'White (1,4)', uv: [0.875, 0.125], expected: [255, 255, 255] },
            { name: 'Black (2,1)', uv: [0.125, 0.375], expected: [0, 0, 0] },
            { name: 'Gray 128 (2,2)', uv: [0.375, 0.375], expected: [128, 128, 128] },
            { name: 'Yellow (3,1)', uv: [0.125, 0.625], expected: [255, 255, 0] },
            { name: 'Cyan (3,2)', uv: [0.375, 0.625], expected: [0, 255, 255] },
            { name: 'Magenta (3,3)', uv: [0.625, 0.625], expected: [255, 0, 255] },
        ];
        
        const differences: Array<{
            colorName: string;
            webgl: [number, number, number, number];
            canvas: [number, number, number, number];
            diff: [number, number, number, number];
            totalDiff: number;
        }> = [];
        
        let totalDiff = 0;
        const channelDiffs = [0, 0, 0];
        let saturatedColorsDiff = 0;
        let neutralColorsDiff = 0;
        let saturatedCount = 0;
        let neutralCount = 0;
        
        for (const point of testPoints) {
            // Convert normalized coordinates to pixel coordinates
            const pixelX = Math.floor(point.uv[0] * this.recordingCanvas.width);
            const pixelY = Math.floor(point.uv[1] * this.recordingCanvas.height);
            
            // Clamp to canvas bounds
            const clampedX = Math.max(0, Math.min(this.recordingCanvas.width - 1, pixelX));
            const clampedY = Math.max(0, Math.min(this.recordingCanvas.height - 1, pixelY));
            
            // Read from WebGL using readPixels()
            const webglPixels = new Uint8Array(4);
            this.recordingGL.readPixels(
                clampedX,
                this.recordingCanvas.height - 1 - clampedY, // Flip Y coordinate
                1,
                1,
                this.recordingGL.RGBA,
                this.recordingGL.UNSIGNED_BYTE,
                webglPixels
            );
            
            // Read from 2D canvas using getImageData()
            // (frame should already be captured by captureFrame() call above)
            const canvasImageData = this.captureCtx.getImageData(clampedX, clampedY, 1, 1);
            const canvasPixels = canvasImageData.data;
            
            // Calculate differences
            const diff: [number, number, number, number] = [
                Math.abs(webglPixels[0] - canvasPixels[0]),
                Math.abs(webglPixels[1] - canvasPixels[1]),
                Math.abs(webglPixels[2] - canvasPixels[2]),
                Math.abs(webglPixels[3] - canvasPixels[3])
            ];
            
            const totalSampleDiff = diff[0] + diff[1] + diff[2] + diff[3];
            totalDiff += totalSampleDiff;
            channelDiffs[0] += diff[0];
            channelDiffs[1] += diff[1];
            channelDiffs[2] += diff[2];
            
            // Categorize by color type
            const isSaturated = point.name.includes('Red') || point.name.includes('Green') || 
                               point.name.includes('Blue') || point.name.includes('White') ||
                               point.name.includes('Yellow') || point.name.includes('Cyan') || 
                               point.name.includes('Magenta');
            const isNeutral = point.name.includes('Black') || point.name.includes('Gray');
            
            if (isSaturated) {
                saturatedColorsDiff += totalSampleDiff;
                saturatedCount++;
            } else if (isNeutral) {
                neutralColorsDiff += totalSampleDiff;
                neutralCount++;
            }
            
            differences.push({
                colorName: point.name,
                webgl: [webglPixels[0], webglPixels[1], webglPixels[2], webglPixels[3]],
                canvas: [canvasPixels[0], canvasPixels[1], canvasPixels[2], canvasPixels[3]],
                diff,
                totalDiff: totalSampleDiff
            });
        }
        
        const summary = {
            maxDiff: Math.max(...differences.map(d => d.totalDiff)),
            avgDiff: totalDiff / differences.length,
            perChannelAvg: [
                channelDiffs[0] / differences.length,
                channelDiffs[1] / differences.length,
                channelDiffs[2] / differences.length
            ] as [number, number, number],
            saturatedColorsAffected: saturatedCount > 0 ? (saturatedColorsDiff / saturatedCount) > 5 : false,
            neutralColorsAffected: neutralCount > 0 ? (neutralColorsDiff / neutralCount) > 5 : false
        };
        
        // Log results
        ShaderLogger.info('drawImage() Conversion Test Results:');
        ShaderLogger.info(`  Total samples: ${differences.length}`);
        ShaderLogger.info(`  Max difference: ${summary.maxDiff}`);
        ShaderLogger.info(`  Average difference: ${summary.avgDiff.toFixed(2)}`);
        ShaderLogger.info(`  Per-channel average: R=${summary.perChannelAvg[0].toFixed(2)}, G=${summary.perChannelAvg[1].toFixed(2)}, B=${summary.perChannelAvg[2].toFixed(2)}`);
        
        if (saturatedCount > 0) {
            ShaderLogger.info(`  Saturated colors avg diff: ${(saturatedColorsDiff / saturatedCount).toFixed(2)}`);
        }
        if (neutralCount > 0) {
            ShaderLogger.info(`  Neutral colors avg diff: ${(neutralColorsDiff / neutralCount).toFixed(2)}`);
        }
        
        if (summary.maxDiff > 0) {
            ShaderLogger.warn('✗ drawImage() is applying color conversion!');
            ShaderLogger.info('Sample differences:');
            differences.forEach(d => {
                ShaderLogger.info(`  ${d.colorName}: WebGL=[${d.webgl.slice(0, 3).join(',')}], Canvas=[${d.canvas.slice(0, 3).join(',')}], Diff=[${d.diff.slice(0, 3).join(',')}]`);
            });
            
            if (summary.saturatedColorsAffected && !summary.neutralColorsAffected) {
                ShaderLogger.warn('→ Pattern detected: Saturated colors affected more than neutral colors');
                ShaderLogger.warn('→ This suggests gamma correction or non-linear color space conversion');
                ShaderLogger.warn('→ Solution: Use readPixels() + putImageData() instead of drawImage()');
            }
        } else {
            ShaderLogger.info('✓ No color conversion detected - drawImage() preserves colors correctly');
        }
        
        return {
            hasConversion: summary.maxDiff > 0,
            differences,
            summary
        };
    }
    
    /**
     * Test alternative copy method using readPixels() + putImageData()
     * This bypasses drawImage() to avoid color conversion
     * Used for Phase 5: Canvas Conversion Analysis
     * @returns Test results comparing both methods
     */
    async testReadPixelsCopy(): Promise<{
        drawImageMethod: Awaited<ReturnType<VideoRecorder['testDrawImageConversion']>>;
        readPixelsMethod: {
            success: boolean;
            performance: number; // ms
        };
        recommendation: string;
    }> {
        ShaderLogger.info('Testing alternative copy method (readPixels + putImageData)...');
        
        // Test current drawImage() method
        const drawImageResult = await this.testDrawImageConversion();
        
        // Test readPixels() + putImageData() method
        const startTime = performance.now();
        let success = false;
        
        try {
            if (!this.recordingGL || !this.recordingCanvas || !this.captureCtx || !this.captureCanvas) {
                throw new Error('Recording not initialized');
            }
            
            // Read entire canvas using readPixels()
            const width = this.recordingCanvas.width;
            const height = this.recordingCanvas.height;
            const pixels = new Uint8Array(width * height * 4);
            
            this.recordingGL.readPixels(
                0,
                0,
                width,
                height,
                this.recordingGL.RGBA,
                this.recordingGL.UNSIGNED_BYTE,
                pixels
            );
            
            // Flip pixels vertically (WebGL origin is bottom-left, canvas is top-left)
            const flippedPixels = new Uint8Array(width * height * 4);
            for (let y = 0; y < height; y++) {
                const srcRow = height - 1 - y;
                const srcOffset = srcRow * width * 4;
                const dstOffset = y * width * 4;
                flippedPixels.set(pixels.subarray(srcOffset, srcOffset + width * 4), dstOffset);
            }
            
            // Create ImageData and put it on canvas
            const imageData = new ImageData(
                new Uint8ClampedArray(flippedPixels),
                width,
                height
            );
            
            this.captureCtx.putImageData(imageData, 0, 0);
            
            success = true;
        } catch (error) {
            ShaderLogger.error('readPixels + putImageData method failed:', error);
        }
        
        const performanceTime = performance.now() - startTime;
        
        let recommendation = '';
        if (drawImageResult.hasConversion) {
            recommendation = 'Use readPixels() + putImageData() instead of drawImage() to avoid color conversion';
            ShaderLogger.warn('Recommendation: Switch to readPixels() + putImageData() method');
            ShaderLogger.info(`  Performance: readPixels method took ${performanceTime.toFixed(2)}ms`);
        } else {
            recommendation = 'drawImage() method is fine - no conversion detected';
            ShaderLogger.info('drawImage() method works correctly, no need to change');
        }
        
        return {
            drawImageMethod: drawImageResult,
            readPixelsMethod: {
                success,
                performance: performanceTime
            },
            recommendation
        };
    }
    
    /**
     * Cleanup test pattern resources
     */
    private cleanupTestPattern(): void {
        const mainTestGL = (this as any)._mainTestGL as WebGLRenderingContext | null;
        const mainTestShader = (this as any)._mainTestShader as any;
        
        if (mainTestGL && mainTestShader) {
            if (mainTestShader.program) {
                mainTestGL.deleteProgram(mainTestShader.program);
            }
            if (mainTestShader.quadBuffer) {
                mainTestGL.deleteBuffer(mainTestShader.quadBuffer);
            }
        }
        
        (this as any)._mainTestCanvas = null;
        (this as any)._mainTestGL = null;
        (this as any)._mainTestShader = null;
    }
    
    /**
     * Compare WebGL pixels between main and recording contexts using readPixels()
     * Uses normalized coordinates (0-1) to handle different canvas sizes
     * Used for Phase 0: Quick Validation Tests
     * @param samplePoints - Array of [x, y] coordinates to sample (0-1 normalized, or pixel coordinates)
     * @param usePixelCoords - If true, samplePoints are pixel coordinates; if false, they're normalized (0-1)
     * @returns Comparison results with pixel differences
     */
    compareWebGLPixels(samplePoints?: Array<[number, number]>, usePixelCoords: boolean = false): {
        matches: boolean;
        differences: Array<{
            x: number;
            y: number;
            main: [number, number, number, number];
            recording: [number, number, number, number];
            diff: [number, number, number, number];
            totalDiff: number;
        }>;
        summary: {
            totalSamples: number;
            matchingSamples: number;
            maxDiff: number;
            avgDiff: number;
            perChannelAvg: [number, number, number];
        };
    } {
        if (!this.recordingGL || !this.recordingCanvas) {
            throw new Error('Recording not initialized. Call startRecording() first.');
        }
        
        // Get test canvas and context (created by renderTestPattern)
        const mainTestGL = (this as any)._mainTestGL as WebGLRenderingContext | null;
        const mainTestCanvas = (this as any)._mainTestCanvas as HTMLCanvasElement | null;
        
        if (!mainTestGL || !mainTestCanvas) {
            throw new Error('Test pattern not rendered. Call renderTestPattern() first.');
        }
        
        // Default sample points: center, corners, and test pattern cell centers (normalized 0-1)
        const defaultPoints: Array<[number, number]> = [
            [0.5, 0.5],   // Center
            [0.125, 0.125], // Top-left cell center (red)
            [0.375, 0.125], // Top cell center (green)
            [0.625, 0.125], // Top cell center (blue)
            [0.875, 0.125], // Top-right cell center (white)
            [0.125, 0.375], // Row 1 cell center (black)
            [0.375, 0.375], // Row 1 cell center (gray 128)
            [0.125, 0.625], // Row 2 cell center (yellow)
            [0.375, 0.625], // Row 2 cell center (cyan)
        ];
        
        const points = samplePoints || defaultPoints;
        const differences: Array<{
            x: number;
            y: number;
            main: [number, number, number, number];
            recording: [number, number, number, number];
            diff: [number, number, number, number];
            totalDiff: number;
        }> = [];
        
        let totalDiff = 0;
        const channelDiffs = [0, 0, 0];
        let matchingSamples = 0;
        
        for (const [u, v] of points) {
            // Convert normalized coordinates (0-1) to pixel coordinates for each canvas
            let mainPixelX: number;
            let mainPixelY: number;
            let recordingPixelX: number;
            let recordingPixelY: number;
            
            if (usePixelCoords) {
                // If using pixel coordinates, assume they're for recording canvas
                recordingPixelX = Math.floor(u);
                recordingPixelY = Math.floor(v);
                // Scale to main canvas size
                mainPixelX = Math.floor((u / this.recordingCanvas.width) * mainTestCanvas.width);
                mainPixelY = Math.floor((v / this.recordingCanvas.height) * mainTestCanvas.height);
            } else {
                // Normalized coordinates (0-1) - scale to each canvas
                mainPixelX = Math.floor(u * mainTestCanvas.width);
                mainPixelY = Math.floor(v * mainTestCanvas.height);
                recordingPixelX = Math.floor(u * this.recordingCanvas.width);
                recordingPixelY = Math.floor(v * this.recordingCanvas.height);
            }
            
            // Clamp to canvas bounds
            mainPixelX = Math.max(0, Math.min(mainTestCanvas.width - 1, mainPixelX));
            mainPixelY = Math.max(0, Math.min(mainTestCanvas.height - 1, mainPixelY));
            recordingPixelX = Math.max(0, Math.min(this.recordingCanvas.width - 1, recordingPixelX));
            recordingPixelY = Math.max(0, Math.min(this.recordingCanvas.height - 1, recordingPixelY));
            
            // Read pixels from main test context
            const mainPixels = new Uint8Array(4);
            mainTestGL.readPixels(
                mainPixelX,
                mainTestCanvas.height - 1 - mainPixelY, // Flip Y coordinate (WebGL origin is bottom-left)
                1,
                1,
                mainTestGL.RGBA,
                mainTestGL.UNSIGNED_BYTE,
                mainPixels
            );
            
            // Read pixels from recording context
            const recordingPixels = new Uint8Array(4);
            this.recordingGL.readPixels(
                recordingPixelX,
                this.recordingCanvas.height - 1 - recordingPixelY, // Flip Y coordinate
                1,
                1,
                this.recordingGL.RGBA,
                this.recordingGL.UNSIGNED_BYTE,
                recordingPixels
            );
            
            // Calculate differences
            const diff: [number, number, number, number] = [
                Math.abs(mainPixels[0] - recordingPixels[0]),
                Math.abs(mainPixels[1] - recordingPixels[1]),
                Math.abs(mainPixels[2] - recordingPixels[2]),
                Math.abs(mainPixels[3] - recordingPixels[3])
            ];
            
            const totalSampleDiff = diff[0] + diff[1] + diff[2] + diff[3];
            totalDiff += totalSampleDiff;
            channelDiffs[0] += diff[0];
            channelDiffs[1] += diff[1];
            channelDiffs[2] += diff[2];
            
            if (totalSampleDiff === 0) {
                matchingSamples++;
            }
            
            differences.push({
                x: recordingPixelX, // Use recording canvas coordinates for reporting
                y: recordingPixelY,
                main: [mainPixels[0], mainPixels[1], mainPixels[2], mainPixels[3]],
                recording: [recordingPixels[0], recordingPixels[1], recordingPixels[2], recordingPixels[3]],
                diff,
                totalDiff: totalSampleDiff
            });
        }
        
        const summary = {
            totalSamples: points.length,
            matchingSamples,
            maxDiff: Math.max(...differences.map(d => d.totalDiff)),
            avgDiff: totalDiff / points.length,
            perChannelAvg: [
                channelDiffs[0] / points.length,
                channelDiffs[1] / points.length,
                channelDiffs[2] / points.length
            ] as [number, number, number]
        };
        
        // Log results
        ShaderLogger.info('WebGL Pixel Comparison Results:');
        ShaderLogger.info(`  Total samples: ${summary.totalSamples}`);
        ShaderLogger.info(`  Matching samples: ${summary.matchingSamples}`);
        ShaderLogger.info(`  Max difference: ${summary.maxDiff}`);
        ShaderLogger.info(`  Average difference: ${summary.avgDiff.toFixed(2)}`);
        ShaderLogger.info(`  Per-channel average: R=${summary.perChannelAvg[0].toFixed(2)}, G=${summary.perChannelAvg[1].toFixed(2)}, B=${summary.perChannelAvg[2].toFixed(2)}`);
        
        if (summary.maxDiff > 0) {
            ShaderLogger.warn('Pixel differences detected between main and recording WebGL contexts');
            ShaderLogger.info('Sample differences:');
            differences.slice(0, 5).forEach(d => {
                ShaderLogger.info(`  (${d.x}, ${d.y}): Main=[${d.main.join(',')}], Recording=[${d.recording.join(',')}], Diff=[${d.diff.join(',')}]`);
            });
        } else {
            ShaderLogger.info('✓ All pixels match - WebGL rendering is identical');
        }
        
        return {
            matches: summary.maxDiff === 0,
            differences,
            summary
        };
    }
    
    /**
     * Test known color accuracy by rendering and reading back specific colors
     * Uses normalized coordinates to handle different canvas sizes
     * Used for Phase 0: Quick Validation Tests
     * @returns Test results with expected vs actual values
     */
    async testKnownColorAccuracy(): Promise<{
        passed: boolean;
        tests: Array<{
            colorName: string;
            expected: [number, number, number];
            main: [number, number, number];
            recording: [number, number, number];
            mainMatch: boolean;
            recordingMatch: boolean;
        }>;
    }> {
        // Ensure test pattern is rendered
        const mainTestGL = (this as any)._mainTestGL as WebGLRenderingContext | null;
        const mainTestCanvas = (this as any)._mainTestCanvas as HTMLCanvasElement | null;
        
        if (!mainTestGL || !mainTestCanvas || !this.recordingGL || !this.recordingCanvas) {
            // Render test pattern if not already rendered
            await this.renderTestPattern();
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        
        // Get references again after potential render
        const finalMainTestGL = (this as any)._mainTestGL as WebGLRenderingContext;
        const finalMainTestCanvas = (this as any)._mainTestCanvas as HTMLCanvasElement;
        
        // Known colors in test pattern (cell centers in normalized coordinates 0-1)
        const knownColors: Array<{
            name: string;
            expected: [number, number, number]; // RGB 0-255
            uv: [number, number]; // Normalized coordinates (0-1)
        }> = [
            { name: 'Red', expected: [255, 0, 0], uv: [0.125, 0.125] },
            { name: 'Green', expected: [0, 255, 0], uv: [0.375, 0.125] },
            { name: 'Blue', expected: [0, 0, 255], uv: [0.625, 0.125] },
            { name: 'White', expected: [255, 255, 255], uv: [0.875, 0.125] },
            { name: 'Black', expected: [0, 0, 0], uv: [0.125, 0.375] },
            { name: 'Gray 128', expected: [128, 128, 128], uv: [0.375, 0.375] },
        ];
        
        const tests: Array<{
            colorName: string;
            expected: [number, number, number];
            main: [number, number, number];
            recording: [number, number, number];
            mainMatch: boolean;
            recordingMatch: boolean;
        }> = [];
        
        if (!this.recordingGL || !this.recordingCanvas) {
            throw new Error('Recording context not available');
        }
        
        for (const color of knownColors) {
            // Convert normalized UV coordinates to pixel coordinates for each canvas
            const mainPixelX = Math.floor(color.uv[0] * finalMainTestCanvas.width);
            const mainPixelY = Math.floor(color.uv[1] * finalMainTestCanvas.height);
            const recordingPixelX = Math.floor(color.uv[0] * this.recordingCanvas.width);
            const recordingPixelY = Math.floor(color.uv[1] * this.recordingCanvas.height);
            
            // Clamp to canvas bounds
            const clampedMainX = Math.max(0, Math.min(finalMainTestCanvas.width - 1, mainPixelX));
            const clampedMainY = Math.max(0, Math.min(finalMainTestCanvas.height - 1, mainPixelY));
            const clampedRecX = Math.max(0, Math.min(this.recordingCanvas.width - 1, recordingPixelX));
            const clampedRecY = Math.max(0, Math.min(this.recordingCanvas.height - 1, recordingPixelY));
            
            // Read from main test context
            const mainPixels = new Uint8Array(4);
            finalMainTestGL.readPixels(
                clampedMainX,
                finalMainTestCanvas.height - 1 - clampedMainY, // Flip Y coordinate
                1,
                1,
                finalMainTestGL.RGBA,
                finalMainTestGL.UNSIGNED_BYTE,
                mainPixels
            );
            
            // Read from recording context
            const recordingPixels = new Uint8Array(4);
            this.recordingGL.readPixels(
                clampedRecX,
                this.recordingCanvas.height - 1 - clampedRecY, // Flip Y coordinate
                1,
                1,
                this.recordingGL.RGBA,
                this.recordingGL.UNSIGNED_BYTE,
                recordingPixels
            );
            
            const mainRGB: [number, number, number] = [mainPixels[0], mainPixels[1], mainPixels[2]];
            const recordingRGB: [number, number, number] = [recordingPixels[0], recordingPixels[1], recordingPixels[2]];
            
            // Allow small tolerance (2 pixels) for rounding/antialiasing
            const tolerance = 2;
            const mainMatch = Math.abs(mainRGB[0] - color.expected[0]) <= tolerance &&
                            Math.abs(mainRGB[1] - color.expected[1]) <= tolerance &&
                            Math.abs(mainRGB[2] - color.expected[2]) <= tolerance;
            
            const recordingMatch = Math.abs(recordingRGB[0] - color.expected[0]) <= tolerance &&
                                 Math.abs(recordingRGB[1] - color.expected[1]) <= tolerance &&
                                 Math.abs(recordingRGB[2] - color.expected[2]) <= tolerance;
            
            tests.push({
                colorName: color.name,
                expected: color.expected,
                main: mainRGB,
                recording: recordingRGB,
                mainMatch,
                recordingMatch
            });
        }
        
        const passed = tests.every(t => t.mainMatch && t.recordingMatch);
        
        // Log results
        ShaderLogger.info('Known Color Accuracy Test Results:');
        tests.forEach(test => {
            const mainStatus = test.mainMatch ? '✓' : '✗';
            const recordingStatus = test.recordingMatch ? '✓' : '✗';
            ShaderLogger.info(`  ${test.colorName}: Expected=[${test.expected.join(',')}], Main=${mainStatus}[${test.main.join(',')}], Recording=${recordingStatus}[${test.recording.join(',')}]`);
        });
        
        if (passed) {
            ShaderLogger.info('✓ All color accuracy tests passed');
        } else {
            ShaderLogger.warn('✗ Some color accuracy tests failed');
        }
        
        return { passed, tests };
    }
    
    /**
     * Compare capture pipeline: Recording WebGL → Capture Canvas
     * This identifies if drawImage() is introducing color differences
     * Also compares with main canvas as reference (since PNG export matches browser)
     * @returns Comparison results
     */
    async compareCapturePipeline(): Promise<{
        matches: boolean;
        totalSamples: number;
        matchingSamples: number;
        maxDifference: number;
        averageDiff: number;
        perChannelAvg: { r: number; g: number; b: number };
        samples: Array<{
            x: number;
            y: number;
            webgl: [number, number, number];
            capture: [number, number, number];
            main?: [number, number, number];
            diff: [number, number, number];
        }>;
    }> {
        if (this.options?.useDirectWebGLCapture) {
            ShaderLogger.info('Direct WebGL capture mode - skipping 2D canvas comparison');
            return {
                matches: true,
                totalSamples: 0,
                matchingSamples: 0,
                maxDifference: 0,
                averageDiff: 0,
                perChannelAvg: { r: 0, g: 0, b: 0 },
                samples: []
            };
        }
        
        if (!this.recordingGL || !this.recordingCanvas || !this.captureCtx || !this.captureCanvas) {
            throw new Error('Recording not initialized - cannot compare capture pipeline');
        }
        
        // During diagnostics, test pattern is already rendered on recording canvas
        // Don't overwrite it with actual shader - just ensure it's captured
        if (this.lastCapturedFrame < 0) {
            // Test pattern should already be on canvas from renderTestPattern()
            // Just capture it to the capture canvas
            this.captureFrame();
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        
        const width = this.recordingCanvas.width;
        const height = this.recordingCanvas.height;
        
        // Sample from center of each colored cell in the 4x4 test pattern grid
        // Test pattern cells are 0.25 x 0.25 in UV space
        // Cell centers: 0.125, 0.375, 0.625, 0.875 for each dimension
        // Note: WebGL Y origin is bottom-left, but test pattern uses top-left convention
        // Test pattern rows (from top): Row 0 (pure colors), Row 1 (grayscale), Row 2 (saturated), Row 3 (mid-range)
        // In WebGL coordinates: Row 0 is at y=0.875, Row 1 at y=0.625, Row 2 at y=0.375, Row 3 at y=0.125
        // Expected values are approximate (gamma-corrected sRGB output from linearToSrgb conversion)
        const samplePoints = [
            // Row 0 (top): Pure colors - Red, Green, Blue, White
            { x: width * 0.125, y: height * 0.875, name: 'Red (0,0)', expected: [188, 0, 0] as [number, number, number] },
            { x: width * 0.375, y: height * 0.875, name: 'Green (0,1)', expected: [0, 188, 0] as [number, number, number] },
            { x: width * 0.625, y: height * 0.875, name: 'Blue (0,2)', expected: [0, 0, 188] as [number, number, number] },
            { x: width * 0.875, y: height * 0.875, name: 'White (0,3)', expected: [188, 188, 188] as [number, number, number] },
            // Row 1: Grayscale - Black, Gray 128, Dark gray, Light gray
            { x: width * 0.125, y: height * 0.625, name: 'Black (1,0)', expected: [0, 0, 0] as [number, number, number] },
            { x: width * 0.375, y: height * 0.625, name: 'Gray128 (1,1)', expected: [118, 118, 118] as [number, number, number] },
            { x: width * 0.625, y: height * 0.625, name: 'DarkGray (1,2)', expected: [61, 61, 61] as [number, number, number] },
            { x: width * 0.875, y: height * 0.625, name: 'LightGray (1,3)', expected: [186, 186, 186] as [number, number, number] },
            // Row 2: Saturated colors - Yellow, Cyan, Magenta, Orange
            { x: width * 0.125, y: height * 0.375, name: 'Yellow (2,0)', expected: [188, 188, 0] as [number, number, number] },
            { x: width * 0.375, y: height * 0.375, name: 'Cyan (2,1)', expected: [0, 188, 188] as [number, number, number] },
            { x: width * 0.625, y: height * 0.375, name: 'Magenta (2,2)', expected: [188, 0, 188] as [number, number, number] },
            { x: width * 0.875, y: height * 0.375, name: 'Orange (2,3)', expected: [188, 118, 0] as [number, number, number] },
            // Row 3: Mid-range colors - Dark red, Dark green, Dark blue, Olive
            { x: width * 0.125, y: height * 0.125, name: 'DarkRed (3,0)', expected: [94, 0, 0] as [number, number, number] },
            { x: width * 0.375, y: height * 0.125, name: 'DarkGreen (3,1)', expected: [0, 94, 0] as [number, number, number] },
            { x: width * 0.625, y: height * 0.125, name: 'DarkBlue (3,2)', expected: [0, 0, 94] as [number, number, number] },
            { x: width * 0.875, y: height * 0.125, name: 'Olive (3,3)', expected: [94, 94, 0] as [number, number, number] },
        ];
        
        const samples: Array<{
            x: number;
            y: number;
            name: string;
            expected?: [number, number, number];
            webgl: [number, number, number];
            capture: [number, number, number];
            main?: [number, number, number];
            diff: [number, number, number];
        }> = [];
        
        let totalDiff = 0;
        let maxDiff = 0;
        let matchingCount = 0;
        let rSum = 0, gSum = 0, bSum = 0;
        let nonBlackSamples = 0; // Track how many samples are actually colored (not black)
        
        // Ensure we're reading from default framebuffer
        this.recordingGL.bindFramebuffer(this.recordingGL.FRAMEBUFFER, null);
        this.recordingGL.viewport(0, 0, width, height);
        
        for (const point of samplePoints) {
            const pixelX = Math.floor(point.x);
            const pixelY = Math.floor(point.y);
            
            // Read from recording WebGL canvas
            const webglPixels = new Uint8Array(4);
            // WebGL origin is bottom-left, so flip Y
            const webglY = height - 1 - pixelY;
            this.recordingGL.readPixels(pixelX, webglY, 1, 1, this.recordingGL.RGBA, this.recordingGL.UNSIGNED_BYTE, webglPixels);
            const webglColor: [number, number, number] = [webglPixels[0], webglPixels[1], webglPixels[2]];
            
            // Check if this is a non-black sample (for validation)
            const isNonBlack = webglColor[0] > 0 || webglColor[1] > 0 || webglColor[2] > 0;
            if (isNonBlack) {
                nonBlackSamples++;
            }
            
            // Read from capture canvas (after drawImage)
            const captureImageData = this.captureCtx.getImageData(pixelX, pixelY, 1, 1);
            const captureColor: [number, number, number] = [
                captureImageData.data[0],
                captureImageData.data[1],
                captureImageData.data[2]
            ];
            
            // Optionally read from main canvas for reference
            let mainColor: [number, number, number] | undefined;
            if (this.mainShaderInstance?.gl && this.mainShaderInstance.canvas) {
                const mainGL = this.mainShaderInstance.gl;
                const mainCanvas = this.mainShaderInstance.canvas;
                const mainPixels = new Uint8Array(4);
                // Scale coordinates to main canvas size
                const mainX = Math.floor((pixelX / width) * mainCanvas.width);
                const mainY = Math.floor((pixelY / height) * mainCanvas.height);
                const mainWebglY = mainCanvas.height - 1 - mainY;
                mainGL.bindFramebuffer(mainGL.FRAMEBUFFER, null);
                mainGL.viewport(0, 0, mainCanvas.width, mainCanvas.height);
                mainGL.readPixels(mainX, mainWebglY, 1, 1, mainGL.RGBA, mainGL.UNSIGNED_BYTE, mainPixels);
                mainColor = [mainPixels[0], mainPixels[1], mainPixels[2]];
            }
            
            // Calculate difference
            const diff: [number, number, number] = [
                Math.abs(webglColor[0] - captureColor[0]),
                Math.abs(webglColor[1] - captureColor[1]),
                Math.abs(webglColor[2] - captureColor[2])
            ];
            
            const totalPixelDiff = diff[0] + diff[1] + diff[2];
            totalDiff += totalPixelDiff;
            maxDiff = Math.max(maxDiff, totalPixelDiff);
            
            if (totalPixelDiff === 0) {
                matchingCount++;
            }
            
            rSum += diff[0];
            gSum += diff[1];
            bSum += diff[2];
            
            samples.push({
                x: pixelX,
                y: pixelY,
                name: point.name,
                expected: point.expected,
                webgl: webglColor,
                capture: captureColor,
                main: mainColor,
                diff
            });
        }
        
        const totalSamples = samplePoints.length;
        const averageDiff = totalDiff / totalSamples;
        const perChannelAvg = {
            r: rSum / totalSamples,
            g: gSum / totalSamples,
            b: bSum / totalSamples
        };
        
        const matches = matchingCount === totalSamples;
        
        // Log results
        ShaderLogger.info('Capture Pipeline Comparison Results:');
        ShaderLogger.info(`  Total samples: ${totalSamples}`);
        ShaderLogger.info(`  Non-black samples: ${nonBlackSamples} (should be ${totalSamples - 1} if test pattern rendered correctly)`);
        ShaderLogger.info(`  Matching samples: ${matchingCount}`);
        ShaderLogger.info(`  Max difference: ${maxDiff}`);
        ShaderLogger.info(`  Average difference: ${averageDiff.toFixed(2)}`);
        ShaderLogger.info(`  Per-channel average: R=${perChannelAvg.r.toFixed(2)}, G=${perChannelAvg.g.toFixed(2)}, B=${perChannelAvg.b.toFixed(2)}`);
        
        // Warn if all samples are black (test pattern not rendered)
        if (nonBlackSamples === 0) {
            ShaderLogger.warn('⚠ All samples are black - test pattern may not be rendered on recording canvas');
            ShaderLogger.warn('  This could indicate:');
            ShaderLogger.warn('    1. Test pattern was not rendered before comparison');
            ShaderLogger.warn('    2. Test pattern was overwritten by actual shader');
            ShaderLogger.warn('    3. Sampling wrong coordinates');
        }
        
        if (matches) {
            ShaderLogger.info('✓ Capture pipeline is identical - drawImage() is not introducing differences');
        } else {
            ShaderLogger.warn('✗ Capture pipeline differences detected - drawImage() may be introducing color changes');
            ShaderLogger.info('Sample differences (showing all samples, not just differences):');
            samples.forEach((sample) => {
                const totalSampleDiff = sample.diff[0] + sample.diff[1] + sample.diff[2];
                const expectedInfo = sample.expected ? `, Expected≈[${sample.expected.join(',')}]` : '';
                const mainInfo = sample.main ? `, Main=[${sample.main.join(',')}]` : '';
                const status = totalSampleDiff === 0 ? '✓' : '✗';
                ShaderLogger.info(`  ${status} ${sample.name} (${sample.x}, ${sample.y}): WebGL=[${sample.webgl.join(',')}], Capture=[${sample.capture.join(',')}]${expectedInfo}${mainInfo}, Diff=[${sample.diff.join(',')}]`);
            });
        }
        
        return {
            matches,
            totalSamples,
            matchingSamples: matchingCount,
            maxDifference: maxDiff,
            averageDiff,
            perChannelAvg,
            samples
        };
    }
    
    /**
     * Test captureStream() by creating a live video element from the stream
     * This isolates whether the problem is in captureStream() or MediaRecorder encoding
     * Based on Expert's Test 2.2
     * @returns Video element and comparison results
     */
    async testCaptureStreamLiveVideo(): Promise<{
        videoElement: HTMLVideoElement;
        matches: boolean;
        pixelComparison?: {
            canvasPixels: [number, number, number];
            videoPixels: [number, number, number];
            diff: [number, number, number];
        };
    }> {
        if (!this.recordingCanvas || !this.recordingGL) {
            throw new Error('Recording canvas not available');
        }
        
        ShaderLogger.info('=== Testing captureStream() → Live Video Element ===');
        
        // Cleanup any existing test video
        this.cleanupLiveStreamTest();
        
        // Ensure canvas is rendering before creating stream
        // Render a frame to ensure the stream has content
        if (this.recordingShader && this.recordingGL) {
            await this.renderTestPattern();
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        
        // Create stream from WebGL canvas
        const stream = this.recordingCanvas.captureStream(this.options!.fps);
        
        // Verify stream has video tracks
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
            throw new Error('Stream has no video tracks');
        }
        
        // Create video element
        const videoEl = document.createElement('video');
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.autoplay = true;
        videoEl.setAttribute('data-test', 'live-stream-preview');
        
        // Style for side-by-side comparison
        videoEl.style.position = 'fixed';
        videoEl.style.left = '0';
        videoEl.style.top = '0';
        videoEl.style.width = `${this.recordingCanvas.width}px`;
        videoEl.style.height = `${this.recordingCanvas.height}px`;
        videoEl.style.zIndex = '9999';
        videoEl.style.border = '2px solid red';
        videoEl.style.backgroundColor = '#000';
        videoEl.style.transform = 'scale(0.5)';
        videoEl.style.transformOrigin = 'top left';
        
        // Add label
        const label = document.createElement('div');
        label.textContent = 'Live Stream Preview (from captureStream) - Compare with WebGL canvas';
        label.setAttribute('data-test', 'live-stream-label');
        label.style.position = 'fixed';
        label.style.left = '0';
        label.style.top = '0';
        label.style.zIndex = '10000';
        label.style.color = 'white';
        label.style.backgroundColor = 'rgba(255,0,0,0.8)';
        label.style.padding = '4px 8px';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        
        document.body.appendChild(videoEl);
        document.body.appendChild(label);
        
        // Wait for video to start playing with better error handling
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                // Don't reject - just warn and continue
                ShaderLogger.warn('Video element took too long to load - continuing anyway');
                resolve();
            }, 10000); // Increased timeout to 10 seconds
            
            // Try to play immediately
            const tryPlay = async () => {
                try {
                    await videoEl.play();
                    // Wait a bit for first frame
                    setTimeout(() => {
                        clearTimeout(timeout);
                        resolve();
                    }, 500);
                } catch (error) {
                    // If autoplay fails, wait for metadata
                    ShaderLogger.debug('Autoplay failed, waiting for metadata...');
                }
            };
            
            videoEl.onloadedmetadata = () => {
                tryPlay().catch((error) => {
                    clearTimeout(timeout);
                    ShaderLogger.warn('Video play failed, but continuing:', error);
                    resolve(); // Don't reject - just continue
                });
            };
            
            videoEl.onerror = (error) => {
                clearTimeout(timeout);
                ShaderLogger.warn('Video element error, but continuing:', error);
                resolve(); // Don't reject - just continue
            };
            
            // Try playing immediately if metadata is already loaded
            if (videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
                tryPlay();
            }
        });
        
        // Render test pattern for comparison
        await this.renderTestPattern();
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve)); // Wait one more frame for video to update
        
        // Optional: Compare pixels programmatically
        let pixelComparison: {
            canvasPixels: [number, number, number];
            videoPixels: [number, number, number];
            diff: [number, number, number];
        } | undefined;
        
        try {
            // Create probe canvas to read video frame
            const probeCanvas = document.createElement('canvas');
            probeCanvas.width = this.recordingCanvas.width;
            probeCanvas.height = this.recordingCanvas.height;
            const probeCtx = probeCanvas.getContext('2d', { colorSpace: 'srgb' });
            
            if (probeCtx) {
                // Draw video frame to probe canvas
                probeCtx.drawImage(videoEl, 0, 0);
                
                // Sample center pixel
                const centerX = Math.floor(this.recordingCanvas.width / 2);
                const centerY = Math.floor(this.recordingCanvas.height / 2);
                
                // Read from WebGL canvas
                const canvasPixels = new Uint8Array(4);
                this.recordingGL.readPixels(
                    centerX,
                    this.recordingCanvas.height - 1 - centerY, // Flip Y for WebGL coordinates
                    1, 1,
                    this.recordingGL.RGBA,
                    this.recordingGL.UNSIGNED_BYTE,
                    canvasPixels
                );
                
                // Read from video frame
                const videoImageData = probeCtx.getImageData(centerX, centerY, 1, 1);
                
                const canvasRGB: [number, number, number] = [canvasPixels[0], canvasPixels[1], canvasPixels[2]];
                const videoRGB: [number, number, number] = [videoImageData.data[0], videoImageData.data[1], videoImageData.data[2]];
                const diff: [number, number, number] = [
                    Math.abs(canvasRGB[0] - videoRGB[0]),
                    Math.abs(canvasRGB[1] - videoRGB[1]),
                    Math.abs(canvasRGB[2] - videoRGB[2])
                ];
                
                pixelComparison = { canvasPixels: canvasRGB, videoPixels: videoRGB, diff };
                
                const totalDiff = diff[0] + diff[1] + diff[2];
                ShaderLogger.info(`Pixel comparison (center): Canvas=[${canvasRGB.join(',')}], Video=[${videoRGB.join(',')}], Diff=[${diff.join(',')}]`);
                
                if (totalDiff > 0) {
                    ShaderLogger.warn(`✗ captureStream() is introducing color differences (diff=${totalDiff})`);
                    ShaderLogger.warn('→ Problem is in canvas → MediaStream path, not MediaRecorder encoding');
                } else {
                    ShaderLogger.info('✓ captureStream() preserves colors correctly');
                    ShaderLogger.info('→ If recorded video differs, problem is in MediaRecorder/codec encoding');
                }
            }
        } catch (error) {
            ShaderLogger.warn('Pixel comparison failed:', error);
        }
        
        ShaderLogger.info('Live video element created - compare visually with WebGL canvas');
        ShaderLogger.info('If colors differ, problem is in captureStream(). If they match, problem is in MediaRecorder/codec.');
        
        return {
            videoElement: videoEl,
            matches: pixelComparison ? (pixelComparison.diff[0] + pixelComparison.diff[1] + pixelComparison.diff[2] === 0) : false,
            pixelComparison
        };
    }
    
    /**
     * Test captureStream() on 2D canvas populated via readPixels + putImageData
     * This tests if using a 2D canvas (instead of WebGL) avoids captureStream() color issues
     * @returns Video element and comparison results
     */
    async testCaptureStream2DCanvas(): Promise<{
        videoElement: HTMLVideoElement;
        matches: boolean;
        pixelComparison?: {
            canvasPixels: [number, number, number];
            videoPixels: [number, number, number];
            diff: [number, number, number];
        };
    }> {
        if (!this.recordingCanvas || !this.recordingGL) {
            throw new Error('Recording canvas not available');
        }
        
        ShaderLogger.info('=== Testing captureStream() → Live Video Element (2D Canvas) ===');
        
        // Cleanup any existing test video
        this.cleanupLiveStream2DTest();
        
        // Create temporary 2D canvas for testing
        const test2DCanvas = document.createElement('canvas');
        test2DCanvas.width = this.recordingCanvas.width;
        test2DCanvas.height = this.recordingCanvas.height;
        
        // Set color space to sRGB
        if ('colorSpace' in test2DCanvas) {
            (test2DCanvas as any).colorSpace = 'srgb';
        }
        
        const test2DCtx = test2DCanvas.getContext('2d', { colorSpace: 'srgb' });
        if (!test2DCtx) {
            throw new Error('Failed to create 2D context for test canvas');
        }
        
        // Copy from WebGL to 2D canvas using readPixels + putImageData
        const width = this.recordingCanvas.width;
        const height = this.recordingCanvas.height;
        const pixels = new Uint8Array(width * height * 4);
        
        this.recordingGL.readPixels(
            0, 0,
            width, height,
            this.recordingGL.RGBA,
            this.recordingGL.UNSIGNED_BYTE,
            pixels
        );
        
        // Flip pixels vertically (WebGL origin is bottom-left, 2D canvas is top-left)
        const flippedPixels = new Uint8Array(width * height * 4);
        const rowSize = width * 4;
        for (let y = 0; y < height; y++) {
            const srcRow = y * rowSize;
            const dstRow = (height - 1 - y) * rowSize;
            flippedPixels.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
        }
        
        // Create ImageData and put it on 2D canvas
        const imageData = new ImageData(
            new Uint8ClampedArray(flippedPixels),
            width,
            height
        );
        
        test2DCtx.putImageData(imageData, 0, 0);
        
        // Ensure 2D canvas has content before creating stream
        // Copy current frame from WebGL to 2D canvas
        if (this.recordingGL && this.recordingCanvas) {
            const pixels = new Uint8Array(width * height * 4);
            this.recordingGL.readPixels(0, 0, width, height, this.recordingGL.RGBA, this.recordingGL.UNSIGNED_BYTE, pixels);
            
            const imageData = new ImageData(
                new Uint8ClampedArray(pixels),
                width,
                height
            );
            
            const ctx = test2DCanvas.getContext('2d');
            if (ctx) {
                ctx.putImageData(imageData, 0, 0);
            }
        }
        
        // Create stream from 2D canvas
        const stream = test2DCanvas.captureStream(this.options!.fps);
        
        // Verify stream has video tracks
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
            throw new Error('Stream has no video tracks');
        }
        
        // Create video element
        const videoEl = document.createElement('video');
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.autoplay = true;
        videoEl.setAttribute('data-test', 'live-stream-2d-preview');
        
        // Style for side-by-side comparison (position next to WebGL test video)
        videoEl.style.position = 'fixed';
        videoEl.style.left = `${width * 0.5 + 20}px`; // Position next to WebGL test video
        videoEl.style.top = '0';
        videoEl.style.width = `${width}px`;
        videoEl.style.height = `${height}px`;
        videoEl.style.zIndex = '9999';
        videoEl.style.border = '2px solid blue';
        videoEl.style.backgroundColor = '#000';
        videoEl.style.transform = 'scale(0.5)';
        videoEl.style.transformOrigin = 'top left';
        
        // Add label
        const label = document.createElement('div');
        label.textContent = 'Live Stream (2D Canvas via readPixels) - Compare with WebGL canvas';
        label.setAttribute('data-test', 'live-stream-2d-label');
        label.style.position = 'fixed';
        label.style.left = `${width * 0.5 + 20}px`;
        label.style.top = '0';
        label.style.zIndex = '10000';
        label.style.color = 'white';
        label.style.backgroundColor = 'rgba(0,0,255,0.8)';
        label.style.padding = '4px 8px';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.transform = 'scale(0.5)';
        label.style.transformOrigin = 'top left';
        
        document.body.appendChild(videoEl);
        document.body.appendChild(label);
        
        // Wait for video to start playing with better error handling
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                // Don't reject - just warn and continue
                ShaderLogger.warn('Video element (2D) took too long to load - continuing anyway');
                resolve();
            }, 10000); // Increased timeout to 10 seconds
            
            // Try to play immediately
            const tryPlay = async () => {
                try {
                    await videoEl.play();
                    // Wait a bit for first frame
                    setTimeout(() => {
                        clearTimeout(timeout);
                        resolve();
                    }, 500);
                } catch (error) {
                    // If autoplay fails, wait for metadata
                    ShaderLogger.debug('Autoplay failed (2D), waiting for metadata...');
                }
            };
            
            videoEl.onloadedmetadata = () => {
                tryPlay().catch((error) => {
                    clearTimeout(timeout);
                    ShaderLogger.warn('Video play failed (2D), but continuing:', error);
                    resolve(); // Don't reject - just continue
                });
            };
            
            videoEl.onerror = (error) => {
                clearTimeout(timeout);
                ShaderLogger.warn('Video element error (2D), but continuing:', error);
                resolve(); // Don't reject - just continue
            };
            
            // Try playing immediately if metadata is already loaded
            if (videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
                tryPlay();
            }
        });
        
        // Wait for video to start and stabilize
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Update 2D canvas with current WebGL canvas content (whatever shader is active)
        // Note: In diagnostics mode, test pattern is already rendered earlier in the flow
        // For standalone testing, this will capture the current shader output
        // We need to continuously update the canvas so the stream picks up changes
        const updateCanvas = () => {
            if (!this.recordingGL || !test2DCtx) return;
            
            this.recordingGL.readPixels(
                0, 0,
                width, height,
                this.recordingGL.RGBA,
                this.recordingGL.UNSIGNED_BYTE,
                pixels
            );
            
            // Flip and update 2D canvas
            for (let y = 0; y < height; y++) {
                const srcRow = y * rowSize;
                const dstRow = (height - 1 - y) * rowSize;
                flippedPixels.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
            }
            
            const updatedImageData = new ImageData(
                new Uint8ClampedArray(flippedPixels),
                width,
                height
            );
            test2DCtx.putImageData(updatedImageData, 0, 0);
        };
        
        // Update immediately
        updateCanvas();
        
        // Continue updating on each frame so stream stays in sync with WebGL canvas
        // Store the update function so we can stop it later if needed
        const updateInterval = setInterval(() => {
            updateCanvas();
        }, 1000 / (this.options!.fps || 60)); // Update at the same rate as the stream
        
        // Store interval ID for cleanup
        (this as any)._test2DCanvasUpdateInterval = updateInterval;
        
        // Wait for video stream to update with new frame
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Optional: Compare pixels programmatically
        let pixelComparison: {
            canvasPixels: [number, number, number];
            videoPixels: [number, number, number];
            diff: [number, number, number];
        } | undefined;
        
        try {
            // Create probe canvas to read video frame
            const probeCanvas = document.createElement('canvas');
            probeCanvas.width = width;
            probeCanvas.height = height;
            const probeCtx = probeCanvas.getContext('2d', { colorSpace: 'srgb' });
            
            if (probeCtx) {
                // Draw video frame to probe canvas
                probeCtx.drawImage(videoEl, 0, 0);
                
                // Sample center pixel
                const centerX = Math.floor(width / 2);
                const centerY = Math.floor(height / 2);
                
                // Read from WebGL canvas
                const canvasPixels = new Uint8Array(4);
                this.recordingGL.readPixels(
                    centerX,
                    height - 1 - centerY, // Flip Y for WebGL coordinates
                    1, 1,
                    this.recordingGL.RGBA,
                    this.recordingGL.UNSIGNED_BYTE,
                    canvasPixels
                );
                
                // Read from video frame
                const videoImageData = probeCtx.getImageData(centerX, centerY, 1, 1);
                
                const canvasRGB: [number, number, number] = [canvasPixels[0], canvasPixels[1], canvasPixels[2]];
                const videoRGB: [number, number, number] = [videoImageData.data[0], videoImageData.data[1], videoImageData.data[2]];
                const diff: [number, number, number] = [
                    Math.abs(canvasRGB[0] - videoRGB[0]),
                    Math.abs(canvasRGB[1] - videoRGB[1]),
                    Math.abs(canvasRGB[2] - videoRGB[2])
                ];
                
                pixelComparison = { canvasPixels: canvasRGB, videoPixels: videoRGB, diff };
                
                const totalDiff = diff[0] + diff[1] + diff[2];
                ShaderLogger.info(`Pixel comparison (2D canvas, center): Canvas=[${canvasRGB.join(',')}], Video=[${videoRGB.join(',')}], Diff=[${diff.join(',')}]`);
                
                if (totalDiff > 0) {
                    ShaderLogger.warn(`✗ captureStream() on 2D canvas is introducing color differences (diff=${totalDiff})`);
                    ShaderLogger.warn('→ Problem is in captureStream() itself, not specific to WebGL canvas');
                } else {
                    ShaderLogger.info('✓ captureStream() on 2D canvas preserves colors correctly');
                    ShaderLogger.info('→ Solution: Use readPixels() + putImageData() + 2D canvas → captureStream()');
                }
            }
        } catch (error) {
            ShaderLogger.warn('Pixel comparison failed:', error);
        }
        
        ShaderLogger.info('Live video element (2D canvas) created - compare visually with WebGL canvas');
        ShaderLogger.info('If 2D canvas video matches WebGL but WebGL direct video does not, use 2D canvas approach');
        
        return {
            videoElement: videoEl,
            matches: pixelComparison ? (pixelComparison.diff[0] + pixelComparison.diff[1] + pixelComparison.diff[2] === 0) : false,
            pixelComparison
        };
    }
    
    /**
     * Cleanup live stream test video element (WebGL direct)
     */
    private cleanupLiveStreamTest(): void {
        const testVideo = document.querySelector('[data-test="live-stream-preview"]') as HTMLVideoElement;
        const testLabel = document.querySelector('[data-test="live-stream-label"]') as HTMLElement;
        
        if (testVideo) {
            if (testVideo.srcObject) {
                const stream = testVideo.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
            testVideo.srcObject = null;
            testVideo.remove();
        }
        if (testLabel) {
            testLabel.remove();
        }
    }
    
    /**
     * Cleanup live stream test video element (2D canvas)
     */
    private cleanupLiveStream2DTest(): void {
        const testVideo = document.querySelector('[data-test="live-stream-2d-preview"]') as HTMLVideoElement;
        const testLabel = document.querySelector('[data-test="live-stream-2d-label"]') as HTMLElement;
        
        // Stop the update interval if it exists
        const updateInterval = (this as any)._test2DCanvasUpdateInterval as number | undefined;
        if (updateInterval) {
            clearInterval(updateInterval);
            (this as any)._test2DCanvasUpdateInterval = undefined;
        }
        
        if (testVideo) {
            if (testVideo.srcObject) {
                const stream = testVideo.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
            testVideo.srcObject = null;
            testVideo.remove();
        }
        if (testLabel) {
            testLabel.remove();
        }
    }
    
    /**
     * Check and log WebGL context color space settings
     * Compares main and recording contexts to identify mismatches
     */
    checkWebGLColorSpaceSettings(): {
        main: {
            version: 'WebGL1' | 'WebGL2' | 'unknown';
            colorSpace: string;
            canvasWidth: number;
            canvasHeight: number;
        };
        recording: {
            version: 'WebGL1' | 'WebGL2' | 'unknown';
            colorSpace: string;
            canvasWidth: number;
            canvasHeight: number;
        };
        match: boolean;
    } {
        const mainGL = this.mainShaderInstance?.gl;
        const recordingGL = this.recordingGL;
        
        const mainInfo = {
            version: 'unknown' as 'WebGL1' | 'WebGL2' | 'unknown',
            colorSpace: 'unknown',
            canvasWidth: 0,
            canvasHeight: 0
        };
        
        const recordingInfo = {
            version: 'unknown' as 'WebGL1' | 'WebGL2' | 'unknown',
            colorSpace: 'unknown',
            canvasWidth: 0,
            canvasHeight: 0
        };
        
        // Check main context
        if (mainGL) {
            mainInfo.version = mainGL instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1';
            if (mainGL instanceof WebGL2RenderingContext && 'drawingBufferColorSpace' in mainGL) {
                mainInfo.colorSpace = (mainGL as any).drawingBufferColorSpace || 'default';
            } else {
                mainInfo.colorSpace = 'not supported (WebGL1)';
            }
            const mainCanvas = this.mainShaderInstance?.canvas;
            if (mainCanvas) {
                mainInfo.canvasWidth = mainCanvas.width;
                mainInfo.canvasHeight = mainCanvas.height;
            }
        }
        
        // Check recording context
        if (recordingGL) {
            recordingInfo.version = recordingGL instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1';
            if (recordingGL instanceof WebGL2RenderingContext && 'drawingBufferColorSpace' in recordingGL) {
                recordingInfo.colorSpace = (recordingGL as any).drawingBufferColorSpace || 'default';
            } else {
                recordingInfo.colorSpace = 'not supported (WebGL1)';
            }
            if (this.recordingCanvas) {
                recordingInfo.canvasWidth = this.recordingCanvas.width;
                recordingInfo.canvasHeight = this.recordingCanvas.height;
            }
        }
        
        const match = 
            mainInfo.version === recordingInfo.version &&
            mainInfo.colorSpace === recordingInfo.colorSpace;
        
        // Log detailed comparison
        ShaderLogger.info('=== WebGL Color Space Settings ===');
        ShaderLogger.info('Main Context:');
        ShaderLogger.info(`  Version: ${mainInfo.version}`);
        ShaderLogger.info(`  Color Space: ${mainInfo.colorSpace}`);
        ShaderLogger.info(`  Canvas Size: ${mainInfo.canvasWidth}x${mainInfo.canvasHeight}`);
        ShaderLogger.info('Recording Context:');
        ShaderLogger.info(`  Version: ${recordingInfo.version}`);
        ShaderLogger.info(`  Color Space: ${recordingInfo.colorSpace}`);
        ShaderLogger.info(`  Canvas Size: ${recordingInfo.canvasWidth}x${recordingInfo.canvasHeight}`);
        
        if (match) {
            ShaderLogger.info('✓ Contexts match');
        } else {
            ShaderLogger.warn('✗ Context mismatch detected!');
            if (mainInfo.version !== recordingInfo.version) {
                ShaderLogger.error(`  Version mismatch: Main=${mainInfo.version}, Recording=${recordingInfo.version}`);
            }
            if (mainInfo.colorSpace !== recordingInfo.colorSpace) {
                ShaderLogger.error(`  Color space mismatch: Main=${mainInfo.colorSpace}, Recording=${recordingInfo.colorSpace}`);
            }
        }
        
        return {
            main: mainInfo,
            recording: recordingInfo,
            match
        };
    }
    
    /**
     * Export current frame as PNG using drawImage() (same method as video capture)
     * This helps isolate whether color differences are introduced by:
     * - WebGL rendering (PNG will show difference)
     * - drawImage() conversion (PNG will show difference)
     * - Video encoding/playback (PNG matches, video doesn't)
     * @param useMainCanvas - If true, export from main canvas (browser display). If false, export from recording canvas.
     * @returns Promise that resolves with the exported PNG blob
     */
    async exportFrameAsPNG(useMainCanvas: boolean = true): Promise<Blob> {
        let sourceCanvas: HTMLCanvasElement | null = null;
        let sourceGL: WebGLRenderingContext | null = null;
        
        if (useMainCanvas) {
            // Export from main canvas (what user sees in browser)
            if (!this.mainShaderInstance?.canvas) {
                throw new Error('Main shader canvas not available');
            }
            sourceCanvas = this.mainShaderInstance.canvas;
            sourceGL = this.mainShaderInstance.gl;
        } else {
            // Export from recording canvas (what gets recorded)
            if (!this.recordingCanvas) {
                throw new Error('Recording canvas not available. Start recording first.');
            }
            sourceCanvas = this.recordingCanvas;
            sourceGL = this.recordingGL;
        }
        
        if (!sourceGL) {
            throw new Error('WebGL context not available');
        }
        
        // Create temporary 2D canvas with same dimensions
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = sourceCanvas.width;
        exportCanvas.height = sourceCanvas.height;
        
        // Set color space to match
        if ('colorSpace' in exportCanvas) {
            (exportCanvas as any).colorSpace = 'srgb';
        }
        
        const exportCtx = exportCanvas.getContext('2d', { 
            colorSpace: 'srgb',
            willReadFrequently: false
        });
        
        if (!exportCtx) {
            throw new Error('Failed to create 2D context for PNG export');
        }
        
        // For main canvas, use readPixels() (drawImage() may not work if preserveDrawingBuffer is false)
        // For recording canvas, use drawImage() to match video capture method
        if (useMainCanvas) {
            // Ensure shader is initialized
            if (!this.mainShaderInstance?.isInitialized) {
                throw new Error('Main shader is not initialized');
            }
            
            // Get audio data and colors from render loop
            const renderLoop = this.mainShaderInstance.renderLoop;
            const audioAnalyzer = (renderLoop as any).audioAnalyzer;
            const audioData = audioAnalyzer ? audioAnalyzer.getData() : null;
            const colors = renderLoop.getColors();
            
            // CRITICAL: Render and read pixels IMMEDIATELY (synchronously)
            // With preserveDrawingBuffer: false, the buffer is cleared after presentation
            // So we must read pixels right after render, before any async operations
            
            // Temporarily disable frame skipping to ensure render happens
            const originalLastFrameTime = this.mainShaderInstance.lastFrameTime;
            this.mainShaderInstance.lastFrameTime = 0; // Force render by resetting last frame time
            
            ShaderLogger.debug('Calling render() before reading pixels...');
            this.mainShaderInstance.render(audioData, colors);
            
            // Restore last frame time
            this.mainShaderInstance.lastFrameTime = originalLastFrameTime;
            
            // Use readPixels() for main canvas
            const width = sourceCanvas.width;
            const height = sourceCanvas.height;
            
            ShaderLogger.debug(`Exporting PNG from main canvas: ${width}x${height}`);
            
            // Ensure we're reading from the default framebuffer (canvas)
            sourceGL.bindFramebuffer(sourceGL.FRAMEBUFFER, null);
            
            // Ensure viewport matches canvas size (readPixels uses viewport coordinates)
            // The render() method should have set this, but ensure it's correct
            sourceGL.viewport(0, 0, width, height);
            
            // Ensure we're using the correct WebGL context
            // The render() method uses the shader's GL context, so we should be reading from the same context
            // But let's make sure the context is active
            const currentFramebuffer = sourceGL.getParameter(sourceGL.FRAMEBUFFER_BINDING);
            ShaderLogger.debug(`Current framebuffer binding: ${currentFramebuffer} (0 = default framebuffer)`);
            
            const pixels = new Uint8Array(width * height * 4);
            
            // Read pixels IMMEDIATELY after render (synchronously, no await)
            // This is critical because preserveDrawingBuffer: false clears the buffer after presentation
            ShaderLogger.debug('Reading pixels from WebGL context...');
            sourceGL.readPixels(
                0,
                0,
                width,
                height,
                sourceGL.RGBA,
                sourceGL.UNSIGNED_BYTE,
                pixels
            );
            
            // Check for WebGL errors
            const error = sourceGL.getError();
            if (error !== sourceGL.NO_ERROR) {
                ShaderLogger.warn(`WebGL error after readPixels: ${error}`);
            }
            
            // Check if we got any non-black pixels
            let nonBlackPixels = 0;
            let maxValue = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                if (r > 0 || g > 0 || b > 0) {
                    nonBlackPixels++;
                }
                maxValue = Math.max(maxValue, r, g, b);
            }
            ShaderLogger.debug(`Read pixels: ${nonBlackPixels} non-black pixels out of ${width * height} total, max value: ${maxValue}`);
            
            // If all pixels are black, try drawImage() as fallback
            // Some browsers might allow drawImage() even with preserveDrawingBuffer: false
            if (nonBlackPixels === 0) {
                ShaderLogger.warn('All pixels are black from readPixels() - trying drawImage() fallback...');
                ShaderLogger.warn('This could indicate:');
                ShaderLogger.warn('  1. Shader render() was skipped (frame rate throttling)');
                ShaderLogger.warn('  2. Canvas is not visible/rendered');
                ShaderLogger.warn('  3. preserveDrawingBuffer: false cleared buffer before read');
                
                // Try drawImage() as fallback
                exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
                exportCtx.drawImage(sourceCanvas, 0, 0);
                
                // Check if drawImage() worked
                const testImageData = exportCtx.getImageData(
                    Math.floor(exportCanvas.width / 2),
                    Math.floor(exportCanvas.height / 2),
                    1,
                    1
                );
                const drawImageWorked = testImageData.data[0] > 0 || 
                                      testImageData.data[1] > 0 || 
                                      testImageData.data[2] > 0;
                
                if (drawImageWorked) {
                    ShaderLogger.info('drawImage() fallback succeeded!');
                    // drawImage() already copied to exportCanvas, we're done
                } else {
                    ShaderLogger.error('Both readPixels() and drawImage() returned black pixels');
                    ShaderLogger.error('Canvas may not be rendering or is not visible');
                }
            } else {
                // readPixels() worked, flip and use those pixels
                // Flip pixels vertically (WebGL origin is bottom-left, canvas is top-left)
                const flippedPixels = new Uint8Array(width * height * 4);
                for (let y = 0; y < height; y++) {
                    const srcRow = height - 1 - y;
                    const srcOffset = srcRow * width * 4;
                    const dstOffset = y * width * 4;
                    flippedPixels.set(pixels.subarray(srcOffset, srcOffset + width * 4), dstOffset);
                }
                
                // Create ImageData and put it on 2D canvas
                const imageData = new ImageData(
                    new Uint8ClampedArray(flippedPixels),
                    width,
                    height
                );
                
                exportCtx.putImageData(imageData, 0, 0);
            }
        } else {
            // Use drawImage() for recording canvas (same method as video capture)
            exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
            exportCtx.drawImage(sourceCanvas, 0, 0);
        }
        
        // Export as PNG
        return new Promise((resolve, reject) => {
            exportCanvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to export PNG'));
                }
            }, 'image/png');
        });
    }
    
    /**
     * Cleanup resources
     */
    private cleanup(): void {
        // Cleanup WebCodecs resources
        if (this.isWebCodecsMode) {
            // Stop audio processing
            if (this.audioProcessorNode) {
                this.audioProcessorNode.disconnect();
                this.audioProcessorNode = null;
            }
            
            if (this.audioSourceNode) {
                this.audioSourceNode.disconnect();
                this.audioSourceNode = null;
            }
            
            if (this.audioContext) {
                this.audioContext.close().catch(() => {
                    // Silent fail on cleanup
                });
                this.audioContext = null;
            }
            
            // Close encoders
            if (this.videoEncoder && this.videoEncoder.state !== 'closed') {
                this.videoEncoder.close();
                this.videoEncoder = null;
            }
            
            if (this.audioEncoder && this.audioEncoder.state !== 'closed') {
                this.audioEncoder.close();
                this.audioEncoder = null;
            }
            
            // Clear chunks
            this.videoChunks = [];
            this.audioChunks = [];
            
            // Clear muxer and target
            this.muxer = null;
            this.muxerTarget = null;
            
            this.isWebCodecsMode = false;
        } else {
            // Cleanup MediaRecorder resources
            // Stop streams
            if (this.videoStream) {
                this.videoStream?.getTracks().forEach(track => track.stop());
                this.videoStream = null;
            }
            
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }
            
            // Cleanup MediaRecorder
            if (this.mediaRecorder) {
                if (this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                }
                this.mediaRecorder = null;
            }
        }
        
        // Cleanup WebGL resources
        if (this.recordingGL && this.recordingShader) {
            // TODO: Properly cleanup shader resources
            // gl.deleteProgram, gl.deleteBuffer, etc.
        }
        
        // Remove canvases from DOM
        if (this.recordingCanvas && this.recordingCanvas.parentNode) {
            this.recordingCanvas.parentNode.removeChild(this.recordingCanvas);
        }
        
        // Cleanup capture canvas only if it exists
        if (this.captureCanvas && this.captureCanvas.parentNode) {
            this.captureCanvas.parentNode.removeChild(this.captureCanvas);
        }
        
        // Cleanup live stream test video elements
        this.cleanupLiveStreamTest();
        this.cleanupLiveStream2DTest();
        
        // Clear references
        this.recordingCanvas = null;
        this.recordingGL = null;
        this.recordingShader = null;
        this.captureCanvas = null;
        this.captureCtx = null;
        this.lastCapturedFrame = -1;
        this.lastRenderTime = 0;
        this.lastAudioTimestamp = null; // Reset audio timestamp tracking
        this.chunks = [];
        
        this.setState('idle');
    }
}

