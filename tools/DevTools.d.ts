// Dev Tools Manager
// Manages development/testing tools (frequency visualizer, etc.)

export interface DevTool {
    init?: () => void;
    destroy?: () => void;
    setEnabled?: (enabled: boolean) => void;
}

export class DevTools {
    constructor();
    
    /**
     * Register a dev tool
     * @param name - Tool name
     * @param tool - Tool object with init() and optional destroy() methods
     */
    registerTool(name: string, tool: DevTool): void;
    
    /**
     * Unregister a dev tool
     * @param name - Tool name
     */
    unregisterTool(name: string): void;
    
    /**
     * Get a dev tool
     * @param name - Tool name
     * @returns Tool object or null
     */
    getTool(name: string): DevTool | null;
    
    /**
     * Enable/disable all dev tools
     * @param enabled - Whether to enable or disable
     */
    setEnabled(enabled: boolean): void;
}








