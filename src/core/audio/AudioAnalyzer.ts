// Audio Analysis Module
// Handles audio context, analysis, and provides structured audio data

import { VolumeAnalyzer } from './VolumeAnalyzer.js';
import { FrequencyAnalyzer } from './FrequencyAnalyzer.js';
import { SmoothingProcessor } from './SmoothingProcessor.js';
import { AudioLoader } from './AudioLoader.js';
import { BeatDetector } from './BeatDetector.js';
import { RippleManager } from './RippleManager.js';
import { AudioDataAggregator } from './AudioDataAggregator.js';
import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import { AUDIO_THRESHOLDS } from '../../config/constants.js';
import type { ExtendedAudioData } from '../../types/index.js';

export class AudioAnalyzer {
    audioContext: AudioContext | null = null;
    analyser: AnalyserNode | null = null;
    source: MediaElementAudioSourceNode | null = null;
    audioElement: HTMLAudioElement | null = null;
    
    // Audio loader (will be initialized after audio context is ready)
    audioLoader: AudioLoader | null = null;
    _isInitialized: boolean = false;
    
    // Frequency data
    frequencyData: Uint8Array | null = null;
    timeData: Uint8Array | null = null;
    
    // Stereo analysis
    splitter: ChannelSplitterNode | null = null;
    leftAnalyser: AnalyserNode | null = null;
    rightAnalyser: AnalyserNode | null = null;
    leftFrequencyData: Uint8Array | null = null;
    rightFrequencyData: Uint8Array | null = null;
    
    // Volume analyzer
    volumeAnalyzer: VolumeAnalyzer;
    
    // Volume properties (exposed for getData() API)
    volume: number = 0;
    peakVolume: number = 0;
    
    // Frequency analyzer (will be initialized after audio context is ready)
    frequencyAnalyzer: FrequencyAnalyzer | null = null;
    
    // Smoothing processor
    smoothingProcessor: SmoothingProcessor;
    
    // Beat detector (handles beat detection and ripple management)
    beatDetector: BeatDetector;
    rippleManager: RippleManager;
    
    lastUpdateTime: number | null = null;  // Track frame time for deltaTime calculation
        
    // Smoothed frequency bands (exposed for getData() API compatibility)
    // Values are updated from SmoothingProcessor in update() method
    smoothedFreq1: number = 0;
    smoothedFreq2: number = 0;
    smoothedFreq3: number = 0;
    smoothedFreq4: number = 0;
    smoothedFreq5: number = 0;
    smoothedFreq6: number = 0;
    smoothedFreq7: number = 0;
    smoothedFreq8: number = 0;
    smoothedFreq9: number = 0;
    smoothedFreq10: number = 0;
    
    // Smoothed main bands (exposed for getData() API compatibility)
    // Values are updated from SmoothingProcessor in update() method
    smoothedBass: number = 0;
    smoothedMid: number = 0;
    smoothedTreble: number = 0;
    
    // Main frequency bands
    bass: number = 0;
    mid: number = 0;
    treble: number = 0;
    
    // Color frequency bands
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
    
    // Stereo balance
    bassStereo: number = 0;
    midStereo: number = 0;
    trebleStereo: number = 0;
    
    // Beat detection (exposed via getters from beatDetector)
    beatTime: number = 0;
    beatIntensity: number = 0;
    lastBeatTime: number = 0;
    
    // Multi-frequency beat detection
    beatTimeBass: number = 0;
    beatTimeMid: number = 0;
    beatTimeTreble: number = 0;
    beatIntensityBass: number = 0;
    beatIntensityMid: number = 0;
    beatIntensityTreble: number = 0;
    beatStereoBass: number = 0;
    beatStereoMid: number = 0;
    beatStereoTreble: number = 0;
    lastBeatTimeBass: number = 0;
    lastBeatTimeMid: number = 0;
    lastBeatTimeTreble: number = 0;
    
    // Advanced audio metrics
    frequencySpread: number = 0;
    bassOnset: number = 0;
    midOnset: number = 0;
    trebleOnset: number = 0;
    lowBass: number = 0;
    midBass: number = 0;
    lowMid: number = 0;
    highMid: number = 0;
    presence: number = 0;
    beatPhase: number = 0;
    beatAnticipation: number = 0;
    energy: number = 0;
    highEnergy: number = 0;
    lowEnergy: number = 0;
    
