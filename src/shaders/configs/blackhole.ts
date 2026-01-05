// Blackhole Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const blackholeConfig: ShaderConfig = {
    name: 'blackhole',
    displayName: 'Blackhole',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/blackhole-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default blackholeConfig;

