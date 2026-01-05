// Unnamed Shader 4 Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const unnamed4Config: ShaderConfig = {
    name: 'unnamed4',
    displayName: 'Unnamed 4',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/unnamed4-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default unnamed4Config;

