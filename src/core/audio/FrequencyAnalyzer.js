// Frequency Analysis Module
// Handles frequency band calculations, stereo balance, and volume/RMS calculations

import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

export class FrequencyAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.leftAnalyser = null;
        this.rightAnalyser = null;
        
        // Stereo emphasis factor (0.0-1.0, lower = more emphasis on differences)
        this.stereoEmphasisExponent = 0.7;
    }
    
    init(audioContext, analyser, leftAnalyser, rightAnalyser) {
        this.audioContext = audioContext;
        this.analyser = analyser;
        this.leftAnalyser = leftAnalyser;
        this.rightAnalyser = rightAnalyser;
    }
    
    /**
     * Calculate all frequency bands, stereo balance, and volume
     * @param {Uint8Array} frequencyData - Main frequency data
     * @param {Uint8Array} leftFrequencyData - Left channel frequency data
     * @param {Uint8Array} rightFrequencyData - Right channel frequency data
     * @param {Uint8Array} timeData - Time domain data for RMS
     * @param {number} deltaTime - Time since last frame (seconds)
     * @param {number} estimatedBPM - Estimated BPM for tempo-relative smoothing
     * @returns {Object} Object containing all calculated values
     */
    calculate(frequencyData, leftFrequencyData, rightFrequencyData, timeData, deltaTime, estimatedBPM) {
        // Calculate frequency bands using Hz ranges
        // fftSize = 2048, so frequencyBinCount = 1024
        // Sample rate typically 44.1kHz, so Nyquist = 22050 Hz
        // Bin size = 22050 / 1024 ≈ 21.53 Hz per bin
        const sampleRate = this.audioContext?.sampleRate || 44100;
        const nyquist = sampleRate / 2;
        const binSize = nyquist / frequencyData.length;
        
        // Helper to convert Hz to bin number
        const hzToBin = (hz) => Math.floor(hz / binSize);
        
        // Calculate main frequency bands using Hz ranges
        // Bass: 20-200 Hz
        // Mid: 600-2000 Hz
        // Treble: 3000-6000 Hz
        const bass = this.getAverage(frequencyData, hzToBin(20), hzToBin(200));
        const mid = this.getAverage(frequencyData, hzToBin(600), hzToBin(2000));
        const treble = this.getAverage(frequencyData, hzToBin(3000), hzToBin(6000));
        
        // Calculate frequency bands (10 bands, octave-spaced)
        // freq1: 10.24k-20k Hz (brightest - high treble)
        // freq2: 5.12k-10.24k Hz (upper treble)
        // freq3: 2.56k-5.12k Hz (treble)
        // freq4: 1.28k-2.56k Hz (upper mid)
        // freq5: 640-1280 Hz (mid)
        // freq6: 320-640 Hz (lower mid)
        // freq7: 160-320 Hz (upper bass)
        // freq8: 80-160 Hz (bass)
        // freq9: 40-80 Hz (sub-bass)
        // freq10: 20-40 Hz (darkest - deep sub-bass)
        const freq1 = this.getAverage(frequencyData, hzToBin(10240), hzToBin(20000));
        const freq2 = this.getAverage(frequencyData, hzToBin(5120), hzToBin(10240));
        const freq3 = this.getAverage(frequencyData, hzToBin(2560), hzToBin(5120));
        const freq4 = this.getAverage(frequencyData, hzToBin(1280), hzToBin(2560));
        const freq5 = this.getAverage(frequencyData, hzToBin(640), hzToBin(1280));
        const freq6 = this.getAverage(frequencyData, hzToBin(320), hzToBin(640));
        const freq7 = this.getAverage(frequencyData, hzToBin(160), hzToBin(320));
        const freq8 = this.getAverage(frequencyData, hzToBin(80), hzToBin(160));
        const freq9 = this.getAverage(frequencyData, hzToBin(40), hzToBin(80));
        const freq10 = this.getAverage(frequencyData, hzToBin(20), hzToBin(40));
        
        // Calculate stereo balance per frequency band
        // Returns -1 (left) to 1 (right), 0 = center
        let bassStereo = 0;
        let midStereo = 0;
        let trebleStereo = 0;
        
        if (leftFrequencyData && rightFrequencyData) {
            const bassLeft = this.getAverage(leftFrequencyData, hzToBin(20), hzToBin(200));
            const bassRight = this.getAverage(rightFrequencyData, hzToBin(20), hzToBin(200));
            bassStereo = this.getStereoBalance(bassLeft, bassRight);
            
            const midLeft = this.getAverage(leftFrequencyData, hzToBin(600), hzToBin(2000));
            const midRight = this.getAverage(rightFrequencyData, hzToBin(600), hzToBin(2000));
            midStereo = this.getStereoBalance(midLeft, midRight);
            
            const trebleLeft = this.getAverage(leftFrequencyData, hzToBin(3000), hzToBin(6000));
            const trebleRight = this.getAverage(rightFrequencyData, hzToBin(3000), hzToBin(6000));
            trebleStereo = this.getStereoBalance(trebleLeft, trebleRight);
        }
        
        // Calculate volume (RMS from time domain)
        const volume = this.getRMS(timeData);
        
        // Apply tempo-relative asymmetric smoothing to volume
        const volumeConfig = TempoSmoothingConfig.volume;
        const attackTimeConstant = getTempoRelativeTimeConstant(
            volumeConfig.attackNote,
            estimatedBPM,
            volumeConfig.attackTimeFallback
        );
        const releaseTimeConstant = getTempoRelativeTimeConstant(
            volumeConfig.releaseNote,
            estimatedBPM,
            volumeConfig.releaseTimeFallback
        );
        
        // Note: smoothedVolume is managed by AudioAnalyzer, so we return the raw volume
        // and let AudioAnalyzer handle smoothing
        
        // Apply tempo-relative smoothing to frequency bands (for color mapping)
        const freqConfig = TempoSmoothingConfig.frequencyBands;
        const freqAttackTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.attackNote,
            estimatedBPM,
            freqConfig.attackTimeFallback
        );
        const freqReleaseTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.releaseNote,
            estimatedBPM,
            freqConfig.releaseTimeFallback
        );
        
        // Return all calculated values
        return {
            bass,
            mid,
            treble,
            volume,
            freq1,
            freq2,
            freq3,
            freq4,
            freq5,
            freq6,
            freq7,
            freq8,
            freq9,
            freq10,
            bassStereo,
            midStereo,
            trebleStereo,
            // Smoothing config for AudioAnalyzer to use
            smoothingConfig: {
                freqAttackTimeConstant,
                freqReleaseTimeConstant,
                volumeAttackTimeConstant: attackTimeConstant,
                volumeReleaseTimeConstant: releaseTimeConstant
            }
        };
    }
    
    getStereoBalance(left, right) {
        const total = left + right;
        if (total < 0.01) return 0; // Too quiet, assume center
        const raw = (right - left) / total; // -1 to 1 (linear)
        
        // Apply exponential curve to emphasize stereo differences
        // Since full left/right panning is rare, we amplify smaller differences
        // Sign preserves direction, exponent amplifies the difference
        // Lower exponent (0.5-0.7) = more emphasis, higher (0.8-1.0) = less emphasis
        return Math.sign(raw) * Math.pow(Math.abs(raw), this.stereoEmphasisExponent);
    }
    
    getAverage(data, start, end) {
        let sum = 0;
        const count = Math.min(end, data.length - 1) - start + 1;
        if (count <= 0) return 0;
        
        for (let i = start; i <= end && i < data.length; i++) {
            sum += data[i];
        }
        return sum / count / 255.0; // Normalize to 0-1
    }
    
    getRMS(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128.0;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / data.length);
    }
}

