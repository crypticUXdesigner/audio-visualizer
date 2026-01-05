// Voxels Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const voxelsConfig: ShaderConfig = {
    name: 'voxels',
    displayName: 'Voxels',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/voxels-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default voxelsConfig;


