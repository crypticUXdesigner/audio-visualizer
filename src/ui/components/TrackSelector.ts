// Track Selector Component
// Handles track dropdown, search, filtering, keyboard navigation, and track management

import type { AudioAnalyzer } from '../../core/audio/AudioAnalyzer.js';
import type { Track } from '../../types/api.js';
import type { UIControlsManager } from './UIControlsManager.js';

export class TrackSelector {
    audioAnalyzer: AudioAnalyzer;
    onTrackChange: ((trackUrl: string) => void) | null;
    trackDropdown: HTMLElement | null;
    trackDropdownBtn: HTMLElement | null;
    trackDropdownText: HTMLElement | null;
    trackDropdownCover: HTMLImageElement | null;
    trackDropdownMenu: HTMLElement | null;
    trackList: HTMLElement | null;
    trackOptions: NodeListOf<HTMLElement>;
    isDropdownOpen: boolean;
    uiControlsManager: UIControlsManager | null;
    onTrackSelected: ((trackUrl: string, trackOption: HTMLElement) => void) | null;
    
    constructor(audioAnalyzer: AudioAnalyzer, onTrackChange: ((trackUrl: string) => void) | null = null) {
        this.audioAnalyzer = audioAnalyzer;
        this.onTrackChange = onTrackChange;
        
        // DOM element references
        this.trackDropdown = document.getElementById('trackDropdown');
        this.trackDropdownBtn = document.getElementById('trackDropdownBtn');
        this.trackDropdownText = document.getElementById('trackDropdownText');
        this.trackDropdownCover = document.getElementById('trackDropdownCover') as HTMLImageElement | null;
        this.trackDropdownMenu = document.getElementById('trackDropdownMenu');
        this.trackList = document.getElementById('trackList');
        this.trackOptions = document.querySelectorAll('.track-option');
        
        // State
        this.isDropdownOpen = false;
        this.uiControlsManager = null;
        this.onTrackSelected = null;
    }
    
    /**
     * Initialize the track selector
     * @param uiControlsManager - UI controls manager for menu coordination
     */
    init(uiControlsManager: UIControlsManager): void {
        this.uiControlsManager = uiControlsManager;
        
        // Track dropdown button click
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }
        
