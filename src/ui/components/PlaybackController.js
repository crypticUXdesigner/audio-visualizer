// Playback Controller Component
// Handles play/pause, skip, seek, playback modes (loop/random), and keyboard controls

export class PlaybackController {
    constructor(audioAnalyzer, waveformScrubber = null, titleDisplay = null) {
        this.audioAnalyzer = audioAnalyzer;
        this.waveformScrubber = waveformScrubber;
        this.titleDisplay = titleDisplay;
        
        // DOM element references
        this.playControlBtn = document.getElementById('playControlBtn');
        this.skipLeftBtn = document.getElementById('skipLeftBtn');
        this.skipRightBtn = document.getElementById('skipRightBtn');
        this.playbackModeBtn = document.getElementById('playbackModeBtn');
        
        // State
        this.isSeeking = false;
        this.seekUpdateInterval = null;
        this.isLoopEnabled = false;
        this.isRandomEnabled = true;
        
        // Callbacks
        this.onTrackChange = null;
        this.onPlayRandomTrack = null;
        this.onLoadTrack = null;
    }
    
    /**
     * Initialize the playback controller
     */
    init() {
        // Setup playback mode toggle button
        this.setupPlaybackModeButton();
        
        // Setup keyboard controls
        this.setupKeyboardControls();
        
        // Setup audio element listeners
        this.setupAudioElementListeners();
        
        // Setup button click handlers
        if (this.playControlBtn) {
            this.playControlBtn.addEventListener('click', () => {
                this.handlePlayControl();
            });
        }
        
        if (this.skipLeftBtn) {
            this.skipLeftBtn.addEventListener('click', async () => {
                await this.handleSkipLeft();
            });
        }
        
        if (this.skipRightBtn) {
            this.skipRightBtn.addEventListener('click', async () => {
                await this.handleSkipRight();
            });
        }
    }
    
    /**
     * Handle play/pause control
     */
    async handlePlayControl() {
        if (!this.audioAnalyzer.audioElement) {
            return;
        }
        
        try {
            const isPlaying = this.audioAnalyzer.isPlaying();
            
            if (isPlaying) {
                // Currently playing -> Pause
                this.audioAnalyzer.pause();
                this.updatePlayControlButton();
                // Hide title display if visible when pausing
                if (this.titleDisplay) {
                    this.titleDisplay.hide();
                }
            } else {
                // Not playing -> Resume/Play from current position
                if (this.audioAnalyzer.audioContext.state === 'suspended') {
                    await this.audioAnalyzer.audioContext.resume();
                }
                await this.audioAnalyzer.play();
                this.startSeekUpdate();
                this.updatePlayControlButton();
            }
        } catch (error) {
            console.error('Error controlling playback:', error);
        }
    }
    
