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
        this.trackLoadingSpinner = this.trackDropdownBtn?.querySelector('.track-loading-spinner');
        this.scrubberContainer = document.querySelector('.scrubber-container');
        this.audioControlsContainer = document.querySelector('.audio-controls-container');
        this.loopBtn = document.getElementById('loopBtn');
        this.randomBtn = document.getElementById('randomBtn');
        
        this.isSeeking = false;
        this.seekUpdateInterval = null;
        this.isDropdownOpen = false;
        this.isLoopEnabled = false;
        this.isRandomEnabled = true;
        
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
        
        // Check for track parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const trackParam = urlParams.get('track');
        
        let defaultTrackSet = false;
        
        // If track parameter is provided, try to load it
        if (trackParam) {
            // Try to find matching track (with or without .mp3 extension)
            const trackToLoad = trackParam.endsWith('.mp3') ? trackParam : `${trackParam}.mp3`;
            const matchingOption = Array.from(this.trackOptions).find(
                option => option.dataset.track === trackToLoad || 
                         option.dataset.track === trackParam ||
                         option.dataset.track.toLowerCase() === trackToLoad.toLowerCase()
            );
            
            if (matchingOption) {
                // Load the track from URL parameter
                const filename = matchingOption.dataset.track;
                matchingOption.classList.add('active');
                this.trackDropdownText.textContent = matchingOption.textContent;
                this.updateTrackTitle(matchingOption.textContent);
                
                // Load track asynchronously after a short delay to ensure audio context is ready
                setTimeout(async () => {
                    await this.loadTrack(filename);
                }, 100);
                
                defaultTrackSet = true;
            } else {
                console.warn(`Track "${trackParam}" not found, using default track`);
            }
        }
        
        // Set first track as active by default if no URL parameter or if URL track wasn't found
        if (!defaultTrackSet && this.trackOptions.length > 0) {
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
                
                // Close dropdown immediately for instant feedback
                this.closeDropdown();
                
                // Load track asynchronously (non-blocking)
                this.loadTrack(filename).catch(error => {
                    console.error('Error loading track:', error);
                    // Track loading error is already logged in loadTrack method
                });
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
                this.updateLoopButtonState();
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
        
        // Setup loop and random buttons
        this.setupLoopButton();
        this.setupRandomButton();
        
        // Setup keyboard controls
        this.setupKeyboardControls();
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
            this.topControls,
            this.loopBtn,
            this.randomBtn
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
        this.audioControlsContainer?.classList.remove('ui-hidden');
        this.topControls?.classList.remove('ui-hidden');
    }
    
    hideControls() {
        if (!this.isControlsVisible) return;
        
        this.isControlsVisible = false;
        this.audioControlsContainer?.classList.add('ui-hidden');
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
    
    showLoading() {
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.classList.add('loading');
        }
    }
    
    hideLoading() {
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.classList.remove('loading');
        }
    }
    
    async loadTrack(filenameOrUrl) {
        try {
            // Show loading spinner
            this.showLoading();
            
            // Check if it's a full URL (API track) or local file
            const isUrl = filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://');
            const filePath = isUrl ? filenameOrUrl : `audio/${filenameOrUrl}`;
            
            // Update active option and dropdown text
            let selectedOption = null;
            this.trackOptions.forEach(option => {
                const trackId = option.dataset.track;
                if (trackId === filenameOrUrl || trackId === filePath) {
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
            
            await this.audioAnalyzer.loadTrack(filePath);
            
            // Apply loop state to new track
            this.updateLoopButtonState();
            
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
        } finally {
            // Hide loading spinner when done (success or error)
            this.hideLoading();
        }
    }
    
    /**
     * Add a track from the Audiotool TrackService to the track selection
     * @param {string} songName - Name of the song
     * @param {string} username - Username of the artist
     * @param {boolean} autoLoad - Whether to automatically load the track after adding
     */
    async addTrackFromAPI(songName, username, autoLoad = false) {
        try {
            // Import the TrackService function dynamically to avoid circular dependencies
            const { loadTrack } = await import('../core/AudiotoolTrackService.js');
            
            // Get track information from TrackService (tries identifier first, falls back to search)
            const result = await loadTrack(songName, username);
            
            if (!result.success || !result.track) {
                // Return gracefully instead of throwing
                const errorMsg = result.error || 'Failed to load track information from TrackService';
                console.warn(`⚠️  ${errorMsg}`);
                return null; // Return null to indicate failure without throwing
            }
            
            const track = result.track;
            
            // Prefer OGG or WAV over MP3 (better quality, less encoding issues)
            // Fallback to MP3 if OGG/WAV not available
            // Note: Protobuf JSON encoding may use snake_case or camelCase
            const audioUrl = track.ogg_url || track.oggUrl || 
                            track.wav_url || track.wavUrl || 
                            track.mp3_url || track.mp3Url || 
                            track.hls_url || track.hlsUrl;
            
            if (!audioUrl) {
                throw new Error('Track has no audio URL');
            }
            
            // Check if track already exists
            const existingTrack = Array.from(this.trackOptions).find(
                option => option.dataset.track === audioUrl || 
                         option.dataset.apiTrackId === track.name
            );
            
            if (existingTrack) {
                console.log('Track already exists in selection');
                if (autoLoad) {
                    await this.loadTrack(audioUrl);
                }
                return existingTrack;
            }
            
            // Create new track option button
            const trackOption = document.createElement('button');
            trackOption.className = 'track-option';
            // Use the songName parameter (user's search term) as the display name
            // display_name is actually an identifier, not the human-readable title
            trackOption.textContent = songName || track.description || track.name;
            trackOption.dataset.track = audioUrl; // Store the full URL
            trackOption.dataset.apiTrackId = track.name; // Store API ID for reference
            trackOption.dataset.apiTrack = 'true'; // Mark as API track
            
            // Add click handler
            trackOption.addEventListener('click', async (e) => {
                e.stopPropagation();
                const trackUrl = trackOption.dataset.track;
                
                // Close dropdown immediately for instant feedback
                this.closeDropdown();
                
                // Load track asynchronously (non-blocking)
                this.loadTrack(trackUrl).catch(error => {
                    console.error('Error loading track:', error);
                    // Track loading error is already logged in loadTrack method
                });
            });
            
            // Add to dropdown menu
            if (this.trackDropdownMenu) {
                this.trackDropdownMenu.appendChild(trackOption);
                
                // Update trackOptions reference
                this.trackOptions = document.querySelectorAll('.track-option');
                
                console.log(`✅ Added "${songName || track.description || track.name}" to track selection`);
                
                // Auto-load if requested
                if (autoLoad) {
                    await this.loadTrack(audioUrl);
                }
                
                return trackOption;
            } else {
                throw new Error('Track dropdown menu not found');
            }
        } catch (error) {
            console.error('Error adding track from API:', error);
            throw error;
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
            // Update loop state when new track is loaded
            this.updateLoopButtonState();
            
            this.audioAnalyzer.audioElement.addEventListener('ended', () => {
                this.stopSeekUpdate();
                this.updatePlayControlButton();
                
                // Handle loop - if loop is enabled, it will automatically restart
                // due to audioElement.loop property, so we don't need to do anything here
                if (this.isLoopEnabled) {
                    return;
                }
                
                // Handle random - play random track when current track ends
                if (this.isRandomEnabled) {
                    this.playRandomTrack();
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
            });
            
            this.audioAnalyzer.audioElement.addEventListener('loadedmetadata', () => {
                this.updateSeekBar();
            });
        }
    }
    
    setupLoopButton() {
        if (!this.loopBtn) return;
        
        this.loopBtn.addEventListener('click', () => {
            this.isLoopEnabled = !this.isLoopEnabled;
            this.updateLoopButtonState();
            
            // If random is enabled, disable it (mutually exclusive)
            if (this.isLoopEnabled && this.isRandomEnabled) {
                this.isRandomEnabled = false;
                this.updateRandomButtonState();
            }
        });
        
        this.updateLoopButtonState();
    }
    
    updateLoopButtonState() {
        if (!this.loopBtn) return;
        
        if (this.isLoopEnabled) {
            this.loopBtn.classList.add('active');
            if (this.audioAnalyzer.audioElement) {
                this.audioAnalyzer.audioElement.loop = true;
            }
        } else {
            this.loopBtn.classList.remove('active');
            if (this.audioAnalyzer.audioElement) {
                this.audioAnalyzer.audioElement.loop = false;
            }
        }
    }
    
    setupRandomButton() {
        if (!this.randomBtn) return;
        
        this.randomBtn.addEventListener('click', () => {
            this.isRandomEnabled = !this.isRandomEnabled;
            this.updateRandomButtonState();
            
            // If loop is enabled, disable it (mutually exclusive)
            if (this.isRandomEnabled && this.isLoopEnabled) {
                this.isLoopEnabled = false;
                this.updateLoopButtonState();
            }
        });
        
        this.updateRandomButtonState();
    }
    
    updateRandomButtonState() {
        if (!this.randomBtn) return;
        
        if (this.isRandomEnabled) {
            this.randomBtn.classList.add('active');
        } else {
            this.randomBtn.classList.remove('active');
        }
    }
    
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
    
    skipBackward(seconds) {
        if (!this.audioAnalyzer.audioElement || !this.audioAnalyzer.audioElement.duration) {
            return;
        }
        
        const newTime = Math.max(0, this.audioAnalyzer.audioElement.currentTime - seconds);
        this.audioAnalyzer.audioElement.currentTime = newTime;
        this.updateSeekBar();
    }
    
    skipForward(seconds) {
        if (!this.audioAnalyzer.audioElement || !this.audioAnalyzer.audioElement.duration) {
            return;
        }
        
        const duration = this.audioAnalyzer.audioElement.duration;
        const newTime = Math.min(duration, this.audioAnalyzer.audioElement.currentTime + seconds);
        this.audioAnalyzer.audioElement.currentTime = newTime;
        this.updateSeekBar();
    }
    
    async playRandomTrack() {
        if (!this.trackOptions || this.trackOptions.length === 0) {
            return;
        }
        
        // Get all available tracks
        const tracks = Array.from(this.trackOptions);
        
        // If only one track, just play it
        if (tracks.length === 1) {
            const filename = tracks[0].dataset.track;
            await this.loadTrack(filename);
            return;
        }
        
        // Pick a random track (excluding current track if possible)
        const currentTrack = this.audioAnalyzer.audioElement?.src;
        let availableTracks = tracks.filter(track => {
            const trackPath = track.dataset.track;
            // Check if this track matches the current one
            if (!currentTrack) return true;
            
            // For local files, check if the path matches
            if (trackPath.startsWith('http')) {
                return trackPath !== currentTrack;
            } else {
                // For local files, check if the filename appears in the current track src
                const filename = trackPath.replace('.mp3', '');
                return !currentTrack.includes(filename);
            }
        });
        
        // If all tracks filtered out, use all tracks
        if (availableTracks.length === 0) {
            availableTracks = tracks;
        }
        
        // Pick random track
        const randomIndex = Math.floor(Math.random() * availableTracks.length);
        const randomTrack = availableTracks[randomIndex];
        const filename = randomTrack.dataset.track;
        
        await this.loadTrack(filename);
    }
}

