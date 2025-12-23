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
  // ... additional audio properties
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
  lightness: number[];
  chroma: number[];
  hue: number[];
}

/**
 * Shader configuration
 */
export interface ShaderConfig {
  name: string;
  displayName: string;
  fragmentPath: string;
  vertexPath: string;
  canvasId?: string;
  parameters?: Record<string, ParameterConfig>;
  colorConfig: ColorConfig;
  uniformMapping?: Record<string, (data: AudioData) => number>;
}

/**
 * Parameter configuration for shader parameters
 */
export interface ParameterConfig {
  type: 'float' | 'int';
  default: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

/**
 * Track information from API
 */
export interface Track {
  name: string;
  display_name?: string;
  displayName?: string;
  contributor_names?: string[];
  contributorNames?: string[];
  mp3Url?: string;
  bpm?: number;
  // ... additional track properties
}

