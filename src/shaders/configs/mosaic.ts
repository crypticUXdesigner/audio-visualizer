// Mosaic Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const mosaicConfig: ShaderConfig = {
    name: 'mosaic',
    displayName: 'Mosaic',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/mosaic-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default mosaicConfig;

