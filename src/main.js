// Main Application Entry Point
// Wires together all modules and initializes the application

// Import styles (Vite will process and bundle these)
import './styles/app.css';

// Initialize Sentry as early as possible (before other imports)
import Sentry from './core/SentryInit.js';
import { AudioAnalyzer } from './core/AudioAnalyzer.js';
import { generateColorsFromOklch, rgbToHex, normalizeColor, hexToRgb, rgbToOklch, interpolateHue } from './core/ColorGenerator.js';
import { ShaderManager } from './shaders/ShaderManager.js';
import backgroundFbmConfig from './shaders/shader-configs/background-fbm.js';
import { colorPresets } from './config/color-presets.js';
import { AudioControls } from './ui/AudioControls.js';
import { ColorPresetSwitcher } from './ui/ColorPresetSwitcher.js';
import { ShaderParameterPanel } from './ui/ShaderParameterPanel.js';
import { DevTools } from './ui/DevTools.js';
import { TitleTexture } from './core/TitleTexture.js';

class VisualPlayer {
    constructor() {
        this.audioAnalyzer = null;
        this.shaderManager = null;
        this.colors = null;
        this.colorConfig = null;
        this.audioControls = null;
        this.colorPresetSwitcher = null;
        this.shaderParameterPanel = null;
        this.devTools = null;
        this.titleTexture = null;
        
        // Color initialization state
        this.isInitializingColors = false;
        this.colorsInitialized = false;
    }
    