    // Previous values for onset detection
    previousBass: number = 0;
    previousMid: number = 0;
    previousTreble: number = 0;
    
    // Event listener references for cleanup
    _onLoadedMetadata: ((this: HTMLAudioElement, ev: Event) => void) | null = null;
    _onError: ((this: HTMLAudioElement, ev: Event | ErrorEvent) => void) | null = null;
    _onCanPlay: ((this: HTMLAudioElement, ev: Event) => void) | null = null;
    
    constructor() {
        // Audio loader (will be initialized after audio context is ready)
        this.audioLoader = null;
        this._isInitialized = false;
        
        // Frequency data
        this.frequencyData = null;
        this.timeData = null;
        
        // Stereo analysis
        this.splitter = null;
        this.leftAnalyser = null;
        this.rightAnalyser = null;
        this.leftFrequencyData = null;
        this.rightFrequencyData = null;
        
        // Volume analyzer
        this.volumeAnalyzer = new VolumeAnalyzer();
        
        // Frequency analyzer (will be initialized after audio context is ready)
        this.frequencyAnalyzer = null;
        
        // Smoothing processor (BPM will be set from beatDetector)
        this.smoothingProcessor = new SmoothingProcessor(0);
        
        // Initialize ripple manager and beat detector
        this.rippleManager = new RippleManager();
        this.beatDetector = new BeatDetector();
        this.beatDetector.setRippleManager(this.rippleManager);
        this.beatDetector.setVolumeAnalyzer(this.volumeAnalyzer);
        
        this.lastUpdateTime = null;
        
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
        
        // Smoothed main bands
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedTreble = 0;
        
        // Main frequency bands
        this.bass = 0;
        this.mid = 0;
        this.treble = 0;
        
        // Color frequency bands
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
        
        // Stereo balance
        this.bassStereo = 0;
        this.midStereo = 0;
        this.trebleStereo = 0;
        
        // Beat detection
        this.beatTime = 0;
        this.beatIntensity = 0;
        this.lastBeatTime = 0;
        
        // Multi-frequency beat detection
        this.beatTimeBass = 0;
        this.beatTimeMid = 0;
        this.beatTimeTreble = 0;
        this.beatIntensityBass = 0;
        this.beatIntensityMid = 0;
        this.beatIntensityTreble = 0;
        this.beatStereoBass = 0;
        this.beatStereoMid = 0;
        this.beatStereoTreble = 0;
        this.lastBeatTimeBass = 0;
        this.lastBeatTimeMid = 0;
        this.lastBeatTimeTreble = 0;
        
        // Advanced audio metrics
        this.frequencySpread = 0;
        this.bassOnset = 0;
        this.midOnset = 0;
        this.trebleOnset = 0;
        this.lowBass = 0;
        this.midBass = 0;
        this.lowMid = 0;
        this.highMid = 0;
        this.presence = 0;
        this.beatPhase = 0;
        this.beatAnticipation = 0;
        this.energy = 0;
        this.highEnergy = 0;
        this.lowEnergy = 0;
        this.previousBass = 0;
        this.previousMid = 0;
        this.previousTreble = 0;
    }
    
