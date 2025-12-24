// Shader type definitions

import type { ShaderConfig, ExtendedAudioData } from './index.js';

/**
 * Valid parameter value types for shader parameters
 */
export type ParameterValue = number | boolean;

/**
 * Shader entry in the shader manager registry
 * Note: instance type is ShaderInstance but not imported to avoid circular dependency
 */
export interface ShaderEntry {
  config: ShaderConfig;
  instance: unknown | null; // ShaderInstance - avoiding circular import
  canvasId: string;
}

/**
 * Loudness controls for time offset management
 */
export interface LoudnessControls {
  loudnessAnimationEnabled: boolean;
  loudnessThreshold: number;
}

// Note: ShaderConfigWithHooks is defined in ShaderInstance.ts to avoid circular dependencies
// It extends ShaderConfig with properly typed hooks for ShaderInstance

/**
 * Ripple arrays for WebGL uniform updates
 */
export interface RippleArrays {
  centerX: Float32Array;
  centerY: Float32Array;
  times: Float32Array;
  intensities: Float32Array;
  widths: Float32Array;
  minRadii: Float32Array;
  maxRadii: Float32Array;
  intensityMultipliers: Float32Array;
  active: Float32Array;
}

/**
 * Last uniform values cache for change detection
 */
export interface LastUniformValues {
  [key: string]: number | number[] | [number, number, number] | [number, number, number, number] | undefined;
}

/**
 * Uniform locations map
 */
export interface UniformLocations {
  [key: string]: WebGLUniformLocation | number | null;
}

/**
 * Valid parameter value types for shader parameters
 */
export type ParameterValue = number | boolean;