        // Track option clicks
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
            if (this.trackDropdown && !this.trackDropdown.contains(e.target as Node) &&
                this.trackDropdownMenu && !this.trackDropdownMenu.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });
        
        // Setup track search
        this.setupTrackSearch();
        
        // Setup keyboard navigation
        this.setupTrackListKeyboardNavigation();
    }
    
    /**
     * Toggle dropdown open/closed
     */
    toggleDropdown(): void {
        this.isDropdownOpen = !this.isDropdownOpen;
        if (this.isDropdownOpen) {
            this.openMenu();
        } else {
            this.closeMenu();
        }
    }
    
    /**
     * Open the track menu
     */
    openMenu(): void {
        this.isDropdownOpen = true;
        if (this.uiControlsManager) {
            this.uiControlsManager.setDropdownOpen(true);
        }
        
        // Step 1: Hide controls (top and bottom)
        if (this.uiControlsManager) {
            this.uiControlsManager.hideControls();
        }
        
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
    
    /**
     * Close the track menu
     */
    closeMenu(): void {
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
            if (this.uiControlsManager) {
                this.uiControlsManager.setDropdownOpen(false);
                this.uiControlsManager.showControls();
            }
        }, 350); // Match the animation duration
    }
    
    /**
     * Close dropdown (alias for closeMenu)
     */
    closeDropdown(): void {
        if (!this.isDropdownOpen) return;
        this.closeMenu();
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
                const { loadTrack } = await import('../../api/TrackService.js');
                
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
                this.closeDropdown();
                
                // Notify parent to load track
                if (this.onTrackSelected) {
                    this.onTrackSelected(trackUrl, trackOption);
                }
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
                
                // Auto-load if requested
                if (autoLoad && this.onTrackSelected) {
                    this.onTrackSelected(audioUrl, trackOption);
                }
                
                return trackOption;
            } else {
                throw new Error('Track list not found');
            }
        } catch (error) {
            ShaderLogger.error('Error adding track from API:', error);
            throw error;
        }
    }
    
    /**
     * Sort tracks alphabetically by name
     */
    sortTracksAlphabetically(): void {
        if (!this.trackList) return;
        
        const tracks = Array.from(this.trackList.querySelectorAll('.track-option'));
        
        // Sort by track name (case-insensitive)
        tracks.sort((a, b) => {
            const htmlA = a as HTMLElement;
            const htmlB = b as HTMLElement;
            const nameA = (htmlA.dataset.trackName || '').toLowerCase();
            const nameB = (htmlB.dataset.trackName || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        // Re-append in sorted order
        tracks.forEach(track => {
            this.trackList!.appendChild(track);
        });
        
        // Update trackOptions reference
        this.trackOptions = document.querySelectorAll('.track-option');
    }
    
    /**
     * Filter tracks by search query
     * @param query - Search query (case-insensitive)
     */
    filterTracks(query: string): void {
        const noResultsMsg = document.getElementById('noResultsMsg');
        const tracks = this.trackList?.querySelectorAll('.track-option') || [];
        
        let visibleCount = 0;
        
        tracks.forEach(track => {
            const htmlTrack = track as HTMLElement;
            const name = htmlTrack.dataset.trackName?.toLowerCase() || '';
            
            if (name.includes(query.toLowerCase())) {
                (track as HTMLElement).style.display = '';
                visibleCount++;
            } else {
                (track as HTMLElement).style.display = 'none';
            }
        });
        
        // Show/hide no results message
        if (visibleCount === 0 && query.length > 0) {
            if (noResultsMsg) {
                noResultsMsg.style.display = 'block';
            }
        } else {
            if (noResultsMsg) {
                noResultsMsg.style.display = 'none';
            }
        }
    }
    
    /**
     * Setup track search functionality
     */
    setupTrackSearch(): void {
        const searchInput = document.getElementById('trackSearchInput') as HTMLInputElement | null;
        const searchClear = document.getElementById('trackSearchClear');
        
        if (!searchInput) return;
        
        // Handle search input
        searchInput.addEventListener('input', (e: Event) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
            
            // Show/hide clear button
            if (searchClear) {
                if (query.length > 0) {
                    searchClear.style.display = 'flex';
                } else {
                    searchClear.style.display = 'none';
                }
            }
            
            // Filter tracks
            this.filterTracks(query);
            
            // Clear focus from track options when searching
            const focusedTrack = this.trackList?.querySelector('.track-option:focus') as HTMLElement | null;
            if (focusedTrack) {
                focusedTrack.blur();
            }
        });
        
        // Handle clear button
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.style.display = 'none';
                this.filterTracks('');
                searchInput.focus();
            });
        }
        
        // Clear search when dropdown opens
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                }
                if (searchClear) {
                    searchClear.style.display = 'none';
                }
                this.filterTracks('');
            });
        }
        
        // Focus search input when dropdown opens (desktop only)
        const observer = new MutationObserver(() => {
            if (this.trackDropdown?.classList.contains('open')) {
                const mediaQuery = window.matchMedia('(min-width: 769px)');
                if (mediaQuery.matches) {
                    setTimeout(() => {
                        if (searchInput) {
                            searchInput.focus();
                        }
                    }, 100);
                }
            }
        });
        if (this.trackDropdown) {
            observer.observe(this.trackDropdown, { attributes: true, attributeFilter: ['class'] });
        }
        
        // Keyboard navigation from search input
        if (searchInput) {
            searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    this.closeDropdown();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.focusFirstVisibleTrack();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    // If there's only one visible track, select it
                    const visibleTracks = this.getVisibleTracks();
                    if (visibleTracks.length === 1) {
                        visibleTracks[0].click();
                    } else {
                        this.focusFirstVisibleTrack();
                    }
                }
            });
        }
    }
    
    /**
     * Setup keyboard navigation for track list
     */
    setupTrackListKeyboardNavigation(): void {
        if (!this.trackList) return;
        
        // Make all track options focusable
        this.updateTrackOptionsFocusability();
        
        // Add keyboard event listener to track list
        if (!this.trackList) return;
        this.trackList.addEventListener('keydown', (e: KeyboardEvent) => {
            const focusedTrack = this.trackList!.querySelector('.track-option:focus') as HTMLElement | null;
            
            if (!focusedTrack) return;
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.focusNextTrack(focusedTrack);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.focusPreviousTrack(focusedTrack);
                    break;
                case 'Home':
                    e.preventDefault();
                    this.focusFirstVisibleTrack();
                    break;
                case 'End':
                    e.preventDefault();
                    this.focusLastVisibleTrack();
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    focusedTrack.click();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.closeDropdown();
                    break;
            }
        });
        
        // Update focusability when tracks are added dynamically
        const trackListObserver = new MutationObserver(() => {
            this.updateTrackOptionsFocusability();
        });
        if (this.trackList) {
            trackListObserver.observe(this.trackList, { childList: true, subtree: true });
        }
    }
    
    /**
     * Update track options to be focusable
     */
    updateTrackOptionsFocusability(): void {
        if (!this.trackList) return;
        const tracks = this.trackList.querySelectorAll('.track-option');
        tracks.forEach(track => {
            // Make focusable if not already
            if (!track.hasAttribute('tabindex')) {
                track.setAttribute('tabindex', '0');
            }
        });
    }
    
    /**
     * Get all visible tracks
     * @returns Array of visible track option elements
     */
    getVisibleTracks(): HTMLElement[] {
        if (!this.trackList) return [];
        return Array.from(this.trackList.querySelectorAll('.track-option')).filter(track => {
            const el = track as HTMLElement;
            return el.style.display !== 'none' && 
                   !el.classList.contains('hidden') &&
                   el.offsetParent !== null;
        }) as HTMLElement[];
    }
    
    /**
     * Focus first visible track
     */
    focusFirstVisibleTrack(): void {
        const visibleTracks = this.getVisibleTracks();
        if (visibleTracks.length > 0) {
            visibleTracks[0].focus();
            this.scrollTrackIntoView(visibleTracks[0]);
        }
    }
    
    /**
     * Focus last visible track
     */
    focusLastVisibleTrack(): void {
        const visibleTracks = this.getVisibleTracks();
        if (visibleTracks.length > 0) {
            visibleTracks[visibleTracks.length - 1].focus();
            this.scrollTrackIntoView(visibleTracks[visibleTracks.length - 1]);
        }
    }
    
    /**
     * Focus next track
     * @param currentTrack - Currently focused track
     */
    focusNextTrack(currentTrack: HTMLElement): void {
        const visibleTracks = this.getVisibleTracks();
        if (visibleTracks.length === 0) return;
        
        const currentIndex = visibleTracks.indexOf(currentTrack);
        const nextIndex = currentIndex < visibleTracks.length - 1 ? currentIndex + 1 : 0; // Wrap around
        const nextTrack = visibleTracks[nextIndex];
        
        nextTrack.focus();
        this.scrollTrackIntoView(nextTrack);
    }
    
    /**
     * Focus previous track
     * @param currentTrack - Currently focused track
     */
    focusPreviousTrack(currentTrack: HTMLElement): void {
        const visibleTracks = this.getVisibleTracks();
        if (visibleTracks.length === 0) return;
        
        const currentIndex = visibleTracks.indexOf(currentTrack);
        const previousIndex = currentIndex > 0 ? currentIndex - 1 : visibleTracks.length - 1; // Wrap around
        const previousTrack = visibleTracks[previousIndex];
        
        previousTrack.focus();
        this.scrollTrackIntoView(previousTrack);
    }
    
    /**
     * Scroll track into view
     * @param track - Track element to scroll into view
     */
    scrollTrackIntoView(track: HTMLElement): void {
        if (!track || !this.trackList) return;
        
        // Use scrollIntoView with smooth behavior
        track.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
        });
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

