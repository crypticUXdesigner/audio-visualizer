// Recording Overlay UI Component
// Manages the recording overlay UI with progress, preview, and controls

import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import type { AudioControls } from './PlaybackControls.js';
import type { RecordingProgress, RecordingState } from '../core/services/VideoRecorder.js';

export class RecordingOverlay {
    private recordingMenu: HTMLElement | null = null;
    private previewCanvas: HTMLCanvasElement | null = null;
    private previewCtx: CanvasRenderingContext2D | null = null;
    private progressBar: HTMLElement | null = null;
    private progressFill: HTMLElement | null = null;
    private currentFrameText: HTMLElement | null = null;
    private totalFramesText: HTMLElement | null = null;
    private timeRemainingText: HTMLElement | null = null;
    private startButton: HTMLElement | null = null;
    private cancelButton: HTMLElement | null = null;
    private errorMessage: HTMLElement | null = null;
    
    private isMenuOpen: boolean = false;
    private audioControls: AudioControls | null = null;
    
    private onStartCallback: (() => void) | null = null;
    private onCancelCallback: (() => void) | null = null;
    
    constructor(audioControls: AudioControls | null = null) {
        this.audioControls = audioControls;
        this.init();
    }
    
    /**
     * Initialize the recording overlay
     */
    init(): void {
        // Get menu element
        this.recordingMenu = document.getElementById('recordingMenu');
        if (!this.recordingMenu) {
            ShaderLogger.warn('Recording menu element not found');
            return;
        }
        
        // Get preview canvas
        const previewCanvasEl = document.getElementById('recordingPreviewCanvas');
        if (previewCanvasEl instanceof HTMLCanvasElement) {
            this.previewCanvas = previewCanvasEl;
            this.previewCtx = this.previewCanvas.getContext('2d');
            
            // Set preview canvas size
            this.previewCanvas.width = 640;
            this.previewCanvas.height = 360;
        }
        
        // Get progress elements
        this.progressBar = this.recordingMenu.querySelector('.progress-bar');
        this.progressFill = this.recordingMenu.querySelector('.progress-fill');
        this.currentFrameText = this.recordingMenu.querySelector('.current-frame');
        this.totalFramesText = this.recordingMenu.querySelector('.total-frames');
        this.timeRemainingText = this.recordingMenu.querySelector('.time-remaining');
        
        // Get control buttons
        this.startButton = document.getElementById('startRecordingBtn');
        this.cancelButton = document.getElementById('cancelRecordingBtn');
        
        // Setup button handlers
        if (this.startButton) {
            this.startButton.addEventListener('click', () => {
                if (this.onStartCallback) {
                    this.onStartCallback();
                }
            });
        }
        
        if (this.cancelButton) {
            this.cancelButton.addEventListener('click', () => {
                if (this.onCancelCallback) {
                    this.onCancelCallback();
                }
            });
        }
        
        // Create error message element if it doesn't exist
        this.createErrorMessageElement();
    }
    
    /**
     * Set callbacks for button actions
     */
    setCallbacks(callbacks: {
        onStart?: () => void;
        onCancel?: () => void;
    }): void {
        this.onStartCallback = callbacks.onStart || null;
        this.onCancelCallback = callbacks.onCancel || null;
    }
    
    /**
     * Open the recording overlay
     */
    open(): void {
        this.isMenuOpen = true;
        
        // Step 1: Hide controls (top and bottom)
        if (this.audioControls?.uiControlsManager) {
            this.audioControls.uiControlsManager.hideControls();
        }
        
        // Step 2: After controls start animating out, show menu
        setTimeout(() => {
            if (this.recordingMenu) {
                // Set display first, then add open class for animation
                this.recordingMenu.style.display = 'flex';
                // Force reflow to ensure display is applied
                this.recordingMenu.offsetHeight;
                this.recordingMenu.classList.add('open');
            }
        }, 100); // Small delay to let controls start animating out
    }
    
    /**
     * Close the recording overlay
     */
    close(): void {
        // Step 1: Hide menu (fade out with downward movement)
        if (this.recordingMenu) {
            this.recordingMenu.classList.remove('open');
        }
        this.isMenuOpen = false;
        
        // Step 2: After menu animation completes, show controls
        setTimeout(() => {
            if (this.recordingMenu) {
                this.recordingMenu.style.display = 'none';
            }
            if (this.audioControls?.uiControlsManager) {
                this.audioControls.uiControlsManager.showControls();
            }
        }, 350); // Match the animation duration
    }
    
