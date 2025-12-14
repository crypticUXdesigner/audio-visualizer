// Shader Parameter Panel UI Module
// Dynamically generates controls for shader parameters

export class ShaderParameterPanel {
    constructor(shaderManager, containerId = 'shaderParameters') {
        this.shaderManager = shaderManager;
        this.containerId = containerId;
        this.container = null;
        this.controls = new Map(); // parameter name -> control element
        this.init();
    }
    
    init() {
        // Create container if it doesn't exist
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = this.containerId;
            this.container.className = 'shader-parameters';
            this.container.style.cssText = `
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 1000;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 20px;
                min-width: 240px;
                max-height: 80vh;
                overflow-y: auto;
                display: none;
            `;
            document.body.appendChild(this.container);
        }
        
        // Update panel when shader changes
        this.updatePanel();
    }
    
    updatePanel() {
        if (!this.container) return;
        
        const config = this.shaderManager.getParameterPanelConfig();
        if (!config) {
            this.container.style.display = 'none';
            return;
        }
        
        // Clear existing controls
        this.container.innerHTML = '';
        this.controls.clear();
        
        // Add title
        const title = document.createElement('div');
        title.className = 'control-label';
        title.style.cssText = 'margin-bottom: 16px; font-size: 14px; font-weight: 600;';
        title.textContent = config.displayName;
        this.container.appendChild(title);
        
        // Add controls for each parameter
        Object.entries(config.parameters).forEach(([name, paramConfig]) => {
            const control = this.createParameterControl(name, paramConfig);
            if (control) {
                this.container.appendChild(control);
                this.controls.set(name, control);
            }
        });
        
        // Show container if there are parameters
        if (this.controls.size > 0) {
            this.container.style.display = 'block';
        } else {
            this.container.style.display = 'none';
        }
    }
    
    createParameterControl(name, config) {
        const group = document.createElement('div');
        group.className = 'control-group';
        group.style.cssText = 'margin-top: 12px;';
        
        const label = document.createElement('label');
        label.className = 'control-label';
        label.textContent = config.label || name;
        label.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.7); font-weight: 500; min-width: 100px; text-transform: uppercase; letter-spacing: 0.5px;';
        
        if (config.type === 'float' || config.type === 'number') {
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'control-slider';
            slider.min = config.min || 0;
            slider.max = config.max || 100;
            slider.step = config.step || 0.1;
            slider.value = config.default || 0;
            
            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'control-value';
            valueDisplay.textContent = slider.value;
            valueDisplay.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.9); font-weight: 500; min-width: 40px; text-align: right; font-variant-numeric: tabular-nums;';
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                valueDisplay.textContent = value.toFixed(config.step < 1 ? 2 : 0);
                this.shaderManager.setParameter(name, value);
            });
            
            // Set initial value
            this.shaderManager.setParameter(name, parseFloat(slider.value));
            
            group.appendChild(label);
            group.appendChild(slider);
            group.appendChild(valueDisplay);
        } else if (config.type === 'color') {
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = config.default || '#ffffff';
            
            colorInput.addEventListener('input', (e) => {
                this.shaderManager.setParameter(name, e.target.value);
            });
            
            // Set initial value
            this.shaderManager.setParameter(name, colorInput.value);
            
            group.appendChild(label);
            group.appendChild(colorInput);
        } else if (config.type === 'boolean') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = config.default || false;
            
            checkbox.addEventListener('change', (e) => {
                this.shaderManager.setParameter(name, e.target.checked);
            });
            
            // Set initial value
            this.shaderManager.setParameter(name, checkbox.checked);
            
            group.appendChild(label);
            group.appendChild(checkbox);
        } else {
            // Unknown type, skip
            return null;
        }
        
        return group;
    }
    
    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }
    
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
}

