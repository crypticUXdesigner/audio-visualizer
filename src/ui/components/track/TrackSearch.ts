// Track Search Component
// Handles search input, filtering, and search-related keyboard navigation

export class TrackSearch {
    trackList: HTMLElement | null;
    searchInput: HTMLInputElement | null;
    searchClear: HTMLElement | null;
    trackDropdown: HTMLElement | null;
    onFilterChange: ((query: string) => void) | null;
    onCloseDropdown: (() => void) | null;
    onFocusFirstTrack: (() => void) | null;
    
    constructor() {
        this.trackList = document.getElementById('trackList');
        this.searchInput = document.getElementById('trackSearchInput') as HTMLInputElement | null;
        this.searchClear = document.getElementById('trackSearchClear');
        this.trackDropdown = document.getElementById('trackDropdown');
        this.onFilterChange = null;
        this.onCloseDropdown = null;
        this.onFocusFirstTrack = null;
    }
    
    /**
     * Initialize search functionality
     * @param onFilterChange - Callback when filter changes
     * @param onCloseDropdown - Callback to close dropdown
     * @param onFocusFirstTrack - Callback to focus first track
     */
    init(
        onFilterChange: (query: string) => void,
        onCloseDropdown: () => void,
        onFocusFirstTrack: () => void
    ): void {
        this.onFilterChange = onFilterChange;
        this.onCloseDropdown = onCloseDropdown;
        this.onFocusFirstTrack = onFocusFirstTrack;
        
        if (!this.searchInput) return;
        
        // Handle search input
        this.searchInput.addEventListener('input', (e: Event) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
            
            // Show/hide clear button
            if (this.searchClear) {
                if (query.length > 0) {
                    this.searchClear.style.display = 'flex';
                } else {
                    this.searchClear.style.display = 'none';
                }
            }
            
            // Filter tracks
            if (this.onFilterChange) {
                this.onFilterChange(query);
            }
            
            // Clear focus from track options when searching
            const focusedTrack = this.trackList?.querySelector('.track-option:focus') as HTMLElement | null;
            if (focusedTrack) {
                focusedTrack.blur();
            }
        });
        
        // Handle clear button
        if (this.searchClear) {
            this.searchClear.addEventListener('click', () => {
                if (this.searchInput) {
                    this.searchInput.value = '';
                }
                this.searchClear!.style.display = 'none';
                if (this.onFilterChange) {
                    this.onFilterChange('');
                }
                if (this.searchInput) {
                    this.searchInput.focus();
                }
            });
        }
        
        // Clear search when dropdown opens
        const trackDropdownBtn = document.getElementById('trackDropdownBtn');
        if (trackDropdownBtn) {
            trackDropdownBtn.addEventListener('click', () => {
                if (this.searchInput) {
                    this.searchInput.value = '';
                }
                if (this.searchClear) {
                    this.searchClear.style.display = 'none';
                }
                if (this.onFilterChange) {
                    this.onFilterChange('');
                }
            });
        }
        
        // Focus search input when dropdown opens (desktop only)
        const observer = new MutationObserver(() => {
            if (this.trackDropdown?.classList.contains('open')) {
                const mediaQuery = window.matchMedia('(min-width: 769px)');
                if (mediaQuery.matches) {
                    setTimeout(() => {
                        if (this.searchInput) {
                            this.searchInput.focus();
                        }
                    }, 100);
                }
            }
        });
        if (this.trackDropdown) {
            observer.observe(this.trackDropdown, { attributes: true, attributeFilter: ['class'] });
        }
        
        // Keyboard navigation from search input
        if (this.searchInput) {
            this.searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    if (this.onCloseDropdown) {
                        this.onCloseDropdown();
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (this.onFocusFirstTrack) {
                        this.onFocusFirstTrack();
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    // If there's only one visible track, select it
                    const visibleTracks = this.getVisibleTracks();
                    if (visibleTracks.length === 1) {
                        visibleTracks[0].click();
                    } else if (this.onFocusFirstTrack) {
                        this.onFocusFirstTrack();
                    }
                }
            });
        }
    }
    
    /**
     * Get visible tracks (delegates to trackList if available)
     */
    getVisibleTracks(): HTMLElement[] {
        if (!this.trackList) return [];
        const tracks = this.trackList.querySelectorAll('.track-option');
        return Array.from(tracks).filter(track => {
            const el = track as HTMLElement;
            return el.style.display !== 'none' && 
                   !el.classList.contains('hidden') &&
                   el.offsetParent !== null;
        }) as HTMLElement[];
    }
    
    /**
     * Clear search input
     */
    clear(): void {
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        if (this.searchClear) {
            this.searchClear.style.display = 'none';
        }
    }
}

