// Track API Integration Component
// Handles API calls and track adding from Audiotool API

import { ShaderLogger } from '../../../shaders/utils/ShaderLogger.js';
import type { Track } from '../../../types/api.js';
import type { TrackListManager } from './TrackListManager.js';

export class TrackAPIIntegration {
    trackListManager: TrackListManager;
    onTrackSelected: ((trackUrl: string, trackOption: HTMLElement) => void) | null;
    onCloseDropdown: (() => void) | null;
    trackOptions: NodeListOf<HTMLElement>;
    
    constructor(trackListManager: TrackListManager) {
        this.trackListManager = trackListManager;
        this.onTrackSelected = null;
        this.onCloseDropdown = null;
        this.trackOptions = document.querySelectorAll('.track-option');
    }
    
    /**
     * Initialize API integration
     * @param onTrackSelected - Callback when track is selected
     * @param onCloseDropdown - Callback to close dropdown
     */
    init(
        onTrackSelected: (trackUrl: string, trackOption: HTMLElement) => void,
        onCloseDropdown: () => void
    ): void {
        this.onTrackSelected = onTrackSelected;
        this.onCloseDropdown = onCloseDropdown;
    }
    
    /**
     * Add a track from the Audiotool TrackService to the track selection
     * @param songName - Name of the song
     * @param username - Username (deprecated, not used)
     * @param autoLoad - Whether to automatically load the track after adding
     * @param preloadedTrack - Optional pre-loaded track object (skips API call)
     * @param prepend - Whether to prepend to the list
     * @returns The created track option element, or null on failure
     */
    async addTrackFromAPI(
        songName: string, 
        username: string, 
        autoLoad: boolean = false, 
        preloadedTrack: Track | null = null, 
        prepend: boolean = false
    ): Promise<HTMLElement | null> {
        try {
            let track: Track;
            
            if (preloadedTrack) {
                // Use pre-loaded track (from batch loading)
                track = preloadedTrack;
            } else {
                // Import the TrackService function dynamically to avoid circular dependencies
                const { loadTrack } = await import('../../../api/TrackService.js');
                
                // Get track information from TrackService (tries identifier first, falls back to search)
                const result = await loadTrack(songName, username);
                
                if (!result.success || !result.track) {
                    // Return gracefully instead of throwing
                    const errorMsg = result.error || 'Failed to load track information from TrackService';
                    ShaderLogger.warn(errorMsg);
                    return null; // Return null to indicate failure without throwing
                }
                
                track = result.track;
            }
            
            // Prefer OGG or WAV over MP3 (better quality, less encoding issues)
            // Fallback to MP3 if OGG/WAV not available
            // Note: Protobuf JSON encoding may use snake_case or camelCase
            const audioUrl = (track as { ogg_url?: string }).ogg_url || (track as { oggUrl?: string }).oggUrl || 
                            (track as { wav_url?: string }).wav_url || (track as { wavUrl?: string }).wavUrl || 
                            (track as { mp3_url?: string }).mp3_url || (track as { mp3Url?: string }).mp3Url || 
                            (track as { hls_url?: string }).hls_url || (track as { hlsUrl?: string }).hlsUrl;
            
            if (!audioUrl) {
                throw new Error('Track has no audio URL');
            }
            
            // Extract BPM from track metadata (API provides this)
            const trackBPM = track.bpm || (track as { bpm_url?: number | string }).bpm_url || null;
            const metadataBPM = (typeof trackBPM === 'number' && trackBPM > 0) ? trackBPM : 
                               (typeof trackBPM === 'string' && !isNaN(parseFloat(trackBPM))) ? parseFloat(trackBPM) : 
                               null;
            
            // Check if track already exists
            this.trackOptions = this.trackListManager.getTrackOptions();
            const existingTrack = Array.from(this.trackOptions).find(
                option => option.dataset.track === audioUrl || 
                         option.dataset.apiTrackId === track.name
            );
            
            if (existingTrack) {
                // Track already exists - no action needed
                if (autoLoad && this.onTrackSelected) {
                    this.onTrackSelected(audioUrl, existingTrack);
                }
                return existingTrack;
            }
            
            // Create new track option button with name
            const trackOption = document.createElement('button');
            trackOption.className = 'track-option';
            trackOption.setAttribute('tabindex', '0'); // Make focusable for keyboard navigation
            
            // Create cover image element (always show, placeholder if no image)
            const coverUrl = (track as { cover_url?: string }).cover_url || (track as { coverUrl?: string }).coverUrl;
            const coverElement = coverUrl 
                ? (() => {
                    const img = document.createElement('img');
                    img.className = 'track-option-cover';
                    img.src = coverUrl;
                    img.alt = songName || track.display_name || track.displayName || track.name;
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
            nameElement.textContent = songName || track.display_name || track.displayName || track.name;
            
            // Append elements
            trackOption.appendChild(nameElement);
            
            // Store data for filtering and playback
            trackOption.dataset.track = audioUrl; // Store the full URL
            trackOption.dataset.apiTrackId = track.name; // Store API ID for reference
            trackOption.dataset.apiTrack = 'true'; // Mark as API track
            trackOption.dataset.trackName = songName || track.display_name || track.displayName || track.name;
            // Store BPM in dataset for later use when loading track
            if (metadataBPM) {
                trackOption.dataset.trackBpm = metadataBPM.toString();
            }
            
            // Add click handler
            trackOption.addEventListener('click', async (e: MouseEvent) => {
                e.stopPropagation();
                const trackUrl = trackOption.dataset.track;
                
                if (!trackUrl) return;
                
                // Close dropdown immediately for instant feedback
                if (this.onCloseDropdown) {
                    this.onCloseDropdown();
                }
                
                // Notify parent to load track
                if (this.onTrackSelected) {
                    this.onTrackSelected(trackUrl, trackOption);
                }
            });
            
            // Add to track list
            this.trackListManager.addTrackOption(trackOption, prepend);
            
            // Update trackOptions reference
            this.trackOptions = this.trackListManager.getTrackOptions();
            
            // Auto-load if requested
            if (autoLoad && this.onTrackSelected) {
                this.onTrackSelected(audioUrl, trackOption);
            }
            
            return trackOption;
        } catch (error) {
            ShaderLogger.error('Error adding track from API:', error);
            throw error;
        }
    }
}

