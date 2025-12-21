// Audio Processing Functions
// Shared audio analysis and modulation utilities

// Calculate volume sensitivity (more sensitive at low volumes)
float calculateVolumeSensitivity(float volume) {
    if (volume > 0.0) {
        float lowVolumeRange = 0.3;
        if (volume < lowVolumeRange) {
            // High sensitivity for low volumes: 2.0x at 0.0, 1.0x at 0.3
            return 2.0 - (volume / lowVolumeRange);
        } else {
            // Lower sensitivity for higher volumes: 1.0x at 0.3, 0.3x at 1.0
            float highVolumeT = (volume - lowVolumeRange) / (1.0 - lowVolumeRange);
            return 1.0 - (highVolumeT * 0.7);
        }
    } else {
        // Maximum sensitivity when completely silent
        return 2.0;
    }
}

// Calculate tempo-based animation speed
float calculateTempoSpeed(float bpm) {
    if (bpm > 0.0) {
        // Normalize BPM to speed multiplier (60-180 BPM range maps to 1.0-2.0x speed)
        float normalizedBPM = clamp((bpm - 60.0) / 120.0, 0.0, 1.0);
        return 1.0 + normalizedBPM * 1.0;
    }
    return 1.0;
}

// Calculate modulated time with volume and tempo
float calculateModulatedTime(
    float time,
    float timeOffset,
    float volume,
    float bass,
    float mid,
    float treble,
    float bpm,
    float staticTimeOffset,
    float baseTimeSpeed
) {
    float tempoSpeed = calculateTempoSpeed(bpm);
    float volumeSensitivity = calculateVolumeSensitivity(volume);
    float volumeModulation = (volume + bass * 0.3 + mid * 0.2 + treble * 0.1) * volumeSensitivity;
    float baseSpeed = baseTimeSpeed * tempoSpeed;
    return (time + staticTimeOffset + timeOffset) * baseSpeed + volumeModulation * 0.15;
}

// Calculate stereo brightness modulation
float calculateStereoBrightness(
    vec2 uv,
    float aspectRatio,
    float bassStereo,
    float midStereo,
    float trebleStereo,
    float bass,
    float mid,
    float treble
) {
    // Get horizontal position in normalized space (-1 = left edge, 0 = center, 1 = right edge)
    float horizontalPos = (uv.x / aspectRatio) * 2.0;
    
    // Calculate stereo contribution per frequency band
    float bassStereoContribution = bassStereo * bass;
    float midStereoContribution = midStereo * mid;
    float trebleStereoContribution = trebleStereo * treble;
    
    // Position-dependent stereo mapping
    float leftWeight = max(-horizontalPos, 0.0); // 1.0 at left edge, 0.0 at right
    float rightWeight = max(horizontalPos, 0.0);  // 0.0 at left edge, 1.0 at right
    float centerWeight = 1.0 - abs(horizontalPos); // 1.0 at center, 0.0 at edges
    
    // Combine stereo effects with position weighting
    float stereoModulation = 
        (bassStereoContribution + midStereoContribution + trebleStereoContribution) * 0.3 +
        (leftWeight * (bassStereoContribution + midStereoContribution + trebleStereoContribution) * -0.2) +
        (rightWeight * (bassStereoContribution + midStereoContribution + trebleStereoContribution) * 0.2);
    
    // Apply stereo modulation to brightness
    return 1.0 + stereoModulation * 0.15;
}

// Calculate volume scale (quieter songs stay darker)
float calculateVolumeScale(float volume) {
    return 0.3 + volume * 0.7;
}

