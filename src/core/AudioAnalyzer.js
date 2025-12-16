// Audio Analysis Module
// Handles audio context, analysis, and provides structured audio data

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
        
        // Frequency bands for color mapping (0.0 to 1.0)
        // freq1: 5.7k-20k Hz (white)
        // freq2: 1.4k-5.7k Hz (yellow)
        // freq3: 0.7k-1.4k Hz (violet)
        // freq4: 354-707 Hz (cyan)
        // freq5: 177-354 Hz (green)
        // freq6: 44-88 Hz (dark green)
        // freq7: 20-44 Hz (darkest)
        this.freq1 = 0;
        this.freq2 = 0;
        this.freq3 = 0;
        this.freq4 = 0;
        this.freq5 = 0;
        this.freq6 = 0;
        this.freq7 = 0;
        
        // Smoothed frequency bands (currently same as raw values)
        this.smoothedFreq1 = 0;
        this.smoothedFreq2 = 0;
        this.smoothedFreq3 = 0;
        this.smoothedFreq4 = 0;
        this.smoothedFreq5 = 0;
        this.smoothedFreq6 = 0;
        this.smoothedFreq7 = 0;
        
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
        this.maxRipples = 16; // Maximum number of simultaneous ripples
        this.ripples = []; // Array of active ripples
        this.rippleLifetime = 2.0; // Ripples fade out after 2 seconds
        
        // Rate limiting and cooldown system
        this.rippleCreationTimes = []; // Track when ripples were created (for rate limiting)
        this.rippleRateLimitWindow = 500; // 500ms window
        this.rippleRateLimit = 12; // Max 10 ripples in 500ms window
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
    }
    
    init() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive'
            });
            
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
        }
    }
    
    async loadTrack(filePath) {
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
            
            // Ensure path is absolute
            const absolutePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
            
            // Create audio element
            this.audioElement = new Audio(absolutePath);
            this.audioElement.crossOrigin = 'anonymous'; // For CORS when using API later
            
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
            console.log('Audio track loaded:', filePath);
        } catch (error) {
            console.error('Error loading audio track:', error);
            throw error;
        }
    }
    
    update() {
        if (!this.analyser) return;
        
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
        
        // Calculate frequency bands:
        // freq1: 5.7k-20k Hz (white/color1)
        // freq2: 1.4k-5.7k Hz (yellow/color2)
        // freq3: 0.7k-1.4k Hz (violet/color3)
        // freq4: 354-707 Hz (cyan/color4)
        // freq5: 177-354 Hz (green/color5)
        // freq6: 44-88 Hz (dark green/color6)
        // freq7: 20-44 Hz (darkest/color7)
        this.freq1 = this.getAverage(this.frequencyData, hzToBin(5700), hzToBin(20000));
        this.freq2 = this.getAverage(this.frequencyData, hzToBin(1400), hzToBin(5700));
        this.freq3 = this.getAverage(this.frequencyData, hzToBin(700), hzToBin(1400));
        this.freq4 = this.getAverage(this.frequencyData, hzToBin(354), hzToBin(707));
        this.freq5 = this.getAverage(this.frequencyData, hzToBin(177), hzToBin(354));
        this.freq6 = this.getAverage(this.frequencyData, hzToBin(44), hzToBin(88));
        this.freq7 = this.getAverage(this.frequencyData, hzToBin(20), hzToBin(44));
        
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
        
        // Use raw frequency values directly (no smoothing)
        this.smoothedBass = this.bass;
        this.smoothedMid = this.mid;
        this.smoothedTreble = this.treble;
        
        // Use raw frequency band values directly (no smoothing)
        this.smoothedFreq1 = this.freq1;
        this.smoothedFreq2 = this.freq2;
        this.smoothedFreq3 = this.freq3;
        this.smoothedFreq4 = this.freq4;
        this.smoothedFreq5 = this.freq5;
        this.smoothedFreq6 = this.freq6;
        this.smoothedFreq7 = this.freq7;
        
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
            
            // Calculate BPM estimate
            if (previousBeatTime > 0) {
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
        let rippleMaxRadius = 1.3; // Default max radius
        let intensityMultiplier = 0.8; // Default intensity multiplier
        
        if (bandType === 'bass') {
            // Base position: 20% down from center (-0.2)
            // Intensity-based offset: more intense = lower position
            // Intensity 0.0 → -0.2 (base), Intensity 1.0 → -0.9 (90% from top)
            // Formula: base + (maxOffset - base) * intensity
            const bassBaseY = -0.15; // 20% down from center
            const bassMaxY = -0.4; // 90% from top (max distance)
            centerY = bassBaseY + (bassMaxY - bassBaseY) * intensity;
            rippleWidth = 0.3; // Thicker rings
            intensityMultiplier = 0.75; // Less intensity (60% of normal)
        } else if (bandType === 'treble') {
            centerY = 0.25; // 20% up from center (10% closer than before)
            rippleWidth = 0.07; // Thinner rings
            rippleMinRadius = 0.0; // Smaller min radius
            rippleMaxRadius = 0.5; // Smaller max radius
            intensityMultiplier = 0.4; // Less intensity (60% of normal)
        }
        // else: mid stays at defaults
        
        // Add new ripple
        this.ripples.push({
            startTime: startTime,
            centerX: stereoPos, // Will be scaled in shader
            centerY: centerY, // Vertical position based on frequency band
            intensity: intensity,
            width: rippleWidth, // Per-ripple width
            minRadius: rippleMinRadius, // Per-ripple min radius
            maxRadius: rippleMaxRadius, // Per-ripple max radius
            intensityMultiplier: intensityMultiplier, // Per-ripple intensity multiplier
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
            if (age > this.rippleLifetime) {
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
        
        // Initialize arrays with zeros
        const centers = new Array(this.maxRipples * 2).fill(0); // x, y pairs
        const times = new Array(this.maxRipples).fill(0); // Time since start in seconds
        const intensities = new Array(this.maxRipples).fill(0);
        const widths = new Array(this.maxRipples).fill(0); // Per-ripple width
        const minRadii = new Array(this.maxRipples).fill(0); // Per-ripple min radius
        const maxRadii = new Array(this.maxRipples).fill(0); // Per-ripple max radius
        const intensityMultipliers = new Array(this.maxRipples).fill(0); // Per-ripple intensity multiplier
        const active = new Array(this.maxRipples).fill(0);
        
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
            volume: this.volume,
            freq1: this.freq1,
            freq2: this.freq2,
            freq3: this.freq3,
            freq4: this.freq4,
            freq5: this.freq5,
            freq6: this.freq6,
            freq7: this.freq7,
            smoothedFreq1: this.smoothedFreq1,
            smoothedFreq2: this.smoothedFreq2,
            smoothedFreq3: this.smoothedFreq3,
            smoothedFreq4: this.smoothedFreq4,
            smoothedFreq5: this.smoothedFreq5,
            smoothedFreq6: this.smoothedFreq6,
            smoothedFreq7: this.smoothedFreq7,
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

