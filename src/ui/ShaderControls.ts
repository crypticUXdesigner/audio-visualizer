// Shader Switcher UI Module
// Handles shader selection and switching

import { safeGetItem, safeSetItem } from '../utils/storage.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import type { ShaderManager } from '../shaders/ShaderManager.js';
import type { AudioControls } from './PlaybackControls.js';
import type { ShaderConfig } from '../types/index.js';

export class ShaderSwitcher {
    shaderManager: ShaderManager;
    onShaderChange: ((shaderName: string) => void) | null;
    audioControls: AudioControls | null;
    currentShader: string;
    isMenuOpen: boolean;
    shaderSwitcherMenu: HTMLElement | null;
    
    constructor(shaderManager: ShaderManager, onShaderChange: ((shaderName: string) => void) | null, audioControls: AudioControls | null = null) {
        this.shaderManager = shaderManager;
        this.onShaderChange = onShaderChange; // Optional callback: (shaderName) => void
        this.audioControls = audioControls; // Reference to AudioControls for hideControls/showControls
        const savedShader = safeGetItem('activeShader', 'heightmap');
        // Migrate old shader names to new names
        this.currentShader = savedShader || 'heightmap';
        this.isMenuOpen = false;
        this.shaderSwitcherMenu = null;
        this.init();
    }
    
    init(): void {
        const shaderSwitcherBtn = document.getElementById('shaderSwitcherBtn');
        this.shaderSwitcherMenu = document.getElementById('shaderSwitcherMenu');
        const shaderButtonsContainer = document.getElementById('shaderButtons');
        const shaderSwitcherItem = shaderSwitcherBtn?.closest('.top-control-item') as HTMLElement | null;
        
        if (!shaderSwitcherBtn || !this.shaderSwitcherMenu || !shaderButtonsContainer || !shaderSwitcherItem) {
            // Retry if not ready yet
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // Setup button toggle
        shaderSwitcherBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            if (this.isMenuOpen) {
                this.closeMenu();
            } else {
                this.openMenu();
            }
        });
        
        // Close when clicking outside
        document.addEventListener('click', (e: MouseEvent) => {
            if (this.isMenuOpen && 
                !shaderSwitcherItem.contains(e.target as Node) && 
                !this.shaderSwitcherMenu!.contains(e.target as Node)) {
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
    populateShaderButtons(container: HTMLElement): void {
        const shaderNames = this.shaderManager.getShaderNames();
        
        // Define desired order: final shaders first, then draft shaders
        const shaderOrder = ['heightmap', 'refraction', 'strings'];
        
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
            // createShaderPreview only needs name property
            const preview = this.createShaderPreview({ name: config.name });
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
    createShaderPreview(config: Pick<ShaderConfig, 'name'> & Partial<ShaderConfig>): HTMLElement {
        const preview = document.createElement('div');
        preview.className = 'shader-preview';
        
        // Create a simple visual indicator
        // For heightmap: show noise pattern
        if (config.name === 'heightmap') {
            // Use safe DOM methods instead of innerHTML
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '40');
            svg.setAttribute('height', '40');
            svg.setAttribute('viewBox', '0 0 40 40');
            
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
            pattern.setAttribute('id', `noise-${config.name}`);
            pattern.setAttribute('x', '0');
            pattern.setAttribute('y', '0');
            pattern.setAttribute('width', '8');
            pattern.setAttribute('height', '8');
            pattern.setAttribute('patternUnits', 'userSpaceOnUse');
            
            const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect1.setAttribute('width', '8');
            rect1.setAttribute('height', '8');
            rect1.setAttribute('fill', 'currentColor');
            rect1.setAttribute('opacity', '0.1');
            
            const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle1.setAttribute('cx', '2');
            circle1.setAttribute('cy', '2');
            circle1.setAttribute('r', '1');
            circle1.setAttribute('fill', 'currentColor');
            circle1.setAttribute('opacity', '0.3');
            
            const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle2.setAttribute('cx', '6');
            circle2.setAttribute('cy', '6');
            circle2.setAttribute('r', '1');
            circle2.setAttribute('fill', 'currentColor');
            circle2.setAttribute('opacity', '0.2');
            
            const circle3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle3.setAttribute('cx', '4');
            circle3.setAttribute('cy', '7');
            circle3.setAttribute('r', '0.5');
            circle3.setAttribute('fill', 'currentColor');
            circle3.setAttribute('opacity', '0.4');
            
            pattern.appendChild(rect1);
            pattern.appendChild(circle1);
            pattern.appendChild(circle2);
            pattern.appendChild(circle3);
            defs.appendChild(pattern);
            svg.appendChild(defs);
            
            const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect2.setAttribute('width', '40');
            rect2.setAttribute('height', '40');
            rect2.setAttribute('fill', `url(#noise-${config.name})`);
            svg.appendChild(rect2);
            
            preview.appendChild(svg);
        } else {
            // Default: simple gradient
            preview.style.background = 'linear-gradient(135deg, currentColor 0%, transparent 100%)';
            preview.style.opacity = '0.6';
        }
        
        return preview;
    }
    
    /**
     * Switch to a different shader
     * @param shaderName - Name of the shader to switch to
     * @param saveToStorage - Whether to save to localStorage (default: true)
     */
    async switchShader(shaderName: string, saveToStorage: boolean = true): Promise<void> {
        if (!this.shaderManager.shaders.has(shaderName)) {
            ShaderLogger.warn(`Shader "${shaderName}" not found`);
            return;
        }
        
        try {
            // Update active state in UI
            document.querySelectorAll('.shader-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            const activeButton = document.querySelector(`.shader-btn[data-shader="${shaderName}"]`) as HTMLElement | null;
            if (activeButton) {
                activeButton.classList.add('active');
            }
            
            // Switch shader
            await this.shaderManager.setActiveShader(shaderName);
            this.currentShader = shaderName;
            
            // Save to localStorage
            if (saveToStorage) {
                safeSetItem('activeShader', shaderName);
            }
            
            // Call optional callback
            if (this.onShaderChange) {
                this.onShaderChange(shaderName);
            }
            
                ShaderLogger.info(`Switched to shader: ${shaderName}`);
            } catch (error) {
                ShaderLogger.error(`Failed to switch to shader "${shaderName}":`, error);
        }
    }
    
    /**
     * Get the currently active shader name
     * @returns Current shader name
     */
    getCurrentShader(): string {
        return this.currentShader;
    }
    
    /**
     * Update the active shader state (called when shader changes externally)
     * @param shaderName - Name of the active shader
     */
    updateActiveShader(shaderName: string): void {
        this.currentShader = shaderName;
        
        // Update UI
        document.querySelectorAll('.shader-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeButton = document.querySelector(`.shader-btn[data-shader="${shaderName}"]`) as HTMLElement | null;
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
    
    openMenu(): void {
        this.isMenuOpen = true;
        
        // Step 1: Hide controls (top and bottom)
        if (this.audioControls?.uiControlsManager) {
            this.audioControls.uiControlsManager.hideControls();
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
    
    closeMenu(): void {
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
            if (this.audioControls?.uiControlsManager) {
                this.audioControls.uiControlsManager.showControls();
            }
        }, 350); // Match the animation duration
    }
}

