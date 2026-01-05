// Unnamed Shader 3 Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const unnamed3Config: ShaderConfig = {
    name: 'unnamed3',
    displayName: 'Unnamed 3',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/unnamed3-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default unnamed3Config;

