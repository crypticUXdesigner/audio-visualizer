// Audio Controls UI Module
// Handles audio playback controls (play, pause, seek, track selection)

import { WaveformScrubber } from './WaveformScrubber.js';
import { TitleDisplay } from './components/TitleDisplay.js';
import { UIControlsManager } from './components/UIControlsManager.js';
import { TrackSelector } from './components/TrackSelector.js';
import { PlaybackController } from './components/PlaybackController.js';

export class AudioControls {
    constructor(audioAnalyzer, shaderManager = null) {
        this.audioAnalyzer = audioAnalyzer;
        this.shaderManager = shaderManager; // Add this
        this.audioFileInput = document.getElementById('audioFileInput');
        this.playControlBtn = document.getElementById('playControlBtn');
        this.skipLeftBtn = document.getElementById('skipLeftBtn');
        this.skipRightBtn = document.getElementById('skipRightBtn');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.totalTimeDisplay = document.getElementById('totalTime');
        // Track selector component
        this.trackSelector = new TrackSelector(audioAnalyzer, this.onTrackChange);
        
        // DOM element references (used by components and for backward compatibility)
        this.trackDropdown = document.getElementById('trackDropdown');
        this.trackDropdownBtn = document.getElementById('trackDropdownBtn');
        this.trackDropdownText = document.getElementById('trackDropdownText');
        this.trackDropdownCover = document.getElementById('trackDropdownCover');
        this.trackDropdownMenu = document.getElementById('trackDropdownMenu');
        this.trackList = document.getElementById('trackList');
        this.trackOptions = document.querySelectorAll('.track-option');
        this.scrubberContainer = document.querySelector('.scrubber-container');
        this.audioControlsContainer = document.querySelector('.audio-controls-container');
        this.playbackModeBtn = document.getElementById('playbackModeBtn');
        
        // isSeeking and seekUpdateInterval are now in PlaybackController
        // Playback mode state is now in PlaybackController
        
        // UI controls manager
        this.uiControlsManager = new UIControlsManager();
        
        // Title display component
        this.titleDisplay = new TitleDisplay(audioAnalyzer);
        
        // Playback controller (waveformScrubber will be set in init())
        this.playbackController = new PlaybackController(audioAnalyzer, null, this.titleDisplay);
        
        // Waveform scrubber
        this.waveformScrubber = null;
        
        // Track change callback for external handlers (e.g., random color preset)
        this.onTrackChange = null;
        
        this.init();
    }
    
    // Update track title text (called when track changes)
    /**
     * Update track title text (called when track changes)
     * @param {string} title - Track title
     */
    updateTrackTitle(title) {
        this.titleDisplay.updateTrackTitle(title);
    }
    
    /**
     * Update track cover image in dropdown button
     * @param {HTMLElement} trackOption - Track option element
     */
    updateTrackCover(trackOption) {
        this.trackSelector.updateTrackCover(trackOption);
    }
    
    /**
     * Set colors for title display
     * @param {Object} colors - Color object with base and peak colors
     */
    setColors(colors) {
        this.titleDisplay.setColors(colors);
    }
    
