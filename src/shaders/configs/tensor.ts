// Tensor Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const tensorConfig: ShaderConfig = {
    name: 'tensor',
    displayName: 'Tensor',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/tensor-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default tensorConfig;

