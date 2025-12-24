// Track Dropdown Component
// Handles dropdown UI state, open/close animations, and menu coordination

import type { UIControlsManager } from '../UIControlsManager.js';

export class TrackDropdown {
    trackDropdown: HTMLElement | null;
    trackDropdownMenu: HTMLElement | null;
    isDropdownOpen: boolean;
    uiControlsManager: UIControlsManager | null;
    
    constructor() {
        this.trackDropdown = document.getElementById('trackDropdown');
        this.trackDropdownMenu = document.getElementById('trackDropdownMenu');
        this.isDropdownOpen = false;
        this.uiControlsManager = null;
    }
    
    /**
     * Initialize the dropdown component
     * @param uiControlsManager - UI controls manager for menu coordination
     */
    init(uiControlsManager: UIControlsManager): void {
        this.uiControlsManager = uiControlsManager;
    }
    
    /**
     * Toggle dropdown open/closed
     */
    toggle(): void {
        this.isDropdownOpen = !this.isDropdownOpen;
        if (this.isDropdownOpen) {
            this.open();
        } else {
            this.close();
        }
    }
    
    /**
     * Open the track menu
     */
    open(): void {
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
    close(): void {
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
     * Check if dropdown is open
     */
    isOpen(): boolean {
        return this.isDropdownOpen;
    }
}

