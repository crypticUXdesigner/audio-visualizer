// Visual Player Application
// Main application class containing all application logic

import { AudioAnalyzer } from './audio/AudioAnalyzer.js';
import { ColorModulator } from './color/ColorModulator.js';
import { ShaderManager } from '../shaders/ShaderManager.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import { colorPresets } from '../config/color-presets.js';
import { AudioControls } from '../ui/PlaybackControls.js';
import { ColorPresetSwitcher } from '../ui/ColorControls.js';
import { ShaderSwitcher } from '../ui/ShaderControls.js';
import { RecordingControls } from '../ui/RecordingControls.js';
import { initializeApp } from './AppInitializer.js';
import { UI_CONFIG } from '../config/constants.js';
import { TrackLoadingService } from './services/TrackLoadingService.js';
import { ColorService } from './services/ColorService.js';
import type { ColorConfig, ExtendedAudioData, ColorMap } from '../types/index.js';

export class VisualPlayer {
    audioAnalyzer: AudioAnalyzer | null = null;
    shaderManager: ShaderManager | null = null;
    colorService: ColorService | null = null;
    colorConfig: ColorConfig | null = null;
    colorModulator: ColorModulator | null = null;
    audioControls: AudioControls | null = null;
    colorPresetSwitcher: ColorPresetSwitcher | null = null;
    shaderSwitcher: ShaderSwitcher | null = null;
    recordingControls: RecordingControls | null = null;
    
    constructor() {
        this.audioAnalyzer = null;
        this.shaderManager = null;
        this.colorService = null;
        this.colorConfig = null;
        this.colorModulator = null;
        this.audioControls = null;
        this.colorPresetSwitcher = null;
        this.shaderSwitcher = null;
        this.recordingControls = null;
    }
    
    /**
     * Check if debug mode is enabled via URL parameter
     * 
     * Debug mode enables additional UI controls and debug information.
     * Activated by adding `?debug` to the URL.
     * 
     * @returns {boolean} True if `?debug` is in the URL
     */
    isDebugMode(): boolean {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has('debug');
    }
    
    /**
     * Initialize the Visual Player application
     * 
     * This is the main entry point that orchestrates all component initialization.
     * Sets up audio analyzer, shaders, colors, UI components, and loads tracks.
     * 
     * @returns {Promise<void>} Promise that resolves when initialization is complete
     * @throws {Error} If initialization fails critically
     */
    async init(): Promise<void> {
        // Set debug mode class on html element (already set by inline script, but ensure it's set)
        if (this.isDebugMode()) {
            document.documentElement.classList.add('debug-mode');
        }
        
        // Delegate initialization to AppInitializer
        return initializeApp(this);
    }
    
    /**
     * Show loading spinner
     * 
     * Displays the application loading indicator to provide user feedback
     * during initialization and track loading.
     */
    showLoader(): void {
        const loader = document.getElementById('appLoader');
        if (loader) {
            loader.classList.remove('hidden');
        }
    }
    
