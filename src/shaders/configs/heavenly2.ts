// Heavenly 2 Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const heavenly2Config: ShaderConfig = {
    name: 'heavenly2',
    displayName: 'Heavenly 2',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/heavenly2-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default heavenly2Config;

