// Audio Controls UI Module
// Handles audio playback controls (play, pause, seek, track selection)

import { WaveformScrubber } from './WaveformScrubber.js';
import { TitleDisplay } from './components/TitleDisplay.js';
import { UIControlsManager } from './components/UIControlsManager.js';
import { TrackSelector } from './components/TrackSelector.js';
import { PlaybackController } from './components/PlaybackController.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import type { AudioAnalyzer } from '../core/audio/AudioAnalyzer.js';
import type { ShaderManager } from '../shaders/ShaderManager.js';
import type { ColorMap, ExtendedAudioData, Track } from '../types/index.js';

export class AudioControls {
    audioAnalyzer: AudioAnalyzer;
    shaderManager: ShaderManager | null;
    audioFileInput: HTMLInputElement | null;
    playControlBtn: HTMLElement | null;
    skipLeftBtn: HTMLElement | null;
    skipRightBtn: HTMLElement | null;
    currentTimeDisplay: HTMLElement | null;
    totalTimeDisplay: HTMLElement | null;
    trackSelector: TrackSelector;
    trackDropdown: HTMLElement | null;
    trackDropdownBtn: HTMLElement | null;
    trackDropdownText: HTMLElement | null;
    trackDropdownCover: HTMLImageElement | null;
    trackDropdownMenu: HTMLElement | null;
    trackList: HTMLElement | null;
    trackOptions: NodeListOf<HTMLElement>;
    scrubberContainer: HTMLElement | null;
    audioControlsContainer: HTMLElement | null;
    playbackModeBtn: HTMLElement | null;
    uiControlsManager: UIControlsManager;
    titleDisplay: TitleDisplay;
    playbackController: PlaybackController;
    waveformScrubber: WaveformScrubber | null;
    onTrackChange: (() => void) | null;
    
    constructor(audioAnalyzer: AudioAnalyzer, shaderManager: ShaderManager | null = null) {
        this.audioAnalyzer = audioAnalyzer;
        this.shaderManager = shaderManager; // Add this
        this.audioFileInput = document.getElementById('audioFileInput') as HTMLInputElement | null;
        this.playControlBtn = document.getElementById('playControlBtn');
        this.skipLeftBtn = document.getElementById('skipLeftBtn');
        this.skipRightBtn = document.getElementById('skipRightBtn');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.totalTimeDisplay = document.getElementById('totalTime');
        // Track change callback for external handlers (e.g., random color preset)
        this.onTrackChange = null;
        // Track selector component
        this.trackSelector = new TrackSelector(audioAnalyzer, this.onTrackChange);
        
        // DOM element references (used by components and for backward compatibility)
        this.trackDropdown = document.getElementById('trackDropdown');
        this.trackDropdownBtn = document.getElementById('trackDropdownBtn');
        this.trackDropdownText = document.getElementById('trackDropdownText');
        this.trackDropdownCover = document.getElementById('trackDropdownCover') as HTMLImageElement | null;
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
        
        this.init();
    }
    
    // Update track title text (called when track changes)
    /**
     * Update track title text (called when track changes)
     * @param {string} title - Track title
     */
    updateTrackTitle(title: string): void {
        this.titleDisplay.updateTrackTitle(title);
    }
    
    /**
     * Update track cover image in dropdown button
     * @param {HTMLElement} trackOption - Track option element
     */
    updateTrackCover(trackOption: HTMLElement | null): void {
        this.trackSelector.updateTrackCover(trackOption);
    }
    
    /**
     * Set colors for title display
     * @param {Object} colors - Color object with base and peak colors
     */
    setColors(colors: ColorMap): void {
        this.titleDisplay.setColors(colors);
    }
    
    /**
     * Update title display with audio reactivity
     * @param {Object} audioData - Audio data from AudioAnalyzer
     * @param {string} currentShaderName - Current shader name
     */
    updateTitleDisplayAudioReactivity(audioData: ExtendedAudioData | null, currentShaderName: string = ''): void {
        this.titleDisplay.updateAudioReactivity(audioData, currentShaderName);
    }
    
