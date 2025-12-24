// Track Selector Component
// Orchestrates track dropdown, search, filtering, keyboard navigation, and track management

import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import type { AudioAnalyzer } from '../../core/audio/AudioAnalyzer.js';
import type { Track } from '../../types/api.js';
import type { UIControlsManager } from './UIControlsManager.js';
import { TrackDropdown } from './track/TrackDropdown.js';
import { TrackSearch } from './track/TrackSearch.js';
import { TrackListManager } from './track/TrackListManager.js';
import { TrackAPIIntegration } from './track/TrackAPIIntegration.js';

export class TrackSelector {
    audioAnalyzer: AudioAnalyzer;
    onTrackChange: ((trackUrl: string) => void) | null;
    trackDropdownBtn: HTMLElement | null;
    trackDropdownText: HTMLElement | null;
    trackDropdownCover: HTMLImageElement | null;
    trackOptions: NodeListOf<HTMLElement>;
    uiControlsManager: UIControlsManager | null;
    onTrackSelected: ((trackUrl: string, trackOption: HTMLElement) => void) | null;
    
    // Component instances
    private dropdown: TrackDropdown;
    private search: TrackSearch;
    private listManager: TrackListManager;
    private apiIntegration: TrackAPIIntegration;
    
    constructor(audioAnalyzer: AudioAnalyzer, onTrackChange: ((trackUrl: string) => void) | null = null) {
        this.audioAnalyzer = audioAnalyzer;
        this.onTrackChange = onTrackChange;
        
        // DOM element references
        this.trackDropdownBtn = document.getElementById('trackDropdownBtn');
        this.trackDropdownText = document.getElementById('trackDropdownText');
        this.trackDropdownCover = document.getElementById('trackDropdownCover') as HTMLImageElement | null;
        this.trackOptions = document.querySelectorAll('.track-option');
        
        // State
        this.uiControlsManager = null;
        this.onTrackSelected = null;
        
        // Initialize components
        this.dropdown = new TrackDropdown();
        this.listManager = new TrackListManager();
        this.search = new TrackSearch();
        this.apiIntegration = new TrackAPIIntegration(this.listManager);
    }
    
    /**
     * Initialize the track selector
     * @param uiControlsManager - UI controls manager for menu coordination
     */
    init(uiControlsManager: UIControlsManager): void {
        this.uiControlsManager = uiControlsManager;
        
        // Initialize dropdown
        this.dropdown.init(uiControlsManager);
        
        // Track dropdown button click
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }
        
        // Track option clicks (for existing tracks)
        this.trackOptions.forEach(option => {
            option.addEventListener('click', async (e: MouseEvent) => {
                e.stopPropagation();
                const filename = option.dataset.track;
                
                if (!filename) return;
                
                // Close dropdown immediately for instant feedback
                this.closeDropdown();
                
                // Return filename for parent to handle loading
                if (this.onTrackSelected) {
                    this.onTrackSelected(filename, option);
                }
            });
        });
        
        // Close dropdown when clicking outside (check both button and menu)
        document.addEventListener('click', (e: MouseEvent) => {
            const trackDropdown = document.getElementById('trackDropdown');
            const trackDropdownMenu = document.getElementById('trackDropdownMenu');
            if (trackDropdown && !trackDropdown.contains(e.target as Node) &&
                trackDropdownMenu && !trackDropdownMenu.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });
        
        // Initialize list manager
        this.listManager.init(() => this.closeDropdown());
        
        // Initialize search
        this.search.init(
            (query) => this.filterTracks(query),
            () => this.closeDropdown(),
            () => this.focusFirstVisibleTrack()
        );
        
        // Initialize API integration
        this.apiIntegration.init(
            (trackUrl, trackOption) => {
                if (this.onTrackSelected) {
                    this.onTrackSelected(trackUrl, trackOption);
                }
            },
            () => this.closeDropdown()
        );
        
        // Update trackOptions reference when tracks are added
        this.trackOptions = this.listManager.getTrackOptions();
    }
    
    /**
     * Toggle dropdown open/closed
     */
    toggleDropdown(): void {
        this.dropdown.toggle();
    }
    
    /**
     * Open the track menu
     */
    openMenu(): void {
        this.dropdown.open();
    }
    
    /**
     * Close the track menu
     */
    closeMenu(): void {
        this.dropdown.close();
    }
    
    /**
     * Close dropdown (alias for closeMenu)
     */
    closeDropdown(): void {
        if (!this.dropdown.isOpen()) return;
        this.dropdown.close();
    }
    