    /**
     * Update progress indicator
     */
    updateProgress(progress: RecordingProgress): void {
        // Update progress bar
        if (this.progressFill) {
            this.progressFill.style.width = `${progress.percentage}%`;
        }
        
        // Update frame count
        if (this.currentFrameText) {
            this.currentFrameText.textContent = progress.currentFrame.toString();
        }
        if (this.totalFramesText) {
            this.totalFramesText.textContent = progress.totalFrames.toString();
        }
        
        // Update time remaining
        if (this.timeRemainingText) {
            const seconds = Math.ceil(progress.timeRemaining / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            this.timeRemainingText.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }
    
    /**
     * Update preview with last rendered frame
     */
    updatePreview(imageData: ImageData | null): void {
        if (!this.previewCanvas || !this.previewCtx || !imageData) {
            return;
        }
        
        // Clear canvas
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        
        // Draw image data
        this.previewCtx.putImageData(imageData, 0, 0);
    }
    
    /**
     * Update preview from canvas element
     */
    updatePreviewFromCanvas(sourceCanvas: HTMLCanvasElement): void {
        if (!this.previewCanvas || !this.previewCtx) {
            return;
        }
        
        // Clear canvas
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        
        // Draw source canvas scaled to preview size
        this.previewCtx.drawImage(
            sourceCanvas,
            0, 0, sourceCanvas.width, sourceCanvas.height,
            0, 0, this.previewCanvas.width, this.previewCanvas.height
        );
    }
    
    /**
     * Update UI based on recording state
     */
    updateState(state: RecordingState): void {
        if (!this.recordingMenu) return;
        
        // Hide error message if not in error state
        if (state !== 'error' && this.errorMessage) {
            this.errorMessage.style.display = 'none';
        }
        
        switch (state) {
            case 'idle':
            case 'ready':
                if (this.startButton) {
                    this.startButton.style.display = 'block';
                    this.startButton.textContent = 'Start Recording';
                }
                if (this.cancelButton) {
                    this.cancelButton.style.display = 'none';
                }
                break;
                
            case 'initializing':
                if (this.startButton) {
                    this.startButton.style.display = 'block';
                    this.startButton.textContent = 'Initializing...';
                    (this.startButton as HTMLButtonElement).disabled = true;
                }
                if (this.cancelButton) {
                    this.cancelButton.style.display = 'none';
                }
                break;
                
            case 'recording':
            case 'encoding':
                if (this.startButton) {
                    this.startButton.style.display = 'none';
                }
                if (this.cancelButton) {
                    this.cancelButton.style.display = 'block';
                }
                break;
                
            case 'complete':
                if (this.startButton) {
                    this.startButton.style.display = 'block';
                    this.startButton.textContent = 'Recording Complete';
                    (this.startButton as HTMLButtonElement).disabled = true;
                }
                if (this.cancelButton) {
                    this.cancelButton.style.display = 'none';
                }
                break;
                
            case 'error':
            case 'cancelled':
                if (this.startButton) {
                    this.startButton.style.display = 'block';
                    this.startButton.textContent = 'Start Recording';
                    (this.startButton as HTMLButtonElement).disabled = false;
                }
                if (this.cancelButton) {
                    this.cancelButton.style.display = 'none';
                }
                break;
        }
    }
    
    /**
     * Show error message
     */
    showError(message: string): void {
        if (!this.errorMessage) {
            this.createErrorMessageElement();
        }
        
        if (this.errorMessage) {
            this.errorMessage.textContent = message;
            this.errorMessage.style.display = 'block';
        }
    }
    
    /**
     * Create error message element
     */
    private createErrorMessageElement(): void {
        if (this.errorMessage || !this.recordingMenu) return;
        
        this.errorMessage = document.createElement('div');
        this.errorMessage.className = 'recording-error';
        this.errorMessage.style.cssText = `
            display: none;
            color: var(--color-error, #ff4444);
            padding: var(--pd-md);
            margin-top: var(--pd-md);
            text-align: center;
            font-size: 14px;
        `;
        
        this.recordingMenu.appendChild(this.errorMessage);
    }
    
    /**
     * Reset progress to initial state
     */
    resetProgress(): void {
        if (this.progressFill) {
            this.progressFill.style.width = '0%';
        }
        if (this.currentFrameText) {
            this.currentFrameText.textContent = '0';
        }
        if (this.totalFramesText) {
            this.totalFramesText.textContent = '0';
        }
        if (this.timeRemainingText) {
            this.timeRemainingText.textContent = '--:--';
        }
    }
    
    /**
     * Check if menu is open
     */
    isOpen(): boolean {
        return this.isMenuOpen;
    }
}

