// Color Preset Switcher UI Module
// Handles color preset selection and application

import { generateColorsFromOklch, rgbToHex, rgbToOklch, hexToRgb, interpolateHue, oklchToRgb } from '../core/ColorGenerator.js';

export class ColorPresetSwitcher {
    constructor(colorPresets, onPresetChange, onPropertyChange, getCurrentColorConfig) {
        this.colorPresets = colorPresets;
        this.onPresetChange = onPresetChange; // Callback: (presetConfig) => void
        this.onPropertyChange = onPropertyChange; // Callback: (property, value, target) => void
        this.getCurrentColorConfig = getCurrentColorConfig; // Callback: () => colorConfig
        this.currentPresetName = localStorage.getItem('colorPreset') || Object.keys(colorPresets)[0];
        this.currentColorConfig = null; // Store current color config for sliders
        this.init();
    }
    
    /**
     * Calculate actual hue from baseHue + hueOffset
     */
    calculateActualHue(baseHue, hueOffset) {
        const baseRgb = hexToRgb(baseHue);
        const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
        return interpolateHue(baseH, baseH + hueOffset, 1.0);
    }
    
    init() {
        const presetButtonsContainer = document.getElementById('presetButtons');
        if (!presetButtonsContainer || !this.colorPresets) {
            // Retry if not ready yet
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // Setup color preset button toggle
        const colorPresetBtn = document.getElementById('colorPresetBtn');
        const colorPresetMenu = document.getElementById('colorPresetMenu');
        const colorPresetItem = colorPresetBtn?.closest('.top-control-item');
        
        if (colorPresetBtn && colorPresetMenu && colorPresetItem) {
            colorPresetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasOpen = colorPresetItem.classList.contains('open');
                colorPresetItem.classList.toggle('open');
                
                // If opening menu, update color pickers with current config values
                if (!wasOpen) {
                    setTimeout(() => {
                        // Get current color config (which may have custom values)
                        const currentConfig = this.getCurrentColorConfig ? this.getCurrentColorConfig() : null;
                        if (currentConfig) {
                            // Use current config values (preserves custom colors)
                            this.updateSlidersFromConfig(currentConfig);
                        } else if (this.currentPresetName && this.colorPresets[this.currentPresetName]) {
                            // Fallback to preset if no current config available
                            this.updateSlidersFromPreset(this.colorPresets[this.currentPresetName]);
                        }
                    }, 50);
                }
            });
            
            // Close when clicking outside
            document.addEventListener('click', (e) => {
                if (!colorPresetItem.contains(e.target)) {
                    colorPresetItem.classList.remove('open');
                }
            });
        }
        
        // Create color controls section
        this.createColorControls(colorPresetMenu);
        
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
                
                // Update sliders with preset values
                this.updateSlidersFromPreset(preset);
                
