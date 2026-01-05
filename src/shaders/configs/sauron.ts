// Sauron Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const sauronConfig: ShaderConfig = {
    name: 'sauron',
    displayName: 'Sauron',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/sauron-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default sauronConfig;

