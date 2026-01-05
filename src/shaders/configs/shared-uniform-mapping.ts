// Shared Uniform Mapping - Common audio data to uniform mappings
// Used by all shader configs to avoid duplication

import type { ExtendedAudioData } from '../../types/index.js';

export const sharedUniformMapping: Record<string, (data: ExtendedAudioData | null) => number> = {
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
    uBeatStereoTreble: (data) => data?.beatStereoTreble || 0,
    
    // Missing peaks (already calculated)
    uPeakVolume: (data) => data?.peakVolume || 0,
    uPeakMid: (data) => data?.peakMid || 0,
    uPeakTreble: (data) => data?.peakTreble || 0,
    
    // Raw frequency bands (unsmoothed)
    uFreq1Raw: (data) => data?.freq1 || 0,
    uFreq2Raw: (data) => data?.freq2 || 0,
    uFreq3Raw: (data) => data?.freq3 || 0,
    uFreq4Raw: (data) => data?.freq4 || 0,
    uFreq5Raw: (data) => data?.freq5 || 0,
    uFreq6Raw: (data) => data?.freq6 || 0,
    uFreq7Raw: (data) => data?.freq7 || 0,
    uFreq8Raw: (data) => data?.freq8 || 0,
    uFreq9Raw: (data) => data?.freq9 || 0,
    uFreq10Raw: (data) => data?.freq10 || 0,
    
    // Advanced metrics
    uFrequencySpread: (data) => data?.frequencySpread || 0,
    uBassOnset: (data) => data?.bassOnset || 0,
    uMidOnset: (data) => data?.midOnset || 0,
    uTrebleOnset: (data) => data?.trebleOnset || 0,
    
    // Frequency band groupings
    uLowBass: (data) => data?.lowBass || 0,
    uMidBass: (data) => data?.midBass || 0,
    uLowMid: (data) => data?.lowMid || 0,
    uHighMid: (data) => data?.highMid || 0,
    uPresence: (data) => data?.presence || 0,
    
    // Beat timing helpers
    uBeatPhase: (data) => data?.beatPhase || 0,
    uBeatAnticipation: (data) => data?.beatAnticipation || 0,
    
    // Energy metrics
    uEnergy: (data) => data?.energy || 0,
    uHighEnergy: (data) => data?.highEnergy || 0,
    uLowEnergy: (data) => data?.lowEnergy || 0,
    
    // Playback progress
    uPlaybackProgress: (data) => data?.playbackProgress || 0
};

