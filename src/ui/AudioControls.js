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
        this.trackDropdown = document.getElementById('trackDropdown');
        this.trackDropdownBtn = document.getElementById('trackDropdownBtn');
        this.trackDropdownText = document.getElementById('trackDropdownText');
        this.trackDropdownMenu = document.getElementById('trackDropdownMenu');
        this.trackOptions = document.querySelectorAll('.track-option');
        this.scrubberContainer = document.querySelector('.scrubber-container');
        
        this.isSeeking = false;
        this.seekUpdateInterval = null;
        this.isDropdownOpen = false;
        
        // Auto-hide controls state
        this.mouseMoveTimeout = null;
        this.hideDelay = 2000; // Hide after 2 seconds of no mouse movement
        this.isControlsVisible = false;
        
        // Title texture for shader
        this.titleTexture = null;
        
        this.init();
    }
    
    setTitleTexture(titleTexture) {
        this.titleTexture = titleTexture;
    }
    
    async updateTrackTitle(title) {
        if (this.titleTexture) {
            await this.titleTexture.updateTitle(title);
        }
    }
    
    init() {
        if (!this.audioFileInput || !this.playControlBtn || !this.seekBar || 
            !this.currentTimeDisplay || !this.totalTimeDisplay) {
            console.warn('Audio control elements not found');
            return;
        }
        
        // Set first track as active by default
        if (this.trackOptions.length > 0) {
            const firstTrack = this.trackOptions[0];
            firstTrack.classList.add('active');
            this.trackDropdownText.textContent = firstTrack.textContent;
            // Update title texture with first track
            this.updateTrackTitle(firstTrack.textContent);
        }
        
        // Track dropdown button click
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }
        
        // Track option clicks
        this.trackOptions.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filename = option.dataset.track;
                await this.loadTrack(filename);
                this.closeDropdown();
            });
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.trackDropdown && !this.trackDropdown.contains(e.target)) {
                this.closeDropdown();
            }
        });
        
        // File input handler
        this.audioFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Remove active state from track options
            this.trackOptions.forEach(option => option.classList.remove('active'));
            this.trackDropdownText.textContent = file.name;
            // Update title texture (remove file extension)
            const titleWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            this.updateTrackTitle(titleWithoutExt);
            
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
        
        // Setup auto-hide controls on mouse movement
        this.setupAutoHideControls();
    }
    
    setupAutoHideControls() {
        // Get top controls container
        this.topControls = document.querySelector('.top-controls');
        
        // Start with controls hidden
        this.hideControls();
        
        // Show controls on mouse movement
        document.addEventListener('mousemove', () => {
            this.showControls();
            this.resetHideTimeout();
        });
        
        // Keep controls visible when hovering over them or interacting
        const controlElements = [
            this.playControlBtn,
            this.scrubberContainer,
            this.trackDropdown,
            this.trackDropdownMenu,
            this.topControls
        ];
        
        controlElements.forEach(element => {
            if (element) {
                element.addEventListener('mouseenter', () => {
                    this.showControls();
                    this.resetHideTimeout();
                });
                
                // Keep visible during interaction
                element.addEventListener('mousedown', () => {
                    this.showControls();
                    if (this.mouseMoveTimeout) {
                        clearTimeout(this.mouseMoveTimeout);
                    }
                });
            }
        });
        
        // Keep controls visible when dropdown is open
        if (this.trackDropdownMenu) {
            const observer = new MutationObserver(() => {
                if (this.trackDropdown?.classList.contains('open')) {
                    this.showControls();
                    if (this.mouseMoveTimeout) {
                        clearTimeout(this.mouseMoveTimeout);
                    }
                }
            });
            observer.observe(this.trackDropdown, { attributes: true, attributeFilter: ['class'] });
        }
        
        // Keep top controls visible when color preset menu is open
        const colorPresetItem = document.querySelector('.top-control-item');
        if (colorPresetItem) {
            const colorObserver = new MutationObserver(() => {
                if (colorPresetItem.classList.contains('open')) {
                    this.showControls();
                    if (this.mouseMoveTimeout) {
                        clearTimeout(this.mouseMoveTimeout);
                    }
                }
            });
            colorObserver.observe(colorPresetItem, { attributes: true, attributeFilter: ['class'] });
        }
    }
    
    showControls() {
        if (this.isControlsVisible) return;
        
        this.isControlsVisible = true;
        this.playControlBtn?.classList.remove('ui-hidden');
        this.scrubberContainer?.classList.remove('ui-hidden');
        this.trackDropdown?.classList.remove('ui-hidden');
        this.topControls?.classList.remove('ui-hidden');
    }
    
    hideControls() {
        if (!this.isControlsVisible) return;
        
        this.isControlsVisible = false;
        this.playControlBtn?.classList.add('ui-hidden');
        this.scrubberContainer?.classList.add('ui-hidden');
        this.trackDropdown?.classList.add('ui-hidden');
        this.topControls?.classList.add('ui-hidden');
    }
    
    resetHideTimeout() {
        if (this.mouseMoveTimeout) {
            clearTimeout(this.mouseMoveTimeout);
        }
        
        this.mouseMoveTimeout = setTimeout(() => {
            this.hideControls();
        }, this.hideDelay);
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
    
    toggleDropdown() {
        this.isDropdownOpen = !this.isDropdownOpen;
        if (this.isDropdownOpen) {
            this.trackDropdown.classList.add('open');
        } else {
            this.trackDropdown.classList.remove('open');
        }
    }
    
    closeDropdown() {
        this.isDropdownOpen = false;
        if (this.trackDropdown) {
            this.trackDropdown.classList.remove('open');
        }
    }
    
    async loadTrack(filename) {
        try {
            // Update active option and dropdown text
            let selectedOption = null;
            this.trackOptions.forEach(option => {
                if (option.dataset.track === filename) {
                    option.classList.add('active');
                    selectedOption = option;
                } else {
                    option.classList.remove('active');
                }
            });
            
            if (selectedOption && this.trackDropdownText) {
                this.trackDropdownText.textContent = selectedOption.textContent;
                // Update title texture
                this.updateTrackTitle(selectedOption.textContent);
            }
            
            await this.audioAnalyzer.loadTrack(`audio/${filename}`);
            
            // Wait for metadata
            if (this.audioAnalyzer.audioElement.readyState >= 1) {
                this.updateSeekBar();
            } else {
                this.audioAnalyzer.audioElement.addEventListener('loadedmetadata', () => {
                    this.updateSeekBar();
                }, { once: true });
            }
            
            // Auto-play the selected track
            if (this.audioAnalyzer.audioContext.state === 'suspended') {
                await this.audioAnalyzer.audioContext.resume();
            }
            await this.audioAnalyzer.play();
            
            this.startSeekUpdate();
            this.updatePlayControlButton();
        } catch (error) {
            console.error('Error loading track:', error);
        }
    }
    
    async handlePlayControl() {
        // If no track is loaded, load the first track
        if (!this.audioAnalyzer.audioElement && this.trackOptions.length > 0) {
            const firstTrackOption = this.trackOptions[0];
            const filename = firstTrackOption.dataset.track;
            await this.loadTrack(filename);
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

