// UI Controls Manager Component
// Handles auto-hide controls, loading states, and UI visibility management

interface UIElements {
    audioControlsContainer?: HTMLElement | null;
    topControls?: HTMLElement | null;
    trackDropdownBtn?: HTMLElement | null;
    appLoader?: HTMLElement | null;
    playControlBtn?: HTMLElement | null;
    skipLeftBtn?: HTMLElement | null;
    skipRightBtn?: HTMLElement | null;
    scrubberContainer?: HTMLElement | null;
    trackDropdown?: HTMLElement | null;
    trackDropdownMenu?: HTMLElement | null;
    playbackModeBtn?: HTMLElement | null;
}

export class UIControlsManager {
    mouseMoveTimeout: ReturnType<typeof setTimeout> | null;
    hideDelay: number;
    isControlsVisible: boolean;
    isHoveringControls: boolean;
    audioControlsContainer: HTMLElement | null;
    topControls: HTMLElement | null;
    trackDropdownBtn: HTMLElement | null;
    appLoader: HTMLElement | null;
    isDropdownOpen: boolean;
    
    constructor() {
        // Auto-hide controls state
        this.mouseMoveTimeout = null;
        this.hideDelay = 2000; // Hide after 2 seconds of no mouse movement
        this.isControlsVisible = false;
        this.isHoveringControls = false;
        
        // UI element references (will be set in init)
        this.audioControlsContainer = null;
        this.topControls = null;
        this.trackDropdownBtn = null;
        this.appLoader = null;
        this.isDropdownOpen = false;
    }
    
    /**
     * Initialize the UI controls manager
     * @param elements - Object containing DOM element references
     */
    init(elements: UIElements): void {
        this.audioControlsContainer = elements.audioControlsContainer || null;
        this.topControls = elements.topControls || null;
        this.trackDropdownBtn = elements.trackDropdownBtn || null;
        this.appLoader = elements.appLoader || null;
        
        // Start with controls hidden
        this.hideControls();
        
        // Setup auto-hide controls
        this.setupAutoHideControls(elements);
    }
    
    /**
     * Setup click-to-toggle controls
     * @param elements - Object containing DOM element references for hover detection
     */
    setupAutoHideControls(elements: UIElements): void {
        // Toggle controls on click anywhere (except inside the controls themselves)
        document.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            
            // Don't toggle if clicking inside the controls
            const isClickInsideControls = 
                this.audioControlsContainer?.contains(target) ||
                this.topControls?.contains(target) ||
                elements.trackDropdownMenu?.contains(target);
            
            if (isClickInsideControls) {
                return;
            }
            
            // Toggle UI visibility on click
            if (this.isControlsVisible) {
                this.hideControls();
            } else {
                this.showControls(true); // Force show even if menus are open
            }
        });
        
        // Keep controls visible when hovering over them
        const controlElements: (HTMLElement | null | undefined)[] = [
            elements.playControlBtn,
            elements.skipLeftBtn,
            elements.skipRightBtn,
            elements.scrubberContainer,
            elements.trackDropdown,
            elements.trackDropdownMenu,
            this.topControls,
            elements.playbackModeBtn,
            this.audioControlsContainer
        ];
        
        controlElements.forEach(element => {
            if (element) {
                element.addEventListener('mouseenter', () => {
                    this.isHoveringControls = true;
                    this.showControls();
                });
                
                element.addEventListener('mouseleave', () => {
                    this.isHoveringControls = false;
                    // Don't auto-hide on mouse leave
                });
            }
        });
    }
    
    /**
     * Show controls (unless menu is open)
     * @param force - Force show even if menu is open
     */
    showControls(force: boolean = false): void {
        // Don't show if any menu is open (unless forced)
        if (!force) {
            if (this.isDropdownOpen) return;
            
            // Check if color preset or shader menus are open
            const colorPresetMenu = document.getElementById('colorPresetMenu');
            const shaderSwitcherMenu = document.getElementById('shaderSwitcherMenu');
            if ((colorPresetMenu && colorPresetMenu.classList.contains('open')) ||
                (shaderSwitcherMenu && shaderSwitcherMenu.classList.contains('open'))) {
                return;
            }
        }
        
        if (this.isControlsVisible) return;
        
        this.isControlsVisible = true;
        this.audioControlsContainer?.classList.remove('ui-hidden');
        this.topControls?.classList.remove('ui-hidden');
    }
    
    /**
     * Hide controls
     */
    hideControls(): void {
        // Always allow hiding (menu needs to hide controls)
        this.isControlsVisible = false;
        this.audioControlsContainer?.classList.add('ui-hidden');
        this.topControls?.classList.add('ui-hidden');
    }
    
    /**
     * Reset hide timeout (no longer used, but keeping for compatibility)
     */
    resetHideTimeout(): void {
        // No-op: we don't auto-hide anymore
    }
    
    /**
     * Set whether dropdown is open (affects showControls behavior)
     * @param isOpen - Whether dropdown is open
     */
    setDropdownOpen(isOpen: boolean): void {
        this.isDropdownOpen = isOpen;
    }
    
    /**
     * Show loading spinner
     */
    showLoading(): void {
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.classList.add('loading');
        }
        // Show full-screen loader
        if (this.appLoader) {
            this.appLoader.style.display = 'flex';
            this.appLoader.classList.remove('hidden');
        }
    }
    
    /**
     * Hide loading spinner
     */
    hideLoading(): void {
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.classList.remove('loading');
        }
        // Hide full-screen loader
        if (this.appLoader) {
            this.appLoader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                if (this.appLoader && this.appLoader.classList.contains('hidden')) {
                    this.appLoader.style.display = 'none';
                }
            }, 300);
        }
    }
    
    /**
     * Clean up and destroy the component
     */
    destroy(): void {
        if (this.mouseMoveTimeout) {
            clearTimeout(this.mouseMoveTimeout);
            this.mouseMoveTimeout = null;
        }
    }
}

