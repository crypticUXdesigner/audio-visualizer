// UI Controls Manager Component
// Handles auto-hide controls, loading states, and UI visibility management

export class UIControlsManager {
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
    }
    
    /**
     * Initialize the UI controls manager
     * @param {Object} elements - Object containing DOM element references
     */
    init(elements) {
        this.audioControlsContainer = elements.audioControlsContainer;
        this.topControls = elements.topControls;
        this.trackDropdownBtn = elements.trackDropdownBtn;
        this.appLoader = elements.appLoader;
        
        // Start with controls hidden
        this.hideControls();
        
        // Setup auto-hide controls
        this.setupAutoHideControls(elements);
    }
    
    /**
     * Setup auto-hide controls on mouse movement
     * @param {Object} elements - Object containing DOM element references for hover detection
     */
    setupAutoHideControls(elements) {
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
    }
    
    /**
     * Show controls (unless menu is open)
     * @param {boolean} force - Force show even if menu is open
     */
    showControls(force = false) {
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
    hideControls() {
        // Always allow hiding (menu needs to hide controls)
        this.isControlsVisible = false;
        this.audioControlsContainer?.classList.add('ui-hidden');
        this.topControls?.classList.add('ui-hidden');
    }
    
    /**
     * Reset hide timeout
     */
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
    
    /**
     * Set whether dropdown is open (affects showControls behavior)
     * @param {boolean} isOpen - Whether dropdown is open
     */
    setDropdownOpen(isOpen) {
        this.isDropdownOpen = isOpen;
    }
    
    /**
     * Show loading spinner
     */
    showLoading() {
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
    hideLoading() {
        if (this.trackDropdownBtn) {
            this.trackDropdownBtn.classList.remove('loading');
        }
        // Hide full-screen loader
        if (this.appLoader) {
            this.appLoader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                if (this.appLoader.classList.contains('hidden')) {
                    this.appLoader.style.display = 'none';
                }
            }, 300);
        }
    }
    
    /**
     * Clean up and destroy the component
     */
    destroy() {
        if (this.mouseMoveTimeout) {
            clearTimeout(this.mouseMoveTimeout);
            this.mouseMoveTimeout = null;
        }
    }
}

