// Frequency Analyzer Module
// Handles frequency band calculations, stereo analysis, and configurable band generation

export class FrequencyAnalyzer {
    analyser: AnalyserNode;
    leftAnalyser: AnalyserNode | null;
    rightAnalyser: AnalyserNode | null;
    sampleRate: number;
    
    // Main frequency bands
    bass: number = 0;
    mid: number = 0;
    treble: number = 0;
    
    // 10 frequency bands for color mapping (0.0 to 1.0) - octave-spaced
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
    freq1: number = 0;
    freq2: number = 0;
    freq3: number = 0;
    freq4: number = 0;
    freq5: number = 0;
    freq6: number = 0;
    freq7: number = 0;
    freq8: number = 0;
    freq9: number = 0;
    freq10: number = 0;
    
    // Stereo balance per frequency band (-1 = left, 0 = center, 1 = right)
    bassStereo: number = 0;
    midStereo: number = 0;
    trebleStereo: number = 0;
    
    constructor(analyser: AnalyserNode, leftAnalyser: AnalyserNode | null, rightAnalyser: AnalyserNode | null, sampleRate?: number) {
        this.analyser = analyser;
        this.leftAnalyser = leftAnalyser;
        this.rightAnalyser = rightAnalyser;
        this.sampleRate = sampleRate || 44100;
        
        // Main frequency bands
        this.bass = 0;
        this.mid = 0;
        this.treble = 0;
        
        // 10 frequency bands for color mapping (0.0 to 1.0) - octave-spaced
        this.freq1 = 0;
        this.freq2 = 0;
        this.freq3 = 0;
        this.freq4 = 0;
        this.freq5 = 0;
        this.freq6 = 0;
        this.freq7 = 0;
        this.freq8 = 0;
        this.freq9 = 0;
        this.freq10 = 0;
        
        // Stereo balance per frequency band (-1 = left, 0 = center, 1 = right)
        this.bassStereo = 0;
        this.midStereo = 0;
        this.trebleStereo = 0;
    }
    
    /**
     * Get average value in a frequency range
     * @param data - Frequency data array
     * @param start - Start bin index
     * @param end - End bin index
     * @returns Average value normalized to 0-1
     */
    getAverage(data: Uint8Array, start: number, end: number): number {
        let sum = 0;
        const count = Math.min(end, data.length - 1) - start + 1;
        if (count <= 0) return 0;
        
        for (let i = start; i <= end && i < data.length; i++) {
            sum += data[i];
        }
        return sum / count / 255.0; // Normalize to 0-1
    }
    
    /**
     * Calculate main frequency bands (bass, mid, treble)
     * @param frequencyData - Frequency data array
     * @returns Object with bass, mid, treble values
     */
    calculateMainBands(frequencyData: Uint8Array | null): { bass: number; mid: number; treble: number } {
        if (!frequencyData || frequencyData.length === 0) {
            return { bass: 0, mid: 0, treble: 0 };
        }
        
        const nyquist = this.sampleRate / 2;
        const binSize = nyquist / frequencyData.length;
        
        // Helper to convert Hz to bin number
        const hzToBin = (hz: number) => Math.floor(hz / binSize);
        
        // Calculate main frequency bands using Hz ranges
        // Bass: 20-200 Hz
        // Mid: 600-2000 Hz
        // Treble: 3000-6000 Hz
        const bass = this.getAverage(frequencyData, hzToBin(20), hzToBin(200));
        const mid = this.getAverage(frequencyData, hzToBin(600), hzToBin(2000));
        const treble = this.getAverage(frequencyData, hzToBin(3000), hzToBin(6000));
        
        this.bass = bass;
        this.mid = mid;
        this.treble = treble;
        
        return { bass, mid, treble };
    }
    
