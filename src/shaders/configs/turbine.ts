// Turbine Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const turbineConfig: ShaderConfig = {
    name: 'turbine',
    displayName: 'Turbine',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/turbine-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default turbineConfig;

