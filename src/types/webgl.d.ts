// WebGL type definitions

export interface WebGLExtension {
  readonly OES_standard_derivatives?: OES_standard_derivatives | null;
}

export interface OES_standard_derivatives {
  readonly FRAGMENT_SHADER_DERIVATIVE_HINT_OES: number;
}

export type UniformType = '1f' | '1i' | '2f' | '2i' | '3f' | '3i' | '4f' | '4i' | '1fv' | '2fv' | '3fv' | '4fv' | 'matrix2fv' | 'matrix3fv' | 'matrix4fv';

export interface UniformLocation {
  location: WebGLUniformLocation | null;
  type: UniformType;
  cached?: boolean;
}

/**
 * WebGL ripple data structure for shader uniforms
 * Uses Float32Array for efficient GPU transfer
 */
export interface WebGLRippleData {
  centerX: Float32Array;
  centerY: Float32Array;
  radius: Float32Array;
  intensity: Float32Array;
  count: number;
}

/**
 * @deprecated Use WebGLRippleData instead
 */
export interface RippleData extends WebGLRippleData {}

export interface TextureInfo {
  texture: WebGLTexture | null;
  width: number;
  height: number;
}

export interface ShaderSource {
  vertex: string;
  fragment: string;
}

/**
 * Color map interface for shader colors
 * Maps color names to RGB tuples [r, g, b] in range [0, 1]
 * @deprecated Use ColorMap from './index.js' instead
 */
export interface Colors {
  [key: string]: [number, number, number];
}

