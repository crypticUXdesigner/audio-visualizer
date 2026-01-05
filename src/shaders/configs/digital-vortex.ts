// Digital Vortex Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const digitalVortexConfig: ShaderConfig = {
    name: 'digital-vortex',
    displayName: 'Digital Vortex',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/digital-vortex-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default digitalVortexConfig;

