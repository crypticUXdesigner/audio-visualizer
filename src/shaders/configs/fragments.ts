// Fragments Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const fragmentsConfig: ShaderConfig = {
    name: 'fragments',
    displayName: 'Fragments',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/fragments-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default fragmentsConfig;