    init(): void {
        if (!this.audioFileInput || !this.playControlBtn || 
            !this.currentTimeDisplay || !this.totalTimeDisplay) {
            ShaderLogger.warn('Audio control elements not found');
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
                         (option.dataset.track && option.dataset.track.toLowerCase() === trackToLoad.toLowerCase())
            );
            
            if (matchingOption) {
                // Load the track from URL parameter
                const filename = matchingOption.dataset.track;
                if (!filename) return;
                matchingOption.classList.add('active');
                if (this.trackDropdownText) {
                    this.trackDropdownText.textContent = matchingOption.textContent || '';
                }
                this.updateTrackTitle(matchingOption.textContent || '');
                this.updateTrackCover(matchingOption);
                
                // Load track asynchronously after a short delay to ensure audio context is ready
                setTimeout(async () => {
                    await this.loadTrack(filename);
                }, 100);
                
                defaultTrackSet = true;
            } else {
                ShaderLogger.warn(`Track "${trackParam}" not found, using default track`);
            }
        }
        
        // Set random track as active by default if no URL parameter or if URL track wasn't found
        // Note: Don't load track here - tracks may not be fully loaded from API yet
        // The track will be loaded when selectRandomTrack() is called after sorting
        if (!defaultTrackSet && this.trackOptions.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.trackOptions.length);
            const randomTrack = this.trackOptions[randomIndex];
            randomTrack.classList.add('active');
            if (this.trackDropdownText) {
                this.trackDropdownText.textContent = randomTrack.textContent;
            }
            // Update title texture with random track
            this.updateTrackTitle(randomTrack.textContent);
            this.updateTrackCover(randomTrack);
        }
        
        // Track dropdown and option clicks are now handled by TrackSelector.init()
        // Play/pause and skip button clicks are now handled by PlaybackController.init()
        
        // File input handler
        this.audioFileInput?.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target?.files?.[0];
            if (!file) return;
            
            // Remove active state from track options
            this.trackOptions.forEach(option => option.classList.remove('active'));
            if (this.trackDropdownText) {
                this.trackDropdownText.textContent = file.name;
            }
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
                // this.updateLoopButtonState(); // Method doesn't exist - removed
                this.updateSeekBar();
                this.startSeekUpdate();
                this.updatePlayControlButton();
            } catch (error) {
                ShaderLogger.error('Error loading audio file:', error);
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
            topControls: document.querySelector('.top-controls') as HTMLElement | null,
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
        // WaveformScrubber implements the required interface methods
        this.playbackController.waveformScrubber = this.waveformScrubber;
        
        // Setup callbacks for playback controller
        this.playbackController.onPlayRandomTrack = () => {
            this.playRandomTrack();
        };
        this.playbackController.onLoadPreviousTrack = async () => {
            const previousTrack = this.trackSelector.getPreviousTrack();
            if (previousTrack && previousTrack.dataset.track) {
                const trackBPM = previousTrack?.dataset.trackBpm ? parseFloat(previousTrack.dataset.trackBpm) : null;
                await this.loadTrack(previousTrack.dataset.track, { bpm: trackBPM ?? undefined });
            }
        };
        this.playbackController.onLoadNextTrack = async () => {
            const nextTrack = this.trackSelector.getNextTrack();
            if (nextTrack && nextTrack.dataset.track) {
                const trackBPM = nextTrack?.dataset.trackBpm ? parseFloat(nextTrack.dataset.trackBpm) : null;
                await this.loadTrack(nextTrack.dataset.track, { bpm: trackBPM ?? undefined });
            } else if (this.trackOptions && this.trackOptions.length > 0) {
                const firstTrack = this.trackOptions[0];
                if (firstTrack.dataset.track) {
                    const trackBPM = firstTrack?.dataset.trackBpm ? parseFloat(firstTrack.dataset.trackBpm) : null;
                    await this.loadTrack(firstTrack.dataset.track, { bpm: trackBPM ?? undefined });
                }
            }
        };
        this.playbackController.onLoadFirstTrack = async () => {
            if (this.trackOptions && this.trackOptions.length > 0) {
                const firstTrack = this.trackOptions[0];
                if (firstTrack.dataset.track) {
                    const trackBPM = firstTrack?.dataset.trackBpm ? parseFloat(firstTrack.dataset.trackBpm) : null;
                    await this.loadTrack(firstTrack.dataset.track, { bpm: trackBPM ?? undefined });
                }
            }
        };
        
        // Initialize playback controller (this sets up button handlers and keyboard controls)
        this.playbackController.init();
        
        // Initialize track selector
        this.trackSelector.init(this.uiControlsManager);
        
        // Set up track selection callback
        this.trackSelector.onTrackSelected = async (filenameOrUrl, trackOption) => {
            // Get BPM from track option if available
            const trackBPM = trackOption?.dataset.trackBpm ? parseFloat(trackOption.dataset.trackBpm) : undefined;
            await this.loadTrack(filenameOrUrl, { bpm: trackBPM });
        };
        
        // Initialize title display
        this.titleDisplay.init();
    }
    
    
    formatTime(seconds: number): string {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    updatePlayControlButton(): void {
        this.playbackController.updatePlayControlButton();
    }
    
    updateSeekBar(): void {
        if (!this.audioAnalyzer.audioElement || this.playbackController.isSeeking) return;
        
        const currentTime = this.audioAnalyzer.audioElement.currentTime;
        const duration = this.audioAnalyzer.audioElement.duration;
        
        if (duration && isFinite(duration)) {
            // Update time displays (waveform scrubber handles visual progress)
            if (this.currentTimeDisplay) {
                this.currentTimeDisplay.textContent = this.formatTime(currentTime);
            }
            if (this.totalTimeDisplay) {
                this.totalTimeDisplay.textContent = this.formatTime(duration);
            }
            this.playbackController.updatePlayControlButton();
            
            // Check if we should show title display
            const playbackProgress = currentTime / duration;
            this.titleDisplay.checkTitleDisplay(playbackProgress, duration);
        }
    }
    
    startSeekUpdate(): void {
        this.playbackController.startSeekUpdate();
        this.titleDisplay.startMonitoring();
    }
    
    stopSeekUpdate(): void {
        this.playbackController.stopSeekUpdate();
        this.titleDisplay.stopMonitoring();
    }
    
    async loadTrack(filenameOrUrl: string, metadata: { bpm?: number } = {}): Promise<void> {
        try {
            // Show loading spinner
            this.uiControlsManager.showLoading();
            
            // Check if it's a full URL (API track) or local file
            const isUrl = filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://');
            const filePath = isUrl ? filenameOrUrl : `audio/${filenameOrUrl}`;
            
            // Update trackOptions reference to ensure we have the latest tracks
            this.trackOptions = document.querySelectorAll('.track-option');
            
            // Update active option and dropdown text
            let selectedOption: HTMLElement | null = null;
            this.trackOptions.forEach((htmlOption) => {
                const trackId = htmlOption.dataset.track;
                // Match by exact URL or by checking if the URL contains the track identifier
                if (trackId === filenameOrUrl || trackId === filePath || 
                    (filenameOrUrl && trackId && (trackId.includes(filenameOrUrl) || filenameOrUrl.includes(trackId)))) {
                    htmlOption.classList.add('active');
                    selectedOption = htmlOption;
                } else {
                    htmlOption.classList.remove('active');
                }
            });
            
            // If no exact match found, try to find by API track ID (for API tracks)
            if (!selectedOption && filenameOrUrl) {
                const allOptions = Array.from(this.trackOptions) as HTMLElement[];
                selectedOption = allOptions.find(option => {
                    const apiTrackId = option.dataset.apiTrackId;
                    // Check if the URL contains the API track ID
                    return apiTrackId && filenameOrUrl.includes(apiTrackId);
                }) || null;
                
                if (selectedOption) {
                    // Mark as active
                    this.trackOptions.forEach((htmlOption) => {
                        if (htmlOption === selectedOption) {
                            htmlOption.classList.add('active');
                        } else {
                            htmlOption.classList.remove('active');
                        }
                    });
                }
            }
            
            // If metadata not provided but track option has BPM, use it
            if (!metadata.bpm && selectedOption !== null) {
                const trackBPMStr = (selectedOption as HTMLElement).dataset.trackBpm;
                const trackBPM = trackBPMStr ? parseFloat(trackBPMStr) : NaN;
                if (!isNaN(trackBPM) && trackBPM > 0) {
                    metadata.bpm = trackBPM;
                }
            }
            
            if (selectedOption !== null && this.trackDropdownText) {
                const option = selectedOption as HTMLElement;
                // Get track name from dataset or name element, fallback to textContent
                const trackName = option.dataset.trackName || 
                                 option.querySelector('.track-option-name')?.textContent || 
                                 option.textContent || 
                                 '';
                this.trackDropdownText.textContent = trackName;
                // Update title texture
                this.updateTrackTitle(trackName);
                
                // Update cover image
                this.updateTrackCover(option);
            }
            
            await this.audioAnalyzer.loadTrack(filePath, metadata);
            
            // Update waveform scrubber audio element
            if (this.waveformScrubber) {
                this.waveformScrubber.audioElement = this.audioAnalyzer.audioElement;
                
                // Clear old waveform immediately (will fade out)
                this.waveformScrubber.clearWaveform();
                
                // Load waveform if this is an API track with track ID
                if (selectedOption !== null) {
                    const option = selectedOption as HTMLElement;
                    const trackId = option.dataset.apiTrackId;
                    if (trackId) {
                        // Small delay to allow fade-out to complete
                        setTimeout(async () => {
                            if (this.waveformScrubber) {
                                await this.waveformScrubber.loadWaveform(trackId);
                            }
                        }, 150);
                    }
                }
            }
            
            // Trigger track change callback (for random color preset)
            if (this.onTrackChange) {
                this.onTrackChange();
            }
            
            // Apply playback mode state to new track
            this.playbackController.updatePlaybackModeButtonState();
            
            // Wait for metadata
            const audioElement = this.audioAnalyzer.audioElement;
            if (audioElement) {
                if (audioElement.readyState >= 1) {
                    this.updateSeekBar();
                } else {
                    audioElement.addEventListener('loadedmetadata', () => {
                        this.updateSeekBar();
                    }, { once: true });
                }
            }
            
            // Auto-play the selected track
            const audioContext = this.audioAnalyzer.audioContext;
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            await this.audioAnalyzer.play();
            
            this.startSeekUpdate();
            this.updatePlayControlButton();
        } catch (error) {
            ShaderLogger.error('Error loading track:', error);
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
    async addTrackFromAPI(songName: string, username: string, autoLoad: boolean = false, preloadedTrack: Track | null = null, prepend: boolean = false): Promise<HTMLElement | null> {
        const result = await this.trackSelector.addTrackFromAPI(songName, username, autoLoad, preloadedTrack ?? undefined, prepend);
        // Update trackOptions reference after adding
        this.trackOptions = document.querySelectorAll('.track-option');
        return result;
    }
    
    /**
     * Handle play/pause control
     */
    async handlePlayControl(): Promise<void> {
        await this.playbackController.handlePlayControl();
    }
    
    /**
     * Setup audio element event listeners
     */
    setupAudioElementListeners(): void {
        this.playbackController.setupAudioElementListeners();
    }
    
    /**
     * Update playback mode button state
     */
    updatePlaybackModeButtonState(): void {
        this.playbackController.updatePlaybackModeButtonState();
    }
    
    async playRandomTrack(): Promise<void> {
        if (!this.trackOptions || this.trackOptions.length === 0) {
            return;
        }
        
        // Get all available tracks
        const tracks = Array.from(this.trackOptions);
        
        // If only one track, just play it
        if (tracks.length === 1) {
            const filename = (tracks[0] as HTMLElement).dataset.track;
            if (filename) {
                await this.loadTrack(filename);
            }
            return;
        }
        
        // Pick a random track (excluding current track if possible)
        const currentTrack = this.audioAnalyzer.audioElement?.src;
        let availableTracks = tracks.filter(track => {
            const htmlTrack = track as HTMLElement;
            const trackPath = htmlTrack.dataset.track;
            if (!trackPath) return false;
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
        const randomTrack = availableTracks[randomIndex] as HTMLElement;
        const filename = randomTrack.dataset.track;
        
        if (filename) {
            await this.loadTrack(filename);
        }
    }
    
    /**
     * Handle skip left button (previous track or restart)
     */
    async handleSkipLeft(): Promise<void> {
        await this.playbackController.handleSkipLeft();
    }
    
    /**
     * Handle skip right button (next track)
     */
    async handleSkipRight(): Promise<void> {
        await this.playbackController.handleSkipRight();
    }
    
    /**
     * Sort track list alphabetically by track name (case-insensitive)
     */
    sortTrackListAlphabetically(): void {
        this.trackSelector.sortTracksAlphabetically();
        // Update trackOptions reference for backward compatibility
        this.trackOptions = document.querySelectorAll('.track-option');
        
        // Select random track if none is currently active
        this.selectRandomTrack();
    }
    
    selectRandomTrack(): void {
        // Update trackOptions reference to ensure we have the latest tracks
        this.trackOptions = document.querySelectorAll('.track-option');
        
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
        const randomTrack = this.trackOptions[randomIndex] as HTMLElement;
        const filename = randomTrack.dataset.track;
        
        if (!filename) return;
        
        // Actually load the track (not just visually select it)
        this.loadTrack(filename).catch(error => {
            ShaderLogger.error('Error loading random track:', error);
        });
    }
}

