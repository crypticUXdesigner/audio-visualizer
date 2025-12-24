// Application Initialization
// Orchestrates component initialization, wiring, and error handling

import { safeCaptureException, safeSentrySpan } from './monitoring/SentryInit.js';
import { AudioAnalyzer } from './audio/AudioAnalyzer.js';
import { ShaderManager } from '../shaders/ShaderManager.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import heightmapConfig from '../shaders/configs/heightmap.js';
import refractionConfig from '../shaders/configs/refraction.js';
import stringsConfig from '../shaders/configs/strings.js';
import arcConfig from '../shaders/configs/arc.js';
import { ColorModulator } from './color/ColorModulator.js';
import { ColorService } from './services/ColorService.js';

/**
 * Initialize the Visual Player application
 * @param {VisualPlayer} app - The VisualPlayer instance to initialize
 * @returns {Promise<void>}
 */
import type { VisualPlayer } from './App.js';

export async function initializeApp(app: VisualPlayer): Promise<void> {
    // Track initialization as a transaction
    return safeSentrySpan(
        {
            op: "app.init",
            name: "Visual Player Initialization",
        },
        async (span) => {
            ShaderLogger.info('Initializing Visual Player...');
            
            try {
                // 1. Initialize Audio Analyzer
                await safeSentrySpan(
                    { op: "audio.init", name: "Audio Analyzer Init" },
                    async () => {
                        app.audioAnalyzer = new AudioAnalyzer();
                        app.audioAnalyzer.init();
                    }
                );
        
                // 2. Initialize Shader Manager
                app.shaderManager = new ShaderManager();
                app.shaderManager.setAudioAnalyzer(app.audioAnalyzer);
                
                // 3. Register shaders
                app.shaderManager.registerShader(heightmapConfig);
                app.shaderManager.registerShader(refractionConfig);
                app.shaderManager.registerShader(stringsConfig);
                app.shaderManager.registerShader(arcConfig);
                
                // 4. Initialize color system
                app.colorConfig = { ...heightmapConfig.colorConfig };
                
                // 4.5. Initialize color modulator for dynamic hue shifts
                app.colorModulator = new ColorModulator(app.colorConfig);
                
                // 4.6. Initialize ColorService
                app.colorService = new ColorService(
                    app.colorConfig,
                    app.shaderManager,
                    app.colorModulator
                );
                
                // Setup color service callbacks
                app.colorService.on('onColorsUpdated', (colors) => {
                    // Update UI components when colors change
                    if (app.audioControls && colors) {
                        app.audioControls.setColors(colors);
                        if (app.audioControls.waveformScrubber) {
                            app.audioControls.waveformScrubber.setColors(colors);
                        }
                    }
                    
                    // Update color control sliders
                    if (app.colorPresetSwitcher && app.colorPresetSwitcher.updateSlidersFromConfig && app.colorConfig) {
                        app.colorPresetSwitcher.updateSlidersFromConfig(app.colorConfig);
                    }
                });
                
                // 5. Initialize colors
                await app.colorService.initializeColors();
                
                // 6. Initialize and activate default shader (check localStorage for saved preference)
                const { safeGetItem } = await import('../utils/storage.js');
                const savedShader = safeGetItem('activeShader', 'heightmap');
                if (savedShader) {
                    await app.shaderManager.setActiveShader(savedShader);
                }
                
                // 6.25. Set color update callback for dynamic color modulation
                app.shaderManager.setColorUpdateCallback((audioData) => {
                    app.updateDynamicColors(audioData);
                });
                
                // 6.3. Set callback for when shader receives first color update
                app.shaderManager.onFirstColorUpdate = () => {
                    app.fadeInCanvas();
                };
                
                // 7. Initialize UI components
                app.initUI();
                
                // 7.5 Set initial waveform colors if waveform scrubber is initialized
                const colors = app.colorService.getColors();
                if (app.audioControls && app.audioControls.waveformScrubber && colors) {
                    app.audioControls.waveformScrubber.setColors(colors);
                }
                
                // 8. Initialize top control buttons
                app.initTopControls();
                
                
                span.setAttribute("success", true);
                ShaderLogger.info('Visual Player initialized successfully');
            } catch (error) {
                span.setAttribute("success", false);
                ShaderLogger.error('Error initializing Visual Player:', error);
                
                // Capture error in Sentry
                safeCaptureException(error);
                
                // Show user-friendly error message
                app.showInitializationError(error as Error);
                
                // Don't throw - allow app to continue in degraded mode if possible
                // throw error;
            }
        }
    );
}

