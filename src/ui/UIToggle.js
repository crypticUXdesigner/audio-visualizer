// UI Toggle Module
// Handles showing/hiding UI elements with auto-hide on inactivity

export class UIToggle {
    constructor() {
        this.uiToggleBtn = document.getElementById('uiToggleBtn');
        this.uiVisible = true;
        this.autoHideTimeout = null;
        this.autoHideDelay = 3000; // Hide UI after 3 seconds of inactivity
        this.isManuallyHidden = false; // Track if user manually hid the UI
        this.isMobile = this.detectMobile();
        this.init();
    }
    
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    }
    
    init() {
        // Manual toggle button (optional - removed on mobile)
        if (this.uiToggleBtn) {
            this.uiToggleBtn.addEventListener('click', () => {
                this.toggle();
            });
        }
        
        // Mouse movement detection for auto-show (desktop)
        document.addEventListener('mousemove', () => {
            this.handleActivity();
        });
        
        // Touch events for mobile
        if (this.isMobile) {
            document.addEventListener('touchstart', () => {
                this.handleActivity();
            }, { passive: true });
            
            document.addEventListener('touchmove', () => {
                this.handleActivity();
            }, { passive: true });
        }
        
        // Also show UI when interacting with controls
        const interactiveElements = document.querySelectorAll(
            '#audioControls, #trackControls, .preset-btn, .track-btn, .play-control, .seek-bar'
        );
        interactiveElements.forEach(el => {
            el.addEventListener('touchstart', () => {
                this.handleActivity();
            }, { passive: true });
            el.addEventListener('mousedown', () => {
                this.handleActivity();
            });
        });
        
        // Start auto-hide timer
        this.startAutoHideTimer();
    }
    
    handleActivity() {
        // Only auto-show if UI wasn't manually hidden
        if (!this.isManuallyHidden) {
            this.show();
            this.startAutoHideTimer();
        }
    }
    
    startAutoHideTimer() {
        // Clear existing timer
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
        }
        
        // Set new timer to hide UI after inactivity
        this.autoHideTimeout = setTimeout(() => {
            // Only auto-hide if UI wasn't manually hidden
            if (!this.isManuallyHidden && this.uiVisible) {
                this.hide();
            }
        }, this.autoHideDelay);
    }
    
    toggle() {
        this.uiVisible = !this.uiVisible;
        this.isManuallyHidden = !this.uiVisible; // Update manual state
        
        if (this.uiVisible) {
            document.body.classList.remove('ui-hidden');
            // Restart auto-hide timer when manually showing
            this.startAutoHideTimer();
        } else {
            document.body.classList.add('ui-hidden');
            // Clear timer when manually hiding
            if (this.autoHideTimeout) {
                clearTimeout(this.autoHideTimeout);
                this.autoHideTimeout = null;
            }
        }
    }
    
    show() {
        this.uiVisible = true;
        this.isManuallyHidden = false; // Reset manual state when auto-showing
        document.body.classList.remove('ui-hidden');
    }
    
    hide() {
        this.uiVisible = false;
        document.body.classList.add('ui-hidden');
    }
}

