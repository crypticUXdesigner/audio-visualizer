// Test Pattern Shader Configuration
// Simple shader for color accuracy testing - renders known RGB values in a grid pattern

import type { ShaderConfig } from '../../types/index.js';

const testPatternConfig: ShaderConfig = {
    name: 'test-pattern',
    displayName: 'Test Pattern',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/test-pattern-fragment.glsl',
    
    // No parameters needed for test pattern
    parameters: {},
    
    // No uniform mapping needed (no audio data)
    uniformMapping: {}
};

export default testPatternConfig;

