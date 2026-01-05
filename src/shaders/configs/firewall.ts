// Firewall Shader Configuration

import { sharedUniformMapping } from './shared-uniform-mapping.js';
import type { ShaderConfig } from '../../types/index.js';

const firewallConfig: ShaderConfig = {
    name: 'firewall',
    displayName: 'Firewall',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/firewall-fragment.glsl',
    
    parameters: {},
    
    uniformMapping: sharedUniformMapping
};

export default firewallConfig;

