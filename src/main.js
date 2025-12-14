// Main Application Entry Point
// Wires together all modules and initializes the application

import { AudioAnalyzer } from './core/AudioAnalyzer.js';
import { generateColorsFromOklch, rgbToHex, normalizeColor } from './core/ColorGenerator.js';
import { ShaderManager } from './shaders/ShaderManager.js';
import backgroundFbmConfig from './shaders/shader-configs/background-fbm.js';
import { colorPresets } from './config/color-presets.js';
import { AudioControls } from './ui/AudioControls.js';
import { ColorPresetSwitcher } from './ui/ColorPresetSwitcher.js';
import { ShaderParameterPanel } from './ui/ShaderParameterPanel.js';
import { FullscreenToggle } from './ui/FullscreenToggle.js';
import { UIToggle } from './ui/UIToggle.js';
import { DevTools } from './ui/DevTools.js';

class VisualPlayer {
    constructor() {
        this.audioAnalyzer = null;
        this.shaderManager = null;
        this.colors = null;
        this.colorConfig = null;
        this.audioControls = null;
        this.colorPresetSwitcher = null;
        this.shaderParameterPanel = null;
        this.fullscreenToggle = null;
        this.uiToggle = null;
        this.devTools = null;
        
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
            
            // 7. Initialize UI components
            this.initUI();
            
            // 8. Initialize dev tools
            this.initDevTools();
            
            // 9. Initialize loudness controls (if they exist in HTML)
            this.initLoudnessControls();
            
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
        const swatchContainer = document.getElementById('colorSwatches');
        if (!swatchContainer) return;
        
        swatchContainer.innerHTML = '';
        
        // Reverse order: color9 (darkest) to color (brightest)
        const colorKeys = ['color9', 'color8', 'color7', 'color6', 'color5', 'color4', 'color3', 'color2', 'color'];
        colorKeys.forEach((key) => {
            const color = this.colors[key];
            if (!color || !Array.isArray(color) || color.length !== 3) {
                return;
            }
            
            const hex = rgbToHex(color);
            const swatch = document.createElement('div');
            swatch.style.width = '30px';
            swatch.style.height = '30px';
            swatch.style.backgroundColor = hex;
            swatch.style.borderRadius = '4px';
            swatch.title = `${key}: ${hex}`;
            swatchContainer.appendChild(swatch);
        });
    }
    
    initUI() {
        // Initialize audio controls
        this.audioControls = new AudioControls(this.audioAnalyzer);
        
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
                
                // Regenerate colors (this will update shader manager)
                this.initializeColors();
            }
        );
        
        // Initialize shader parameter panel
        this.shaderParameterPanel = new ShaderParameterPanel(this.shaderManager);
        
        // Initialize fullscreen toggle
        this.fullscreenToggle = new FullscreenToggle();
        
        // Initialize UI toggle
        this.uiToggle = new UIToggle();
    }
    
    initDevTools() {
        this.devTools = new DevTools();
        
        // Register frequency visualizer if it exists
        if (window.FrequencyVisualizer) {
            this.devTools.registerTool('frequencyVisualizer', window.FrequencyVisualizer);
        }
    }
    
    initLoudnessControls() {
        const loudnessToggle = document.getElementById('loudnessAnimationToggle');
        const thresholdSlider = document.getElementById('loudnessThresholdSlider');
        const thresholdValue = document.getElementById('loudnessThresholdValue');
        
        // Store controls globally for shader access (backward compatibility)
        window._loudnessControls = {
            loudnessAnimationEnabled: true,
            loudnessThreshold: 0.1
        };
        
        if (loudnessToggle) {
            loudnessToggle.checked = window._loudnessControls.loudnessAnimationEnabled;
            loudnessToggle.addEventListener('change', (e) => {
                window._loudnessControls.loudnessAnimationEnabled = e.target.checked;
            });
        }
        
        if (thresholdSlider && thresholdValue) {
            thresholdSlider.value = window._loudnessControls.loudnessThreshold;
            thresholdValue.textContent = window._loudnessControls.loudnessThreshold.toFixed(2);
            
            thresholdSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                thresholdValue.textContent = value.toFixed(2);
                window._loudnessControls.loudnessThreshold = value;
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