    init(): void {
        try {
            // Create audio context with error handling
            const AudioContextClass = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error('AudioContext is not supported in this browser');
            }
            
            this.audioContext = new AudioContextClass({
                latencyHint: 'interactive'
            });
            
            // Handle suspended state (browser autoplay policy)
            if (this.audioContext && this.audioContext.state === 'suspended') {
                ShaderLogger.warn('AudioContext is suspended. User interaction required to resume.');
                // Set up resume handler
                const resumeAudio = async () => {
                    try {
                        if (this.audioContext) {
                            await this.audioContext.resume();
                            ShaderLogger.info('AudioContext resumed');
                        }
                        // Listeners with {once: true} auto-remove, no need to manually remove
                    } catch (err) {
                        ShaderLogger.error('Failed to resume AudioContext:', err);
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
            
            // Initialize frequency analyzer
            const sampleRate = this.audioContext.sampleRate || 44100;
            this.frequencyAnalyzer = new FrequencyAnalyzer(
                this.analyser,
                this.leftAnalyser,
                this.rightAnalyser,
                sampleRate
            );
            
            // Initialize audio loader (must be done after splitter is created)
            if (this.audioContext && this.splitter) {
                this.audioLoader = new AudioLoader(this.audioContext, this.splitter);
            } else {
                throw new Error('AudioContext or splitter not available for AudioLoader initialization');
            }
            
            this._isInitialized = true;
            ShaderLogger.info('AudioAnalyzer initialized with stereo support');
        } catch (error) {
            ShaderLogger.error('Error initializing AudioAnalyzer:', error);
            // Reset initialization flag on error
            this._isInitialized = false;
            this.audioLoader = null;
            // Show user-friendly error message
            this.showAudioError(error as Error);
            throw error; // Re-throw to allow caller to handle
        }
    }
    
    /**
     * Show user-friendly error message for audio initialization failures
     * @param {Error} error - The error that occurred
     */
    showAudioError(error: Error): void {
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
    setMetadataBPM(bpm: number): void {
        this.beatDetector.setMetadataBPM(bpm);
        if (typeof bpm === 'number' && bpm > 0 && bpm <= 300) {
            this.smoothingProcessor.setBPM(bpm);
            ShaderLogger.debug(`[BPM] Using metadata BPM: ${bpm}`);
        } else {
            if (bpm !== undefined && bpm !== null) {
                ShaderLogger.warn(`[BPM] Invalid BPM value from metadata: ${bpm}`);
            }
        }
    }
    
    /**
     * Get estimated BPM
     */
    get estimatedBPM(): number {
        return this.beatDetector.getEstimatedBPM();
    }
    
    /**
     * Get metadata BPM
     */
    get metadataBPM(): number {
        return this.beatDetector.getMetadataBPM();
    }
    
    async loadTrack(filePath: string, metadata: { bpm?: number } = {}): Promise<void> {
        try {
            // Set BPM from metadata if provided (from API or file metadata extraction)
            if (metadata.bpm !== undefined) {
                this.setMetadataBPM(metadata.bpm);
            } else {
                // Reset metadata BPM if not provided
                this.beatDetector.setMetadataBPM(0);
            }
            
            // Ensure AudioAnalyzer is initialized
            if (!this._isInitialized || !this.audioLoader) {
                // Auto-initialize if not already done
                if (!this._isInitialized) {
                    try {
                        this.init();
                    } catch (initError) {
                        ShaderLogger.error('Failed to auto-initialize AudioAnalyzer:', initError);
                        throw new Error('AudioAnalyzer initialization failed. Please call init() manually first.');
                    }
                }
                // Double-check after init
                if (!this.audioLoader) {
                    throw new Error('AudioLoader not initialized. AudioAnalyzer.init() must be called first.');
                }
            }
            
            this.audioElement = await this.audioLoader.loadTrack(filePath);
            this.source = this.audioLoader.getSource();
            
            // Connect splitter outputs to analysers (stereo analysis)
            if (this.splitter && this.leftAnalyser) {
                this.splitter.connect(this.leftAnalyser, 0, 0);   // Left channel to left analyser
            }
            if (this.splitter && this.rightAnalyser) {
                this.splitter.connect(this.rightAnalyser, 1, 0); // Right channel to right analyser
            }
            
            // Also connect source to main analyser (mono sum for overall analysis)
            if (this.source && this.analyser) {
                this.source.connect(this.analyser);
            }
            
            // Connect to output for playback
            if (this.source && this.audioContext) {
                this.source.connect(this.audioContext.destination);
            }
            
            // Play
            await this.audioElement.play();
        } catch (error) {
            ShaderLogger.error('Error loading audio track:', error);
            throw error;
        }
    }
    
    /**
     * Update audio analysis data
     * @param deltaTime - Optional deltaTime in seconds. If provided, uses this instead of calculating from real-world time.
     *                    This is critical for recording when seeking through audio, where audio time jumps but real-world time doesn't.
     *                    If not provided, calculates deltaTime from performance.now() (normal playback mode).
     */
    update(deltaTime?: number): void {
        if (!this.analyser || !this.audioContext || this.audioContext.state === 'closed') {
            return;
        }
        
        // Calculate frame time (deltaTime) for time-based smoothing
        // If deltaTime is provided (e.g., during recording with seeking), use it directly
        // Otherwise, calculate from real-world time (normal playback mode)
        let frameDeltaTime: number;
        if (deltaTime !== undefined) {
            // Use provided deltaTime (audio-time-based during recording)
            frameDeltaTime = deltaTime;
            // Still update lastUpdateTime for consistency, but it won't affect smoothing
            const currentTime = performance.now();
            this.lastUpdateTime = currentTime;
        } else {
            // Normal mode: calculate from real-world time
            const currentTime = performance.now();
            frameDeltaTime = this.lastUpdateTime !== null 
                ? (currentTime - this.lastUpdateTime) / 1000.0  // Convert ms to seconds
                : 0.016;  // Default to ~60fps on first frame
            this.lastUpdateTime = currentTime;
        }
        
        // Get fresh data
        if (this.analyser && this.frequencyData) {
            this.analyser.getByteFrequencyData(this.frequencyData as Uint8Array<ArrayBuffer>);
        }
        if (this.analyser && this.timeData) {
            this.analyser.getByteTimeDomainData(this.timeData as Uint8Array<ArrayBuffer>);
        }
        
        // Get stereo frequency data
        if (this.leftAnalyser && this.rightAnalyser && this.leftFrequencyData && this.rightFrequencyData) {
            this.leftAnalyser.getByteFrequencyData(this.leftFrequencyData as Uint8Array<ArrayBuffer>);
            this.rightAnalyser.getByteFrequencyData(this.rightFrequencyData as Uint8Array<ArrayBuffer>);
        }
        
        // Calculate frequency bands using FrequencyAnalyzer
        if (this.frequencyAnalyzer && this.frequencyData) {
            const mainBands = this.frequencyAnalyzer.calculateMainBands(this.frequencyData);
            this.bass = mainBands.bass;
            this.mid = mainBands.mid;
            this.treble = mainBands.treble;
            
            const colorBands = this.frequencyAnalyzer.calculateColorBands(this.frequencyData);
            this.freq1 = colorBands.freq1;
            this.freq2 = colorBands.freq2;
            this.freq3 = colorBands.freq3;
            this.freq4 = colorBands.freq4;
            this.freq5 = colorBands.freq5;
            this.freq6 = colorBands.freq6;
            this.freq7 = colorBands.freq7;
            this.freq8 = colorBands.freq8;
            this.freq9 = colorBands.freq9;
            this.freq10 = colorBands.freq10;
            
            const stereoBands = this.frequencyAnalyzer.calculateStereoBands(
                this.leftFrequencyData,
                this.rightFrequencyData
            );
            this.bassStereo = stereoBands.bassStereo;
            this.midStereo = stereoBands.midStereo;
            this.trebleStereo = stereoBands.trebleStereo;
        }
        
        // Calculate volume using VolumeAnalyzer
        if (this.timeData) {
            this.volumeAnalyzer.calculateVolume(this.timeData);
        }
        this.volumeAnalyzer.smoothVolume(frameDeltaTime, this.estimatedBPM);
        
        // Expose volume properties for getData() API
        this.volume = this.volumeAnalyzer.volume;
        this.peakVolume = this.volumeAnalyzer.peakVolume;
        
        // Apply tempo-relative smoothing using SmoothingProcessor
        this.smoothingProcessor.setBPM(this.estimatedBPM);
        
        // Smooth main frequency bands
        const smoothedMain = this.smoothingProcessor.smoothMainBands(this.bass, this.mid, this.treble, frameDeltaTime);
        this.smoothedBass = smoothedMain.smoothedBass;
        this.smoothedMid = smoothedMain.smoothedMid;
        this.smoothedTreble = smoothedMain.smoothedTreble;
        
        // Smooth frequency bands for color mapping
        const smoothedFreq = this.smoothingProcessor.smoothFrequencyBands({
            freq1: this.freq1, freq2: this.freq2, freq3: this.freq3, freq4: this.freq4, freq5: this.freq5,
            freq6: this.freq6, freq7: this.freq7, freq8: this.freq8, freq9: this.freq9, freq10: this.freq10
        }, frameDeltaTime);
        this.smoothedFreq1 = smoothedFreq.smoothedFreq1;
        this.smoothedFreq2 = smoothedFreq.smoothedFreq2;
        this.smoothedFreq3 = smoothedFreq.smoothedFreq3;
        this.smoothedFreq4 = smoothedFreq.smoothedFreq4;
        this.smoothedFreq5 = smoothedFreq.smoothedFreq5;
        this.smoothedFreq6 = smoothedFreq.smoothedFreq6;
        this.smoothedFreq7 = smoothedFreq.smoothedFreq7;
        this.smoothedFreq8 = smoothedFreq.smoothedFreq8;
        this.smoothedFreq9 = smoothedFreq.smoothedFreq9;
        this.smoothedFreq10 = smoothedFreq.smoothedFreq10;
        
        // Beat detection (multi-frequency with ripple tracking)
        this.beatDetector.detect(
            this.bass,
            this.mid,
            this.treble,
            this.smoothedBass,
            this.smoothedMid,
            this.smoothedTreble,
            this.bassStereo,
            this.midStereo,
            this.trebleStereo
        );
        
        // Sync beat detection state from beatDetector
        const beatState = this.beatDetector.getState();
        this.beatTime = beatState.beatTime;
        this.beatIntensity = beatState.beatIntensity;
        this.lastBeatTime = beatState.lastBeatTime;
        this.beatTimeBass = beatState.beatTimeBass;
        this.beatTimeMid = beatState.beatTimeMid;
        this.beatTimeTreble = beatState.beatTimeTreble;
        this.beatIntensityBass = beatState.beatIntensityBass;
        this.beatIntensityMid = beatState.beatIntensityMid;
        this.beatIntensityTreble = beatState.beatIntensityTreble;
        this.beatStereoBass = beatState.beatStereoBass;
        this.beatStereoMid = beatState.beatStereoMid;
        this.beatStereoTreble = beatState.beatStereoTreble;
        this.lastBeatTimeBass = beatState.lastBeatTimeBass;
        this.lastBeatTimeMid = beatState.lastBeatTimeMid;
        this.lastBeatTimeTreble = beatState.lastBeatTimeTreble;
        
        // Calculate advanced metrics
        this.calculateAdvancedMetrics();
    }
    
    /**
     * Calculate advanced audio metrics (frequency spread, onsets, groupings, beat timing)
     */
    private calculateAdvancedMetrics(): void {
        // Frequency spread (texture indicator)
        const freqs = [
            this.freq1, this.freq2, this.freq3, this.freq4, this.freq5,
            this.freq6, this.freq7, this.freq8, this.freq9, this.freq10
        ];
        const mean = freqs.reduce((a, b) => a + b, 0) / 10;
        const variance = freqs.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / 10;
        this.frequencySpread = Math.sqrt(variance);
        
        // Onset detection (sudden changes)
        const bassChange = Math.max(0, this.bass - this.previousBass);
        const midChange = Math.max(0, this.mid - this.previousMid);
        const trebleChange = Math.max(0, this.treble - this.previousTreble);
        
        // Normalize onset values (0-1 range)
        this.bassOnset = Math.min(1.0, bassChange * 2.0);  // Scale for sensitivity
        this.midOnset = Math.min(1.0, midChange * 2.0);
        this.trebleOnset = Math.min(1.0, trebleChange * 2.0);
        
        // Store current values for next frame
        this.previousBass = this.bass;
        this.previousMid = this.mid;
        this.previousTreble = this.treble;
        
        // Frequency band groupings
        this.lowBass = (this.freq9 + this.freq10) / 2.0;
        this.midBass = (this.freq7 + this.freq8) / 2.0;
        this.lowMid = (this.freq5 + this.freq6) / 2.0;
        this.highMid = (this.freq3 + this.freq4) / 2.0;
        this.presence = (this.freq1 + this.freq2) / 2.0;
        
        // Energy metrics
        this.energy = (this.bass + this.mid + this.treble) / 3.0;
        this.highEnergy = (this.treble + (this.freq1 + this.freq2 + this.freq3) / 3.0) / 2.0;
        this.lowEnergy = (this.bass + (this.freq8 + this.freq9 + this.freq10) / 3.0) / 2.0;
        
        // Beat timing helpers
        if (this.estimatedBPM > 0) {
            const beatPeriod = 60.0 / this.estimatedBPM;
            const phase = (this.beatTime % beatPeriod) / beatPeriod;
            this.beatPhase = phase;
            this.beatAnticipation = 1.0 - phase;  // Invert so 1.0 = approaching beat
        } else {
            this.beatPhase = 0;
            this.beatAnticipation = 0;
        }
    }
    
    /**
     * Get ripple data as arrays for shader uniforms
     * Returns arrays padded to max ripples length with zeros
     * Delegates to RippleManager
     */
    getRippleData(currentTime: number): {
        centers: number[];
        times: number[];
        intensities: number[];
        widths: number[];
        minRadii: number[];
        maxRadii: number[];
        intensityMultipliers: number[];
        active: number[];
        count: number;
    } {
        return this.rippleManager.getRippleData(currentTime);
    }
    
    // getStereoBalance moved to FrequencyAnalyzer
    
    // getAverage moved to FrequencyAnalyzer
    
    // Volume calculation methods moved to VolumeAnalyzer
    
    isPlaying() {
        // Get audioElement from audioLoader if available, otherwise use stored reference
        const audioEl = this.audioLoader?.getAudioElement() || this.audioElement;
        return audioEl && !audioEl.paused;
    }
    
    pause() {
        // Get audioElement from audioLoader if available, otherwise use stored reference
        const audioEl = this.audioLoader?.getAudioElement() || this.audioElement;
        if (audioEl) {
            audioEl.pause();
        }
    }
    
    async play() {
        // Get audioElement from audioLoader if available, otherwise use stored reference
        const audioEl = this.audioLoader?.getAudioElement() || this.audioElement;
        if (audioEl) {
            return await audioEl.play();
        }
    }
    
    /**
     * Returns structured audio data for shaders
     * Delegates to AudioDataAggregator for data aggregation
     * @returns {Object} Audio data object with all analysis values
     */
    getData(): ExtendedAudioData {
        return AudioDataAggregator.aggregate(this);
    }
    
    /**
     * Calculate configurable frequency bands with left/right channel separation
     * @param {number} numBands - Number of frequency bands (16-128)
     * @returns {Object} Object with leftBands and rightBands Float32Arrays
     */
    calculateConfigurableBands(numBands: number = 32): { leftBands: Float32Array; rightBands: Float32Array; numBands: number } {
        if (!this.frequencyAnalyzer) {
            return { leftBands: new Float32Array(numBands), rightBands: new Float32Array(numBands), numBands };
        }
        
        return this.frequencyAnalyzer.calculateConfigurableBands(
            this.frequencyData,
            this.leftFrequencyData,
            this.rightFrequencyData,
            numBands
        );
    }
    
    /**
     * Clean up all audio resources and disconnect nodes
     * Should be called when AudioAnalyzer is no longer needed
     */
    destroy() {
        // Store references for cleanup
        const audioEl = this.audioElement;
        const audioCtx = this.audioContext;
        
        // Stop and cleanup audio element
        if (audioEl) {
            audioEl.pause();
            audioEl.src = '';
            // Remove all event listeners
            if (this._onLoadedMetadata) {
                audioEl.removeEventListener('loadedmetadata', this._onLoadedMetadata);
            }
            if (this._onError) {
                audioEl.removeEventListener('error', this._onError);
            }
            if (this._onCanPlay) {
                audioEl.removeEventListener('canplay', this._onCanPlay);
            }
            this.audioElement = null;
        }
        
        // Disconnect all audio nodes
        if (this.source) {
            try {
                this.source.disconnect();
            } catch (e) {
                // Ignore - may already be disconnected
            }
            this.source = null;
        }
        
        if (this.splitter) {
            try {
                this.splitter.disconnect();
            } catch (e) {
                // Ignore - may already be disconnected
            }
            this.splitter = null;
        }
        
        if (this.analyser) {
            try {
                this.analyser.disconnect();
            } catch (e) {
                // Ignore - may already be disconnected
            }
            this.analyser = null;
        }
        
        if (this.leftAnalyser) {
            try {
                this.leftAnalyser.disconnect();
            } catch (e) {
                // Ignore - may already be disconnected
            }
            this.leftAnalyser = null;
        }
        
        if (this.rightAnalyser) {
            try {
                this.rightAnalyser.disconnect();
            } catch (e) {
                // Ignore - may already be disconnected
            }
            this.rightAnalyser = null;
        }
        
        // Close audio context
        if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close().catch(err => {
                ShaderLogger.warn('Error closing AudioContext:', err);
            });
        }
        
        // Clear all references
        this.audioContext = null;
        this.frequencyData = null;
        this.timeData = null;
        this.leftFrequencyData = null;
        this.rightFrequencyData = null;
        this._onLoadedMetadata = null;
        this._onError = null;
        this._onCanPlay = null;
    }
}


