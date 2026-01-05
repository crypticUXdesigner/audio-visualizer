// Audio Source Selector Utility
// Provides a unified way to extract audio values by source type

import type { ExtendedAudioData } from '../../types/index.js';
import type { AudioSourceType } from '../../types/audio-reactivity.js';

/**
 * Get audio value by source type
 * @param audioData - Extended audio data
 * @param source - Audio source type
 * @returns Audio value (0-1 range)
 */
export function getAudioValue(
    audioData: ExtendedAudioData | null,
    source: AudioSourceType
): number {
    if (!audioData) return 0;
    
    switch (source) {
        case 'volume': return audioData.volume || 0;
        case 'bass': return audioData.bass || 0;
        case 'mid': return audioData.mid || 0;
        case 'treble': return audioData.treble || 0;
        
        case 'freq1': return audioData.smoothedFreq1 || 0;
        case 'freq2': return audioData.smoothedFreq2 || 0;
        case 'freq3': return audioData.smoothedFreq3 || 0;
        case 'freq4': return audioData.smoothedFreq4 || 0;
        case 'freq5': return audioData.smoothedFreq5 || 0;
        case 'freq6': return audioData.smoothedFreq6 || 0;
        case 'freq7': return audioData.smoothedFreq7 || 0;
        case 'freq8': return audioData.smoothedFreq8 || 0;
        case 'freq9': return audioData.smoothedFreq9 || 0;
        case 'freq10': return audioData.smoothedFreq10 || 0;
        
        case 'freq1Raw': return audioData.freq1 || 0;
        case 'freq2Raw': return audioData.freq2 || 0;
        case 'freq3Raw': return audioData.freq3 || 0;
        case 'freq4Raw': return audioData.freq4 || 0;
        case 'freq5Raw': return audioData.freq5 || 0;
        case 'freq6Raw': return audioData.freq6 || 0;
        case 'freq7Raw': return audioData.freq7 || 0;
        case 'freq8Raw': return audioData.freq8 || 0;
        case 'freq9Raw': return audioData.freq9 || 0;
        case 'freq10Raw': return audioData.freq10 || 0;
        
        case 'smoothedBass': return audioData.smoothedBass || 0;
        case 'smoothedMid': return audioData.smoothedMid || 0;
        case 'smoothedTreble': return audioData.smoothedTreble || 0;
        
        case 'peakVolume': return audioData.peakVolume || 0;
        case 'peakBass': return audioData.peakBass || 0;
        case 'peakMid': return audioData.peakMid || 0;
        case 'peakTreble': return audioData.peakTreble || 0;
        
        case 'beatIntensity': return audioData.beatIntensity || 0;
        case 'beatIntensityBass': return audioData.beatIntensityBass || 0;
        case 'beatIntensityMid': return audioData.beatIntensityMid || 0;
        case 'beatIntensityTreble': return audioData.beatIntensityTreble || 0;
        
        case 'bassStereo': return audioData.bassStereo || 0;
        case 'midStereo': return audioData.midStereo || 0;
        case 'trebleStereo': return audioData.trebleStereo || 0;
        
        case 'frequencySpread': return audioData.frequencySpread || 0;
        case 'bassOnset': return audioData.bassOnset || 0;
        case 'midOnset': return audioData.midOnset || 0;
        case 'trebleOnset': return audioData.trebleOnset || 0;
        
        case 'lowBass': return audioData.lowBass || 0;
        case 'midBass': return audioData.midBass || 0;
        case 'lowMid': return audioData.lowMid || 0;
        case 'highMid': return audioData.highMid || 0;
        case 'presence': return audioData.presence || 0;
        
        case 'beatPhase': return audioData.beatPhase || 0;
        case 'beatAnticipation': return audioData.beatAnticipation || 0;
        
        case 'energy': return audioData.energy || 0;
        case 'highEnergy': return audioData.highEnergy || 0;
        case 'lowEnergy': return audioData.lowEnergy || 0;
        
        default: return 0;
    }
}

