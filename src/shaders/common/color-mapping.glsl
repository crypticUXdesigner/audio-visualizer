// Color Mapping Functions
// Frequency-based color threshold system

// Calculate active state for each frequency band
// Returns 10 floats via out parameters (GLSL doesn't support array returns)
void calculateFrequencyActiveStates(
    out float freq1Active,
    out float freq2Active,
    out float freq3Active,
    out float freq4Active,
    out float freq5Active,
    out float freq6Active,
    out float freq7Active,
    out float freq8Active,
    out float freq9Active,
    out float freq10Active
) {
    float freq1Min = 0.20;  // Brightest: 11.3k-20k Hz, needs 20% loudness to trigger
    float freq2Min = 0.20;  // color2: 5.7k-11.3k Hz, needs 20% loudness to trigger
    float freq3Min = 0.25;  // color3: 2.8k-5.7k Hz, needs 25% loudness to trigger
    float freq4Min = 0.30;  // color4: 1.4k-2.8k Hz, needs 30% loudness to trigger
    float freq5Min = 0.30;  // color5: 707-1414 Hz, needs 30% loudness to trigger
    float freq6Min = 0.25;  // color6: 354-707 Hz, needs 25% loudness to trigger
    float freq7Min = 0.20;  // color7: 177-354 Hz, needs 20% loudness to trigger
    float freq8Min = 0.15;  // color8: 88-177 Hz, needs 15% loudness to trigger
    float freq9Min = 0.10;  // color9: 44-88 Hz, needs 10% loudness to trigger
    float freq10Min = 0.10; // Darkest: 20-44 Hz, needs 10% loudness to trigger
    
    freq1Active = smoothstep(freq1Min - 0.05, freq1Min + 0.05, uFreq1);
    freq2Active = smoothstep(freq2Min - 0.05, freq2Min + 0.05, uFreq2);
    freq3Active = smoothstep(freq3Min - 0.05, freq3Min + 0.05, uFreq3);
    freq4Active = smoothstep(freq4Min - 0.05, freq4Min + 0.05, uFreq4);
    freq5Active = smoothstep(freq5Min - 0.05, freq5Min + 0.05, uFreq5);
    freq6Active = smoothstep(freq6Min - 0.05, freq6Min + 0.05, uFreq6);
    freq7Active = smoothstep(freq7Min - 0.05, freq7Min + 0.05, uFreq7);
    freq8Active = smoothstep(freq8Min - 0.05, freq8Min + 0.05, uFreq8);
    freq9Active = smoothstep(freq9Min - 0.05, freq9Min + 0.05, uFreq9);
    freq10Active = smoothstep(freq10Min - 0.05, freq10Min + 0.05, uFreq10);
}