                // Don't close dropdown - keep it open for color adjustments
            });
            
            presetButtonsContainer.appendChild(button);
        });
        
        // Apply saved preset on load
        if (this.currentPresetName && this.colorPresets[this.currentPresetName]) {
            const savedPreset = this.colorPresets[this.currentPresetName];
            const applyPreset = () => {
                if (this.onPresetChange) {
                    this.onPresetChange(savedPreset);
                    // Update sliders after preset is applied
                    setTimeout(() => {
                        this.updateSlidersFromPreset(savedPreset);
                    }, 100);
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
    
    /**
     * Create color control pickers
     */
    createColorControls(menuContainer) {
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'color-controls';
        
        // Add separator
        const separator = document.createElement('div');
        separator.className = 'color-controls-separator';
        controlsContainer.appendChild(separator);
        
        // Create a row container for both pickers
        const pickersRow = document.createElement('div');
        pickersRow.className = 'color-pickers-row';
        
        // Create two color pickers: bass (darkest) and trebles (brightest)
        const pickers = [
            { label: 'Bass', target: 'darkest', id: 'color-picker-darkest' },
            { label: 'Trebles', target: 'brightest', id: 'color-picker-brightest' }
        ];
        
        pickers.forEach(picker => {
            const controlGroup = document.createElement('div');
            controlGroup.className = 'color-control-group';
            
            const label = document.createElement('label');
            label.className = 'color-control-label';
            label.textContent = picker.label;
            label.setAttribute('for', picker.id);
            
            const pickerContainer = document.createElement('div');
            pickerContainer.className = 'color-control-picker-container';
            
            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.id = picker.id;
            colorPicker.className = 'color-control-picker';
            colorPicker.value = '#000000'; // Default black
            colorPicker.dataset.target = picker.target;
            
            // Handle color change
            colorPicker.addEventListener('input', (e) => {
                const hexColor = e.target.value;
                this.handleColorPickerChange(picker.target, hexColor);
            });
            
            pickerContainer.appendChild(colorPicker);
            
            controlGroup.appendChild(label);
            controlGroup.appendChild(pickerContainer);
            pickersRow.appendChild(controlGroup);
        });
        
        controlsContainer.appendChild(pickersRow);
        
        menuContainer.appendChild(controlsContainer);
    }
    
    /**
     * Handle color picker changes - convert RGB to OKLCH and update config
     */
    handleColorPickerChange(target, hexColor) {
        // Convert hex to RGB
        const rgb = hexToRgb(hexColor);
        
        // Convert RGB to OKLCH
        const [lightness, chroma, hue] = rgbToOklch(rgb);
        
        // Update all three properties at once
        if (this.onPropertyChange) {
            // Update lightness
            this.onPropertyChange('lightness', lightness, target);
            // Update chroma
            this.onPropertyChange('chroma', chroma, target);
            // Update hue (with wrap-around)
            const normalizedHue = ((hue % 360) + 360) % 360;
            this.onPropertyChange('hue', normalizedHue, target);
        }
    }
    
    /**
     * Update color pickers from preset config
     */
    updateSlidersFromPreset(presetConfig) {
        this.currentColorConfig = presetConfig;
        
        // Calculate actual hues from baseHue + hueOffset
        const darkestHue = presetConfig.darkest.hue !== undefined 
            ? presetConfig.darkest.hue 
            : this.calculateActualHue(presetConfig.baseHue, presetConfig.darkest.hueOffset || 0);
        
        const brightestHue = presetConfig.brightest.hue !== undefined 
            ? presetConfig.brightest.hue 
            : this.calculateActualHue(presetConfig.baseHue, presetConfig.brightest.hueOffset || 0);
        
        // Convert OKLCH to RGB and update color pickers
        const updateColorPicker = (target, lightness, chroma, hue) => {
            const oklch = [lightness, chroma, hue];
            const rgb = oklchToRgb(oklch);
            const hex = rgbToHex(rgb);
            
            const picker = document.getElementById(`color-picker-${target}`);
            if (picker) {
                picker.value = hex;
            }
        };
        
        updateColorPicker('darkest', presetConfig.darkest.lightness, presetConfig.darkest.chroma, darkestHue);
        updateColorPicker('brightest', presetConfig.brightest.lightness, presetConfig.brightest.chroma, brightestHue);
    }
    
    /**
     * Update color pickers from current color config (for when config changes externally)
     */
    updateSlidersFromConfig(colorConfig) {
        if (!colorConfig) return;
        
        this.currentColorConfig = colorConfig;
        
        // Calculate actual hues
        const darkestHue = colorConfig.darkest.hue !== undefined 
            ? colorConfig.darkest.hue 
            : this.calculateActualHue(colorConfig.baseHue, colorConfig.darkest.hueOffset || 0);
        
        const brightestHue = colorConfig.brightest.hue !== undefined 
            ? colorConfig.brightest.hue 
            : this.calculateActualHue(colorConfig.baseHue, colorConfig.brightest.hueOffset || 0);
        
        // Convert OKLCH to RGB and update color pickers
        const updateColorPicker = (target, lightness, chroma, hue) => {
            const oklch = [lightness, chroma, hue];
            const rgb = oklchToRgb(oklch);
            const hex = rgbToHex(rgb);
            
            const picker = document.getElementById(`color-picker-${target}`);
            if (picker) {
                picker.value = hex;
            }
        };
        
        updateColorPicker('darkest', colorConfig.darkest.lightness, colorConfig.darkest.chroma, darkestHue);
        updateColorPicker('brightest', colorConfig.brightest.lightness, colorConfig.brightest.chroma, brightestHue);
    }
}

