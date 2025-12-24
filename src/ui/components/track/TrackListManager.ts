// Track List Manager Component
// Handles list rendering, keyboard navigation, and track option management

export class TrackListManager {
    trackList: HTMLElement | null;
    onCloseDropdown: (() => void) | null;
    
    constructor() {
        this.trackList = document.getElementById('trackList');
        this.onCloseDropdown = null;
    }
    
    /**
     * Initialize list manager
     * @param onCloseDropdown - Callback to close dropdown
     */
    init(onCloseDropdown: () => void): void {
        this.onCloseDropdown = onCloseDropdown;
        
        if (!this.trackList) return;
        
        // Make all track options focusable
        this.updateTrackOptionsFocusability();
        
        // Add keyboard event listener to track list
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
                    if (this.onCloseDropdown) {
                        this.onCloseDropdown();
                    }
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
            if (!track.hasAttribute('tabindex')) {
                track.setAttribute('tabindex', '0');
            }
        });
    }
    
    /**
     * Get visible tracks
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
     * Add track option to list
     * @param trackOption - Track option element
     * @param prepend - Whether to prepend to the list
     */
    addTrackOption(trackOption: HTMLElement, prepend: boolean = false): void {
        if (!this.trackList) return;
        
        if (prepend && this.trackList.firstChild) {
            this.trackList.insertBefore(trackOption, this.trackList.firstChild);
        } else {
            this.trackList.appendChild(trackOption);
        }
        
        // Update focusability
        this.updateTrackOptionsFocusability();
    }
    
    /**
     * Sort tracks alphabetically by name
     */
    sortTracksAlphabetically(): void {
        if (!this.trackList) return;
        
        const tracks = Array.from(this.trackList.querySelectorAll('.track-option'));
        
        tracks.sort((a, b) => {
            const nameA = (a as HTMLElement).dataset.trackName?.toLowerCase() || '';
            const nameB = (b as HTMLElement).dataset.trackName?.toLowerCase() || '';
            return nameA.localeCompare(nameB);
        });
        
        // Re-append sorted tracks
        tracks.forEach(track => {
            this.trackList!.appendChild(track);
        });
    }
    
    /**
     * Filter tracks by query
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
     * Get all track options
     */
    getTrackOptions(): NodeListOf<HTMLElement> {
        return document.querySelectorAll('.track-option');
    }
}

