// Application Initialization
// Orchestrates component initialization, wiring, and error handling

import { safeCaptureException, safeSentrySpan } from './monitoring/SentryInit.js';
import { AudioAnalyzer } from './audio/AudioAnalyzer.js';
import { ShaderManager } from '../shaders/ShaderManager.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
// Phosphor shader first (default)
import phosphorConfig from '../shaders/configs/phosphor.js';
import heightmapConfig from '../shaders/configs/heightmap.js';
import refractionConfig from '../shaders/configs/refraction.js';
import stringsConfig from '../shaders/configs/strings.js';
import arcConfig from '../shaders/configs/arc.js';
import testPatternConfig from '../shaders/configs/test-pattern.js';
import raymarchConfig from '../shaders/configs/raymarch.js';
// New shaders
import voxelsConfig from '../shaders/configs/voxels.js';
import heavenlyConfig from '../shaders/configs/heavenly.js';
import unnamed2Config from '../shaders/configs/unnamed2.js';
import sauronConfig from '../shaders/configs/sauron.js';
import gltchConfig from '../shaders/configs/gltch.js';
import blackholeConfig from '../shaders/configs/blackhole.js';
import neutronConfig from '../shaders/configs/neutron.js';
import turbineConfig from '../shaders/configs/turbine.js';
import hyperspace2Config from '../shaders/configs/hyperspace2.js';
import tensorConfig from '../shaders/configs/tensor.js';
import fragmentsConfig from '../shaders/configs/fragments.js';
import unnamed3Config from '../shaders/configs/unnamed3.js';
import unnamed4Config from '../shaders/configs/unnamed4.js';
import firewallConfig from '../shaders/configs/firewall.js';
import heavenly2Config from '../shaders/configs/heavenly2.js';
import bitsConfig from '../shaders/configs/bits.js';
import protostar2Config from '../shaders/configs/protostar2.js';
import contoursConfig from '../shaders/configs/contours.js';
import triangleFractalConfig from '../shaders/configs/triangle-fractal.js';
import digitalVortexConfig from '../shaders/configs/digital-vortex.js';
import mosaicConfig from '../shaders/configs/mosaic.js';
import { ColorModulator } from './color/ColorModulator.js';
import { ColorService } from './services/ColorService.js';
import { colorPresets } from '../config/color-presets.js';

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
                
                // 3. Register shaders (phosphor first - default)
                app.shaderManager.registerShader(phosphorConfig);
                app.shaderManager.registerShader(heightmapConfig);
                app.shaderManager.registerShader(refractionConfig);
                app.shaderManager.registerShader(stringsConfig);
                app.shaderManager.registerShader(arcConfig);
                app.shaderManager.registerShader(raymarchConfig);
                app.shaderManager.registerShader(testPatternConfig);
                
                // Register new shaders
                app.shaderManager.registerShader(voxelsConfig);
                app.shaderManager.registerShader(heavenlyConfig);
                app.shaderManager.registerShader(unnamed2Config);
                app.shaderManager.registerShader(sauronConfig);
                app.shaderManager.registerShader(gltchConfig);
                app.shaderManager.registerShader(blackholeConfig);
                app.shaderManager.registerShader(neutronConfig);
                app.shaderManager.registerShader(turbineConfig);
                app.shaderManager.registerShader(hyperspace2Config);
                app.shaderManager.registerShader(tensorConfig);
                app.shaderManager.registerShader(fragmentsConfig);
                app.shaderManager.registerShader(unnamed3Config);
                app.shaderManager.registerShader(unnamed4Config);
                app.shaderManager.registerShader(firewallConfig);
                app.shaderManager.registerShader(heavenly2Config);
                app.shaderManager.registerShader(bitsConfig);
                app.shaderManager.registerShader(protostar2Config);
                app.shaderManager.registerShader(contoursConfig);
                app.shaderManager.registerShader(triangleFractalConfig);
                app.shaderManager.registerShader(digitalVortexConfig);
                app.shaderManager.registerShader(mosaicConfig);
                
                // 4. Initialize color system (use default color preset)
                app.colorConfig = { ...colorPresets.Red };
                
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
                const { safeGetItem, safeSetItem } = await import('../utils/storage.js');
                let savedShader = safeGetItem('activeShader', 'phosphor');
                
                // Migrate old shader names to new names
                if (savedShader === 'vivarium-grayscale') {
                    savedShader = 'heightmap';
                    safeSetItem('activeShader', 'heightmap');
                }
                
                // Verify shader exists before activating, with fallback
                const defaultShader = 'phosphor';
                if (savedShader && app.shaderManager.shaders.has(savedShader)) {
                    try {
                        await app.shaderManager.setActiveShader(savedShader);
                    } catch (error) {
                        ShaderLogger.warn(`Failed to activate saved shader "${savedShader}", falling back to "${defaultShader}":`, error);
                        await app.shaderManager.setActiveShader(defaultShader);
                    }
                } else {
                    // Fallback to default if saved shader doesn't exist
                    await app.shaderManager.setActiveShader(defaultShader);
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

