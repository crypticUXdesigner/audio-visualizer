// Shader Switcher UI Module
// Handles shader selection and switching

export class ShaderSwitcher {
    constructor(shaderManager, onShaderChange, audioControls = null) {
        this.shaderManager = shaderManager;
        this.onShaderChange = onShaderChange; // Optional callback: (shaderName) => void
        this.audioControls = audioControls; // Reference to AudioControls for hideControls/showControls
        let savedShader = localStorage.getItem('activeShader') || 'heightmap';
        // Migrate old shader names to new names
        if (savedShader === 'background-fbm') {
            savedShader = 'heightmap';
            localStorage.setItem('activeShader', 'heightmap');
        }
        if (savedShader === 'milky-glass') {
            savedShader = 'refraction';
            localStorage.setItem('activeShader', 'refraction');
        }
        this.currentShader = savedShader;
        this.isMenuOpen = false;
        this.shaderSwitcherMenu = null;
        this.init();
    }
    
    init() {
        const shaderSwitcherBtn = document.getElementById('shaderSwitcherBtn');
        this.shaderSwitcherMenu = document.getElementById('shaderSwitcherMenu');
        const shaderButtonsContainer = document.getElementById('shaderButtons');
        const shaderSwitcherItem = shaderSwitcherBtn?.closest('.top-control-item');
        
        if (!shaderSwitcherBtn || !this.shaderSwitcherMenu || !shaderButtonsContainer || !shaderSwitcherItem) {
            // Retry if not ready yet
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // Setup button toggle
        shaderSwitcherBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isMenuOpen) {
                this.closeMenu();
            } else {
                this.openMenu();
            }
        });
        
        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isMenuOpen && 
                !shaderSwitcherItem.contains(e.target) && 
                !this.shaderSwitcherMenu.contains(e.target)) {
                this.closeMenu();
            }
        });
        
        // Populate shader buttons
        this.populateShaderButtons(shaderButtonsContainer);
        
        // Update UI to reflect current active shader (may already be set by main.js)
        const activeShader = this.shaderManager.getActiveShader();
        if (activeShader) {
            this.currentShader = activeShader.config.name;
            this.updateActiveShader(this.currentShader);
        } else if (this.currentShader) {
            // Only switch if shader isn't already active
            this.switchShader(this.currentShader, false); // Don't save again
        }
    }
    
    /**
     * Populate the shader buttons container with available shaders
     */
    populateShaderButtons(container) {
        const shaderNames = this.shaderManager.getShaderNames();
        
        // Define desired order: final shaders first, then draft shaders
        const shaderOrder = ['refraction', 'heightmap', 'strings'];
        
        // Sort shaders according to desired order
        const sortedShaderNames = shaderNames.sort((a, b) => {
            const indexA = shaderOrder.indexOf(a);
            const indexB = shaderOrder.indexOf(b);
            // If not in order list, put at end
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
        
        sortedShaderNames.forEach(shaderName => {
            const shaderEntry = this.shaderManager.shaders.get(shaderName);
            if (!shaderEntry) return;
            
            const config = shaderEntry.config;
            const displayName = config.displayName || config.name;
            
            // Create button
            const button = document.createElement('button');
            button.className = 'shader-btn';
            button.dataset.shader = shaderName;
            
            // Create preview/icon
            const preview = this.createShaderPreview(config);
            button.appendChild(preview);
            
            // Create label
            const label = document.createElement('span');
            label.className = 'shader-btn-label';
            label.textContent = displayName;
            button.appendChild(label);
            
            // Mark active shader
            if (shaderName === this.currentShader) {
                button.classList.add('active');
            }
            
            // Handle click
            button.addEventListener('click', () => {
                this.switchShader(shaderName);
                // Close dropdown after selection
                this.closeMenu();
            });
            
            container.appendChild(button);
        });
    }
    
    /**
     * Create a visual preview for a shader
     * For now, use a simple icon/gradient based on shader type
     */
    createShaderPreview(config) {
        const preview = document.createElement('div');
        preview.className = 'shader-preview';
        
        // Create a simple visual indicator
        // For heightmap: show noise pattern
        if (config.name === 'heightmap') {
            preview.innerHTML = `
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="noise-${config.name}" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                            <rect width="8" height="8" fill="currentColor" opacity="0.1"/>
                            <circle cx="2" cy="2" r="1" fill="currentColor" opacity="0.3"/>
                            <circle cx="6" cy="6" r="1" fill="currentColor" opacity="0.2"/>
                            <circle cx="4" cy="7" r="0.5" fill="currentColor" opacity="0.4"/>
                        </pattern>
                    </defs>
                    <rect width="40" height="40" fill="url(#noise-${config.name})"/>
                </svg>
            `;
        } else {
            // Default: simple gradient
            preview.style.background = 'linear-gradient(135deg, currentColor 0%, transparent 100%)';
            preview.style.opacity = '0.6';
        }
        
        return preview;
    }
    
    /**
     * Switch to a different shader
     * @param {string} shaderName - Name of the shader to switch to
     * @param {boolean} saveToStorage - Whether to save to localStorage (default: true)
     */
    async switchShader(shaderName, saveToStorage = true) {
        if (!this.shaderManager.shaders.has(shaderName)) {
            console.warn(`Shader "${shaderName}" not found`);
            return;
        }
        
        try {
            // Update active state in UI
            document.querySelectorAll('.shader-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            const activeButton = document.querySelector(`.shader-btn[data-shader="${shaderName}"]`);
            if (activeButton) {
                activeButton.classList.add('active');
            }
            
            // Switch shader
            await this.shaderManager.setActiveShader(shaderName);
            this.currentShader = shaderName;
            
            // Save to localStorage
            if (saveToStorage) {
                localStorage.setItem('activeShader', shaderName);
            }
            
            // Call optional callback
            if (this.onShaderChange) {
                this.onShaderChange(shaderName);
            }
            
            console.log(`✅ Switched to shader: ${shaderName}`);
        } catch (error) {
            console.error(`❌ Failed to switch to shader "${shaderName}":`, error);
        }
    }
    
    /**
     * Get the currently active shader name
     * @returns {string}
     */
    getCurrentShader() {
        return this.currentShader;
    }
    
    /**
     * Update the active shader state (called when shader changes externally)
     * @param {string} shaderName - Name of the active shader
     */
    updateActiveShader(shaderName) {
        this.currentShader = shaderName;
        
        // Update UI
        document.querySelectorAll('.shader-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeButton = document.querySelector(`.shader-btn[data-shader="${shaderName}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
    
    openMenu() {
        this.isMenuOpen = true;
        
        // Step 1: Hide controls (top and bottom)
        if (this.audioControls) {
            this.audioControls.hideControls();
        }
        
        // Step 2: After controls start animating out, show menu
        setTimeout(() => {
            if (this.shaderSwitcherMenu) {
                // Set display first, then add open class for animation
                this.shaderSwitcherMenu.style.display = 'flex';
                // Force reflow to ensure display is applied
                this.shaderSwitcherMenu.offsetHeight;
                this.shaderSwitcherMenu.classList.add('open');
            }
        }, 100); // Small delay to let controls start animating out
    }
    
    closeMenu() {
        // Step 1: Hide menu (fade out with downward movement)
        if (this.shaderSwitcherMenu) {
            this.shaderSwitcherMenu.classList.remove('open');
        }
        this.isMenuOpen = false;
        
        // Step 2: After menu animation completes, show controls
        setTimeout(() => {
            if (this.shaderSwitcherMenu) {
                this.shaderSwitcherMenu.style.display = 'none';
            }
            if (this.audioControls) {
                this.audioControls.showControls();
            }
        }, 350); // Match the animation duration
    }
}

