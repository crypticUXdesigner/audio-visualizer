// Unnamed Shader 2 Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const unnamed2Config: ShaderConfig = {
    name: 'unnamed2',
    displayName: 'Unnamed 2',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/unnamed2-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default unnamed2Config;

