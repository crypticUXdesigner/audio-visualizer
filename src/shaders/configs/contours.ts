// Contours Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const contoursConfig: ShaderConfig = {
    name: 'contours',
    displayName: 'Contours',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/contours-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default contoursConfig;

