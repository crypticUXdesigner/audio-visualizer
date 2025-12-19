// Audio Controls UI Module
// Handles audio playback controls (play, pause, seek, track selection)

import { WaveformScrubber } from './WaveformScrubber.js';

export class AudioControls {
    constructor(audioAnalyzer) {
        this.audioAnalyzer = audioAnalyzer;
        this.audioFileInput = document.getElementById('audioFileInput');
        this.playControlBtn = document.getElementById('playControlBtn');
        this.skipLeftBtn = document.getElementById('skipLeftBtn');
        this.skipRightBtn = document.getElementById('skipRightBtn');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.totalTimeDisplay = document.getElementById('totalTime');
        this.trackDropdown = document.getElementById('trackDropdown');
        this.trackDropdownBtn = document.getElementById('trackDropdownBtn');
        this.trackDropdownText = document.getElementById('trackDropdownText');
        this.trackDropdownMenu = document.getElementById('trackDropdownMenu');
        this.trackList = document.getElementById('trackList');
        this.trackOptions = document.querySelectorAll('.track-option');
        this.trackLoadingSpinner = this.trackDropdownBtn?.querySelector('.track-loading-spinner');
        this.scrubberContainer = document.querySelector('.scrubber-container');
        this.audioControlsContainer = document.querySelector('.audio-controls-container');
        this.playbackModeBtn = document.getElementById('playbackModeBtn');
        
        this.isSeeking = false;
        this.seekUpdateInterval = null;
        this.isDropdownOpen = false;
        this.isLoopEnabled = false;
        this.isRandomEnabled = true;
        
        // Auto-hide controls state
        this.mouseMoveTimeout = null;
        this.hideDelay = 2000; // Hide after 2 seconds of no mouse movement
        this.isControlsVisible = false;
        this.isHoveringControls = false;
        
        // Title texture for shader
        this.titleTexture = null;
        
        // Waveform scrubber
        this.waveformScrubber = null;
        
        // Track change callback for external handlers (e.g., random color preset)
        this.onTrackChange = null;
        
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
        if (!this.audioFileInput || !this.playControlBtn || 
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
        
        // Close dropdown when clicking outside (check both button and menu)
        document.addEventListener('click', (e) => {
            if (this.trackDropdown && !this.trackDropdown.contains(e.target) &&
                this.trackDropdownMenu && !this.trackDropdownMenu.contains(e.target)) {
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
                // Load track without BPM metadata (API tracks provide BPM)
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
        
        // Play control button
        this.playControlBtn.addEventListener('click', async () => {
            await this.handlePlayControl();
        });
        
        // Skip left button
        if (this.skipLeftBtn) {
            this.skipLeftBtn.addEventListener('click', async () => {
                await this.handleSkipLeft();
            });
        }
        
        // Skip right button
        if (this.skipRightBtn) {
            this.skipRightBtn.addEventListener('click', async () => {
                await this.handleSkipRight();
            });
        }
        
        // Override loadTrack to setup listeners
        const originalLoadTrack = this.audioAnalyzer.loadTrack.bind(this.audioAnalyzer);
        this.audioAnalyzer.loadTrack = async (filePath, metadata = {}) => {
            await originalLoadTrack(filePath, metadata);
            this.setupAudioElementListeners();
            this.updateSeekBar();
        };
        
        // Setup auto-hide controls on mouse movement
        this.setupAutoHideControls();
        
        // Setup playback mode toggle button
        this.setupPlaybackModeButton();
        
        // Setup keyboard controls
        this.setupKeyboardControls();
        
        // Setup track search functionality
        this.setupTrackSearch();
        
        // Initialize waveform scrubber (replaces seek bar)
        if (this.scrubberContainer) {
            this.waveformScrubber = new WaveformScrubber(this.scrubberContainer, this.audioAnalyzer?.audioElement || null);
        }
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
        
        // Show controls on touch (for mobile)
        document.addEventListener('touchstart', () => {
            this.showControls();
            this.resetHideTimeout();
        }, { passive: true });
        
        // Keep controls visible when hovering over them or interacting
        const controlElements = [
            this.playControlBtn,
            this.skipLeftBtn,
            this.skipRightBtn,
            this.scrubberContainer,
            this.trackDropdown,
            this.trackDropdownMenu,
            this.topControls,
            this.playbackModeBtn,
            this.audioControlsContainer
        ];
        
        controlElements.forEach(element => {
            if (element) {
                element.addEventListener('mouseenter', () => {
                    this.isHoveringControls = true;
                    this.showControls();
                    // Clear timeout but don't reset it while hovering
                    if (this.mouseMoveTimeout) {
                        clearTimeout(this.mouseMoveTimeout);
                        this.mouseMoveTimeout = null;
                    }
                });
                
                element.addEventListener('mouseleave', () => {
                    this.isHoveringControls = false;
                    // Start hide timeout when leaving the control
                    this.resetHideTimeout();
                });
                
                // Keep visible during interaction
                element.addEventListener('mousedown', () => {
                    this.showControls();
                    if (this.mouseMoveTimeout) {
                        clearTimeout(this.mouseMoveTimeout);
                        this.mouseMoveTimeout = null;
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
        // Don't show if menu is open (menu controls visibility)
        if (this.isDropdownOpen) return;
        
        if (this.isControlsVisible) return;
        
        this.isControlsVisible = true;
        this.audioControlsContainer?.classList.remove('ui-hidden');
        this.topControls?.classList.remove('ui-hidden');
    }
    
    hideControls() {
        // Always allow hiding (menu needs to hide controls)
        this.isControlsVisible = false;
        this.audioControlsContainer?.classList.add('ui-hidden');
        this.topControls?.classList.add('ui-hidden');
    }
    
    resetHideTimeout() {
        if (this.mouseMoveTimeout) {
            clearTimeout(this.mouseMoveTimeout);
        }
        
        // Don't start hide timer if hovering over controls
        if (this.isHoveringControls) {
            return;
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
            // Update time displays (waveform scrubber handles visual progress)
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
            this.openMenu();
        } else {
            this.closeMenu();
        }
    }
    
    openMenu() {
        this.isDropdownOpen = true;
        
        // Step 1: Hide controls (top and bottom)
        this.hideControls();
        
        // Step 2: After controls start animating out, show menu
        setTimeout(() => {
            this.trackDropdown?.classList.add('open');
            if (this.trackDropdownMenu) {
                // Set display first, then add open class for animation
                this.trackDropdownMenu.style.display = 'flex';
                // Force reflow to ensure display is applied
                this.trackDropdownMenu.offsetHeight;
                this.trackDropdownMenu.classList.add('open');
            }
        }, 100); // Small delay to let controls start animating out
    }
    
    closeMenu() {
        // Step 1: Hide menu (fade out with downward movement)
        if (this.trackDropdownMenu) {
            this.trackDropdownMenu.classList.remove('open');
        }
        this.trackDropdown?.classList.remove('open');
        this.isDropdownOpen = false;
        
        // Step 2: After menu animation completes, show controls
        setTimeout(() => {
            if (this.trackDropdownMenu) {
                this.trackDropdownMenu.style.display = 'none';
            }
            this.showControls();
        }, 350); // Match the animation duration
    }
    
    closeDropdown() {
        if (!this.isDropdownOpen) return;
        this.closeMenu();
    }
    
    showLoading() {
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.classList.add('loading');
        }
        // Show full-screen loader
        const appLoader = document.getElementById('appLoader');
        if (appLoader) {
            appLoader.style.display = 'flex';
            appLoader.classList.remove('hidden');
        }
    }
    
    hideLoading() {
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.classList.remove('loading');
        }
        // Hide full-screen loader
        const appLoader = document.getElementById('appLoader');
        if (appLoader) {
            appLoader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                if (appLoader.classList.contains('hidden')) {
                    appLoader.style.display = 'none';
                }
            }, 300);
        }
    }
    
    async loadTrack(filenameOrUrl, metadata = {}) {
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
            
            // If metadata not provided but track option has BPM, use it
            if (!metadata.bpm && selectedOption && selectedOption.dataset.trackBpm) {
                const trackBPM = parseFloat(selectedOption.dataset.trackBpm);
                if (!isNaN(trackBPM) && trackBPM > 0) {
                    metadata.bpm = trackBPM;
                }
            }
            
            if (selectedOption && this.trackDropdownText) {
                this.trackDropdownText.textContent = selectedOption.textContent;
                // Update title texture
                this.updateTrackTitle(selectedOption.textContent);
            }
            
            await this.audioAnalyzer.loadTrack(filePath, metadata);
            
            // Update waveform scrubber audio element
            if (this.waveformScrubber) {
                this.waveformScrubber.audioElement = this.audioAnalyzer.audioElement;
                
                // Clear old waveform immediately (will fade out)
                this.waveformScrubber.clearWaveform();
                
                // Load waveform if this is an API track with track ID
                if (selectedOption && selectedOption.dataset.apiTrackId) {
                    const trackId = selectedOption.dataset.apiTrackId;
                    // Small delay to allow fade-out to complete
                    setTimeout(async () => {
                        await this.waveformScrubber.loadWaveform(trackId);
                    }, 150);
                }
            }
            
            // Trigger track change callback (for random color preset)
            if (this.onTrackChange) {
                this.onTrackChange();
            }
            
            // Apply playback mode state to new track
            this.updatePlaybackModeButtonState();
            
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
     * @param {string} username - Username (deprecated, not used)
     * @param {boolean} autoLoad - Whether to automatically load the track after adding
     * @param {object} preloadedTrack - Optional pre-loaded track object (skips API call)
     */
    async addTrackFromAPI(songName, username, autoLoad = false, preloadedTrack = null) {
        try {
            let track;
            
            if (preloadedTrack) {
                // Use pre-loaded track (from batch loading)
                track = preloadedTrack;
            } else {
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
                
                track = result.track;
            }
            
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
            
            // Extract BPM from track metadata (API provides this)
            const trackBPM = track.bpm || track.bpm_url || null;
            const metadataBPM = (typeof trackBPM === 'number' && trackBPM > 0) ? trackBPM : 
                               (typeof trackBPM === 'string' && !isNaN(parseFloat(trackBPM))) ? parseFloat(trackBPM) : 
                               null;
            
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
            
            // Create new track option button with name
            const trackOption = document.createElement('button');
            trackOption.className = 'track-option';
            
            // Create cover image element (always show, placeholder if no image)
            const coverUrl = track.cover_url || track.coverUrl;
            const coverElement = coverUrl 
                ? (() => {
                    const img = document.createElement('img');
                    img.className = 'track-option-cover';
                    img.src = coverUrl;
                    img.alt = songName || track.description || track.name;
                    img.loading = 'lazy'; // Lazy load for performance
                    return img;
                })()
                : (() => {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'track-option-cover track-option-cover-placeholder';
                    return placeholder;
                })();
            trackOption.appendChild(coverElement);
            
            // Create name element
            const nameElement = document.createElement('div');
            nameElement.className = 'track-option-name';
            nameElement.textContent = songName || track.description || track.name;
            
            // Append elements
            trackOption.appendChild(nameElement);
            
            // Store data for filtering and playback
            trackOption.dataset.track = audioUrl; // Store the full URL
            trackOption.dataset.apiTrackId = track.name; // Store API ID for reference
            trackOption.dataset.apiTrack = 'true'; // Mark as API track
            trackOption.dataset.trackName = songName || track.description || track.name;
            // Store BPM in dataset for later use when loading track
            if (metadataBPM) {
                trackOption.dataset.trackBpm = metadataBPM.toString();
            }
            
            // Add click handler
            trackOption.addEventListener('click', async (e) => {
                e.stopPropagation();
                const trackUrl = trackOption.dataset.track;
                
                // Close dropdown immediately for instant feedback
                this.closeDropdown();
                
                // Load track asynchronously (non-blocking) with BPM metadata
                // Get BPM from the track data stored in dataset
                const trackBPM = trackOption.dataset.trackBpm ? parseFloat(trackOption.dataset.trackBpm) : null;
                this.loadTrack(trackUrl, { bpm: trackBPM }).catch(error => {
                    console.error('Error loading track:', error);
                    // Track loading error is already logged in loadTrack method
                });
            });
            
            // Add to track list
            if (this.trackList) {
                this.trackList.appendChild(trackOption);
                
                // Update trackOptions reference
                this.trackOptions = document.querySelectorAll('.track-option');
                
                // Auto-load if requested (with BPM metadata)
                if (autoLoad) {
                    await this.loadTrack(audioUrl, { bpm: metadataBPM });
                }
                
                return trackOption;
            } else {
                throw new Error('Track list not found');
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
            
            if (isPlaying) {
                // Currently playing -> Pause
                this.audioAnalyzer.pause();
                this.updatePlayControlButton();
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
    
    setupTrackSearch() {
        const searchInput = document.getElementById('trackSearchInput');
        const searchClear = document.getElementById('trackSearchClear');
        const noResultsMsg = document.getElementById('noResultsMsg');
        
        if (!searchInput) return;
        
        // Handle search input
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            // Show/hide clear button
            if (query.length > 0) {
                searchClear.style.display = 'flex';
            } else {
                searchClear.style.display = 'none';
            }
            
            // Filter tracks
            this.filterTracks(query);
        });
        
        // Handle clear button
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            this.filterTracks('');
            searchInput.focus();
        });
        
        // Clear search when dropdown opens
        this.trackDropdownBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            this.filterTracks('');
        });
        
        // Focus search input when dropdown opens (desktop only)
        const observer = new MutationObserver(() => {
            if (this.trackDropdown?.classList.contains('open')) {
                const mediaQuery = window.matchMedia('(min-width: 769px)');
                if (mediaQuery.matches) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            }
        });
        observer.observe(this.trackDropdown, { attributes: true, attributeFilter: ['class'] });
        
        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDropdown();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const firstVisibleTrack = this.trackList.querySelector('.track-option:not([style*="display: none"])');
                if (firstVisibleTrack) {
                    firstVisibleTrack.focus();
                }
            }
        });
    }
    
    filterTracks(query) {
        const noResultsMsg = document.getElementById('noResultsMsg');
        const tracks = this.trackList.querySelectorAll('.track-option');
        
        let visibleCount = 0;
        
        tracks.forEach(track => {
            const name = track.dataset.trackName?.toLowerCase() || '';
            
            if (name.includes(query)) {
                track.style.display = '';
                visibleCount++;
            } else {
                track.style.display = 'none';
            }
        });
        
        // Show/hide no results message
        if (visibleCount === 0 && query.length > 0) {
            noResultsMsg.style.display = 'block';
        } else {
            noResultsMsg.style.display = 'none';
        }
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
    
    getCurrentTrackIndex() {
        if (!this.audioAnalyzer.audioElement || !this.trackOptions || this.trackOptions.length === 0) {
            return -1;
        }
        
        const currentTrack = this.audioAnalyzer.audioElement.src;
        const tracks = Array.from(this.trackOptions);
        
        return tracks.findIndex(track => {
            const trackPath = track.dataset.track;
            if (trackPath.startsWith('http')) {
                return trackPath === currentTrack;
            } else {
                // For local files, check if the filename appears in the current track src
                const filename = trackPath.replace(/\.mp3$/, '');
                return currentTrack.includes(filename);
            }
        });
    }
    
    getPreviousTrack() {
        if (!this.trackOptions || this.trackOptions.length === 0) {
            return null;
        }
        
        const tracks = Array.from(this.trackOptions);
        const currentIndex = this.getCurrentTrackIndex();
        
        if (currentIndex === -1) {
            // No current track, return last track
            return tracks[tracks.length - 1];
        }
        
        // Get previous track (wrap around to last track if at beginning)
        const previousIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
        return tracks[previousIndex];
    }
    
    getNextTrack() {
        if (!this.trackOptions || this.trackOptions.length === 0) {
            return null;
        }
        
        const tracks = Array.from(this.trackOptions);
        const currentIndex = this.getCurrentTrackIndex();
        
        if (currentIndex === -1) {
            // No current track, return first track
            return tracks[0];
        }
        
        // Get next track (wrap around to first track if at end)
        const nextIndex = currentIndex === tracks.length - 1 ? 0 : currentIndex + 1;
        return tracks[nextIndex];
    }
    
    async handleSkipLeft() {
        if (!this.audioAnalyzer.audioElement) {
            // No track loaded, load first track
            if (this.trackOptions && this.trackOptions.length > 0) {
                const firstTrack = this.trackOptions[0];
                await this.loadTrack(firstTrack.dataset.track);
            }
            return;
        }
        
        const currentTime = this.audioAnalyzer.audioElement.currentTime;
        const skipThreshold = 2; // If within 2 seconds of start, go to previous track
        
        if (currentTime <= skipThreshold) {
            // Already at or very close to the beginning, go to previous track
            const previousTrack = this.getPreviousTrack();
            if (previousTrack) {
                await this.loadTrack(previousTrack.dataset.track);
            }
        } else {
            // Skip to start of current track
            this.audioAnalyzer.audioElement.currentTime = 0;
            this.updateSeekBar();
        }
    }
    
    async handleSkipRight() {
        // Go to next track
        const nextTrack = this.getNextTrack();
        if (nextTrack) {
            await this.loadTrack(nextTrack.dataset.track);
        } else if (this.trackOptions && this.trackOptions.length > 0) {
            // Fallback to first track if no current track
            const firstTrack = this.trackOptions[0];
            await this.loadTrack(firstTrack.dataset.track);
        }
    }
}