    /**
     * Update title display with audio reactivity
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {string} currentShaderName - Current shader name
     */
    updateTitleDisplayAudioReactivity(audioData, currentShaderName = '') {
        this.titleDisplay.updateAudioReactivity(audioData, currentShaderName);
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
                this.updateTrackCover(matchingOption);
                
                // Load track asynchronously after a short delay to ensure audio context is ready
                setTimeout(async () => {
                    await this.loadTrack(filename);
                }, 100);
                
                defaultTrackSet = true;
            } else {
                console.warn(`Track "${trackParam}" not found, using default track`);
            }
        }
        
        // Set random track as active by default if no URL parameter or if URL track wasn't found
        // Note: Don't load track here - tracks may not be fully loaded from API yet
        // The track will be loaded when selectRandomTrack() is called after sorting
        if (!defaultTrackSet && this.trackOptions.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.trackOptions.length);
            const randomTrack = this.trackOptions[randomIndex];
            randomTrack.classList.add('active');
            this.trackDropdownText.textContent = randomTrack.textContent;
            // Update title texture with random track
            this.updateTrackTitle(randomTrack.textContent);
            this.updateTrackCover(randomTrack);
        }
        
        // Track dropdown and option clicks are now handled by TrackSelector.init()
        // Play/pause and skip button clicks are now handled by PlaybackController.init()
        
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
            // Hide cover for custom files
            if (this.trackDropdownCover) {
                this.trackDropdownCover.src = '';
                this.trackDropdownCover.style.display = 'none';
            }
            
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
        
        // Play control button click handler is now in PlaybackController.init()
        
        // Skip button click handlers are now in PlaybackController.init()
        
        // Override loadTrack to setup listeners
        const originalLoadTrack = this.audioAnalyzer.loadTrack.bind(this.audioAnalyzer);
        this.audioAnalyzer.loadTrack = async (filePath, metadata = {}) => {
            await originalLoadTrack(filePath, metadata);
            this.setupAudioElementListeners();
            this.updateSeekBar();
        };
        
        // Setup auto-hide controls on mouse movement
        this.uiControlsManager.init({
            audioControlsContainer: this.audioControlsContainer,
            topControls: document.querySelector('.top-controls'),
            trackDropdownBtn: this.trackDropdownBtn,
            appLoader: document.getElementById('appLoader'),
            playControlBtn: this.playControlBtn,
            skipLeftBtn: this.skipLeftBtn,
            skipRightBtn: this.skipRightBtn,
            scrubberContainer: this.scrubberContainer,
            trackDropdown: this.trackDropdown,
            trackDropdownMenu: this.trackDropdownMenu,
            playbackModeBtn: this.playbackModeBtn
        });
        
        // Initialize waveform scrubber (replaces seek bar)
        if (this.scrubberContainer) {
            this.waveformScrubber = new WaveformScrubber(this.scrubberContainer, this.audioAnalyzer?.audioElement || null);
        }
        
        // Set waveform scrubber reference in playback controller
        this.playbackController.waveformScrubber = this.waveformScrubber;
        
        // Setup callbacks for playback controller
        this.playbackController.onPlayRandomTrack = () => {
            this.playRandomTrack();
        };
        this.playbackController.onLoadPreviousTrack = async () => {
            const previousTrack = this.getPreviousTrack();
            if (previousTrack) {
                const trackBPM = previousTrack?.dataset.trackBpm ? parseFloat(previousTrack.dataset.trackBpm) : null;
                await this.loadTrack(previousTrack.dataset.track, { bpm: trackBPM });
            }
        };
        this.playbackController.onLoadNextTrack = async () => {
            const nextTrack = this.getNextTrack();
            if (nextTrack) {
                const trackBPM = nextTrack?.dataset.trackBpm ? parseFloat(nextTrack.dataset.trackBpm) : null;
                await this.loadTrack(nextTrack.dataset.track, { bpm: trackBPM });
            } else if (this.trackOptions && this.trackOptions.length > 0) {
                const firstTrack = this.trackOptions[0];
                const trackBPM = firstTrack?.dataset.trackBpm ? parseFloat(firstTrack.dataset.trackBpm) : null;
                await this.loadTrack(firstTrack.dataset.track, { bpm: trackBPM });
            }
        };
        this.playbackController.onLoadFirstTrack = async () => {
            if (this.trackOptions && this.trackOptions.length > 0) {
                const firstTrack = this.trackOptions[0];
                const trackBPM = firstTrack?.dataset.trackBpm ? parseFloat(firstTrack.dataset.trackBpm) : null;
                await this.loadTrack(firstTrack.dataset.track, { bpm: trackBPM });
            }
        };
        
        // Initialize playback controller (this sets up button handlers and keyboard controls)
        this.playbackController.init();
        
        // Initialize track selector
        this.trackSelector.init(this.uiControlsManager);
        
        // Set up track selection callback
        this.trackSelector.onTrackSelected = async (filenameOrUrl, trackOption) => {
            // Get BPM from track option if available
            const trackBPM = trackOption?.dataset.trackBpm ? parseFloat(trackOption.dataset.trackBpm) : null;
            await this.loadTrack(filenameOrUrl, { bpm: trackBPM });
        };
        
        // Initialize title display
        this.titleDisplay.init();
    }
    
    
    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    updatePlayControlButton() {
        this.playbackController.updatePlayControlButton();
    }
    
    updateSeekBar() {
        if (!this.audioAnalyzer.audioElement || this.playbackController.isSeeking) return;
        
        const currentTime = this.audioAnalyzer.audioElement.currentTime;
        const duration = this.audioAnalyzer.audioElement.duration;
        
        if (duration && isFinite(duration)) {
            // Update time displays (waveform scrubber handles visual progress)
            this.currentTimeDisplay.textContent = this.formatTime(currentTime);
            this.totalTimeDisplay.textContent = this.formatTime(duration);
            this.playbackController.updatePlayControlButton();
            
            // Check if we should show title display
            const playbackProgress = currentTime / duration;
            this.titleDisplay.checkTitleDisplay(playbackProgress, duration);
        }
    }
    
    startSeekUpdate() {
        this.playbackController.startSeekUpdate();
        this.titleDisplay.startMonitoring();
    }
    
    stopSeekUpdate() {
        this.playbackController.stopSeekUpdate();
        this.titleDisplay.stopMonitoring();
    }
    
    // Track dropdown methods delegated to TrackSelector
    toggleDropdown() {
        this.trackSelector.toggleDropdown();
    }
    
    closeDropdown() {
        this.trackSelector.closeDropdown();
    }
    
    
    async loadTrack(filenameOrUrl, metadata = {}) {
        try {
            // Show loading spinner
            this.uiControlsManager.showLoading();
            
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
                
                // Update cover image
                this.updateTrackCover(selectedOption);
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
            this.playbackController.updatePlaybackModeButtonState();
            
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
            this.uiControlsManager.hideLoading();
        }
    }
    
    /**
     * Add a track from the Audiotool TrackService to the track selection
     * @param {string} songName - Name of the song
     * @param {string} username - Username (deprecated, not used)
     * @param {boolean} autoLoad - Whether to automatically load the track after adding
     * @param {object} preloadedTrack - Optional pre-loaded track object (skips API call)
     * @param {boolean} prepend - Whether to prepend to the list
     */
    async addTrackFromAPI(songName, username, autoLoad = false, preloadedTrack = null, prepend = false) {
        return this.trackSelector.addTrackFromAPI(songName, username, autoLoad, preloadedTrack, prepend);
        try {
            let track;
            
            if (preloadedTrack) {
                // Use pre-loaded track (from batch loading)
                track = preloadedTrack;
            } else {
                // Import the TrackService function dynamically to avoid circular dependencies
                const { loadTrack } = await import('../api/TrackService.js');
                
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
            trackOption.setAttribute('tabindex', '0'); // Make focusable for keyboard navigation
            
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
                if (prepend && this.trackList.firstChild) {
                    this.trackList.insertBefore(trackOption, this.trackList.firstChild);
                } else {
                    this.trackList.appendChild(trackOption);
                }
                
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
    
    /**
     * Handle play/pause control
     */
    async handlePlayControl() {
        await this.playbackController.handlePlayControl();
    }
    
    /**
     * Setup audio element event listeners
     */
    setupAudioElementListeners() {
        this.playbackController.setupAudioElementListeners();
    }
    
    /**
     * Setup playback mode button (delegated to PlaybackController)
     */
    setupPlaybackModeButton() {
        // Handled by PlaybackController.init()
    }
    
    /**
     * Update playback mode button state
     */
    updatePlaybackModeButtonState() {
        this.playbackController.updatePlaybackModeButtonState();
    }
    
    /**
     * Setup keyboard controls (delegated to PlaybackController)
     */
    setupKeyboardControls() {
        // Handled by PlaybackController.init()
    }
    
    /**
     * Skip backward by specified seconds
     * @param {number} seconds - Seconds to skip backward
     */
    skipBackward(seconds) {
        this.playbackController.skipBackward(seconds);
    }
    
    /**
     * Skip forward by specified seconds
     * @param {number} seconds - Seconds to skip forward
     */
    skipForward(seconds) {
        this.playbackController.skipForward(seconds);
    }
    
    // Track search is now handled by TrackSelector.init()
    setupTrackSearch() {
        // Delegated to TrackSelector.init() - no longer needed here
    }
    
    // Track filtering and navigation methods delegated to TrackSelector
    filterTracks(query) {
        this.trackSelector.filterTracks(query);
    }
    
    setupTrackListKeyboardNavigation() {
        // Delegated to TrackSelector.init()
    }
    
    updateTrackOptionsFocusability() {
        this.trackSelector.updateTrackOptionsFocusability();
    }
    
    getVisibleTracks() {
        return this.trackSelector.getVisibleTracks();
    }
    
    focusFirstVisibleTrack() {
        this.trackSelector.focusFirstVisibleTrack();
    }
    
    focusLastVisibleTrack() {
        this.trackSelector.focusLastVisibleTrack();
    }
    
    focusNextTrack(currentTrack) {
        this.trackSelector.focusNextTrack(currentTrack);
    }
    
    focusPreviousTrack(currentTrack) {
        this.trackSelector.focusPreviousTrack(currentTrack);
    }
    
    scrollTrackIntoView(track) {
        this.trackSelector.scrollTrackIntoView(track);
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
        return this.trackSelector.getCurrentTrackIndex();
    }
    
    getPreviousTrack() {
        return this.trackSelector.getPreviousTrack();
    }
    
    getNextTrack() {
        return this.trackSelector.getNextTrack();
    }
    
    /**
     * Handle skip left button (previous track or restart)
     */
    async handleSkipLeft() {
        await this.playbackController.handleSkipLeft();
    }
    
    /**
     * Handle skip right button (next track)
     */
    async handleSkipRight() {
        await this.playbackController.handleSkipRight();
    }
    
    /**
     * Sort track list alphabetically by track name (case-insensitive)
     */
    sortTrackListAlphabetically() {
        this.trackSelector.sortTracksAlphabetically();
        // Update trackOptions reference for backward compatibility
        this.trackOptions = document.querySelectorAll('.track-option');
        
        // Select random track if none is currently active
        this.selectRandomTrack();
    }
    
    selectRandomTrack() {
        if (!this.trackOptions || this.trackOptions.length === 0) {
            return;
        }
        
        // Check if a track is already active
        const hasActiveTrack = Array.from(this.trackOptions).some(option => option.classList.contains('active'));
        if (hasActiveTrack) {
            return; // Don't override if track is already selected
        }
        
        // Select random track
        const randomIndex = Math.floor(Math.random() * this.trackOptions.length);
        const randomTrack = this.trackOptions[randomIndex];
        const filename = randomTrack.dataset.track;
        
        // Actually load the track (not just visually select it)
        this.loadTrack(filename).catch(error => {
            console.error('Error loading random track:', error);
        });
    }
}

