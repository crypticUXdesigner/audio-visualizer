// Waveform Data Loader
// Handles loading and normalizing waveform data from API

import { safeSentrySpan, safeCaptureException } from '../../core/monitoring/SentryInit.js';
import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import { COLOR_CONFIG } from '../../config/constants.js';

export interface WaveformData {
  leftChannelData: number[];
  rightChannelData: number[];
  normalizedTargetLeft: number[];
  normalizedTargetRight: number[];
  dataPoints: number;
  channels: 'stereo' | 'mono';
}

/**
 * Manages waveform data loading and normalization
 */
export class WaveformDataLoader {
  private minWaveformValue: number;
  
  constructor() {
    this.minWaveformValue = COLOR_CONFIG.MIN_WAVEFORM_VALUE;
  }
  
  /**
   * Load waveform data for a track
   * @param trackId - Track identifier
   * @param resolution - Resolution in pixels (default: 120)
   * @param currentTrackId - Current track ID to check for cache hit
   * @param existingData - Existing waveform data (for cache check)
   * @returns WaveformData or null if loading failed
   */
  async loadWaveform(
    trackId: string,
    resolution: number | null = null,
    currentTrackId: string | null = null,
    existingData: number[] | null = null
  ): Promise<WaveformData | null> {
    return safeSentrySpan(
      {
        op: 'waveform.load',
        name: 'Load Waveform Data',
      },
      async (span) => {
        try {
          // Avoid reloading same waveform
          if (currentTrackId === trackId && existingData) {
            ShaderLogger.debug('Waveform already loaded for this track');
            return null; // Indicates cache hit, no new data
          }
          
          // Default resolution
          if (!resolution) {
            resolution = 120; // STATIC OVERRIDE FOR NOW
          }
          
          // Import the service dynamically
          const { getAudiographs } = await import('../../api/AudiographService.js');
          
          ShaderLogger.info(`Loading waveform for ${trackId} at ${resolution}px (stereo)`);
          
          const result = await getAudiographs(trackId, resolution, true);
          
          if (result.success && result.audiographs && result.audiographs.length > 0) {
            const audiograph = result.audiographs[0];
            if (audiograph.graphs && audiograph.graphs.length >= 2) {
              // Stereo: graphs[0] = left channel, graphs[1] = right channel
              const newLeftData = audiograph.graphs[0].values || [];
              const newRightData = audiograph.graphs[1].values || [];
              
              // Normalize to 0-1 range for animation
              const maxLeft = Math.max(...newLeftData);
              const maxRight = Math.max(...newRightData);
              const maxValue = Math.max(maxLeft, maxRight);
              
              const normalizedTargetLeft = newLeftData.map(v => v / maxValue);
              const normalizedTargetRight = newRightData.map(v => v / maxValue);
              
              ShaderLogger.debug(`Loaded stereo waveform: L=${newLeftData.length} R=${newRightData.length} data points`);
              
              span.setAttribute('waveform.dataPoints', newLeftData.length);
              span.setAttribute('waveform.channels', 'stereo');
              span.setAttribute('waveform.resolution', resolution);
              
              return {
                leftChannelData: newLeftData,
                rightChannelData: newRightData,
                normalizedTargetLeft,
                normalizedTargetRight,
                dataPoints: newLeftData.length,
                channels: 'stereo'
              };
            } else if (audiograph.graphs && audiograph.graphs.length === 1) {
              // Fallback to mono if only one channel received
              ShaderLogger.warn('Received mono data, duplicating for stereo visualization');
              const newData = audiograph.graphs[0].values || [];
              
              // Normalize to 0-1 range
              const maxValue = Math.max(...newData);
              const normalizedTarget = newData.map(v => v / maxValue);
              
              span.setAttribute('waveform.dataPoints', newData.length);
              span.setAttribute('waveform.channels', 'mono');
              span.setAttribute('waveform.resolution', resolution);
              
              return {
                leftChannelData: newData,
                rightChannelData: newData,
                normalizedTargetLeft: normalizedTarget,
                normalizedTargetRight: normalizedTarget,
                dataPoints: newData.length,
                channels: 'mono'
              };
            } else {
              ShaderLogger.warn('No graph data in audiograph response');
              return null;
            }
          } else {
            ShaderLogger.warn('No audiograph data received:', result.error || 'Unknown error');
            return null;
          }
        } catch (error) {
          ShaderLogger.error('Failed to load waveform:', error);
          safeCaptureException(error);
          return null;
        }
      }
    );
  }
  
  /**
   * Initialize displayed data arrays with minimum values
   * @param length - Length of the arrays
   * @returns Tuple of [leftData, rightData] arrays filled with min values
   */
  initializeDisplayData(length: number): [number[], number[]] {
    const minValue = this.minWaveformValue;
    return [
      new Array(length).fill(minValue),
      new Array(length).fill(minValue)
    ];
  }
  
  /**
   * Get minimum waveform value
   */
  getMinWaveformValue(): number {
    return this.minWaveformValue;
  }
}