    /**
     * Calculate 10 frequency bands for color mapping
     * @param frequencyData - Frequency data array
     * @returns Object with freq1 through freq10 values
     */
    calculateColorBands(frequencyData: Uint8Array | null): {
        freq1: number; freq2: number; freq3: number; freq4: number; freq5: number;
        freq6: number; freq7: number; freq8: number; freq9: number; freq10: number;
    } {
        if (!frequencyData || frequencyData.length === 0) {
            return {
                freq1: 0, freq2: 0, freq3: 0, freq4: 0, freq5: 0,
                freq6: 0, freq7: 0, freq8: 0, freq9: 0, freq10: 0
            };
        }
        
        const nyquist = this.sampleRate / 2;
        const binSize = nyquist / frequencyData.length;
        
        // Helper to convert Hz to bin number
        const hzToBin = (hz: number) => Math.floor(hz / binSize);
        
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
        this.freq1 = this.getAverage(frequencyData, hzToBin(10240), hzToBin(20000));
        this.freq2 = this.getAverage(frequencyData, hzToBin(5120), hzToBin(10240));
        this.freq3 = this.getAverage(frequencyData, hzToBin(2560), hzToBin(5120));
        this.freq4 = this.getAverage(frequencyData, hzToBin(1280), hzToBin(2560));
        this.freq5 = this.getAverage(frequencyData, hzToBin(640), hzToBin(1280));
        this.freq6 = this.getAverage(frequencyData, hzToBin(320), hzToBin(640));
        this.freq7 = this.getAverage(frequencyData, hzToBin(160), hzToBin(320));
        this.freq8 = this.getAverage(frequencyData, hzToBin(80), hzToBin(160));
        this.freq9 = this.getAverage(frequencyData, hzToBin(40), hzToBin(80));
        this.freq10 = this.getAverage(frequencyData, hzToBin(20), hzToBin(40));
        
        return {
            freq1: this.freq1, freq2: this.freq2, freq3: this.freq3, freq4: this.freq4, freq5: this.freq5,
            freq6: this.freq6, freq7: this.freq7, freq8: this.freq8, freq9: this.freq9, freq10: this.freq10
        };
    }
    
    /**
     * Calculate stereo balance per frequency band
     * @param leftFrequencyData - Left channel frequency data
     * @param rightFrequencyData - Right channel frequency data
     * @returns Object with bassStereo, midStereo, trebleStereo values
     */
    calculateStereoBands(leftFrequencyData: Uint8Array | null, rightFrequencyData: Uint8Array | null): {
        bassStereo: number;
        midStereo: number;
        trebleStereo: number;
    } {
        if (!leftFrequencyData || !rightFrequencyData) {
            this.bassStereo = 0;
            this.midStereo = 0;
            this.trebleStereo = 0;
            return { bassStereo: 0, midStereo: 0, trebleStereo: 0 };
        }
        
        const nyquist = this.sampleRate / 2;
        const binSize = nyquist / leftFrequencyData.length;
        
        // Helper to convert Hz to bin number
        const hzToBin = (hz: number) => Math.floor(hz / binSize);
        
        // Calculate stereo balance per frequency band
        // Returns -1 (left) to 1 (right), 0 = center
        // Use same Hz ranges as main frequency bands
        const bassLeft = this.getAverage(leftFrequencyData, hzToBin(20), hzToBin(200));
        const bassRight = this.getAverage(rightFrequencyData, hzToBin(20), hzToBin(200));
        this.bassStereo = this.getStereoBalance(bassLeft, bassRight);
        
        const midLeft = this.getAverage(leftFrequencyData, hzToBin(600), hzToBin(2000));
        const midRight = this.getAverage(rightFrequencyData, hzToBin(600), hzToBin(2000));
        this.midStereo = this.getStereoBalance(midLeft, midRight);
        
        const trebleLeft = this.getAverage(leftFrequencyData, hzToBin(3000), hzToBin(6000));
        const trebleRight = this.getAverage(rightFrequencyData, hzToBin(3000), hzToBin(6000));
        this.trebleStereo = this.getStereoBalance(trebleLeft, trebleRight);
        
        return {
            bassStereo: this.bassStereo,
            midStereo: this.midStereo,
            trebleStereo: this.trebleStereo
        };
    }
    
    /**
     * Get stereo balance from left and right channel values
     * @param left - Left channel value
     * @param right - Right channel value
     * @param stereoEmphasisExponent - Stereo emphasis factor (0.0-1.0, lower = more emphasis)
     * @returns Stereo balance (-1 = left, 0 = center, 1 = right)
     */
    getStereoBalance(left: number, right: number, stereoEmphasisExponent: number = 0.7): number {
        const total = left + right;
        if (total < 0.01) return 0; // Too quiet, assume center
        const raw = (right - left) / total; // -1 to 1 (linear)
        
        // Apply exponential curve to emphasize stereo differences
        // Since full left/right panning is rare, we amplify smaller differences
        // Sign preserves direction, exponent amplifies the difference
        // Lower exponent (0.5-0.7) = more emphasis, higher (0.8-1.0) = less emphasis
        return Math.sign(raw) * Math.pow(Math.abs(raw), stereoEmphasisExponent);
    }
    
