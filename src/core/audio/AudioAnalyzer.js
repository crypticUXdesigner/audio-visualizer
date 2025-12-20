// Audio Analysis Module
// Handles audio context, analysis, and provides structured audio data

import { TempoSmoothingConfig, getTempoRelativeTimeConstant, applyTempoRelativeSmoothing } from '../../config/tempoSmoothing.js';

export class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.audioElement = null;
        
        // Frequency data
        this.frequencyData = null;
        this.timeData = null;
        
        // Stereo analysis
        this.splitter = null;
        this.leftAnalyser = null;
        this.rightAnalyser = null;
        this.leftFrequencyData = null;
        this.rightFrequencyData = null;
        
        // Processed values (updated every frame)
        this.bass = 0;
        this.mid = 0;
        this.treble = 0;
        this.volume = 0;
        this.peakVolume = 0;
        
        // Volume smoothing (asymmetric: fast attack, slow release)
        // Tempo-relative attack/release (musical note values) - adapts to song BPM
        this.smoothedVolume = 0.0;
        this.lastUpdateTime = null;  // Track frame time for deltaTime calculation
        
        // Frequency bands for color mapping (0.0 to 1.0) - 10 bands, octave-spaced
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
        
        // Smoothed frequency bands
        this.smoothedFreq1 = 0;
        this.smoothedFreq2 = 0;
        this.smoothedFreq3 = 0;
        this.smoothedFreq4 = 0;
        this.smoothedFreq5 = 0;
        this.smoothedFreq6 = 0;
        this.smoothedFreq7 = 0;
        this.smoothedFreq8 = 0;
        this.smoothedFreq9 = 0;
        this.smoothedFreq10 = 0;
        
        // Stereo balance per frequency band (-1 = left, 0 = center, 1 = right)
        this.bassStereo = 0;
        this.midStereo = 0;
        this.trebleStereo = 0;
        
        // Temporal smoothing and beat detection
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedTreble = 0;
        this.peakBass = 0;
        this.peakMid = 0;
        this.peakTreble = 0;
        this.beatTime = 0;        // Time since last beat (in seconds)
        this.beatIntensity = 0;   // Intensity of last beat (0-1)
        this.lastBeatTime = 0;    // Timestamp of last beat (milliseconds)
        this.estimatedBPM = 0;    // Estimated beats per minute
        this.metadataBPM = 0;     // BPM from file metadata or API (takes precedence)
        
        // Multi-frequency beat detection
        this.beatTimeBass = 0;
        this.beatTimeMid = 0;
        this.beatTimeTreble = 0;
        this.beatIntensityBass = 0;
        this.beatIntensityMid = 0;
        this.beatIntensityTreble = 0;
        this.beatStereoBass = 0;    // Stereo position when bass beat was detected (fixed)
        this.beatStereoMid = 0;     // Stereo position when mid beat was detected (fixed)
        this.beatStereoTreble = 0;  // Stereo position when treble beat was detected (fixed)
        this.lastBeatTimeBass = 0;
        this.lastBeatTimeMid = 0;
        this.lastBeatTimeTreble = 0;
        
        // Multiple ripple tracking system
        // Each ripple: { startTime, centerX, centerY, intensity, active }
        this.maxRipples = 12; // Maximum number of simultaneous ripples
        this.ripples = []; // Array of active ripples
        this.rippleLifetime = 2.0; // Ripples fade out after 2 seconds
        
        // Rate limiting and cooldown system
        this.rippleCreationTimes = []; // Track when ripples were created (for rate limiting)
        this.rippleRateLimitWindow = 500; // 500ms window
        this.rippleRateLimit = 9; // Max 10 ripples in 500ms window
        this.rippleCooldownUntil = 0; // Timestamp when cooldown ends
        this.rippleCooldownDuration = 300; // 300ms cooldown after hitting rate limit
        
        // Dynamic change detection
        this.previousBass = 0;
        this.previousMid = 0;
        this.previousTreble = 0;
        this.dynamicChangeThreshold = 0.07; // Minimum change required to trigger ripple
        
        // Configurable thresholds per frequency band for ripple triggering
        this.bassThreshold = 0.08;   // Minimum threshold for bass to trigger ripple
        this.midThreshold = 0.05;    // Minimum threshold for mid to trigger ripple
        this.trebleThreshold = 0.05; // Minimum threshold for treble to trigger ripple
        
        // Stereo emphasis factor (0.0-1.0, lower = more emphasis on differences)
        // 0.7 = moderate emphasis, 0.5 = strong emphasis, 1.0 = no emphasis (linear)
        this.stereoEmphasisExponent = 0.7;
        
        // Object pooling for ripple data arrays (performance optimization)
        // Reuse arrays instead of allocating new ones every frame
        this._rippleDataCache = {
            centers: new Array(this.maxRipples * 2),
            times: new Array(this.maxRipples),
            intensities: new Array(this.maxRipples),
            widths: new Array(this.maxRipples),
            minRadii: new Array(this.maxRipples),
            maxRadii: new Array(this.maxRipples),
            intensityMultipliers: new Array(this.maxRipples),
            active: new Array(this.maxRipples)
        };
    }
    
    init() {
        try {
            // Create audio context with error handling
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error('AudioContext is not supported in this browser');
            }
            
            this.audioContext = new AudioContextClass({
                latencyHint: 'interactive'
            });
            
            // Handle suspended state (browser autoplay policy)
            if (this.audioContext.state === 'suspended') {
                console.warn('AudioContext is suspended. User interaction required to resume.');
                // Set up resume handler
                const resumeAudio = async () => {
                    try {
                        await this.audioContext.resume();
                        console.log('AudioContext resumed');
                        // Remove listeners after first resume
                        document.removeEventListener('click', resumeAudio);
                        document.removeEventListener('touchstart', resumeAudio);
                    } catch (err) {
                        console.error('Failed to resume AudioContext:', err);
                    }
                };
                document.addEventListener('click', resumeAudio, { once: true });
                document.addEventListener('touchstart', resumeAudio, { once: true });
            }
            
            // Create main analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.3;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            
            // Create stereo splitter and analysers
            this.splitter = this.audioContext.createChannelSplitter(2);
            this.leftAnalyser = this.audioContext.createAnalyser();
            this.rightAnalyser = this.audioContext.createAnalyser();
            this.leftAnalyser.fftSize = 2048;
            this.rightAnalyser.fftSize = 2048;
            this.leftAnalyser.smoothingTimeConstant = 0.3;
            this.rightAnalyser.smoothingTimeConstant = 0.3;
            this.leftAnalyser.minDecibels = -90;
            this.leftAnalyser.maxDecibels = -10;
            this.rightAnalyser.minDecibels = -90;
            this.rightAnalyser.maxDecibels = -10;
            
            const bufferLength = this.analyser.frequencyBinCount; // 1024
            this.frequencyData = new Uint8Array(bufferLength);
            this.timeData = new Uint8Array(bufferLength);
            this.leftFrequencyData = new Uint8Array(bufferLength);
            this.rightFrequencyData = new Uint8Array(bufferLength);
            
            console.log('AudioAnalyzer initialized with stereo support');
        } catch (error) {
            console.error('Error initializing AudioAnalyzer:', error);
            // Show user-friendly error message
            this.showAudioError(error);
            throw error; // Re-throw to allow caller to handle
        }
    }
    
    /**
     * Show user-friendly error message for audio initialization failures
     * @param {Error} error - The error that occurred
     */
    showAudioError(error) {
        // Create error message element if it doesn't exist
        let errorElement = document.getElementById('audio-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'audio-error-message';
            errorElement.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 0, 0, 0.9);
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                z-index: 10000;
                font-family: 'Lexend', sans-serif;
                font-size: 14px;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            `;
            document.body.appendChild(errorElement);
        }
        
        errorElement.textContent = `Audio initialization failed: ${error.message}. Please check your browser's audio settings.`;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorElement && errorElement.parentNode) {
                errorElement.parentNode.removeChild(errorElement);
            }
        }, 5000);
    }
    
    /**
     * Set BPM from metadata (API or file metadata)
     * @param {number} bpm - BPM value from metadata
     */
    setMetadataBPM(bpm) {
        if (typeof bpm === 'number' && bpm > 0 && bpm <= 300) {
            this.metadataBPM = bpm;
            this.estimatedBPM = bpm;  // Use metadata BPM as initial estimate
            console.log(`[BPM] Using metadata BPM: ${bpm}`);
        } else {
            // Reset if invalid
            this.metadataBPM = 0;
            if (bpm !== undefined && bpm !== null) {
                console.warn(`[BPM] Invalid BPM value from metadata: ${bpm}`);
            }
        }
    }
    
    async loadTrack(filePath, metadata = {}) {
        try {
            // Resume audio context if suspended (browser autoplay policy)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Stop current if playing
            if (this.audioElement) {
                this.audioElement.pause();
                if (this.source) {
                    this.source.disconnect();
                }
            }
            
            // Set BPM from metadata if provided (from API or file metadata extraction)
            if (metadata.bpm !== undefined) {
                this.setMetadataBPM(metadata.bpm);
            } else {
                // Reset metadata BPM if not provided
                this.metadataBPM = 0;
            }
            
            // Check if it's a full URL (http/https) - use as-is
            let cleanPath;
            if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                cleanPath = filePath;
            } else {
                // Get base URL from Vite (handles both dev and production)
                const baseUrl = import.meta.env.BASE_URL || '/';
                
                // Normalize the path: if it starts with /, remove it; otherwise use as-is
                // Then prepend base URL
                const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
                const absolutePath = baseUrl + normalizedPath;
                
                // Ensure base URL doesn't have double slashes
                cleanPath = absolutePath.replace(/([^:]\/)\/+/g, '$1');
            }
            
            // Create audio element
            this.audioElement = new Audio(cleanPath);
            this.audioElement.crossOrigin = 'anonymous'; // For CORS when using API later
            
            // Ensure playbackRate is 1.0 (normal speed)
            if (this.audioElement.playbackRate !== 1.0) {
                console.warn(`⚠️  Audio playbackRate is ${this.audioElement.playbackRate}, resetting to 1.0`);
                this.audioElement.playbackRate = 1.0;
            }
            
            // Add event listeners to track audio loading and metadata
            this.audioElement.addEventListener('loadedmetadata', () => {
                // Metadata loaded - audio is ready
            });
            
            this.audioElement.addEventListener('error', (e) => {
                console.error('Audio loading error:', e, this.audioElement.error);
            });
            
            this.audioElement.addEventListener('canplay', () => {
                // Audio can start playing
            });
            
            // Create source node
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            
            // Connect to splitter for stereo analysis
            this.source.connect(this.splitter);
            this.splitter.connect(this.leftAnalyser, 0, 0);   // Left channel to left analyser
            this.splitter.connect(this.rightAnalyser, 1, 0); // Right channel to right analyser
            
            // Also connect source to main analyser (mono sum for overall analysis)
            this.source.connect(this.analyser);
            
            // Connect to output for playback
            this.source.connect(this.audioContext.destination);
            
            // Play
            await this.audioElement.play();
        } catch (error) {
            console.error('Error loading audio track:', error);
            throw error;
        }
    }
    
    update() {
        if (!this.analyser) return;
        
        // Calculate frame time (deltaTime) for time-based smoothing
        const currentTime = performance.now();
        const deltaTime = this.lastUpdateTime !== null 
            ? (currentTime - this.lastUpdateTime) / 1000.0  // Convert ms to seconds
            : 0.016;  // Default to ~60fps on first frame
        this.lastUpdateTime = currentTime;
        
        // Get fresh data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeData);
        
        // Get stereo frequency data
        if (this.leftAnalyser && this.rightAnalyser) {
            this.leftAnalyser.getByteFrequencyData(this.leftFrequencyData);
            this.rightAnalyser.getByteFrequencyData(this.rightFrequencyData);
        }
        
        // Calculate frequency bands using Hz ranges
        // fftSize = 2048, so frequencyBinCount = 1024
        // Sample rate typically 44.1kHz, so Nyquist = 22050 Hz
        // Bin size = 22050 / 1024 ≈ 21.53 Hz per bin
        const sampleRate = this.audioContext?.sampleRate || 44100;
        const nyquist = sampleRate / 2;
        const binSize = nyquist / this.frequencyData.length;
        
        // Helper to convert Hz to bin number
        const hzToBin = (hz) => Math.floor(hz / binSize);
        
        // Calculate main frequency bands using Hz ranges
        // Bass: 20-200 Hz
        // Mid: 600-2000 Hz
        // Treble: 3000-6000 Hz
        this.bass = this.getAverage(this.frequencyData, hzToBin(20), hzToBin(200));
        this.mid = this.getAverage(this.frequencyData, hzToBin(600), hzToBin(2000));
        this.treble = this.getAverage(this.frequencyData, hzToBin(3000), hzToBin(6000));
        
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
        this.freq1 = this.getAverage(this.frequencyData, hzToBin(10240), hzToBin(20000));
        this.freq2 = this.getAverage(this.frequencyData, hzToBin(5120), hzToBin(10240));
        this.freq3 = this.getAverage(this.frequencyData, hzToBin(2560), hzToBin(5120));
        this.freq4 = this.getAverage(this.frequencyData, hzToBin(1280), hzToBin(2560));
        this.freq5 = this.getAverage(this.frequencyData, hzToBin(640), hzToBin(1280));
        this.freq6 = this.getAverage(this.frequencyData, hzToBin(320), hzToBin(640));
        this.freq7 = this.getAverage(this.frequencyData, hzToBin(160), hzToBin(320));
        this.freq8 = this.getAverage(this.frequencyData, hzToBin(80), hzToBin(160));
        this.freq9 = this.getAverage(this.frequencyData, hzToBin(40), hzToBin(80));
        this.freq10 = this.getAverage(this.frequencyData, hzToBin(20), hzToBin(40));
        
        // Calculate stereo balance per frequency band
        // Returns -1 (left) to 1 (right), 0 = center
        // Use same Hz ranges as main frequency bands
        if (this.leftFrequencyData && this.rightFrequencyData) {
            const bassLeft = this.getAverage(this.leftFrequencyData, hzToBin(20), hzToBin(200));
            const bassRight = this.getAverage(this.rightFrequencyData, hzToBin(20), hzToBin(200));
            this.bassStereo = this.getStereoBalance(bassLeft, bassRight);
            
            const midLeft = this.getAverage(this.leftFrequencyData, hzToBin(600), hzToBin(2000));
            const midRight = this.getAverage(this.rightFrequencyData, hzToBin(600), hzToBin(2000));
            this.midStereo = this.getStereoBalance(midLeft, midRight);
            
            const trebleLeft = this.getAverage(this.leftFrequencyData, hzToBin(3000), hzToBin(6000));
            const trebleRight = this.getAverage(this.rightFrequencyData, hzToBin(3000), hzToBin(6000));
            this.trebleStereo = this.getStereoBalance(trebleLeft, trebleRight);
        } else {
            this.bassStereo = 0;
            this.midStereo = 0;
            this.trebleStereo = 0;
        }
        
        // Calculate volume (RMS from time domain)
        this.volume = this.getRMS(this.timeData);
        
        // Calculate peak volume (maximum absolute value from time domain)
        this.peakVolume = this.getPeakVolume(this.timeData);
        
        // Apply tempo-relative asymmetric smoothing to volume
        const volumeConfig = TempoSmoothingConfig.volume;
        const attackTimeConstant = getTempoRelativeTimeConstant(
            volumeConfig.attackNote,
            this.estimatedBPM,
            volumeConfig.attackTimeFallback
        );
        const releaseTimeConstant = getTempoRelativeTimeConstant(
            volumeConfig.releaseNote,
            this.estimatedBPM,
            volumeConfig.releaseTimeFallback
        );
        this.smoothedVolume = applyTempoRelativeSmoothing(
            this.smoothedVolume,
            this.volume,
            deltaTime,
            attackTimeConstant,
            releaseTimeConstant
        );
        
        // Apply tempo-relative smoothing to frequency bands (for color mapping)
        const freqConfig = TempoSmoothingConfig.frequencyBands;
        const freqAttackTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.attackNote,
            this.estimatedBPM,
            freqConfig.attackTimeFallback
        );
        const freqReleaseTimeConstant = getTempoRelativeTimeConstant(
            freqConfig.releaseNote,
            this.estimatedBPM,
            freqConfig.releaseTimeFallback
        );
        
        // Smooth main frequency bands
        this.smoothedBass = applyTempoRelativeSmoothing(
            this.smoothedBass,
            this.bass,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedMid = applyTempoRelativeSmoothing(
            this.smoothedMid,
            this.mid,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedTreble = applyTempoRelativeSmoothing(
            this.smoothedTreble,
            this.treble,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        
        // Smooth frequency bands for color mapping
        this.smoothedFreq1 = applyTempoRelativeSmoothing(
            this.smoothedFreq1,
            this.freq1,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq2 = applyTempoRelativeSmoothing(
            this.smoothedFreq2,
            this.freq2,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq3 = applyTempoRelativeSmoothing(
            this.smoothedFreq3,
            this.freq3,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq4 = applyTempoRelativeSmoothing(
            this.smoothedFreq4,
            this.freq4,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq5 = applyTempoRelativeSmoothing(
            this.smoothedFreq5,
            this.freq5,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq6 = applyTempoRelativeSmoothing(
            this.smoothedFreq6,
            this.freq6,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq7 = applyTempoRelativeSmoothing(
            this.smoothedFreq7,
            this.freq7,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq8 = applyTempoRelativeSmoothing(
            this.smoothedFreq8,
            this.freq8,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq9 = applyTempoRelativeSmoothing(
            this.smoothedFreq9,
            this.freq9,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        this.smoothedFreq10 = applyTempoRelativeSmoothing(
            this.smoothedFreq10,
            this.freq10,
            deltaTime,
            freqAttackTimeConstant,
            freqReleaseTimeConstant
        );
        
        // Peak detection (decay over time)
        const peakDecay = 0.92;
        this.peakBass = Math.max(this.peakBass * peakDecay, this.bass);
        this.peakMid = Math.max(this.peakMid * peakDecay, this.mid);
        this.peakTreble = Math.max(this.peakTreble * peakDecay, this.treble);
        
        // Beat detection (primarily bass-driven)
        this.detectBeat();
    }
    
    detectBeat() {
        const currentTime = Date.now();
        const minBeatInterval = 160; // Minimum 200ms between beats (300 BPM max)
        
        // Detect beats for each frequency band separately
        const bands = [
            { 
                value: this.bass, 
                smoothed: this.smoothedBass,
                stereo: this.bassStereo,
                beatTime: 'beatTimeBass',
                intensity: 'beatIntensityBass',
                stereoPos: 'beatStereoBass',
                lastTime: 'lastBeatTimeBass',
                minThreshold: this.bassThreshold, // Configurable threshold
                bandType: 'bass' // For vertical positioning
            },
            { 
                value: this.mid, 
                smoothed: this.smoothedMid,
                stereo: this.midStereo,
                beatTime: 'beatTimeMid',
                intensity: 'beatIntensityMid',
                stereoPos: 'beatStereoMid',
                lastTime: 'lastBeatTimeMid',
                minThreshold: this.midThreshold, // Configurable threshold
                bandType: 'mid' // For vertical positioning
            },
            { 
                value: this.treble, 
                smoothed: this.smoothedTreble,
                stereo: this.trebleStereo,
                beatTime: 'beatTimeTreble',
                intensity: 'beatIntensityTreble',
                stereoPos: 'beatStereoTreble',
                lastTime: 'lastBeatTimeTreble',
                minThreshold: this.trebleThreshold, // Configurable threshold
                bandType: 'treble' // For vertical positioning
            }
        ];
        
        bands.forEach((band) => {
            // Use peak-based threshold instead of smoothed-based to detect beats
            // Peak decays over time, so when current value exceeds decaying peak, it's a beat
            const peakKey = band.beatTime.replace('beatTime', 'peak');
            const peakValue = this[peakKey] || 0;
            // Threshold: 85% of current peak value, or minimum threshold, whichever is higher
            // This allows beats when value exceeds decaying peak
            const threshold = Math.max(peakValue * 0.85, band.minThreshold);
            
            // Update beat time (time since last beat in seconds)
            if (this[band.lastTime] > 0) {
                this[band.beatTime] = (currentTime - this[band.lastTime]) / 1000.0;
                // Cap at 2 seconds (fade out after 2s)
                if (this[band.beatTime] > 2.0) {
                    this[band.beatTime] = 0;
                    this[band.intensity] = 0;
                }
            } else {
                this[band.beatTime] = 0;
            }
            
            // Get previous value for dynamic change detection
            const previousKey = band.beatTime.replace('beatTime', 'previous');
            let previousValue = 0;
            if (band.beatTime === 'beatTimeBass') {
                previousValue = this.previousBass;
            } else if (band.beatTime === 'beatTimeMid') {
                previousValue = this.previousMid;
            } else if (band.beatTime === 'beatTimeTreble') {
                previousValue = this.previousTreble;
            }
            
            // Calculate dynamic change (how much the signal has increased)
            const dynamicChange = band.value - previousValue;
            
            // Check for new beat with dynamic change detection
            // Must pass: threshold check, minimum threshold, beat interval, AND significant dynamic change
            if (band.value > threshold && band.value > band.minThreshold && 
                (this[band.lastTime] === 0 || (currentTime - this[band.lastTime]) > minBeatInterval) &&
                dynamicChange > this.dynamicChangeThreshold) {
                // Beat detected! Capture stereo position at this moment (fixed for this ripple)
                this[band.lastTime] = currentTime;
                // Increase intensity calculation to make ripples more visible
                const intensity = Math.min(band.value * 1.5, 1.0); // Increased multiplier from 1.25 to 1.5
                this[band.intensity] = intensity;
                this[band.stereoPos] = band.stereo; // Capture stereo position (won't change)
                this[band.beatTime] = 0; // Reset beat time
                
                // Add new ripple to tracking system (rate limiting handled inside)
                // Pass band type for vertical positioning: bass=lower, mid=center, treble=higher
                this.addRipple(currentTime, band.stereo, intensity, band.bandType);
            }
            
            // Update previous values for next frame
            if (band.beatTime === 'beatTimeBass') {
                this.previousBass = band.value;
            } else if (band.beatTime === 'beatTimeMid') {
                this.previousMid = band.value;
            } else if (band.beatTime === 'beatTimeTreble') {
                this.previousTreble = band.value;
            }
        });
        
        // Keep existing BPM calculation (based on bass) for backward compatibility
        const bassThreshold = this.smoothedBass * 1.4;
        if (this.lastBeatTime > 0) {
            this.beatTime = (currentTime - this.lastBeatTime) / 1000.0;
            if (this.beatTime > 2.0) {
                this.beatTime = 0;
                this.beatIntensity = 0;
            }
        } else {
            this.beatTime = 0;
        }
        
        if (this.bass > bassThreshold && this.bass > 0.15 && 
            (this.lastBeatTime === 0 || (currentTime - this.lastBeatTime) > minBeatInterval)) {
            const previousBeatTime = this.lastBeatTime;
            this.lastBeatTime = currentTime;
            this.beatIntensity = Math.min(this.bass / 0.8, 1.0);
            this.beatTime = 0;
            
            // Calculate BPM estimate (only if metadata BPM is not available)
            // Metadata BPM takes precedence over detected BPM
            if (this.metadataBPM === 0 && previousBeatTime > 0) {
                const beatInterval = (currentTime - previousBeatTime) / 1000.0;
                if (beatInterval > 0.1 && beatInterval < 2.0) { // Reasonable range (30-600 BPM)
                    const instantBPM = 60.0 / beatInterval;
                    if (this.estimatedBPM === 0) {
                        this.estimatedBPM = instantBPM;
                    } else {
                        this.estimatedBPM = this.estimatedBPM * 0.7 + instantBPM * 0.3;
                    }
                }
            }
        }
    }
    
    /**
     * Check if we can create a new ripple (rate limiting and cooldown)
     * @param {number} currentTime - Current timestamp (milliseconds)
     * @returns {boolean} True if ripple can be created
     */
    canCreateRipple(currentTime) {
        // Check if we're in cooldown
        if (currentTime < this.rippleCooldownUntil) {
            return false;
        }
        
        // Remove old creation times outside the window
        const windowStart = currentTime - this.rippleRateLimitWindow;
        this.rippleCreationTimes = this.rippleCreationTimes.filter(time => time > windowStart);
        
        // Check if we've hit the rate limit
        if (this.rippleCreationTimes.length >= this.rippleRateLimit) {
            // Start cooldown
            this.rippleCooldownUntil = currentTime + this.rippleCooldownDuration;
            return false;
        }
        
        return true;
    }
    
    /**
     * Add a new ripple to the tracking system
     * @param {number} startTime - Timestamp when ripple started (milliseconds)
     * @param {number} stereoPos - Stereo position (-1 to 1)
     * @param {number} intensity - Intensity of the beat (0-1)
     * @param {string} bandType - Frequency band type: 'bass', 'mid', or 'treble'
     * @returns {boolean} True if ripple was created, false if rate limited
     */
    addRipple(startTime, stereoPos, intensity, bandType = 'mid') {
        // Check rate limiting and cooldown
        if (!this.canCreateRipple(startTime)) {
            return false; // Rate limited or in cooldown
        }
        
        // Remove expired ripples first
        this.updateRipples(startTime);
        
        // If we're at max capacity, remove the oldest ripple
        if (this.ripples.length >= this.maxRipples) {
            this.ripples.shift(); // Remove oldest
        }
        
        // Track creation time for rate limiting
        this.rippleCreationTimes.push(startTime);
        
        // Set vertical position based on frequency band
        // Bass: starts at 20% down from center (-0.2), intensity moves it lower (max -0.9 at 90% from top)
        // Mid: centered (0.0)
        // Treble: 20% up from center (+0.2) - 10% closer to center than before
        let centerY = 0.0;
        let rippleWidth = 0.05; // Default width
        let rippleMinRadius = 0.0; // Default min radius
        let baseMaxRadius = 1.3; // Base max radius (will be scaled by intensity)
        let intensityMultiplier = 0.8; // Default intensity multiplier
        
        if (bandType === 'bass') {
            // Base position: 20% down from center (-0.2)
            // Intensity-based offset: more intense = lower position
            // Intensity 0.0 → -0.2 (base), Intensity 1.0 → -0.9 (90% from top)
            // Formula: base + (maxOffset - base) * intensity
            const bassBaseY = -0.15; // 20% down from center
            const bassMaxY = -0.4; // 90% from top (max distance)
            centerY = bassBaseY + (bassMaxY - bassBaseY) * intensity;
            rippleWidth = 0.15; // Reduced from 0.2 (narrower rings, less prominent)
            intensityMultiplier = 0.65; // Reduced from 0.75 (less bright)
            baseMaxRadius = 0.88; // Bass base max radius (reduced for ~30% shorter lifetime)
        } else if (bandType === 'treble') {
            centerY = 0.25; // 20% up from center (10% closer than before)
            rippleWidth = 0.07; // Thinner rings
            rippleMinRadius = 0.0; // Smaller min radius
            baseMaxRadius = 0.5; // Treble base max radius (smaller)
            intensityMultiplier = 0.55; // Less intensity (60% of normal)
        }
        // else: mid stays at defaults
        
        // Make maxRadius intensity-dependent: stronger beats create larger ripples
        // Scale from 0.5x to 1.0x of base max radius based on intensity
        let rippleMaxRadius = baseMaxRadius * (0.5 + intensity * 0.5);
        
        // Calculate dynamic lifetime based on when wave reaches maxRadius
        // Ripple speed matches shader's default uRippleSpeed (0.3)
        const rippleSpeed = 0.3;
        const radiusRange = rippleMaxRadius - rippleMinRadius;
        const timeToReachMax = radiusRange / rippleSpeed;
        // Add small buffer to ensure fade completes (0.1 seconds)
        const rippleLifetime = timeToReachMax + 0.1;
        
        // Add new ripple
        this.ripples.push({
            startTime: startTime,
            centerX: stereoPos, // Will be scaled in shader
            centerY: centerY, // Vertical position based on frequency band
            intensity: intensity,
            width: rippleWidth, // Per-ripple width
            minRadius: rippleMinRadius, // Per-ripple min radius
            maxRadius: rippleMaxRadius, // Per-ripple max radius (intensity-based)
            intensityMultiplier: intensityMultiplier, // Per-ripple intensity multiplier
            lifetime: rippleLifetime, // Per-ripple dynamic lifetime
            active: 1.0
        });
        
        return true;
    }
    
    /**
     * Update ripple states and remove expired ones
     * @param {number} currentTime - Current timestamp (milliseconds)
     */
    updateRipples(currentTime) {
        this.ripples = this.ripples.filter(ripple => {
            const age = (currentTime - ripple.startTime) / 1000.0; // Age in seconds
            // Use per-ripple lifetime if available, otherwise fall back to class property
            const lifetime = ripple.lifetime !== undefined ? ripple.lifetime : this.rippleLifetime;
            if (age > lifetime) {
                return false; // Remove expired ripple
            }
            return true; // Keep active ripple
        });
    }
    
    /**
     * Get ripple data as arrays for shader uniforms
     * Returns arrays padded to maxRipples length with zeros
     */
    getRippleData(currentTime) {
        // Update ripples to remove expired ones
        this.updateRipples(currentTime);
        
        // Reuse cached arrays instead of creating new ones (performance optimization)
        const centers = this._rippleDataCache.centers;
        const times = this._rippleDataCache.times;
        const intensities = this._rippleDataCache.intensities;
        const widths = this._rippleDataCache.widths;
        const minRadii = this._rippleDataCache.minRadii;
        const maxRadii = this._rippleDataCache.maxRadii;
        const intensityMultipliers = this._rippleDataCache.intensityMultipliers;
        const active = this._rippleDataCache.active;
        
        // Zero out arrays first (faster than fill() for small arrays)
        for (let i = 0; i < this.maxRipples * 2; i++) {
            centers[i] = 0;
        }
        for (let i = 0; i < this.maxRipples; i++) {
            times[i] = 0;
            intensities[i] = 0;
            widths[i] = 0;
            minRadii[i] = 0;
            maxRadii[i] = 0;
            intensityMultipliers[i] = 0;
            active[i] = 0;
        }
        
        // Fill with active ripple data
        this.ripples.forEach((ripple, index) => {
            if (index >= this.maxRipples) return; // Safety check
            
            const age = (currentTime - ripple.startTime) / 1000.0; // Age in seconds
            
            centers[index * 2] = ripple.centerX;
            centers[index * 2 + 1] = ripple.centerY;
            times[index] = age;
            intensities[index] = ripple.intensity;
            widths[index] = ripple.width || 0.1; // Default to 0.1 if not set
            minRadii[index] = ripple.minRadius !== undefined ? ripple.minRadius : 0.0;
            maxRadii[index] = ripple.maxRadius !== undefined ? ripple.maxRadius : 1.5;
            intensityMultipliers[index] = ripple.intensityMultiplier !== undefined ? ripple.intensityMultiplier : 1.0;
            active[index] = 1.0;
        });
        
        return {
            centers,
            times,
            intensities,
            widths,
            minRadii,
            maxRadii,
            intensityMultipliers,
            active,
            count: this.ripples.length
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
    
    getPeakVolume(data) {
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
            const normalized = Math.abs((data[i] - 128) / 128.0);
            peak = Math.max(peak, normalized);
        }
        return peak; // Returns 0-1 range
    }
    
    isPlaying() {
        return this.audioElement && !this.audioElement.paused;
    }
    
    pause() {
        if (this.audioElement) {
            this.audioElement.pause();
        }
    }
    
    play() {
        if (this.audioElement) {
            this.audioElement.play();
        }
    }
    
    /**
     * Returns structured audio data for shaders
     * @returns {Object} Audio data object with all analysis values
     */
    getData() {
        const currentTime = Date.now();
        
        // Calculate playback progress (0.0 to 1.0)
        let playbackProgress = 0.0;
        if (this.audioElement && this.audioElement.duration && isFinite(this.audioElement.duration)) {
            playbackProgress = this.audioElement.currentTime / this.audioElement.duration;
            playbackProgress = Math.max(0.0, Math.min(1.0, playbackProgress)); // Clamp to [0, 1]
        }
        
        return {
            bass: this.bass,
            mid: this.mid,
            treble: this.treble,
            volume: this.smoothedVolume,  // Use smoothed volume to reduce jittery brightness changes
            peakVolume: this.peakVolume,  // Peak volume (maximum absolute value, 0-1 range)
            freq1: this.freq1,
            freq2: this.freq2,
            freq3: this.freq3,
            freq4: this.freq4,
            freq5: this.freq5,
            freq6: this.freq6,
            freq7: this.freq7,
            freq8: this.freq8,
            freq9: this.freq9,
            freq10: this.freq10,
            smoothedFreq1: this.smoothedFreq1,
            smoothedFreq2: this.smoothedFreq2,
            smoothedFreq3: this.smoothedFreq3,
            smoothedFreq4: this.smoothedFreq4,
            smoothedFreq5: this.smoothedFreq5,
            smoothedFreq6: this.smoothedFreq6,
            smoothedFreq7: this.smoothedFreq7,
            smoothedFreq8: this.smoothedFreq8,
            smoothedFreq9: this.smoothedFreq9,
            smoothedFreq10: this.smoothedFreq10,
            bassStereo: this.bassStereo,
            midStereo: this.midStereo,
            trebleStereo: this.trebleStereo,
            smoothedBass: this.smoothedBass,
            smoothedMid: this.smoothedMid,
            smoothedTreble: this.smoothedTreble,
            peakBass: this.peakBass,
            peakMid: this.peakMid,
            peakTreble: this.peakTreble,
            beatTime: this.beatTime,
            beatIntensity: this.beatIntensity,
            estimatedBPM: this.estimatedBPM,
            beatTimeBass: this.beatTimeBass,
            beatTimeMid: this.beatTimeMid,
            beatTimeTreble: this.beatTimeTreble,
            beatIntensityBass: this.beatIntensityBass,
            beatIntensityMid: this.beatIntensityMid,
            beatIntensityTreble: this.beatIntensityTreble,
            beatStereoBass: this.beatStereoBass,
            beatStereoMid: this.beatStereoMid,
            beatStereoTreble: this.beatStereoTreble,
            // Multiple ripple tracking data
            rippleData: this.getRippleData(currentTime),
            // Playback progress (0.0 = start, 1.0 = end)
            playbackProgress: playbackProgress,
            // Raw data arrays for frequency visualizer
            frequencyData: this.frequencyData,
            timeData: this.timeData,
            leftFrequencyData: this.leftFrequencyData,
            rightFrequencyData: this.rightFrequencyData,
            audioContext: this.audioContext
        };
    }
}

