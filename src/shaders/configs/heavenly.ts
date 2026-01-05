// Heavenly Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const heavenlyConfig: ShaderConfig = {
    name: 'heavenly',
    displayName: 'Heavenly',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/heavenly-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default heavenlyConfig;

