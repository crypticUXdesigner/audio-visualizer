// Color Preset Configurations
// 10 presets evenly distributed across the hue range (360° / 10 = 36° per preset)

import { hslToRgb, rgbToHex } from '../core/ColorGenerator.js';

const presetNames = [
    'Red', 'Orange', 'Yellow', 'Green', 'Cyan',
    'Blue', 'Indigo', 'Purple', 'Magenta', 'Pink'
];

export const colorPresets = {};

// Generate 10 presets with hues evenly spaced from 0° to 324° (36° increments)
for (let i = 0; i < 10; i++) {
    const hue = i * 36; // 0, 36, 72, 108, 144, 180, 216, 252, 288, 324
    const rgb = hslToRgb(hue, 0.8, 0.5); // High saturation, medium lightness for vibrant base colors
    const hex = rgbToHex(rgb);
    
    colorPresets[presetNames[i]] = {
        baseHue: hex,
        darkest: {
            lightness: 0.09,
            chroma: 0.08,
            hueOffset: -60
        },
        brightest: {
            lightness: 0.97,
            chroma: 0.20,
            hueOffset: 60
        },
        interpolationCurve: {
            lightness: [0.7, 0.1, 1.0, 1.0],
            chroma: [0.0, 0.25, 1.0, 0.75],
            hue: [0.0, 0.25, 1.0, 0.75]
        },
        // Threshold distribution curve - controls how feed space is allocated to colors
        thresholdCurve: [0.3, 0.1, 1.0, 0.7]
    };
}

