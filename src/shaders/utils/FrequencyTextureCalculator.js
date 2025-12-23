// FrequencyTextureCalculator - Utility for calculating frequency bands from audio data
// Shared logic for frequency texture updates across shader plugins

export class FrequencyTextureCalculator {
    /**
     * Calculate frequency bands from audio data
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {number} numBands - Number of bands to calculate
     * @param {AudioAnalyzer} [audioAnalyzer] - Optional AudioAnalyzer instance with calculateConfigurableBands method
     * @returns {Object|null} Object with leftBands, rightBands, numBands, or null if calculation fails
     */
    static calculateBands(audioData, numBands, audioAnalyzer = null) {
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
            
            const hzToBin = (hz) => Math.floor(hz / binSize);
            const getAverage = (data, start, end) => {
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
                const binEnd = Math.min(hzToBin(freqEnd), audioData.leftFrequencyData.length - 1);
                leftBands[i] = getAverage(audioData.leftFrequencyData, binStart, binEnd);
                rightBands[i] = getAverage(audioData.rightFrequencyData, binStart, binEnd);
            }
            
            return { leftBands, rightBands, numBands };
        }
        
        return null;
    }
    
    /**
     * Create texture data array from band data (interleaved RG format)
     * @param {Float32Array} leftBands - Left channel band data
     * @param {Float32Array} rightBands - Right channel band data
     * @returns {Float32Array} Interleaved texture data (R=left, G=right)
     */
    static createTextureData(leftBands, rightBands) {
        const numBands = leftBands.length;
        const data = new Float32Array(numBands * 2);
        for (let i = 0; i < numBands; i++) {
            data[i * 2] = leftBands[i];
            data[i * 2 + 1] = rightBands[i];
        }
        return data;
    }
}