// Calculate frequency-based threshold adjustments
// useFrequencyModulation: true for heightmap (frequency affects thresholds), false for refraction (constant thresholds)
void calculateFrequencyThresholds(
    float bayer,
    float freq1Active, float freq2Active, float freq3Active, float freq4Active, float freq5Active,
    float freq6Active, float freq7Active, float freq8Active, float freq9Active, float freq10Active,
    bool useFrequencyModulation,
    out float threshold1, out float threshold2, out float threshold3, out float threshold4, out float threshold5,
    out float threshold6, out float threshold7, out float threshold8, out float threshold9, out float threshold10
) {
    // Calculate each threshold individually (GLSL doesn't support array parameters well)
    if (useFrequencyModulation) {
        // Heightmap: frequency affects thresholds
        float threshold1Base = uThreshold1 + bayer * 0.04;
        float threshold1Reduced = threshold1Base - (uFreq1 * 0.05 * freq1Active);
        threshold1 = max(threshold1Reduced, threshold1Base * 0.70);
        
        float threshold2Base = uThreshold2 + bayer * 0.08;
        float threshold2Reduced = threshold2Base - (uFreq2 * 0.08 * freq2Active);
        threshold2 = max(threshold2Reduced, threshold2Base * 0.70);
        
        float threshold3Base = uThreshold3 + bayer * 0.10;
        float threshold3Reduced = threshold3Base - (uFreq3 * 0.12 * freq3Active);
        threshold3 = max(threshold3Reduced, threshold3Base * 0.70);
        
        float threshold4Base = uThreshold4 + bayer * 0.12;
        float threshold4Reduced = threshold4Base - (uFreq4 * 0.20 * freq4Active);
        threshold4 = max(threshold4Reduced, threshold4Base * 0.75);
        
        float threshold5Base = uThreshold5 + bayer * 0.14;
        float threshold5Reduced = threshold5Base - (uFreq5 * 0.30 * freq5Active);
        threshold5 = max(threshold5Reduced, threshold5Base * 0.75);
        
        float threshold6Base = uThreshold6 + bayer * 0.14;
        float threshold6Reduced = threshold6Base - (uFreq6 * 0.35 * freq6Active);
        threshold6 = max(threshold6Reduced, threshold6Base * 0.75);
        
        float threshold7Base = uThreshold7 + bayer * 0.14;
        float threshold7Reduced = threshold7Base - (uFreq7 * 0.25 * freq7Active);
        threshold7 = max(threshold7Reduced, threshold7Base * 0.85);
        
        float threshold8Base = uThreshold8 + bayer * 0.12;
        float threshold8Reduced = threshold8Base - (uFreq8 * 0.30 * freq8Active);
        threshold8 = max(threshold8Reduced, threshold8Base * 0.85);
        
        float threshold9Base = uThreshold9 + bayer * 0.08;
        float threshold9Reduced = threshold9Base - (uFreq9 * 0.40 * freq9Active);
        threshold9 = max(threshold9Reduced, threshold9Base * 0.85);
        
        float threshold10Base = uThreshold10 + bayer * 0.04;
        float threshold10Reduced = threshold10Base - (uFreq10 * 0.50 * freq10Active);
        threshold10 = max(threshold10Reduced, threshold10Base * 0.85);
    } else {
        // Refraction: constant thresholds (no frequency modulation)
        threshold1 = uThreshold1 + bayer * 0.04;
        threshold2 = uThreshold2 + bayer * 0.08;
        threshold3 = uThreshold3 + bayer * 0.10;
        threshold4 = uThreshold4 + bayer * 0.12;
        threshold5 = uThreshold5 + bayer * 0.14;
        threshold6 = uThreshold6 + bayer * 0.14;
        threshold7 = uThreshold7 + bayer * 0.14;
        threshold8 = uThreshold8 + bayer * 0.12;
        threshold9 = uThreshold9 + bayer * 0.08;
        threshold10 = uThreshold10 + bayer * 0.04;
    }
}

// Map noise value to color using thresholds
vec3 mapNoiseToColor(
    float noiseValue,
    float threshold1, float threshold2, float threshold3, float threshold4, float threshold5,
    float threshold6, float threshold7, float threshold8, float threshold9, float threshold10,
    float transitionWidth
) {
    float t = clamp(noiseValue, 0.0, 1.0);
    
    // Calculate weights for each color with smooth transitions
    float w1 = smoothstep(threshold1 - transitionWidth, threshold1 + transitionWidth, t);
    float w2 = smoothstep(threshold2 - transitionWidth, threshold2 + transitionWidth, t) * (1.0 - w1);
    float w3 = smoothstep(threshold3 - transitionWidth, threshold3 + transitionWidth, t) * (1.0 - w1 - w2);
    float w4 = smoothstep(threshold4 - transitionWidth, threshold4 + transitionWidth, t) * (1.0 - w1 - w2 - w3);
    float w5 = smoothstep(threshold5 - transitionWidth, threshold5 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4);
    float w6 = smoothstep(threshold6 - transitionWidth, threshold6 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5);
    float w7 = smoothstep(threshold7 - transitionWidth, threshold7 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6);
    float w8 = smoothstep(threshold8 - transitionWidth, threshold8 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7);
    float w9 = smoothstep(threshold9 - transitionWidth, threshold9 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7 - w8);
    float w10 = smoothstep(threshold10 - transitionWidth, threshold10 + transitionWidth, t) * (1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7 - w8 - w9);
    float w0 = 1.0 - w1 - w2 - w3 - w4 - w5 - w6 - w7 - w8 - w9 - w10;
    
    // Mix colors based on weights
    vec3 color = uColor * w1 + uColor2 * w2 + uColor3 * w3 + uColor4 * w4 + uColor5 * w5 + 
                uColor6 * w6 + uColor7 * w7 + uColor8 * w8 + uColor9 * w9 + uColor10 * (w10 + w0);
    
    // Always evaluate all uniforms to prevent WebGL optimization
    float uniformPresence = (uColor.r + uColor2.r + uColor3.r + uColor4.r + uColor5.r + 
                            uColor6.r + uColor7.r + uColor8.r + uColor9.r + uColor10.r) * 0.0000001;
    color += vec3(uniformPresence);
    
    return color;
}

