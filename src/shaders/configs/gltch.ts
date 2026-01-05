// Gltch Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const gltchConfig: ShaderConfig = {
    name: 'gltch',
    displayName: 'Gltch',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/gltch-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default gltchConfig;