    /**
     * Update track cover image in dropdown button
     * @param trackOption - Track option element
     */
    updateTrackCover(trackOption: HTMLElement | null): void {
        if (!this.trackDropdownCover) return;
        
        // Get cover image from track option
        const coverImg = trackOption?.querySelector('.track-option-cover') as HTMLImageElement | null;
        
        if (coverImg && coverImg.tagName === 'IMG' && coverImg.src) {
            // Has cover image
            this.trackDropdownCover.src = coverImg.src;
            this.trackDropdownCover.alt = coverImg.alt || '';
            this.trackDropdownCover.style.display = 'block';
        } else {
            // No cover image, hide it
            this.trackDropdownCover.src = '';
            this.trackDropdownCover.alt = '';
            this.trackDropdownCover.style.display = 'none';
        }
    }
    
    /**
     * Add a track from the Audiotool TrackService to the track selection
     * Delegates to TrackAPIIntegration
     */
    async addTrackFromAPI(
        songName: string, 
        username: string, 
        autoLoad: boolean = false, 
        preloadedTrack: Track | null = null, 
        prepend: boolean = false
    ): Promise<HTMLElement | null> {
        const result = await this.apiIntegration.addTrackFromAPI(songName, username, autoLoad, preloadedTrack, prepend);
        // Update trackOptions reference after adding
        this.trackOptions = this.listManager.getTrackOptions();
        return result;
    }
    
    /**
     * Sort tracks alphabetically by name
     */
    sortTracksAlphabetically(): void {
        this.listManager.sortTracksAlphabetically();
        // Update trackOptions reference after sorting
        this.trackOptions = this.listManager.getTrackOptions();
    }
    
    /**
     * Filter tracks by search query
     * @param query - Search query (case-insensitive)
     */
    filterTracks(query: string): void {
        this.listManager.filterTracks(query);
    }
    
    /**
     * Setup track search functionality
     * @deprecated Now handled by TrackSearch component in init()
     */
    setupTrackSearch(): void {
        // Delegated to TrackSearch component - no longer needed here
        ShaderLogger.debug('setupTrackSearch() called but is now handled by TrackSearch component');
    }
    
    /**
     * Setup keyboard navigation for track list
     * @deprecated Now handled by TrackListManager component in init()
     */
    setupTrackListKeyboardNavigation(): void {
        // Delegated to TrackListManager component - no longer needed here
        ShaderLogger.debug('setupTrackListKeyboardNavigation() called but is now handled by TrackListManager component');
    }
    
    /**
     * Update track options to be focusable
     */
    updateTrackOptionsFocusability(): void {
        this.listManager.updateTrackOptionsFocusability();
    }
    
    /**
     * Get all visible tracks
     * @returns Array of visible track option elements
     */
    getVisibleTracks(): HTMLElement[] {
        return this.listManager.getVisibleTracks();
    }
    
    /**
     * Focus first visible track
     */
    focusFirstVisibleTrack(): void {
        this.listManager.focusFirstVisibleTrack();
    }
    
    /**
     * Focus last visible track
     */
    focusLastVisibleTrack(): void {
        this.listManager.focusLastVisibleTrack();
    }
    
    /**
     * Focus next track
     * @param currentTrack - Currently focused track
     */
    focusNextTrack(currentTrack: HTMLElement): void {
        this.listManager.focusNextTrack(currentTrack);
    }
    
    /**
     * Focus previous track
     * @param currentTrack - Currently focused track
     */
    focusPreviousTrack(currentTrack: HTMLElement): void {
        this.listManager.focusPreviousTrack(currentTrack);
    }
    
    /**
     * Scroll track into view
     * @param track - Track element to scroll into view
     */
    scrollTrackIntoView(track: HTMLElement): void {
        this.listManager.scrollTrackIntoView(track);
    }
    
    /**
     * Get current track index
     * @returns Index of current track, or -1 if not found
     */
    getCurrentTrackIndex(): number {
        if (!this.audioAnalyzer.audioElement || !this.trackOptions || this.trackOptions.length === 0) {
            return -1;
        }
        
        const currentTrack = this.audioAnalyzer.audioElement.src;
        const tracks = Array.from(this.trackOptions);
        
        return tracks.findIndex(track => {
            const trackPath = track.dataset.track;
            if (!trackPath) return false;
            if (trackPath.startsWith('http')) {
                return trackPath === currentTrack;
            } else {
                // For local files, check if the filename appears in the current track src
                const filename = trackPath.replace(/\.mp3$/, '');
                return currentTrack.includes(filename);
            }
        });
    }
    
    /**
     * Get current track element
     * @returns Current track option element, or null if not found
     */
    getCurrentTrack(): HTMLElement | null {
        const index = this.getCurrentTrackIndex();
        if (index === -1) return null;
        return Array.from(this.trackOptions)[index];
    }
    
    /**
     * Get previous track element
     * @returns Previous track option element, or null if not found
     */
    getPreviousTrack(): HTMLElement | null {
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
    
    /**
     * Get next track element
     * @returns Next track option element, or null if not found
     */
    getNextTrack(): HTMLElement | null {
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
    
    /**
     * Clean up and destroy the component
     */
    destroy(): void {
        // Cleanup is handled by removing event listeners if needed
        // Most listeners are on DOM elements that will be cleaned up naturally
    }
}
