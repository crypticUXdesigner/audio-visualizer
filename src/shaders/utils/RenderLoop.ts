// Render Loop
// Manages the rendering loop for a shader instance

import { ShaderLogger } from './ShaderLogger.js';
import type { ExtendedAudioData } from '../../types/index.js';
import type { AudioAnalyzer } from '../../core/audio/AudioAnalyzer.js';
import type { ShaderInstance } from '../ShaderInstance.js';
import type { Colors } from '../../types/webgl.js';

export class RenderLoop {
    private renderLoopId: number | null = null;
    private audioAnalyzer: AudioAnalyzer | null = null;
    private colors: Colors | null = null;
    private shaderInstance: ShaderInstance;
    private shaderManager: { 
        colorUpdateCallback?: (data: ExtendedAudioData) => void;
        colors?: Colors;
        onFirstColorUpdate?: () => void;
    } | null = null;
    
    constructor(shaderInstance: ShaderInstance) {
        this.shaderInstance = shaderInstance;
    }
    
    /**
     * Set the shader manager reference for color updates
     */
    setShaderManager(shaderManager: { 
        colorUpdateCallback?: (data: ExtendedAudioData) => void;
        colors?: Colors;
        onFirstColorUpdate?: () => void;
    } | null): void {
        this.shaderManager = shaderManager;
    }
    
    /**
     * Start the render loop
     * Continuously renders frames using requestAnimationFrame
     * @param audioAnalyzer - Audio analyzer instance
     * @param colors - Initial color values (optional)
     */
    start(audioAnalyzer: AudioAnalyzer, colors: Colors | null): void {
        // Stop existing loop if running
        if (this.renderLoopId) {
            this.stop();
        }
        
        // Store references for render loop
        this.audioAnalyzer = audioAnalyzer;
        this.colors = colors;
        
        // Initialize colors in ColorTransitionManager if provided
        if (colors && this.shaderInstance.colorTransitionManager) {
            const isFirstColorUpdate = !this.shaderInstance.colorTransitionManager.currentColors;
            this.shaderInstance.colorTransitionManager.startTransition(colors, isFirstColorUpdate);
        }
        
        const render = (): void => {
            if (this.shaderInstance.webglFallbackActive || 
                this.shaderInstance.webglContext.webglFallbackActive) {
                // Skip rendering if WebGL fallback is active
                this.renderLoopId = requestAnimationFrame(render);
                return;
            }
            
            if (this.audioAnalyzer) {
                this.audioAnalyzer.update();
            }
            
            // Get audio data
            const audioData = this.audioAnalyzer ? this.audioAnalyzer.getData() : null;
            
            // Update dynamic colors if callback is set (called before render)
            if (audioData && this.shaderManager?.colorUpdateCallback) {
                this.shaderManager.colorUpdateCallback(audioData);
                // Colors may have been updated, refresh reference
                if (this.shaderManager.colors) {
                    this.colors = this.shaderManager.colors;
                }
            }
            
            // Always use current colors reference (may have been updated)
            const frameStartTime = performance.now();
            const previousFrameTime = this.shaderInstance.lastFrameTime;
            
            // Check quality BEFORE recording frame to detect changes
            const previousQuality = this.shaderInstance.performanceMonitor.getQualityLevel();
            
            // Measure performance and check for quality changes
            if (previousFrameTime > 0) {
                const elapsed = frameStartTime - previousFrameTime;
                this.shaderInstance.performanceMonitor.recordFrame(elapsed, null);
            } else {
                // First frame: estimate frame time based on target FPS
                const estimatedFrameTime = 1000 / this.shaderInstance.performanceMonitor.targetFPS;
                this.shaderInstance.performanceMonitor.recordFrame(estimatedFrameTime, null);
            }
            
            // Check if quality changed AFTER recording frame
            const currentQuality = this.shaderInstance.performanceMonitor.getQualityLevel();
            const qualityChanged = previousQuality !== currentQuality;
            
            // Apply quality change immediately before rendering
            if (qualityChanged) {
                ShaderLogger.debug(`Quality changed from ${(previousQuality * 100).toFixed(0)}% to ${(currentQuality * 100).toFixed(0)}% - resizing`);
                this.shaderInstance.resize();
            }
            
            this.shaderInstance.render(audioData, this.colors);
            
            this.renderLoopId = requestAnimationFrame(render);
        };
        
        this.renderLoopId = requestAnimationFrame(render);
    }
    
    /**
     * Stop the render loop
     */
    stop(): void {
        if (this.renderLoopId) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
    }
    
    /**
     * Update colors in the render loop without restarting
     * Starts a smooth transition from current colors to new colors
     * @param colors - New colors object with color, color2, etc. properties
     */
    updateColors(colors: Colors): void {
        if (!colors) return;
        
        const isFirstColorUpdate = !this.colors || 
            !this.shaderInstance.colorTransitionManager.currentColors;
        this.colors = colors;
        this.shaderInstance.colorTransitionManager.startTransition(colors, isFirstColorUpdate);
    }
    
    /**
     * Get current colors
     */
    getColors(): Colors | null {
        return this.colors;
    }
    
    /**
     * Get current audio analyzer
     */
    getAudioAnalyzer(): AudioAnalyzer | null {
        return this.audioAnalyzer;
    }
    
    /**
     * Check if render loop is running
     */
    isRunning(): boolean {
        return this.renderLoopId !== null;
    }
}

