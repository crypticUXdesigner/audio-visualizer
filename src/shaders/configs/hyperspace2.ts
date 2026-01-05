// Hyperspace 2 Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const hyperspace2Config: ShaderConfig = {
    name: 'hyperspace2',
    displayName: 'Hyperspace 2',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/hyperspace2-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default hyperspace2Config;

