// Audio Controls UI Module
// Handles audio playback controls (play, pause, seek, track selection)

export class AudioControls {
    constructor(audioAnalyzer) {
        this.audioAnalyzer = audioAnalyzer;
        this.audioFileInput = document.getElementById('audioFileInput');
        this.playControlBtn = document.getElementById('playControlBtn');
        this.seekBar = document.getElementById('seekBar');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.totalTimeDisplay = document.getElementById('totalTime');
        this.trackButtons = document.querySelectorAll('.track-btn');
        
        this.isSeeking = false;
        this.seekUpdateInterval = null;
        
        this.init();
    }
    
    init() {
        if (!this.audioFileInput || !this.playControlBtn || !this.seekBar || 
            !this.currentTimeDisplay || !this.totalTimeDisplay) {
            console.warn('Audio control elements not found');
            return;
        }
        
        // Set first track as active by default
        if (this.trackButtons.length > 0) {
            this.trackButtons[0].classList.add('active');
        }
        
        // Track button clicks
        this.trackButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const filename = btn.dataset.track;
                await this.loadTrack(filename);
            });
        });
        
        // File input handler
        this.audioFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Remove active state from track buttons
            this.trackButtons.forEach(btn => btn.classList.remove('active'));
            
            const fileUrl = URL.createObjectURL(file);
            try {
                await this.audioAnalyzer.loadTrack(fileUrl);
                this.setupAudioElementListeners();
                this.updateSeekBar();
                this.startSeekUpdate();
                this.updatePlayControlButton();
            } catch (error) {
                console.error('Error loading audio file:', error);
            }
        });
        
        // Seek bar handlers
        this.seekBar.addEventListener('mousedown', () => {
            this.isSeeking = true;
        });
        
        this.seekBar.addEventListener('mouseup', () => {
            this.isSeeking = false;
            if (this.audioAnalyzer.audioElement && this.audioAnalyzer.audioElement.duration) {
                const percent = parseFloat(this.seekBar.value);
                this.audioAnalyzer.audioElement.currentTime = (percent / 100) * this.audioAnalyzer.audioElement.duration;
            }
        });
        
        this.seekBar.addEventListener('input', () => {
            if (this.isSeeking && this.audioAnalyzer.audioElement && this.audioAnalyzer.audioElement.duration) {
                const percent = parseFloat(this.seekBar.value);
                const newTime = (percent / 100) * this.audioAnalyzer.audioElement.duration;
                this.currentTimeDisplay.textContent = this.formatTime(newTime);
            }
        });
        
        // Play control button
        this.playControlBtn.addEventListener('click', async () => {
            await this.handlePlayControl();
        });
        
        // Override loadTrack to setup listeners
        const originalLoadTrack = this.audioAnalyzer.loadTrack.bind(this.audioAnalyzer);
        this.audioAnalyzer.loadTrack = async (filePath) => {
            await originalLoadTrack(filePath);
            this.setupAudioElementListeners();
            this.updateSeekBar();
        };
    }
    
    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    updatePlayControlButton() {
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
    
    updateSeekBar() {
        if (!this.audioAnalyzer.audioElement || this.isSeeking) return;
        
        const currentTime = this.audioAnalyzer.audioElement.currentTime;
        const duration = this.audioAnalyzer.audioElement.duration;
        
        if (duration && isFinite(duration)) {
            const percent = (currentTime / duration) * 100;
            this.seekBar.value = percent;
            this.currentTimeDisplay.textContent = this.formatTime(currentTime);
            this.totalTimeDisplay.textContent = this.formatTime(duration);
            this.updatePlayControlButton();
        }
    }
    
    startSeekUpdate() {
        if (this.seekUpdateInterval) clearInterval(this.seekUpdateInterval);
        this.seekUpdateInterval = setInterval(() => this.updateSeekBar(), 100);
    }
    
    stopSeekUpdate() {
        if (this.seekUpdateInterval) {
            clearInterval(this.seekUpdateInterval);
            this.seekUpdateInterval = null;
        }
    }
    
    async loadTrack(filename) {
        try {
            // Update active button
            this.trackButtons.forEach(btn => {
                if (btn.dataset.track === filename) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            await this.audioAnalyzer.loadTrack(`audio/${filename}`);
            
            // Wait for metadata
            if (this.audioAnalyzer.audioElement.readyState >= 1) {
                this.updateSeekBar();
            } else {
                this.audioAnalyzer.audioElement.addEventListener('loadedmetadata', () => {
                    this.updateSeekBar();
                }, { once: true });
            }
            
            this.startSeekUpdate();
            this.updatePlayControlButton();
        } catch (error) {
            console.error('Error loading track:', error);
        }
    }
    
    async handlePlayControl() {
        // If no track is loaded, load the first track
        if (!this.audioAnalyzer.audioElement && this.trackButtons.length > 0) {
            const firstTrackBtn = this.trackButtons[0];
            const filename = firstTrackBtn.dataset.track;
            await this.loadTrack(filename);
            
            if (this.audioAnalyzer.audioElement) {
                if (this.audioAnalyzer.audioContext.state === 'suspended') {
                    await this.audioAnalyzer.audioContext.resume();
                }
                await this.audioAnalyzer.play();
                this.startSeekUpdate();
                this.updatePlayControlButton();
            }
            return;
        }
        
        if (!this.audioAnalyzer.audioElement) {
            return;
        }
        
        try {
            const isPlaying = this.audioAnalyzer.isPlaying();
            const currentTime = this.audioAnalyzer.audioElement.currentTime;
            
            if (isPlaying) {
                // Currently playing -> Pause
                this.audioAnalyzer.pause();
                this.updatePlayControlButton();
            } else if (currentTime > 0.1) {
                // Paused but not at beginning -> Stop (reset to beginning)
                this.audioAnalyzer.pause();
                this.audioAnalyzer.audioElement.currentTime = 0;
                this.updateSeekBar();
                this.updatePlayControlButton();
            } else {
                // Stopped/at beginning -> Play
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
    
    setupAudioElementListeners() {
        if (this.audioAnalyzer.audioElement) {
            this.audioAnalyzer.audioElement.addEventListener('ended', () => {
                this.stopSeekUpdate();
                this.updatePlayControlButton();
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
            });
            
            this.audioAnalyzer.audioElement.addEventListener('loadedmetadata', () => {
                this.updateSeekBar();
            });
        }
    }
}

