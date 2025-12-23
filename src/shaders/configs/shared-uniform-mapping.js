// Shared Uniform Mapping - Common audio data to uniform mappings
// Used by all shader configs to avoid duplication

export const sharedUniformMapping = {
    // Standard audio uniforms
    uBass: (data) => data?.bass || 0,
    uMid: (data) => data?.mid || 0,
    uTreble: (data) => data?.treble || 0,
    uVolume: (data) => data?.volume || 0,
    
    // Frequency band uniforms
    uFreq1: (data) => data?.smoothedFreq1 || 0,
    uFreq2: (data) => data?.smoothedFreq2 || 0,
    uFreq3: (data) => data?.smoothedFreq3 || 0,
    uFreq4: (data) => data?.smoothedFreq4 || 0,
    uFreq5: (data) => data?.smoothedFreq5 || 0,
    uFreq6: (data) => data?.smoothedFreq6 || 0,
    uFreq7: (data) => data?.smoothedFreq7 || 0,
    uFreq8: (data) => data?.smoothedFreq8 || 0,
    uFreq9: (data) => data?.smoothedFreq9 || 0,
    uFreq10: (data) => data?.smoothedFreq10 || 0,
    
    // Stereo uniforms
    uBassStereo: (data) => data?.bassStereo || 0,
    uMidStereo: (data) => data?.midStereo || 0,
    uTrebleStereo: (data) => data?.trebleStereo || 0,
    
    // Temporal and beat uniforms
    uSmoothedBass: (data) => data?.smoothedBass || 0,
    uSmoothedMid: (data) => data?.smoothedMid || 0,
    uSmoothedTreble: (data) => data?.smoothedTreble || 0,
    uPeakBass: (data) => data?.peakBass || 0,
    uBeatTime: (data) => data?.beatTime || 0,
    uBeatIntensity: (data) => data?.beatIntensity || 0,
    uBPM: (data) => data?.estimatedBPM || 0,
    
    // Multi-frequency beat uniforms
    uBeatTimeBass: (data) => data?.beatTimeBass || 0,
    uBeatTimeMid: (data) => data?.beatTimeMid || 0,
    uBeatTimeTreble: (data) => data?.beatTimeTreble || 0,
    uBeatIntensityBass: (data) => data?.beatIntensityBass || 0,
    uBeatIntensityMid: (data) => data?.beatIntensityMid || 0,
    uBeatIntensityTreble: (data) => data?.beatIntensityTreble || 0,
    uBeatStereoBass: (data) => data?.beatStereoBass || 0,
    uBeatStereoMid: (data) => data?.beatStereoMid || 0,
    uBeatStereoTreble: (data) => data?.beatStereoTreble || 0
};

