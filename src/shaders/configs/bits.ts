// Bits Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const bitsConfig: ShaderConfig = {
    name: 'bits',
    displayName: 'Bits',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/bits-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default bitsConfig;

