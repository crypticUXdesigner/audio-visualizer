// Type definitions for Visual Player
// These types can be used for JSDoc type hints and future TypeScript migration

/**
 * Audio analysis data structure
 */
export interface AudioData {
  volume: number;
  bass: number;
  mid: number;
  treble: number;
  frequencyBands: number[];
  beatTime: number;
  beatIntensity: number;
  stereoBalance: number;
}

/**
 * Color configuration object
 */
export interface ColorConfig {
  baseHue: string;
  darkest: ColorRange;
  brightest: ColorRange;
  interpolationCurve: InterpolationCurve;
  thresholdCurve?: number[];
}

/**
 * Color range configuration
 */
export interface ColorRange {
  lightness: number;
  chroma: number;
  hue?: number;
  hueOffset?: number;
}

/**
 * Interpolation curve configuration
 */
export interface InterpolationCurve {
  lightness: [number, number, number, number];
  chroma: [number, number, number, number];
  hue: [number, number, number, number];
}

/**
 * Color map type - maps color names to RGB tuples [r, g, b] in range [0, 1]
 */
export type ColorMap = Record<string, [number, number, number]>;

/**
 * Shader configuration
 * Note: plugin, onInit, and onRender use unknown to avoid circular dependencies.
 * Use ShaderConfigWithHooks in ShaderInstance.ts for properly typed versions.
 */
export interface ShaderConfig {
  name: string;
  displayName: string;
  fragmentPath: string;
  vertexPath: string;
  canvasId?: string;
  parameters?: Record<string, ParameterConfig>;
  colorConfig: ColorConfig;
  uniformMapping?: Record<string, (data: ExtendedAudioData | null) => number>;
  // These use unknown to avoid circular dependency with ShaderInstance
  // ShaderInstance.ts defines ShaderConfigWithHooks with proper types
  plugin?: new (instance: unknown, config: ShaderConfig) => unknown;
  onInit?: (instance: unknown) => void;
  onRender?: (instance: unknown, audioData: ExtendedAudioData | null) => void;
}

/**
 * Parameter configuration for shader parameters
 */
export interface ParameterConfig extends Record<string, unknown> {
  type: 'float' | 'int';
  default: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

// Re-export API types
export type { Track, ListTracksResponse, GetTrackResponse } from './api.js';
export type { ExtendedAudioData, FrequencyBandData, StereoData, BeatData, RippleData as AudioRippleData } from './audio.js';
export type { WebGLExtension, UniformType, UniformLocation, TextureInfo, ShaderSource, WebGLRippleData, RippleData } from './webgl.js';
export type { ShaderEntry, LoudnessControls, RippleArrays, LastUniformValues, UniformLocations, ParameterValue, ParameterDef, PluginFactoryOptions } from './shader.js';

