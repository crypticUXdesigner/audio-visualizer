// Application Initialization
// Orchestrates component initialization, wiring, and error handling

import { safeCaptureException, safeSentrySpan } from './monitoring/SentryInit.js';
import { AudioAnalyzer } from './audio/AudioAnalyzer.js';
import { ShaderManager } from '../shaders/ShaderManager.js';
import heightmapConfig from '../shaders/configs/heightmap.js';
import dotsConfig from '../shaders/configs/dots.js';
import { ColorModulator } from './color/ColorModulator.js';

/**
 * Initialize the Visual Player application
 * @param {VisualPlayer} app - The VisualPlayer instance to initialize
 * @returns {Promise<void>}
 */
export async function initializeApp(app) {
    // Track initialization as a transaction
    return safeSentrySpan(
        {
            op: "app.init",
            name: "Visual Player Initialization",
        },
        async (span) => {
            console.log('Initializing Visual Player...');
            
            try {
                // 1. Initialize Audio Analyzer
                await safeSentrySpan(
                    { op: "audio.init", name: "Audio Analyzer Init" },
                    async () => {
                        app.audioAnalyzer = new AudioAnalyzer();
                        app.audioAnalyzer.init();
                    }
                );
        
                // Expose globally for backward compatibility with frequency visualizer
                window.AudioVisualizer = app.audioAnalyzer;
                
                // 2. Initialize Shader Manager
                app.shaderManager = new ShaderManager();
                app.shaderManager.setAudioAnalyzer(app.audioAnalyzer);
                
                // 3. Register shaders
                app.shaderManager.registerShader(heightmapConfig);
                app.shaderManager.registerShader(dotsConfig);
                
                // 4. Initialize color system
                app.colorConfig = { ...dotsConfig.colorConfig };
                app.initializeColors();
                
                // 4.5. Initialize color modulator for dynamic hue shifts
                app.colorModulator = new ColorModulator(app.colorConfig);
                
                // 5. Set colors in shader manager (before activating shader)
                if (app.colors) {
                    app.shaderManager.setColors(app.colors);
                }
                
                // 6. Initialize and activate default shader (check localStorage for saved preference)
                let savedShader = localStorage.getItem('activeShader') || 'dots';
                // Migrate old shader name to new name
                if (savedShader === 'background-fbm') {
                    savedShader = 'heightmap';
                    localStorage.setItem('activeShader', 'heightmap');
                }
                await app.shaderManager.setActiveShader(savedShader);
                
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
                if (app.audioControls && app.audioControls.waveformScrubber && app.colors) {
                    app.audioControls.waveformScrubber.setColors(app.colors);
                }
                
                // 8. Initialize dev tools
                app.initDevTools();
                
                // 9. Initialize top control buttons
                app.initTopControls();
                
                // 10. Expose global API for backward compatibility
                app.exposeGlobalAPI();
                
                span.setAttribute("success", true);
                console.log('Visual Player initialized successfully');
            } catch (error) {
                span.setAttribute("success", false);
                console.error('Error initializing Visual Player:', error);
                
                // Capture error in Sentry
                safeCaptureException(error);
                
                // Show user-friendly error message
                app.showInitializationError(error);
                
                // Don't throw - allow app to continue in degraded mode if possible
                // throw error;
            }
        }
    );
}

