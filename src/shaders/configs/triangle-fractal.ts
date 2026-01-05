// Triangle Fractal Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const triangleFractalConfig: ShaderConfig = {
    name: 'triangle-fractal',
    displayName: 'Triangle Fractal',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/triangle-fractal-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default triangleFractalConfig;

