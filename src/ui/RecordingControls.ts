// Recording Controls Component
// Handles recording button and coordinates VideoRecorder with RecordingOverlay

import { VideoRecorder, type RecordingOptions, type RecordingProgress, type RecordingState } from '../core/services/VideoRecorder.js';
import { RecordingOverlay } from './RecordingOverlay.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import type { VisualPlayer } from '../core/App.js';
import type { AudioControls } from './PlaybackControls.js';

export class RecordingControls {
    private recordingBtn: HTMLElement | null = null;
    private recordingOverlay: RecordingOverlay;
    private videoRecorder: VideoRecorder;
    private app: VisualPlayer | null = null;
    private audioControls: AudioControls | null = null;
    private isMenuOpen: boolean = false;
    
    constructor(audioControls: AudioControls | null = null) {
        this.audioControls = audioControls;
        this.recordingOverlay = new RecordingOverlay(audioControls);
        this.videoRecorder = new VideoRecorder();
        this.init();
    }
    
    /**
     * Initialize recording controls
     */
    init(): void {
        // Get recording button
        this.recordingBtn = document.getElementById('recordingBtn');
        if (!this.recordingBtn) {
            ShaderLogger.warn('Recording button not found');
            return;
        }
        
        // Setup button click handler
        this.recordingBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            if (this.isMenuOpen) {
                this.closeMenu();
            } else {
                this.openMenu();
            }
        });
        
        // Close when clicking outside (similar to other menus)
        document.addEventListener('click', (e: MouseEvent) => {
            if (this.isMenuOpen) {
                const target = e.target as Node;
                const recordingMenu = document.getElementById('recordingMenu');
                
                // Close if clicking outside both the button and the menu
                if (this.recordingBtn && !this.recordingBtn.contains(target) &&
                    recordingMenu && !recordingMenu.contains(target)) {
                    this.closeMenu();
                }
            }
        });
        
        // Setup overlay callbacks
        this.recordingOverlay.setCallbacks({
            onStart: () => this.startRecording(),
            onCancel: () => this.cancelRecording()
        });
        
        // Setup video recorder callbacks
        this.videoRecorder.setCallbacks({
            onProgress: (progress) => this.handleProgress(progress),
            onStateChange: (state) => this.handleStateChange(state),
            onError: (error) => this.handleError(error),
            onComplete: (blob) => this.handleComplete(blob)
        });
        
        // Setup PNG export button handler
        const exportPngBtn = document.getElementById('exportPngBtn');
        if (exportPngBtn) {
            exportPngBtn.addEventListener('click', () => {
                this.exportFrameAsPNG();
            });
        }
    }
    
    /**
     * Set app reference for accessing shader manager and audio analyzer
     */
    setApp(app: VisualPlayer): void {
        this.app = app;
    }
    
    /**
     * Open recording menu
     */
    openMenu(): void {
        this.isMenuOpen = true;
        this.recordingOverlay.open();
    }
    
    /**
     * Close recording menu
     */
    closeMenu(): void {
        this.isMenuOpen = false;
        this.recordingOverlay.close();
    }
    
    /**
     * Start recording
     */
    async startRecording(): Promise<void> {
        if (!this.app) {
            this.recordingOverlay.showError('App not initialized');
            return;
        }
        
        const shaderManager = this.app.shaderManager;
        const audioAnalyzer = this.app.audioAnalyzer;
        const colorService = this.app.colorService;
        
        if (!shaderManager || !audioAnalyzer) {
            this.recordingOverlay.showError('Shader manager or audio analyzer not available');
            return;
        }
        
        const activeShader = shaderManager.activeShader;
        if (!activeShader) {
            this.recordingOverlay.showError('No active shader');
            return;
        }
        
        // Get audio element from audio analyzer
        const audioElement = audioAnalyzer.audioElement;
        if (!audioElement || !audioElement.duration || !isFinite(audioElement.duration)) {
            this.recordingOverlay.showError('Audio not loaded or ready');
            return;
        }
        
        // Get current colors
        const colors = colorService ? colorService.getColors() : null;
        
        // Get codec selection from UI
        const codecSelect = document.getElementById('codecSelect') as HTMLSelectElement | null;
        const selectedCodec = codecSelect?.value as 'vp9' | 'vp8' | 'h264' | 'av1' | 'auto' | undefined;
        
        // For testing: codec override (forces specific codec, overrides preference)
        // Set to 'vp8' or 'h264' to test different codecs for color accuracy
        // undefined = use codec preference from UI
        const codecOverride: 'vp9' | 'vp8' | 'h264' | 'av1' | undefined = undefined;
        
        // Recording options (1440p target resolution, 60fps)
        // DPR is used for shader parameters (pixel size, etc.) but canvas renders at target resolution
        const options: RecordingOptions = {
            width: 2560,
            height: 1440,
            dpr: 1.5, // Used for shader parameters (uDevicePixelRatio, uPixelSize), not canvas size
            fps: 60,
            videoBitrate: 60000000, // 60 Mbps for higher quality
            audioElement: audioElement,
            codec: selectedCodec || 'auto', // Use selected codec or default to 'auto'
            codecOverride: codecOverride, // Force specific codec for testing (overrides codec preference)
            // Use WebCodecs API instead of MediaRecorder (provides explicit color space control)
            // This should provide better color accuracy than MediaRecorder
            useWebCodecs: true, // Enable WebCodecs for better color control
            // Use direct WebGL capture to bypass drawImage() color conversion
            // This eliminates color space conversion issues by capturing directly from WebGL canvas
            useDirectWebGLCapture: true, // Enable direct WebGL capture for better color accuracy
            // Run color diagnostics after initialization (Phase 0 tests)
            // This automatically tests WebGL rendering to identify color differences
            runDiagnostics: true, // Enable diagnostics by default
            // Optional: Configure color adjustments for recording
            // All adjustments are DISABLED by default to match browser display exactly
            // Enable and configure these only if you need to compensate for color space differences
            colorAdjustments: {
                 toneCurve: {
                     enabled: false,  // DISABLED: No tone curve adjustment
                     x1: 0.0, y1: 0.0,  // Identity curve: maps input directly to output
                     x2: 1.0, y2: 1.0   // Linear mapping (no change)
                 },
                 brightness: {
                     enabled: false,  // DISABLED: No brightness adjustment
                     x1: 0.0, y1: 0.0,  // Identity curve
                     x2: 1.0, y2: 1.0
                 },
                 contrast: {
                     enabled: false,  // DISABLED: No contrast adjustment
                     x1: 0.0, y1: 0.0,  // Identity curve
                     x2: 1.0, y2: 1.0
                 },
                 saturation: {
                     enabled: false,  // DISABLED: No saturation adjustment
                     x1: 0.0, y1: 0.0,  // Identity curve
                     x2: 1.0, y2: 1.0
                 },
                 oklch: {
                     lightness: {
                         enabled: false,  // DISABLED: No OKLCH lightness adjustment
                         x1: 0.0, y1: 0.0,  // Identity: maps input 0→0
                         x2: 1.0, y2: 1.0   // Identity: maps input 1→1 (linear, no change)
                         },
                         chroma: {
                             enabled: false,  // DISABLED: No OKLCH chroma adjustment
                             x1: 0.0, y1: 0.0,  // Identity: linear mapping (no change)
                             x2: 1.0, y2: 1.0
                         },
                         hue: {
                             enabled: false,  // DISABLED: No OKLCH hue adjustment
                             x1: 0.0, y1: 0.0,  // Identity: linear mapping (no change)
                             x2: 1.0, y2: 1.0
                         }
                     }
            }
            // Example with RGB-based adjustments (legacy):
            // colorAdjustments: {
            //     brightness: {
            //         enabled: true,
            //         x1: 0.0, y1: 1.0,  // Identity curve: always returns 1.0 (no change)
            //         x2: 1.0, y2: 1.0
            //     },
            //     contrast: { enabled: false, x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 },
            //     saturation: { enabled: false, x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 }
            // }
        };
        
        try {
            // Check if any color adjustments are enabled (only log if enabled)
            if (options.colorAdjustments) {
                const enabledAdjustments = [];
                if (options.colorAdjustments.toneCurve?.enabled) enabledAdjustments.push('toneCurve');
                if (options.colorAdjustments.brightness?.enabled) enabledAdjustments.push('brightness');
                if (options.colorAdjustments.contrast?.enabled) enabledAdjustments.push('contrast');
                if (options.colorAdjustments.saturation?.enabled) enabledAdjustments.push('saturation');
                if (options.colorAdjustments.oklch?.lightness?.enabled) enabledAdjustments.push('oklch.lightness');
                if (options.colorAdjustments.oklch?.chroma?.enabled) enabledAdjustments.push('oklch.chroma');
                if (options.colorAdjustments.oklch?.hue?.enabled) enabledAdjustments.push('oklch.hue');
            
                if (enabledAdjustments.length > 0) {
                    ShaderLogger.warn(`Recording color adjustments enabled: ${enabledAdjustments.join(', ')}`);
                }
            }
            
            // Reset progress
            this.recordingOverlay.resetProgress();
            
            // Start recording
            await this.videoRecorder.startRecording(
                activeShader,
                audioAnalyzer,
                colors,
                options
            );
            
            // Render frames
            await this.videoRecorder.renderFrames(colors);
            
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            ShaderLogger.error('Recording failed:', err);
            this.recordingOverlay.showError(err.message);
        }
    }
    
    /**
     * Cancel recording
     */
    cancelRecording(): void {
        this.videoRecorder.cancelRecording();
    }
    
    /**
     * Handle recording progress
     */
    private handleProgress(progress: RecordingProgress): void {
        this.recordingOverlay.updateProgress(progress);
        
        // Update preview if recording canvas is available
        // TODO: Get preview from recording canvas
        // For now, we'll update this when we implement preview capture
    }
    
    /**
     * Handle recording state change
     */
    private handleStateChange(state: RecordingState): void {
        this.recordingOverlay.updateState(state);
        
        if (state === 'complete' || state === 'cancelled' || state === 'error') {
            // Reset recorder state to allow new recording
            // Cleanup is already handled by VideoRecorder, but ensure state is reset
            if (state === 'complete') {
                // Auto-close menu after a delay
                setTimeout(() => {
                    this.closeMenu();
                }, 2000);
            } else {
                // For cancelled/error, keep menu open but allow new recording
                // State will be reset to 'idle' by VideoRecorder cleanup
            }
        }
    }
    
    /**
     * Handle recording error
     */
    private handleError(error: Error): void {
        ShaderLogger.error('Recording error:', error);
        this.recordingOverlay.showError(error.message);
    }
    
    /**
     * Handle recording completion
     */
    private handleComplete(blob: Blob): void {
        // Validate blob before attempting download
        if (!blob || blob.size === 0) {
            ShaderLogger.error('Recording failed: blob is empty or invalid');
            this.recordingOverlay.showError('Recording failed: invalid video data');
            return;
        }
        
        // Generate filename with proper sanitization
        const trackName = this.audioControls?.trackDropdownText?.textContent || 'visualization';
        // Sanitize: replace non-alphanumeric with single dash, remove multiple dashes, ensure .webm extension
        let sanitized = trackName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        sanitized = sanitized.replace(/-+/g, '-'); // Replace multiple dashes with single dash
        sanitized = sanitized.replace(/^-|-$/g, ''); // Remove leading/trailing dashes
        if (!sanitized) sanitized = 'visualization'; // Fallback if sanitization removes everything
        
        const timestamp = Date.now();
        const filename = `${sanitized}-${timestamp}.webm`;
        
        ShaderLogger.info(`Downloading recording: ${filename}, size: ${(blob.size / 1024 / 1024).toFixed(2)} MB, type: ${blob.type}`);
        
        // Use the blob directly - it already has the correct MIME type
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        // Trigger download immediately
        document.body.appendChild(a);
        a.click();
        
        // Cleanup after a short delay
        setTimeout(() => {
            if (a.parentNode) {
                document.body.removeChild(a);
            }
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    /**
     * Export current frame as PNG
     * Uses the same drawImage() method as video capture to help isolate color differences
     */
    private async exportFrameAsPNG(): Promise<void> {
        if (!this.app?.shaderManager?.activeShader) {
            ShaderLogger.warn('No active shader to export');
            return;
        }
        
        const activeShader = this.app.shaderManager.activeShader;
        
        // Temporarily set main shader instance for export
        // (exportFrameAsPNG needs access to mainShaderInstance.canvas)
        const originalMainShader = (this.videoRecorder as any).mainShaderInstance;
        (this.videoRecorder as any).mainShaderInstance = activeShader;
        
        try {
            // Export from main canvas (what user sees in browser)
            const blob = await this.videoRecorder.exportFrameAsPNG(true);
            
            // Generate filename
            const trackName = this.audioControls?.trackDropdownText?.textContent || 'visualization';
            const sanitized = trackName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
            const timestamp = Date.now();
            const filename = `frame-${sanitized}-${timestamp}.png`;
            
            // Download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                if (a.parentNode) {
                    document.body.removeChild(a);
                }
                URL.revokeObjectURL(url);
            }, 100);
            
            ShaderLogger.info(`Exported frame as PNG: ${filename}`);
        } catch (error) {
            ShaderLogger.error('Failed to export PNG:', error);
            const err = error instanceof Error ? error : new Error(String(error));
            ShaderLogger.error('Export error details:', err);
        } finally {
            // Restore original main shader instance
            (this.videoRecorder as any).mainShaderInstance = originalMainShader;
        }
    }
    
}

