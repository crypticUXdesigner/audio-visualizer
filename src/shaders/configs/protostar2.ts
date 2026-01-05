// Protostar2 Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const protostar2Config: ShaderConfig = {
    name: 'protostar2',
    displayName: 'Protostar2',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/protostar2-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default protostar2Config;

