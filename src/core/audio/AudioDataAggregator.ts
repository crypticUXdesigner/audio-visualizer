// Audio Data Aggregator
// Aggregates audio analysis data into a structured format for shaders

import type { ExtendedAudioData } from '../../types/index.js';
import type { AudioAnalyzer } from './AudioAnalyzer.js';

/**
 * Aggregates audio analysis data from AudioAnalyzer into ExtendedAudioData format
 * This separates data aggregation logic from the main AudioAnalyzer class
 */
export class AudioDataAggregator {
    /**
     * Aggregate all audio data into a structured format
     * @param analyzer - AudioAnalyzer instance to read data from
     * @returns ExtendedAudioData object with all analysis values
     */
    static aggregate(analyzer: AudioAnalyzer): ExtendedAudioData {
        const currentTime = Date.now();
        
        // Calculate playback progress (0.0 to 1.0)
        let playbackProgress = 0.0;
        const audioElement = analyzer.audioLoader?.getAudioElement() || analyzer.audioElement;
        if (audioElement && audioElement.duration && isFinite(audioElement.duration)) {
            playbackProgress = audioElement.currentTime / audioElement.duration;
            playbackProgress = Math.max(0.0, Math.min(1.0, playbackProgress)); // Clamp to [0, 1]
        }
        
        // Calculate frequencyBands array from frequency data (for AudioData compatibility)
        const frequencyBands: number[] = [];
        if (analyzer.frequencyData) {
            // Convert frequency data to normalized array (0-1)
            for (let i = 0; i < analyzer.frequencyData.length; i++) {
                frequencyBands.push(analyzer.frequencyData[i] / 255.0);
            }
        }
        
        // Calculate stereoBalance (average of bass, mid, treble stereo values)
        const stereoBalance = (analyzer.bassStereo + analyzer.midStereo + analyzer.trebleStereo) / 3.0;
        
        return {
            bass: analyzer.bass,
            mid: analyzer.mid,
            treble: analyzer.treble,
            volume: analyzer.volumeAnalyzer.smoothedVolume,  // Use smoothed volume to reduce jittery brightness changes
            peakVolume: analyzer.volumeAnalyzer.peakVolume,  // Peak volume (maximum absolute value, 0-1 range)
            freq1: analyzer.freq1,
            freq2: analyzer.freq2,
            freq3: analyzer.freq3,
            freq4: analyzer.freq4,
            freq5: analyzer.freq5,
            freq6: analyzer.freq6,
            freq7: analyzer.freq7,
            freq8: analyzer.freq8,
            freq9: analyzer.freq9,
            freq10: analyzer.freq10,
            smoothedFreq1: analyzer.smoothedFreq1,
            smoothedFreq2: analyzer.smoothedFreq2,
            smoothedFreq3: analyzer.smoothedFreq3,
            smoothedFreq4: analyzer.smoothedFreq4,
            smoothedFreq5: analyzer.smoothedFreq5,
            smoothedFreq6: analyzer.smoothedFreq6,
            smoothedFreq7: analyzer.smoothedFreq7,
            smoothedFreq8: analyzer.smoothedFreq8,
            smoothedFreq9: analyzer.smoothedFreq9,
            smoothedFreq10: analyzer.smoothedFreq10,
            bassStereo: analyzer.bassStereo,
            midStereo: analyzer.midStereo,
            trebleStereo: analyzer.trebleStereo,
            smoothedBass: analyzer.smoothedBass,
            smoothedMid: analyzer.smoothedMid,
            smoothedTreble: analyzer.smoothedTreble,
            peakBass: analyzer.volumeAnalyzer.peakBass,
            peakMid: analyzer.volumeAnalyzer.peakMid,
            peakTreble: analyzer.volumeAnalyzer.peakTreble,
            beatTime: analyzer.beatTime,
            beatIntensity: analyzer.beatIntensity,
            estimatedBPM: analyzer.estimatedBPM,
            beatTimeBass: analyzer.beatTimeBass,
            beatTimeMid: analyzer.beatTimeMid,
            beatTimeTreble: analyzer.beatTimeTreble,
            beatIntensityBass: analyzer.beatIntensityBass,
            beatIntensityMid: analyzer.beatIntensityMid,
            beatIntensityTreble: analyzer.beatIntensityTreble,
            beatStereoBass: analyzer.beatStereoBass,
            beatStereoMid: analyzer.beatStereoMid,
            beatStereoTreble: analyzer.beatStereoTreble,
            // Multiple ripple tracking data
            rippleData: analyzer.getRippleData(currentTime),
            // Playback progress (0.0 = start, 1.0 = end)
            playbackProgress: playbackProgress,
            // Raw data arrays for frequency visualizer
            frequencyData: analyzer.frequencyData,
            timeData: analyzer.timeData,
            leftFrequencyData: analyzer.leftFrequencyData,
            rightFrequencyData: analyzer.rightFrequencyData,
            audioContext: analyzer.audioContext,
            // AudioData required properties
            frequencyBands: frequencyBands,
            stereoBalance: stereoBalance
        };
    }
}

