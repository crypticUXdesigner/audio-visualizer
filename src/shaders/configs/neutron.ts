// Neutron Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const neutronConfig: ShaderConfig = {
    name: 'neutron',
    displayName: 'Neutron',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/neutron-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default neutronConfig;

