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
            // Ensure it's hidden initially (CSS should handle this, but set it explicitly for safety)
            this.container.style.display = 'none';
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
        
        // Add save button
        const saveButton = this.createSaveButton(config.shaderName);
        if (saveButton) {
            this.container.appendChild(saveButton);
        }
        
        // Don't automatically show the panel - visibility is controlled by the button click handler
        // Keep the current display state (should be 'none' initially)
        if (this.container.style.display === '') {
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
    
    createSaveButton(shaderName) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1);';
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save as Default';
        saveButton.style.cssText = `
            width: 100%;
            padding: 10px 16px;
            background: rgba(65, 238, 229, 0.2);
            border: 1px solid rgba(65, 238, 229, 0.4);
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        // Hover effect
        saveButton.addEventListener('mouseenter', () => {
            saveButton.style.background = 'rgba(65, 238, 229, 0.3)';
            saveButton.style.borderColor = 'rgba(65, 238, 229, 0.6)';
        });
        saveButton.addEventListener('mouseleave', () => {
            saveButton.style.background = 'rgba(65, 238, 229, 0.2)';
            saveButton.style.borderColor = 'rgba(65, 238, 229, 0.4)';
        });
        
        saveButton.addEventListener('click', () => {
            this.saveParametersAsDefault(shaderName, saveButton);
        });
        
        buttonContainer.appendChild(saveButton);
        return buttonContainer;
    }
    
    saveParametersAsDefault(shaderName, buttonElement) {
        const activeShader = this.shaderManager.getActiveShader();
        if (!activeShader) {
            console.warn('No active shader to save parameters from');
            return;
        }
        
        // Get all current parameter values
        const currentParams = activeShader.getAllParameters();
        
        // Get parameter config to preserve structure
        const config = this.shaderManager.getParameterPanelConfig();
        if (!config) return;
        
        // Get the original config object
        const originalConfig = activeShader.config;
        
        // Generate updated config code
        const updatedConfigCode = this.generateConfigCode(originalConfig, currentParams);
        
        // Create a modal/dialog to show the code
        this.showConfigCodeModal(updatedConfigCode, shaderName);
        
        // Update the config defaults in memory (for current session)
        if (originalConfig && originalConfig.parameters) {
            Object.entries(currentParams).forEach(([name, value]) => {
                if (originalConfig.parameters[name]) {
                    originalConfig.parameters[name].default = value;
                }
            });
        }
        
        // Show button feedback
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Saved!';
        buttonElement.style.background = 'rgba(76, 175, 80, 0.3)';
        buttonElement.style.borderColor = 'rgba(76, 175, 80, 0.6)';
        
        setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.style.background = 'rgba(65, 238, 229, 0.2)';
            buttonElement.style.borderColor = 'rgba(65, 238, 229, 0.4)';
        }, 1500);
        
        console.log(`Generated updated config for shader "${shaderName}"`);
    }
    
    generateConfigCode(config, currentParams) {
        // Start building the config code
        let code = `// ${config.displayName || config.name} Shader Configuration\n`;
        code += `// Configuration for the ${config.displayName || config.name} shader\n\n`;
        code += `export default {\n`;
        code += `    name: '${config.name}',\n`;
        code += `    displayName: '${config.displayName || config.name}',\n`;
        code += `    canvasId: '${config.canvasId}',\n`;
        code += `    vertexPath: '${config.vertexPath}',\n`;
        code += `    fragmentPath: '${config.fragmentPath}',\n`;
        code += `    \n`;
        code += `    // Default parameters (experiment with these)\n`;
        code += `    parameters: {\n`;
        
        // Generate parameter definitions with updated defaults
        const paramEntries = Object.entries(config.parameters || {});
        paramEntries.forEach(([name, paramConfig], index) => {
            const currentValue = currentParams[name] !== undefined ? currentParams[name] : paramConfig.default;
            const isLast = index === paramEntries.length - 1;
            
            code += `        ${name}: { \n`;
            code += `            type: '${paramConfig.type}', \n`;
            
            // Format the default value appropriately
            let defaultValueStr;
            if (paramConfig.type === 'boolean') {
                defaultValueStr = currentValue ? 'true' : 'false';
            } else if (paramConfig.type === 'color') {
                defaultValueStr = `'${currentValue}'`;
            } else {
                // For numbers, preserve precision
                defaultValueStr = typeof currentValue === 'number' ? currentValue.toString() : String(currentValue);
            }
            
            code += `            default: ${defaultValueStr}`;
            
            if (paramConfig.min !== undefined) {
                code += `, \n            min: ${paramConfig.min}`;
            }
            if (paramConfig.max !== undefined) {
                code += `, \n            max: ${paramConfig.max}`;
            }
            if (paramConfig.step !== undefined) {
                code += `, \n            step: ${paramConfig.step}`;
            }
            if (paramConfig.label) {
                code += `, \n            label: '${paramConfig.label}'`;
            }
            
            code += `\n        }${isLast ? '' : ','}\n`;
        });
        
        code += `    },\n`;
        code += `    \n`;
        
        // Add colorConfig if it exists
        if (config.colorConfig) {
            code += `    // Color configuration (can be overridden)\n`;
            code += `    colorConfig: ${JSON.stringify(config.colorConfig, null, 8).replace(/^/gm, '    ')},\n`;
            code += `    \n`;
        }
        
        // Add uniformMapping comment (we can't serialize functions, so just add a comment)
        if (config.uniformMapping) {
            code += `    // Uniform mapping (how audio data maps to shader uniforms)\n`;
            code += `    uniformMapping: {\n`;
            code += `        // ... (uniform mapping functions preserved from original config)\n`;
            code += `    },\n`;
            code += `    \n`;
        }
        
        // Add hooks if they exist
        if (config.onInit || config.onRender) {
            if (config.onInit) {
                code += `    // Custom initialization hook (optional)\n`;
                code += `    onInit: (shaderInstance) => {\n`;
                code += `        // Can add custom initialization logic here if needed\n`;
                code += `    },\n`;
                code += `    \n`;
            }
            if (config.onRender) {
                code += `    // Custom render hook (optional)\n`;
                code += `    onRender: (shaderInstance, audioData) => {\n`;
                code += `        // Can add custom render logic here if needed\n`;
                code += `    }\n`;
            }
        }
        
        code += `};\n`;
        
        return code;
    }
    
    showConfigCodeModal(code, shaderName) {
        // Remove existing modal if present
        const existingModal = document.getElementById('configCodeModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'configCodeModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        
        // Create modal content
        const content = document.createElement('div');
        content.style.cssText = `
            background: rgba(20, 20, 30, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            max-width: 800px;
            max-height: 90vh;
            width: 100%;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        `;
        
        // Title
        const title = document.createElement('div');
        title.textContent = `Updated Config for ${shaderName}`;
        title.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            color: rgba(255, 255, 255, 0.9);
        `;
        
        // Instructions
        const instructions = document.createElement('div');
        instructions.textContent = 'Copy the code below and replace the contents of your shader config file:';
        instructions.style.cssText = `
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 12px;
        `;
        
        // Code textarea
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.readOnly = true;
        textarea.style.cssText = `
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 16px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.9);
            resize: none;
            flex: 1;
            min-height: 400px;
            line-height: 1.6;
            white-space: pre;
            overflow-x: auto;
        `;
        
        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 12px;
            margin-top: 16px;
        `;
        
        // Copy button
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy to Clipboard';
        copyButton.style.cssText = `
            flex: 1;
            padding: 12px;
            background: rgba(65, 238, 229, 0.2);
            border: 1px solid rgba(65, 238, 229, 0.4);
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        copyButton.addEventListener('mouseenter', () => {
            copyButton.style.background = 'rgba(65, 238, 229, 0.3)';
        });
        copyButton.addEventListener('mouseleave', () => {
            copyButton.style.background = 'rgba(65, 238, 229, 0.2)';
        });
        
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(code);
                const originalText = copyButton.textContent;
                copyButton.textContent = 'Copied!';
                copyButton.style.background = 'rgba(76, 175, 80, 0.3)';
                setTimeout(() => {
                    copyButton.textContent = originalText;
                    copyButton.style.background = 'rgba(65, 238, 229, 0.2)';
                }, 2000);
            } catch (err) {
                // Fallback: select text
                textarea.select();
                document.execCommand('copy');
                copyButton.textContent = 'Copied!';
            }
        });
        
        // Download button
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download File';
        downloadButton.style.cssText = copyButton.style.cssText;
        
        downloadButton.addEventListener('mouseenter', () => {
            downloadButton.style.background = 'rgba(65, 238, 229, 0.3)';
        });
        downloadButton.addEventListener('mouseleave', () => {
            downloadButton.style.background = 'rgba(65, 238, 229, 0.2)';
        });
        
        downloadButton.addEventListener('click', () => {
            const blob = new Blob([code], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${shaderName}.js`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        
        // Close button
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.cssText = `
            flex: 1;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        closeButton.addEventListener('click', () => {
            modal.remove();
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Assemble modal
        buttonContainer.appendChild(copyButton);
        buttonContainer.appendChild(downloadButton);
        buttonContainer.appendChild(closeButton);
        
        content.appendChild(title);
        content.appendChild(instructions);
        content.appendChild(textarea);
        content.appendChild(buttonContainer);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Focus and select textarea
        textarea.focus();
        textarea.select();
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

