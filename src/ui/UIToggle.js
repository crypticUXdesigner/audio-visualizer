// UI Toggle Module
// Handles showing/hiding UI elements on background click

export class UIToggle {
    constructor() {
        this.uiVisible = true;
        this.init();
    }
    
    init() {
        // Get background canvas
        const backgroundCanvas = document.getElementById('backgroundCanvas');
        
        // List of UI element selectors that should not trigger toggle
        const uiSelectors = [
            '#audioControls',
            '#trackControls',
            '#colorSwatches',
            '#frequencyCanvas',
            '#shaderParameters',
            '.preset-btn',
            '.track-btn',
            '.play-control',
            '.seek-bar'
        ];
        
        // Add click handler to document body to toggle UI
        document.body.addEventListener('click', (e) => {
            // Check if click target is a UI element or inside a UI element
            const isUIElement = uiSelectors.some(selector => {
                const element = e.target.closest(selector);
                return element !== null;
            });
            
            // Only toggle if clicking on background (not on UI elements)
            if (!isUIElement) {
                this.toggle();
            }
        });
    }
    
    toggle() {
        this.uiVisible = !this.uiVisible;
        
        if (this.uiVisible) {
            document.body.classList.remove('ui-hidden');
        } else {
            document.body.classList.add('ui-hidden');
        }
    }
    
    show() {
        this.uiVisible = true;
        document.body.classList.remove('ui-hidden');
    }
    
    hide() {
        this.uiVisible = false;
        document.body.classList.add('ui-hidden');
    }
}

