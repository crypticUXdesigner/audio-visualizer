// Dev Tools Manager
// Manages development/testing tools (frequency visualizer, etc.)

export class DevTools {
    constructor() {
        this.tools = new Map();
    }
    
    /**
     * Register a dev tool
     * @param {string} name - Tool name
     * @param {Object} tool - Tool object with init() and optional destroy() methods
     */
    registerTool(name, tool) {
        this.tools.set(name, tool);
        if (tool.init) {
            tool.init();
        }
    }
    
    /**
     * Unregister a dev tool
     * @param {string} name - Tool name
     */
    unregisterTool(name) {
        const tool = this.tools.get(name);
        if (tool && tool.destroy) {
            tool.destroy();
        }
        this.tools.delete(name);
    }
    
    /**
     * Get a dev tool
     * @param {string} name - Tool name
     * @returns {Object|null}
     */
    getTool(name) {
        return this.tools.get(name) || null;
    }
    
    /**
     * Enable/disable all dev tools
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.tools.forEach((tool) => {
            if (tool.setEnabled) {
                tool.setEnabled(enabled);
            }
        });
    }
}