    /**
     * Hide loading spinner
     * 
     * Hides the loading indicator and shows UI controls after initialization
     * is complete. Includes a fade-out transition.
     */
    hideLoader(): void {
        const loader = document.getElementById('appLoader');
        if (loader) {
            loader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                if (loader.classList.contains('hidden')) {
                    loader.style.display = 'none';
                }
            }, UI_CONFIG.ANIMATION.FADE_DURATION);
        }
        
        // Show controls after initial loading completes
        if (this.audioControls && this.audioControls.uiControlsManager) {
            this.audioControls.uiControlsManager.showControls();
        }
    }
    
    /**
     * Fade in the shader canvas after first color update
     * 
     * Smoothly transitions the WebGL canvas from hidden to visible after
     * the first color update is received. Uses CSS transitions for smooth animation.
     */
    fadeInCanvas(): void {
        const canvas = document.getElementById('backgroundCanvas');
        if (!canvas) return;
        
        // First add the 'ready' class to enable transitions
        canvas.classList.add('ready');
        
        // Force a reflow to ensure the ready state is rendered
        canvas.offsetHeight; // eslint-disable-line no-unused-expressions
        
        // Use double RAF to ensure browser has painted
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                canvas.classList.add('visible');
            });
        });
    }
    
    /**
     * Show user-friendly error message for initialization failures
     * @param {Error} error - The error that occurred
     */
    showInitializationError(error: Error): void {
        // Hide loader on error
        this.hideLoader();
        
        // Create error message element if it doesn't exist
        let errorElement = document.getElementById('init-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'init-error-message';
            errorElement.style.cssText = [
                'position: fixed',
                'top: 50%',
                'left: 50%',
                'transform: translate(-50%, -50%)',
                'background: rgba(0, 0, 0, 0.9)',
                'color: white',
                'padding: 30px 40px',
                'border-radius: 12px',
                `z-index: ${UI_CONFIG.Z_INDEX.ERROR_MESSAGE}`,
                "font-family: 'Lexend', sans-serif",
                'font-size: 16px',
                `max-width: ${UI_CONFIG.ERROR_MESSAGE_MAX_WIDTH}px`,
                'text-align: center',
                'box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5)',
            ].join('; ');
            document.body.appendChild(errorElement);
        }
        
        const errorMessage = error.message || 'Unknown error occurred';
        
        // Clear existing content and use safe DOM methods to prevent XSS
        errorElement.textContent = '';
        
        const h2 = document.createElement('h2');
        h2.style.cssText = 'margin: 0 0 15px 0; font-size: 20px;';
        h2.textContent = 'Initialization Error';
        
        const p1 = document.createElement('p');
        p1.style.cssText = 'margin: 0 0 20px 0; line-height: 1.5;';
        p1.textContent = errorMessage; // Safe - textContent escapes HTML
        
        const p2 = document.createElement('p');
        p2.style.cssText = 'margin: 0; font-size: 14px; opacity: 0.8;';
        p2.textContent = 'Please refresh the page or check your browser\'s WebGL and audio support.';
        
        errorElement.appendChild(h2);
        errorElement.appendChild(p1);
        errorElement.appendChild(p2);
        
        // Error already logged in AppInitializer
    }
    
    /**
     * Initialize colors from configuration
     * Delegates to ColorService
     * 
     * @param {boolean} [skipFrequencyUpdate=false] - If true, skips frequency-based updates
     * @param {Object|null} [audioData=null] - Audio data for dynamic color modulation
     * @returns {Promise<Object>} Promise that resolves to the generated colors object
     */
    async initializeColors(skipFrequencyUpdate: boolean = false, audioData: ExtendedAudioData | null = null): Promise<ColorMap> {
        if (!this.colorService) {
            throw new Error('ColorService not initialized');
        }
        return this.colorService.initializeColors(skipFrequencyUpdate, audioData);
    }
    
    /**
     * Update dynamic colors based on audio data (called from render loop)
     * Delegates to ColorService
     * 
     * @param {Object} audioData - Audio analysis data
     */
    updateDynamicColors(audioData: ExtendedAudioData): void {
        if (!this.colorService) {
            return;
        }
        
        // Update title display with audio reactivity
        if (this.audioControls) {
            const currentShaderName = this.shaderManager?.activeShader?.config?.name || '';
            this.audioControls.updateTitleDisplayAudioReactivity(audioData, currentShaderName);
        }
        
        // Update colors via ColorService
        this.colorService.updateDynamicColors(audioData);
    }
    
    initUI(): void {
        // Initialize audio controls
        if (!this.audioAnalyzer) {
            throw new Error('AudioAnalyzer not initialized');
        }
        this.audioControls = new AudioControls(this.audioAnalyzer, this.shaderManager);
        
        // Update title with current track (if any)
        const trackDropdownText = document.getElementById('trackDropdownText');
        if (trackDropdownText && trackDropdownText.textContent) {
            this.audioControls.updateTrackTitle(trackDropdownText.textContent);
        }
        
        // Set up track change callback for random color preset selection
        this.audioControls.onTrackChange = () => {
            if (this.colorPresetSwitcher) {
                this.colorPresetSwitcher.selectRandomPreset();
            }
        };
        
        // Load tracks from TrackService dynamically using batch loading
        // This happens asynchronously so it doesn't block initialization
        const trackLoadingService = new TrackLoadingService(this.audioControls);
        setTimeout(async () => {
            await trackLoadingService.loadAllTracks(() => this.hideLoader(), this.audioControls);
        }, UI_CONFIG.TRACK_LOAD_DELAY);
        
        // Initialize color preset switcher
        if (!this.colorService) {
            throw new Error('ColorService not initialized');
        }
        this.colorPresetSwitcher = new ColorPresetSwitcher(
            colorPresets,
            this.colorService,
            this.audioControls // Pass audioControls for menu open/close behavior
        );
        
        // Initialize shader switcher
        if (!this.shaderManager) {
            throw new Error('ShaderManager not initialized');
        }
        this.shaderSwitcher = new ShaderSwitcher(
            this.shaderManager,
            () => {
                // Optional callback when shader changes
                // Shader switch is logged in ShaderManager
            },
            this.audioControls // Pass audioControls for menu open/close behavior
        );
        
        // Initialize recording controls
        this.recordingControls = new RecordingControls(this.audioControls);
        this.recordingControls.setApp(this);
        
        // Shader parameter panel removed - controls are now hardcoded
    }
    
    initTopControls(): void {
        // Initialize loudness controls and inject into shader manager
        const loudnessControls = {
            loudnessAnimationEnabled: true,
            loudnessThreshold: 0.1
        };
        
        // Inject loudness controls via ShaderManager (will be applied to active shader)
        if (this.shaderManager) {
            this.shaderManager.setLoudnessControls(loudnessControls);
        }
    }
    
    /**
     * Load a track from the Audiotool TrackService and add it to the track selection
     * @param {string} songName - Name of the song
     * @param {string} username - Username (deprecated, not used)
     * @param {boolean} autoLoad - Whether to automatically load the track after adding
     */
    async loadAPITrack(songName: string, username: string, autoLoad: boolean = false): Promise<void> {
        if (!this.audioControls) {
            // AudioControls not initialized - this is expected during startup
            return;
        }
        
        try {
            await this.audioControls.addTrackFromAPI(songName, username, autoLoad);
            // Success/failure is logged in addTrackFromAPI
        } catch (error) {
            // Only log unexpected errors, not "track not found" errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('not found') && !errorMessage.includes('Failed to load')) {
                ShaderLogger.warn(`Unexpected error loading track "${songName}" by ${username}:`, errorMessage);
            }
        }
    }
    
}