    /**
     * Update play control button state
     */
    updatePlayControlButton() {
        if (!this.playControlBtn) return;
        
        if (!this.audioAnalyzer.audioElement) {
            // Use SVG icons instead of text
            const playIcon = this.playControlBtn.querySelector('.play-icon');
            const pauseIcon = this.playControlBtn.querySelector('.pause-icon');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
            return;
        }
        
        const isPlaying = this.audioAnalyzer.isPlaying();
        const currentTime = this.audioAnalyzer.audioElement.currentTime;
        const playIcon = this.playControlBtn.querySelector('.play-icon');
        const pauseIcon = this.playControlBtn.querySelector('.pause-icon');
        
        if (isPlaying) {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        } else if (currentTime > 0.1) {
            // Paused but not at beginning - show play icon
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        } else {
            // Stopped/at beginning - show play icon
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
    }
    
    /**
     * Setup audio element event listeners
     */
    setupAudioElementListeners() {
        if (this.audioAnalyzer.audioElement) {
            // Update playback mode button state when new track is loaded
            this.updatePlaybackModeButtonState();
            
            this.audioAnalyzer.audioElement.addEventListener('ended', () => {
                this.stopSeekUpdate();
                this.updatePlayControlButton();
                
                // Handle loop - if loop is enabled, it will automatically restart
                // due to audioElement.loop property, so we don't need to do anything here
                if (this.isLoopEnabled) {
                    return;
                }
                
                // Handle random - play random track when current track ends
                if (this.isRandomEnabled && this.onPlayRandomTrack) {
                    this.onPlayRandomTrack();
                    return;
                }
            });
            
            this.audioAnalyzer.audioElement.addEventListener('play', () => {
                this.startSeekUpdate();
                this.updatePlayControlButton();
            });
            
            this.audioAnalyzer.audioElement.addEventListener('pause', () => {
                this.updatePlayControlButton();
            });
            
            this.audioAnalyzer.audioElement.addEventListener('timeupdate', () => {
                this.updatePlayControlButton();
                // Check title display on timeupdate (for manual seeking)
                if (this.titleDisplay && this.audioAnalyzer.audioElement.duration && isFinite(this.audioAnalyzer.audioElement.duration)) {
                    const playbackProgress = this.audioAnalyzer.audioElement.currentTime / this.audioAnalyzer.audioElement.duration;
                    this.titleDisplay.checkTitleDisplay(playbackProgress, this.audioAnalyzer.audioElement.duration);
                }
            });
            
            this.audioAnalyzer.audioElement.addEventListener('loadedmetadata', () => {
                this.updateSeekBar();
            });
        }
    }
    
    /**
     * Setup playback mode button (loop/random toggle)
     */
    setupPlaybackModeButton() {
        if (!this.playbackModeBtn) return;
        
        this.playbackModeBtn.addEventListener('click', () => {
            // Toggle between random and loop modes
            if (this.isRandomEnabled) {
                // Switch to loop mode
                this.isRandomEnabled = false;
                this.isLoopEnabled = true;
            } else {
                // Switch to random mode
                this.isRandomEnabled = true;
                this.isLoopEnabled = false;
            }
            
            this.updatePlaybackModeButtonState();
        });
        
        // Initialize with default state (random enabled)
        this.updatePlaybackModeButtonState();
    }
    
    /**
     * Update playback mode button state
     */
    updatePlaybackModeButtonState() {
        if (!this.playbackModeBtn) return;
        
        const randomIcon = this.playbackModeBtn.querySelector('.random-icon');
        const loopIcon = this.playbackModeBtn.querySelector('.loop-icon');
        
        if (this.isRandomEnabled) {
            // Random mode: show random icon, add active class
            if (randomIcon) randomIcon.style.display = 'block';
            if (loopIcon) loopIcon.style.display = 'none';
            this.playbackModeBtn.classList.add('active');
            this.playbackModeBtn.title = 'Random Playlist';
            
            // Disable audio element loop
            if (this.audioAnalyzer.audioElement) {
                this.audioAnalyzer.audioElement.loop = false;
            }
        } else if (this.isLoopEnabled) {
            // Loop mode: show loop icon, add active class
            if (randomIcon) randomIcon.style.display = 'none';
            if (loopIcon) loopIcon.style.display = 'block';
            this.playbackModeBtn.classList.add('active');
            this.playbackModeBtn.title = 'Loop Current Track';
            
            // Enable audio element loop
            if (this.audioAnalyzer.audioElement) {
                this.audioAnalyzer.audioElement.loop = true;
            }
        }
    }
    
    /**
     * Setup keyboard controls
     */
    setupKeyboardControls() {
        // Prevent default space behavior (page scroll) and handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Space key for play/pause (only when not in input fields)
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.handlePlayControl();
            }
            
            // Arrow keys for seeking (only when not in input fields)
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    this.skipBackward(15);
                } else if (e.code === 'ArrowRight') {
                    e.preventDefault();
                    this.skipForward(15);
                }
            }
        });
    }
    
    /**
     * Skip backward by specified seconds
     * @param {number} seconds - Seconds to skip backward
     */
    skipBackward(seconds) {
        if (!this.audioAnalyzer.audioElement || !this.audioAnalyzer.audioElement.duration) {
            return;
        }
        
        const newTime = Math.max(0, this.audioAnalyzer.audioElement.currentTime - seconds);
        this.audioAnalyzer.audioElement.currentTime = newTime;
        this.updateSeekBar();
    }
    
    /**
     * Skip forward by specified seconds
     * @param {number} seconds - Seconds to skip forward
     */
    skipForward(seconds) {
        if (!this.audioAnalyzer.audioElement || !this.audioAnalyzer.audioElement.duration) {
            return;
        }
        
        const duration = this.audioAnalyzer.audioElement.duration;
        const newTime = Math.min(duration, this.audioAnalyzer.audioElement.currentTime + seconds);
        this.audioAnalyzer.audioElement.currentTime = newTime;
        this.updateSeekBar();
    }
    
    /**
     * Handle skip left button (previous track or restart current)
     */
    async handleSkipLeft() {
        if (!this.audioAnalyzer.audioElement) {
            // No track loaded, load first track
            if (this.onLoadFirstTrack) {
                await this.onLoadFirstTrack();
            }
            return;
        }
        
        const currentTime = this.audioAnalyzer.audioElement.currentTime;
        const skipThreshold = 2; // If within 2 seconds of start, go to previous track
        
        if (currentTime <= skipThreshold) {
            // Already at or very close to the beginning, go to previous track
            // Hide title display when skipping tracks
            if (this.titleDisplay) {
                this.titleDisplay.hide();
            }
            if (this.onLoadPreviousTrack) {
                await this.onLoadPreviousTrack();
            }
        } else {
            // Skip to start of current track
            this.audioAnalyzer.audioElement.currentTime = 0;
            this.updateSeekBar();
        }
    }
    
    /**
     * Handle skip right button (next track)
     */
    async handleSkipRight() {
        // Hide title display when skipping tracks
        if (this.titleDisplay) {
            this.titleDisplay.hide();
        }
        
        // Go to next track
        if (this.onLoadNextTrack) {
            await this.onLoadNextTrack();
        } else if (this.onLoadFirstTrack) {
            // Fallback to first track if no current track
            await this.onLoadFirstTrack();
        }
    }
    
    /**
     * Update seek bar (delegated to waveform scrubber if available)
     */
    updateSeekBar() {
        if (this.waveformScrubber) {
            // Waveform scrubber handles its own updates
            return;
        }
        
        // Fallback: manual seek bar update if needed
        // This is handled by waveform scrubber in the current implementation
    }
    
    /**
     * Start seek update interval
     */
    startSeekUpdate() {
        if (this.seekUpdateInterval) return;
        this.seekUpdateInterval = setInterval(() => this.updateSeekBar(), 100);
    }
    
    /**
     * Stop seek update interval
     */
    stopSeekUpdate() {
        if (this.seekUpdateInterval) {
            clearInterval(this.seekUpdateInterval);
            this.seekUpdateInterval = null;
        }
    }
    
    /**
     * Clean up and destroy the component
     */
    destroy() {
        this.stopSeekUpdate();
        // Remove event listeners if needed
        // Most listeners are on DOM elements that will be cleaned up naturally
    }
}

