// Shader Initializer
// Handles shader initialization, context setup, and context restoration

import { ShaderCompiler } from '../utils/ShaderCompiler.js';
import { ShaderError, ErrorCodes } from '../utils/ShaderErrors.js';
import { ShaderLogger } from '../utils/ShaderLogger.js';
import { safeCaptureException } from '../../core/monitoring/SentryInit.js';
import type { ShaderConfig } from '../../types/index.js';
import type { WebGLContextManager } from '../managers/WebGLContextManager.js';
import type { BaseShaderPlugin } from '../plugins/BaseShaderPlugin.js';
import type { UniformManager } from '../managers/UniformManager.js';
import type { TextureManager } from '../managers/TextureManager.js';
import type { UniformLocationCache } from '../managers/UniformLocationCache.js';
import type { RenderLoop } from '../utils/RenderLoop.js';
import type { EventListenerManager } from '../../utils/eventListenerManager.js';
import type { UniformLocations } from '../../types/shader.js';
import type { LastUniformValues } from '../../types/shader.js';

export interface ShaderInitContext {
    config: ShaderConfig;
    webglContext: WebGLContextManager;
    canvasId: string;
    plugin: BaseShaderPlugin | null;
    onInit?: (instance: unknown) => void;
    onContextLost?: () => void;
    onContextRestored?: () => Promise<void>;
    resize: () => void;
    eventListenerManager: EventListenerManager;
    renderLoop: RenderLoop;
    lastUniformValues: LastUniformValues;
}

export interface ShaderInitResult {
    gl: WebGLRenderingContext;
    canvas: HTMLCanvasElement;
    ext: OES_standard_derivatives | null;
    program: WebGLProgram;
    quadBuffer: WebGLBuffer;
    uniformLocations: UniformLocations;
    uniformManager: UniformManager;
    textureManager: TextureManager;
    uniformLocationCache: UniformLocationCache;
    webglFallbackActive: boolean;
}

export class ShaderInitializer {
    /**
     * Initialize the shader instance
     * Loads and compiles shaders, sets up WebGL context, initializes managers
     * @param context - Initialization context
     * @returns Promise that resolves with initialization result
     */
    static async init(context: ShaderInitContext): Promise<ShaderInitResult | null> {
        const {
            config,
            webglContext,
            plugin,
            resize,
            eventListenerManager,
            lastUniformValues
        } = context;

        try {
            // Get WebGL context from manager
            const initialized = await webglContext.initialize();
            if (!initialized) {
                return null;
            }

            // Get references from context manager
            const gl = webglContext.gl;
            const canvas = webglContext.canvas;
            const ext = webglContext.ext;
            const hasDerivatives = !!ext;

            if (!gl || !canvas) {
                throw new ShaderError('WebGL context or canvas not available', ErrorCodes.NOT_INITIALIZED);
            }

            // Compile shader using ShaderCompiler
            // Convert LastUniformValues to Record<string, ParameterValue> for ShaderCompiler
            const uniformValuesForCompiler = lastUniformValues as Record<string, number | number[] | [number, number, number] | [number, number, number, number] | undefined>;
            const compiled = await ShaderCompiler.compile(
                gl,
                config,
                hasDerivatives,
                uniformValuesForCompiler
            );

            // Setup resize handler
            resize();
            const resizeHandler = () => resize();
            eventListenerManager.add(window, 'resize', resizeHandler);

            // Note: Custom init hook is called separately in ShaderInstance
            // to ensure proper instance reference

            // Plugin onInit() is now called AFTER textureManager is assigned to shaderInstance
            // This is done in ShaderInstance.init() to ensure all managers are available

            ShaderLogger.info(`ShaderInstance ${config.name} initialized`);

            return {
                gl,
                canvas,
                ext,
                program: compiled.program,
                quadBuffer: compiled.quadBuffer,
                uniformLocations: compiled.uniformLocations,
                uniformManager: compiled.uniformManager,
                textureManager: compiled.textureManager,
                uniformLocationCache: compiled.uniformLocationCache,
                webglFallbackActive: false
            };
        } catch (error) {
            ShaderLogger.error(`Failed to initialize shader ${config.name}:`, error);
            
            // Show fallback UI
            if (webglContext) {
                webglContext.showWebGLFallback();
            }

            // Don't throw - allow app to continue in degraded mode
            safeCaptureException(error as Error);

            return null;
        }
    }

    /**
     * Reinitialize shader after WebGL context restoration
     * @param context - Initialization context
     * @param existingProgram - Existing program (may be null)
     * @param existingQuadBuffer - Existing quad buffer (may be null)
     * @param existingTextureManager - Existing texture manager (may be null)
     * @param lastUniformValues - Last uniform values for optimization
     * @param renderLoop - Render loop instance
     * @returns Promise that resolves with reinitialization result, or null if failed
     */
    static async reinitializeAfterContextRestore(
        context: ShaderInitContext,
        existingProgram: WebGLProgram | null,
        existingQuadBuffer: WebGLBuffer | null,
        existingTextureManager: TextureManager | null,
        lastUniformValues: LastUniformValues,
        renderLoop: RenderLoop
    ): Promise<ShaderInitResult | null> {
        const {
            config,
            webglContext,
            plugin
        } = context;

        if (!webglContext || !webglContext.gl) {
            return false;
        }

        try {
            // Re-get context references
            const gl = webglContext.gl;
            const canvas = webglContext.canvas;
            const ext = webglContext.ext;
            const hasDerivatives = !!ext;

            if (!gl || !canvas) {
                return false;
            }

            // Recompile shader using ShaderCompiler
            // Convert LastUniformValues to Record<string, ParameterValue> for ShaderCompiler
            const uniformValuesForCompiler = lastUniformValues as Record<string, number | number[] | [number, number, number] | [number, number, number, number] | undefined>;
            const compiled = await ShaderCompiler.recompile(
                gl,
                config,
                hasDerivatives,
                existingProgram,
                existingQuadBuffer,
                existingTextureManager,
                uniformValuesForCompiler
            );

            // Call plugin reinit hook if it exists
            // Note: onContextRestored is not in BaseShaderPlugin interface but may be implemented by plugins
            if (plugin && 'onContextRestored' in plugin && typeof plugin.onContextRestored === 'function') {
                plugin.onContextRestored();
            }

            // Restart render loop if it was running
            const audioAnalyzer = renderLoop.getAudioAnalyzer();
            const colors = renderLoop.getColors();
            if (audioAnalyzer && colors) {
                renderLoop.start(audioAnalyzer, colors);
            }

            ShaderLogger.info(`ShaderInstance ${config.name} reinitialized after context restore`);
            
            return {
                gl,
                canvas,
                ext,
                program: compiled.program,
                quadBuffer: compiled.quadBuffer,
                uniformLocations: compiled.uniformLocations,
                uniformManager: compiled.uniformManager,
                textureManager: compiled.textureManager,
                uniformLocationCache: compiled.uniformLocationCache,
                webglFallbackActive: false
            };
        } catch (error) {
            ShaderLogger.error('Failed to restore WebGL context:', error);
            // Ensure fallback UI is shown if context restoration fails
            if (webglContext) {
                webglContext.showWebGLFallback();
            }
            return null;
        }
    }
}

