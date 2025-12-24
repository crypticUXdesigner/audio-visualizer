// Audio type definitions

import type { AudioData } from './index.js';

export interface AudioContextState {
  suspended: 'suspended' | 'running' | 'closed';
}

export interface FrequencyBandData {
  bass: number;
  mid: number;
  treble: number;
  freq1: number;
  freq2: number;
  freq3: number;
  freq4: number;
  freq5: number;
  freq6: number;
  freq7: number;
  freq8: number;
  freq9: number;
  freq10: number;
}

export interface StereoData {
  bassStereo: number;
  midStereo: number;
  trebleStereo: number;
  beatStereoBass: number;
  beatStereoMid: number;
  beatStereoTreble: number;
}

export interface BeatData {
  beatTime: number;
  beatIntensity: number;
  beatTimeBass: number;
  beatTimeMid: number;
  beatTimeTreble: number;
  beatIntensityBass: number;
  beatIntensityMid: number;
  beatIntensityTreble: number;
  estimatedBPM: number;
}

export interface RippleData {
  centers: number[];
  times: number[];
  intensities: number[];
  widths: number[];
  minRadii: number[];
  maxRadii: number[];
  intensityMultipliers: number[];
  active: number[];
  count: number;
}

export interface ExtendedAudioData extends AudioData, FrequencyBandData, StereoData, BeatData {
  // AudioData already includes: volume, bass, mid, treble, frequencyBands, beatTime, beatIntensity, stereoBalance
  peakVolume: number;
  smoothedFreq1: number;
  smoothedFreq2: number;
  smoothedFreq3: number;
  smoothedFreq4: number;
  smoothedFreq5: number;
  smoothedFreq6: number;
  smoothedFreq7: number;
  smoothedFreq8: number;
  smoothedFreq9: number;
  smoothedFreq10: number;
  smoothedBass: number;
  smoothedMid: number;
  smoothedTreble: number;
  peakBass: number;
  peakMid: number;
  peakTreble: number;
  playbackProgress: number;
  frequencyData: Uint8Array | null;
  timeData: Uint8Array | null;
  leftFrequencyData: Uint8Array | null;
  rightFrequencyData: Uint8Array | null;
  audioContext: AudioContext | null;
  rippleData?: RippleData | null | undefined;
  // Ensure AudioData properties are explicitly included
  frequencyBands: number[];
  stereoBalance: number;
}

export interface TempoSmoothingConfig {
  enabled: boolean;
  timeConstant: number;
  tempoMultiplier: number;
}