    /**
     * Check if debug mode is enabled via URL parameter
     * @returns {boolean} True if ?debug is in the URL
     */
    isDebugMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has('debug');
    }
    
    async init() {
        // Set debug mode class on html element (already set by inline script, but ensure it's set)
        if (this.isDebugMode()) {
            document.documentElement.classList.add('debug-mode');
        }
        
        // Track initialization as a transaction
        return Sentry.startSpan(
            {
                op: "app.init",
                name: "Visual Player Initialization",
            },
            async (span) => {
                console.log('Initializing Visual Player...');
                
                try {
                    // 1. Initialize Audio Analyzer
                    await Sentry.startSpan(
                        { op: "audio.init", name: "Audio Analyzer Init" },
                        async () => {
                            this.audioAnalyzer = new AudioAnalyzer();
                            this.audioAnalyzer.init();
                        }
                    );
            
            // Expose globally for backward compatibility with frequency visualizer
            window.AudioVisualizer = this.audioAnalyzer;
            
            // 2. Initialize Shader Manager
            this.shaderManager = new ShaderManager();
            this.shaderManager.setAudioAnalyzer(this.audioAnalyzer);
            
            // 3. Register shaders
            this.shaderManager.registerShader(backgroundFbmConfig);
            
            // 4. Initialize color system
            this.colorConfig = { ...backgroundFbmConfig.colorConfig };
            this.initializeColors();
            
            // 5. Set colors in shader manager (before activating shader)
            if (this.colors) {
                this.shaderManager.setColors(this.colors);
            }
            
            // 6. Initialize and activate default shader
            await this.shaderManager.setActiveShader('background-fbm');
            
            // 6.5. Initialize title texture (after shader is active so we have GL context)
            const activeShader = this.shaderManager.getActiveShader();
            if (activeShader && activeShader.gl && !activeShader.webglFallbackActive) {
                this.titleTexture = new TitleTexture(activeShader.gl);
                activeShader.setTitleTexture(this.titleTexture);
                
                // Resize title texture to match canvas size immediately
                if (activeShader.canvas) {
                    await this.titleTexture.resize(activeShader.canvas.width, activeShader.canvas.height);
                }
                
                // Ensure texture is ready (fonts loaded) before continuing
                await this.titleTexture.ensureReady();
            } else if (activeShader && activeShader.webglFallbackActive) {
                console.warn('WebGL fallback active - skipping title texture initialization');
            }
            
            // 7. Initialize UI components
            this.initUI();
            
            // 8. Initialize dev tools
            this.initDevTools();
            
            // 9. Initialize top control buttons
            this.initTopControls();
            
            // 10. Expose global API for backward compatibility
            this.exposeGlobalAPI();
            
                    span.setAttribute("success", true);
                    console.log('Visual Player initialized successfully');
                } catch (error) {
                    span.setAttribute("success", false);
                    console.error('Error initializing Visual Player:', error);
                    
                    // Capture error in Sentry
                    Sentry.captureException(error);
                    
                    // Show user-friendly error message
                    this.showInitializationError(error);
                    
                    // Don't throw - allow app to continue in degraded mode if possible
                    // throw error;
                }
            }
        );
    }
    
    /**
     * Show user-friendly error message for initialization failures
     * @param {Error} error - The error that occurred
     */
    showInitializationError(error) {
        // Create error message element if it doesn't exist
        let errorElement = document.getElementById('init-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'init-error-message';
            errorElement.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 30px 40px;
                border-radius: 12px;
                z-index: 10000;
                font-family: sans-serif;
                font-size: 16px;
                max-width: 600px;
                text-align: center;
                box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
            `;
            document.body.appendChild(errorElement);
        }
        
        const errorMessage = error.message || 'Unknown error occurred';
        errorElement.innerHTML = `
            <h2 style="margin: 0 0 15px 0; font-size: 20px;">Initialization Error</h2>
            <p style="margin: 0 0 20px 0; line-height: 1.5;">${errorMessage}</p>
            <p style="margin: 0; font-size: 14px; opacity: 0.8;">Please refresh the page or check your browser's WebGL and audio support.</p>
        `;
        
        console.error('Initialization error displayed to user:', error);
    }
    
    initializeColors(skipFrequencyUpdate = false) {
        if (this.isInitializingColors) {
            return;
        }
        
        this.isInitializingColors = true;
        
        try {
            const generatedColors = generateColorsFromOklch(this.colorConfig);
            
            // Map color1-color9 to color, color2-color9 format
            // Always create new object to ensure reference changes (important for preset switching)
            const newColors = {
                color: normalizeColor(generatedColors.color1),
                color2: normalizeColor(generatedColors.color2),
                color3: normalizeColor(generatedColors.color3),
                color4: normalizeColor(generatedColors.color4),
                color5: normalizeColor(generatedColors.color5),
                color6: normalizeColor(generatedColors.color6),
                color7: normalizeColor(generatedColors.color7),
                color8: normalizeColor(generatedColors.color8),
                color9: normalizeColor(generatedColors.color9),
                color10: normalizeColor(generatedColors.color9) // color10 same as color9 for now
            };
            
            this.colors = newColors;
            this.colorsInitialized = true;
            
            // Update shader manager with colors (this will update render loop with new colors)
            if (this.shaderManager) {
                this.shaderManager.setColors(this.colors);
            }
            
            // Update color swatches
            this.updateColorSwatches();
            
            // Update color control sliders
            if (this.colorPresetSwitcher && this.colorPresetSwitcher.updateSlidersFromConfig) {
                this.colorPresetSwitcher.updateSlidersFromConfig(this.colorConfig);
            }
            
            // Update frequency visualizer colors
            if (!skipFrequencyUpdate && window.FrequencyVisualizer && window.FrequencyVisualizer.updateBandColors) {
                setTimeout(() => {
                    if (window.FrequencyVisualizer && window.FrequencyVisualizer.updateBandColors) {
                        window.FrequencyVisualizer.updateBandColors();
                    }
                }, 0);
            }
            
            console.log('Colors initialized/updated:', Object.keys(this.colors).length, 'colors');
        } finally {
            this.isInitializingColors = false;
        }
    }
    
    updateColorSwatches() {
        // Color swatches removed - no longer needed
        // This method kept for backward compatibility but does nothing
    }
    
    initUI() {
        // Initialize audio controls
        this.audioControls = new AudioControls(this.audioAnalyzer);
        
        // Set title texture on audio controls BEFORE init() completes
        // This ensures the initial title is set correctly
        if (this.titleTexture) {
            this.audioControls.setTitleTexture(this.titleTexture);
            // Update title with current track (if any)
            const trackDropdownText = document.getElementById('trackDropdownText');
            if (trackDropdownText && trackDropdownText.textContent) {
                this.audioControls.updateTrackTitle(trackDropdownText.textContent);
            }
        }
        
        // Load tracks from TrackService dynamically
        // This happens asynchronously so it doesn't block initialization
        setTimeout(() => {
            // Load "Blue Eyes (Trust Fund)" (has identifier, will use direct lookup)
            this.loadAPITrack('Blue Eyes (Trust Fund)', 'dquerg').catch(error => {
                console.warn('Failed to load API track "Blue Eyes (Trust Fund)" (this is optional):', error);
            });
            
            // Load "Beast Within" (has identifier, will use direct lookup)
            setTimeout(() => {
                this.loadAPITrack('Beast Within', 'dquerg').catch(error => {
                    console.warn('Failed to load API track "Beast Within" (this is optional):', error);
                });
            }, 300);
            
            // Load "#BBCHTRN" (has identifier, will use direct lookup)
            setTimeout(() => {
                this.loadAPITrack('#BBCHTRN', 'dquerg').catch(error => {
                    console.warn('Failed to load API track "#BBCHTRN" (this is optional):', error);
                });
            }, 600);
            
            // Load "#DFNTLYNABYPK" (has identifier, will use direct lookup)
            setTimeout(() => {
                this.loadAPITrack('#DFNTLYNABYPK', 'dquerg').catch(error => {
                    console.warn('Failed to load API track "#DFNTLYNABYPK" (this is optional):', error);
                });
            }, 900);
            
            // Load "kitsch (Kepz Remix)" (will search first time, then save identifier)
            setTimeout(() => {
                this.loadAPITrack('kitsch (Kepz Remix)', 'various').catch(error => {
                    console.warn('Failed to load API track "kitsch (Kepz Remix)" (this is optional):', error);
                });
            }, 1200);
            
            // Load "Five Hundred" (will search first time, then save identifier)
            setTimeout(() => {
                this.loadAPITrack('Five Hundred', 'various').catch(error => {
                    console.warn('Failed to load API track "Five Hundred" (this is optional):', error);
                });
            }, 1500);
            
            // Load "Sackgesicht" (will search first time, then save identifier)
            setTimeout(() => {
                this.loadAPITrack('Sackgesicht', 'various').catch(error => {
                    console.warn('Failed to load API track "Sackgesicht" (this is optional):', error);
                });
            }, 1800);
            
            // Load "Back To You - Icebox, SIREN & dcln" (will search first time, then save identifier)
            setTimeout(() => {
                this.loadAPITrack('Back To You - Icebox, SIREN & dcln', 'various').catch(error => {
                    console.warn('Failed to load API track "Back To You - Icebox, SIREN & dcln" (this is optional):', error);
                });
            }, 2100);
        }, 1000); // Wait 1 second after initialization to load API tracks
        
        // Initialize color preset switcher
        this.colorPresetSwitcher = new ColorPresetSwitcher(
            colorPresets,
            (presetConfig) => {
                // Update color config and regenerate colors
                // Deep merge to preserve structure
                if (presetConfig.baseHue) this.colorConfig.baseHue = presetConfig.baseHue;
                if (presetConfig.darkest) Object.assign(this.colorConfig.darkest, presetConfig.darkest);
                if (presetConfig.brightest) Object.assign(this.colorConfig.brightest, presetConfig.brightest);
                if (presetConfig.interpolationCurve) this.colorConfig.interpolationCurve = presetConfig.interpolationCurve;
                
                // Calculate and store actual hue values for sliders
                if (presetConfig.baseHue && presetConfig.darkest.hueOffset !== undefined) {
                    const baseRgb = hexToRgb(presetConfig.baseHue);
                    const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
                    this.colorConfig.darkest.hue = interpolateHue(baseH, baseH + presetConfig.darkest.hueOffset, 1.0);
                }
                if (presetConfig.baseHue && presetConfig.brightest.hueOffset !== undefined) {
                    const baseRgb = hexToRgb(presetConfig.baseHue);
                    const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
                    this.colorConfig.brightest.hue = interpolateHue(baseH, baseH + presetConfig.brightest.hueOffset, 1.0);
                }
                
                // Regenerate colors (this will update shader manager)
                this.initializeColors();
            },
            (property, value, target) => {
                // Handle individual property changes from sliders
                if (target === 'darkest' && this.colorConfig.darkest) {
                    this.colorConfig.darkest[property] = value;
                } else if (target === 'brightest' && this.colorConfig.brightest) {
                    this.colorConfig.brightest[property] = value;
                }
                
                // Regenerate colors
                this.initializeColors();
            },
            () => {
                // Provide current color config when menu opens
                return this.colorConfig;
            }
        );
        
        // Initialize shader parameter panel only in debug mode
        if (this.isDebugMode()) {
            this.shaderParameterPanel = new ShaderParameterPanel(this.shaderManager);
        }
    }
    
    initDevTools() {
        this.devTools = new DevTools();
        
        // Register frequency visualizer if it exists
        if (window.FrequencyVisualizer) {
            this.devTools.registerTool('frequencyVisualizer', window.FrequencyVisualizer);
        }
    }
    
    initTopControls() {
        // Initialize default loudness controls state (for backward compatibility)
        window._loudnessControls = {
            loudnessAnimationEnabled: true,
            loudnessThreshold: 0.1
        };
        
        const isDebugMode = this.isDebugMode();
        
        // Shader Controls Button
        const shaderControlsBtn = document.getElementById('shaderControlsBtn');
        const shaderParameters = document.getElementById('shaderParameters');
        
        if (shaderControlsBtn) {
            // Button visibility is now controlled by CSS (debug-mode class on body)
            if (isDebugMode) {
                // Ensure it starts hidden
                if (shaderParameters) {
                    shaderParameters.style.display = 'none';
                }
                
                let isShaderControlsVisible = false;
                
                shaderControlsBtn.addEventListener('click', () => {
                    if (!shaderParameters) return;
                    
                    isShaderControlsVisible = !isShaderControlsVisible;
                    
                    if (isShaderControlsVisible) {
                        shaderParameters.style.display = 'block';
                        shaderControlsBtn.classList.add('active');
                    } else {
                        shaderParameters.style.display = 'none';
                        shaderControlsBtn.classList.remove('active');
                    }
                });
            } else {
                // Also hide the shader parameters panel if it exists
                if (shaderParameters) {
                    shaderParameters.style.display = 'none';
                }
            }
        } else if (shaderParameters && !isDebugMode) {
            // If button doesn't exist but panel does, hide it
            shaderParameters.style.display = 'none';
        }
        
        // Frequency Visualizer Button
        const frequencyVisualizerBtn = document.getElementById('frequencyVisualizerBtn');
        const frequencyCanvas = document.getElementById('frequencyCanvas');
        
        if (frequencyVisualizerBtn && frequencyCanvas) {
            // Button visibility is now controlled by CSS (debug-mode class on body)
            if (isDebugMode) {
                // Ensure it starts hidden
                frequencyCanvas.style.display = 'none';
                
                let isFrequencyVisible = false;
                
                frequencyVisualizerBtn.addEventListener('click', () => {
                    isFrequencyVisible = !isFrequencyVisible;
                    
                    if (isFrequencyVisible) {
                        frequencyCanvas.style.display = 'block';
                        frequencyVisualizerBtn.classList.add('active');
                    } else {
                        frequencyCanvas.style.display = 'none';
                        frequencyVisualizerBtn.classList.remove('active');
                    }
                });
            }
        }
    }
    
    /**
     * Load a track from the Audiotool TrackService and add it to the track selection
     * @param {string} songName - Name of the song
     * @param {string} username - Username of the artist
     * @param {boolean} autoLoad - Whether to automatically load the track after adding
     */
    async loadAPITrack(songName, username, autoLoad = false) {
        if (!this.audioControls) {
            console.warn('AudioControls not initialized yet');
            return;
        }
        
        try {
            const result = await this.audioControls.addTrackFromAPI(songName, username, autoLoad);
            if (result) {
                console.log(`✅ Successfully added "${songName}" by ${username} to track selection`);
            }
            // If result is null, track wasn't found - already logged in addTrackFromAPI, skip silently
        } catch (error) {
            // Only log unexpected errors, not "track not found" errors
            if (!error.message?.includes('not found') && !error.message?.includes('Failed to load')) {
                console.warn(`⚠️  Unexpected error loading track "${songName}" by ${username}:`, error.message || error);
            }
        }
    }
    
    exposeGlobalAPI() {
        // Expose color presets globally for backward compatibility
        window.colorPresets = colorPresets;
        
        // Expose getColorForFrequencyRange for frequency visualizer
        window.getColorForFrequencyRange = (minHz, maxHz) => {
            if (!this.colors || !this.colors.color) {
                return '#ffffff';
            }
            
            const centerHz = (minHz + maxHz) / 2;
            
            // Map frequency bands to colors
            if (centerHz >= 11314) return rgbToHex(this.colors.color);
            if (centerHz >= 5657) return rgbToHex(this.colors.color2);
            if (centerHz >= 2828) return rgbToHex(this.colors.color3);
            if (centerHz >= 1414) return rgbToHex(this.colors.color4);
            if (centerHz >= 707) return rgbToHex(this.colors.color5);
            if (centerHz >= 354) return rgbToHex(this.colors.color6);
            if (centerHz >= 177) return rgbToHex(this.colors.color7);
            if (centerHz >= 44) return rgbToHex(this.colors.color8);
            return rgbToHex(this.colors.color9);
        };
        
        // Expose BackgroundShader API for backward compatibility
        window.BackgroundShader = {
            setColorConfig: (newConfig) => {
                Object.assign(this.colorConfig, newConfig);
                this.initializeColors();
            },
            getColorConfig: () => {
                return JSON.parse(JSON.stringify(this.colorConfig));
            },
            regenerateColors: () => {
                this.initializeColors();
            },
            setParameter: (name, value) => {
                if (this.shaderManager) {
                    return this.shaderManager.setParameter(name, value);
                }
                return false;
            },
            getParameter: (name) => {
                if (this.shaderManager) {
                    return this.shaderManager.getParameter(name);
                }
                return null;
            }
        };
        
        // Expose main app instance
        window.VisualPlayer = this;
    }
}

// Initialize when DOM is ready
const app = new VisualPlayer();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => app.init(), 100);
    });
} else {
    setTimeout(() => app.init(), 100);
}

export default app;