    /**
     * Calculate configurable frequency bands with left/right channel separation
     * @param frequencyData - Main frequency data
     * @param leftFrequencyData - Left channel frequency data
     * @param rightFrequencyData - Right channel frequency data
     * @param numBands - Number of frequency bands (16-128)
     * @returns Object with leftBands and rightBands Float32Arrays
     */
    calculateConfigurableBands(
        frequencyData: Uint8Array | null,
        leftFrequencyData: Uint8Array | null,
        rightFrequencyData: Uint8Array | null,
        numBands: number = 32
    ): { leftBands: Float32Array; rightBands: Float32Array; numBands: number } {
        if (!frequencyData) {
            return { leftBands: new Float32Array(numBands), rightBands: new Float32Array(numBands), numBands };
        }
        
        const nyquist = this.sampleRate / 2;
        const binSize = nyquist / frequencyData.length;
        
        // Helper to convert Hz to bin number
        const hzToBin = (hz: number) => Math.floor(hz / binSize);
        
        // Helper to get average value in a range
        const getAverage = (data: Uint8Array, start: number, end: number): number => {
            let sum = 0;
            const count = Math.min(end, data.length - 1) - start + 1;
            if (count <= 0) return 0;
            for (let i = start; i <= end && i < data.length; i++) {
                sum += data[i];
            }
            return sum / count / 255.0; // Normalize to 0-1
        };
        
        // Frequency range: 20 Hz to Nyquist (typically 22050 Hz)
        const minFreq = 20;
        const maxFreq = nyquist;
        
        // Logarithmic distribution of bands
        const leftBands = new Float32Array(numBands);
        const rightBands = new Float32Array(numBands);
        
        for (let i = 0; i < numBands; i++) {
            // Logarithmic spacing: ensure last band covers up to Nyquist
            const t = i / (numBands - 1);
            const freqStart = minFreq * Math.pow(maxFreq / minFreq, t);
            // For last band, use maxFreq (Nyquist) to ensure full coverage
            const freqEnd = (i === numBands - 1) 
                ? maxFreq 
                : minFreq * Math.pow(maxFreq / minFreq, (i + 1) / (numBands - 1));
            
            const binStart = hzToBin(freqStart);
            // Calculate binEnd to include the bin that contains freqEnd
            // Use ceil to ensure we include the bin containing freqEnd, then subtract 1 to get the bin index
            // (since bins are 0-indexed and bin N covers [N*binSize, (N+1)*binSize))
            const binEnd = Math.min(Math.max(hzToBin(freqEnd), binStart), frequencyData.length - 1);
            // Ensure we include the bin containing freqEnd if it falls beyond the calculated bin
            const binEndFreq = (binEnd + 1) * binSize;
            const finalBinEnd = (freqEnd > binEndFreq && binEnd < frequencyData.length - 1)
                ? Math.min(binEnd + 1, frequencyData.length - 1)
                : binEnd;
            
            // Calculate average for main channel
            const avg = getAverage(frequencyData, binStart, finalBinEnd);
            
            // Calculate left and right channel averages
            let leftAvg = 0;
            let rightAvg = 0;
            if (leftFrequencyData && rightFrequencyData) {
                leftAvg = getAverage(leftFrequencyData, binStart, finalBinEnd);
                rightAvg = getAverage(rightFrequencyData, binStart, finalBinEnd);
            } else {
                // Fallback to mono if stereo data not available
                leftAvg = avg;
                rightAvg = avg;
            }
            
            leftBands[i] = leftAvg;
            rightBands[i] = rightAvg;
        }
        
        return { leftBands, rightBands, numBands };
    }
    
    /**
     * Update sample rate (useful if audio context changes)
     * @param sampleRate - New sample rate
     */
    setSampleRate(sampleRate: number): void {
        this.sampleRate = sampleRate || 44100;
    }
}

