// FrequencyTextureCalculator - Utility for calculating frequency bands from audio data
// Shared logic for frequency texture updates across shader plugins

import type { ExtendedAudioData } from '../../types/index.js';
import type { AudioAnalyzer } from '../../core/audio/AudioAnalyzer.js';

interface FrequencyBandResult {
    leftBands: Float32Array;
    rightBands: Float32Array;
    numBands: number;
}

export class FrequencyTextureCalculator {
    /**
     * Calculate frequency bands from audio data
     * @param audioData - Audio data from AudioAnalyzer
     * @param numBands - Number of bands to calculate
     * @param audioAnalyzer - Optional AudioAnalyzer instance with calculateConfigurableBands method
     * @returns Object with leftBands, rightBands, numBands, or null if calculation fails
     */
    static calculateBands(audioData: ExtendedAudioData | null, numBands: number, audioAnalyzer: AudioAnalyzer | null = null): FrequencyBandResult | null {
        if (!audioData || !audioData.audioContext) return null;
        
        // Try to use AudioAnalyzer's method if available
        if (audioAnalyzer && typeof audioAnalyzer.calculateConfigurableBands === 'function') {
            return audioAnalyzer.calculateConfigurableBands(numBands);
        }
        
        // Fallback: calculate directly from frequency data
        if (audioData.leftFrequencyData && audioData.rightFrequencyData && audioData.frequencyData) {
            const sampleRate = audioData.audioContext?.sampleRate || 44100;
            const nyquist = sampleRate / 2;
            const binSize = nyquist / audioData.frequencyData.length;
            
            const hzToBin = (hz: number): number => Math.floor(hz / binSize);
            const getAverage = (data: Uint8Array, start: number, end: number): number => {
                let sum = 0;
                const count = Math.min(end, data.length - 1) - start + 1;
                if (count <= 0) return 0;
                for (let i = start; i <= end && i < data.length; i++) {
                    sum += data[i];
                }
                return sum / count / 255.0;
            };
            
            const minFreq = 20;
            const maxFreq = nyquist;
            const leftBands = new Float32Array(numBands);
            const rightBands = new Float32Array(numBands);
            
            for (let i = 0; i < numBands; i++) {
                const t = i / (numBands - 1);
                const freqStart = minFreq * Math.pow(maxFreq / minFreq, t);
                const freqEnd = (i === numBands - 1) 
                    ? maxFreq 
                    : minFreq * Math.pow(maxFreq / minFreq, (i + 1) / (numBands - 1));
                const binStart = hzToBin(freqStart);
                // Calculate binEnd to include the bin that contains freqEnd
                // Ensure we include the bin containing freqEnd if it falls beyond the calculated bin
                let binEnd = Math.min(Math.max(hzToBin(freqEnd), binStart), audioData.leftFrequencyData!.length - 1);
                const binEndFreq = (binEnd + 1) * binSize;
                const finalBinEnd = (freqEnd > binEndFreq && binEnd < audioData.leftFrequencyData!.length - 1)
                    ? Math.min(binEnd + 1, audioData.leftFrequencyData!.length - 1)
                    : binEnd;
                leftBands[i] = getAverage(audioData.leftFrequencyData, binStart, finalBinEnd);
                rightBands[i] = getAverage(audioData.rightFrequencyData, binStart, finalBinEnd);
            }
            
            return { leftBands, rightBands, numBands };
        }
        
        return null;
    }
    
    /**
     * Create texture data array from band data (interleaved RG format)
     * @param leftBands - Left channel band data
     * @param rightBands - Right channel band data
     * @returns Interleaved texture data (R=left, G=right)
     */
    static createTextureData(leftBands: Float32Array, rightBands: Float32Array): Float32Array {
        const numBands = leftBands.length;
        const data = new Float32Array(numBands * 2);
        for (let i = 0; i < numBands; i++) {
            data[i * 2] = leftBands[i];
            data[i * 2 + 1] = rightBands[i];
        }
        return data;
    }
}

