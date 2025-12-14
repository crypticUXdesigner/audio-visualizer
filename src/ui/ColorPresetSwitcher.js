// Color Preset Switcher UI Module
// Handles color preset selection and application

import { generateColorsFromOklch, rgbToHex } from '../core/ColorGenerator.js';

export class ColorPresetSwitcher {
    constructor(colorPresets, onPresetChange) {
        this.colorPresets = colorPresets;
        this.onPresetChange = onPresetChange; // Callback: (presetConfig) => void
        this.currentPresetName = localStorage.getItem('colorPreset') || Object.keys(colorPresets)[0];
        this.init();
    }
    
    init() {
        const presetButtonsContainer = document.getElementById('presetButtons');
        if (!presetButtonsContainer || !this.colorPresets) {
            // Retry if not ready yet
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // Create buttons for each preset
        Object.keys(this.colorPresets).forEach(presetName => {
            const button = document.createElement('button');
            button.className = 'preset-btn';
            button.dataset.preset = presetName;
            
            // Create and append swatch
            const swatch = this.generatePresetSwatch(this.colorPresets[presetName]);
            button.appendChild(swatch);
            
            // Mark active preset
            if (presetName === this.currentPresetName) {
                button.classList.add('active');
            }
            
            // Handle click
            button.addEventListener('click', () => {
                // Remove active class from all buttons
                document.querySelectorAll('.preset-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // Add active class to clicked button
                button.classList.add('active');
                
                // Apply preset
                const preset = this.colorPresets[presetName];
                if (this.onPresetChange) {
                    this.onPresetChange(preset);
                }
                this.currentPresetName = presetName;
                localStorage.setItem('colorPreset', presetName);
                console.log('Applied color preset:', presetName);
            });
            
            presetButtonsContainer.appendChild(button);
        });
        
        // Apply saved preset on load
        if (this.currentPresetName && this.colorPresets[this.currentPresetName]) {
            const savedPreset = this.colorPresets[this.currentPresetName];
            const applyPreset = () => {
                if (this.onPresetChange) {
                    this.onPresetChange(savedPreset);
                } else {
                    // Retry if callback not ready yet
                    setTimeout(applyPreset, 100);
                }
            };
            setTimeout(applyPreset, 500);
        }
    }
    
    generatePresetSwatch(presetConfig) {
        // Generate colors from the preset config
        const generatedColors = generateColorsFromOklch(presetConfig);
        // Get a few representative colors (darkest, middle, brightest)
        // Note: generateColorsFromOklch returns color1-color9, where color1 is brightest, color9 is darkest
        const color9 = generatedColors.color9 || generatedColors.color10; // darkest
        const color5 = generatedColors.color5;   // middle
        const color1 = generatedColors.color1;     // brightest
        
        // Create a gradient swatch showing the color range
        const swatch = document.createElement('div');
        swatch.className = 'preset-swatch';
        
        // Create gradient using the three representative colors
        const color9Hex = rgbToHex(color9);
        const color5Hex = rgbToHex(color5);
        const color1Hex = rgbToHex(color1);
        
        swatch.style.background = `linear-gradient(to right, ${color9Hex}, ${color5Hex}, ${color1Hex})`;
        
        return swatch;
    }
}

