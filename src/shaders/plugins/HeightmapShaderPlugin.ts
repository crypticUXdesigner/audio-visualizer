// HeightmapShaderPlugin - Plugin for heightmap shader
// Handles performance-based adaptive quality adjustments

import { BaseShaderPlugin } from './BaseShaderPlugin.js';
import type { ShaderConfig } from '../../types/index.js';
import type { ShaderInstance } from '../ShaderInstance.js';

export class HeightmapShaderPlugin extends BaseShaderPlugin {
    constructor(shaderInstance: ShaderInstance, config: ShaderConfig) {
        super(shaderInstance, config);
    }
    
    /**
     * Update performance-based adaptive uniforms
     * Adjusts fBm octaves and ripple count based on device performance
     */
    onUpdateUniforms(_audioData: unknown, _colors: unknown, _deltaTime: number): void {
        const gl = this.shaderInstance.gl;
        if (!gl || !this.shaderInstance.uniformLocations) return;
        
        // Get quality level from performance monitor
        const qualityLevel = this.shaderInstance.performanceMonitor?.qualityLevel ?? 1.0;
        
        // Adjust fBm octaves based on quality (6 = full quality, 3 = minimum)
        const octaves = Math.max(3, Math.floor(6 * qualityLevel));
        if (this.shaderInstance.uniformLocations.uFbmOctaves) {
            gl.uniform1i(this.shaderInstance.uniformLocations.uFbmOctaves, octaves);
        }
        
        // Reduce ripple count on mobile devices
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const maxRipples = isMobile 
            ? (qualityLevel < 0.6 ? 4 : 8)  // 4 on low-end mobile, 8 on mid-tier
            : 16;  // Full count on desktop
        
        // Note: uRippleCount is managed by RippleManager, but we can set a max limit
        // The actual ripple count will be clamped by the shader's renderAllRipples function
    }
}

