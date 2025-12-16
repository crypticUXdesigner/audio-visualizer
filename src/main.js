// Main Application Entry Point
// Wires together all modules and initializes the application

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
    
    async init() {
        console.log('Initializing Visual Player...');
        
        try {
            // 1. Initialize Audio Analyzer
            this.audioAnalyzer = new AudioAnalyzer();
            this.audioAnalyzer.init();
            
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
            if (activeShader && activeShader.gl) {
                this.titleTexture = new TitleTexture(activeShader.gl);
                activeShader.setTitleTexture(this.titleTexture);
                
                // Resize title texture to match canvas size immediately
                if (activeShader.canvas) {
                    await this.titleTexture.resize(activeShader.canvas.width, activeShader.canvas.height);
                }
                
                // Ensure texture is ready (fonts loaded) before continuing
                await this.titleTexture.ensureReady();
            }
            
            // 7. Initialize UI components
            this.initUI();
            
            // 8. Initialize dev tools
            this.initDevTools();
            
            // 9. Initialize top control buttons
            this.initTopControls();
            
            // 10. Expose global API for backward compatibility
            this.exposeGlobalAPI();
            
            console.log('Visual Player initialized successfully');
        } catch (error) {
            console.error('Error initializing Visual Player:', error);
            throw error;
        }
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
        
        // Initialize shader parameter panel
        this.shaderParameterPanel = new ShaderParameterPanel(this.shaderManager);
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
        
        // Shader Controls Button
        const shaderControlsBtn = document.getElementById('shaderControlsBtn');
        const shaderParameters = document.getElementById('shaderParameters');
        
        if (shaderControlsBtn && shaderParameters) {
            // Ensure it starts hidden
            shaderParameters.style.display = 'none';
            
            let isShaderControlsVisible = false;
            
            shaderControlsBtn.addEventListener('click', () => {
                isShaderControlsVisible = !isShaderControlsVisible;
                
                if (isShaderControlsVisible) {
                    shaderParameters.style.display = 'block';
                    shaderControlsBtn.classList.add('active');
                } else {
                    shaderParameters.style.display = 'none';
                    shaderControlsBtn.classList.remove('active');
                }
            });
        }
        
        // Frequency Visualizer Button
        const frequencyVisualizerBtn = document.getElementById('frequencyVisualizerBtn');
        const frequencyCanvas = document.getElementById('frequencyCanvas');
        
        if (frequencyVisualizerBtn && frequencyCanvas) {
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

