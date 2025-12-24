// Track Registry Loader
// Loads track registry data from JSON files at runtime

import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import type { Track } from '../types/api.js';

export interface TrackRegistryData {
  TRACK_REGISTRY: Record<string, string>;
  TRACKS_DATA: Record<string, Track>;
  ENGAGEMENT_TRACKS_CACHE: Record<string, Track>;
  CACHE_METADATA: {
    fetchedAt: string;
    totalTracks: number;
    engagementThreshold: number;
    engagementTracks: number;
    registryTracks: number;
    uniqueTrackIdentifiers: number;
    mergedAt: string;
  };
}

let loadedData: TrackRegistryData | null = null;
let loadPromise: Promise<TrackRegistryData> | null = null;

/**
 * Load track registry data from JSON files
 * @returns Promise that resolves with the loaded data
 */
export async function loadTrackRegistry(): Promise<TrackRegistryData> {
  // Return cached data if already loaded
  if (loadedData) {
    return loadedData;
  }

  // Return existing promise if loading is in progress
  if (loadPromise) {
    return loadPromise;
  }

  // Start loading
  loadPromise = (async () => {
    try {
      ShaderLogger.info('Loading track registry data from JSON files...');
      
      // Determine base path based on environment
      const basePath = import.meta.env.BASE_URL || '/';
      const dataPath = basePath.endsWith('/') ? `${basePath}data/` : `${basePath}/data/`;
      
      // Load all JSON files in parallel
      const [registryResponse, tracksResponse, engagementResponse, metadataResponse] = await Promise.all([
        fetch(`${dataPath}track-registry.json`).catch(() => null),
        fetch(`${dataPath}tracks-data.json`).catch(() => null),
        fetch(`${dataPath}engagement-tracks-cache.json`).catch(() => null),
        fetch(`${dataPath}cache-metadata.json`).catch(() => null),
      ]);

      // Parse responses
      const TRACK_REGISTRY: Record<string, string> = registryResponse?.ok
        ? await registryResponse.json()
        : {};
      
      const TRACKS_DATA: Record<string, Track> = tracksResponse?.ok
        ? await tracksResponse.json()
        : {};
      
      const ENGAGEMENT_TRACKS_CACHE: Record<string, Track> = engagementResponse?.ok
        ? await engagementResponse.json()
        : {};
      
      const CACHE_METADATA = metadataResponse?.ok
        ? await metadataResponse.json()
        : {
            fetchedAt: new Date().toISOString(),
            totalTracks: 0,
            engagementThreshold: 0,
            engagementTracks: 0,
            registryTracks: 0,
            uniqueTrackIdentifiers: 0,
            mergedAt: new Date().toISOString(),
          };

      // Validate that we have at least the registry
      if (Object.keys(TRACK_REGISTRY).length === 0) {
        ShaderLogger.warn('Track registry is empty. Falling back to empty registry.');
      }

      const data: TrackRegistryData = {
        TRACK_REGISTRY,
        TRACKS_DATA,
        ENGAGEMENT_TRACKS_CACHE,
        CACHE_METADATA,
      };

      loadedData = data;
      ShaderLogger.info(`Track registry loaded: ${Object.keys(TRACK_REGISTRY).length} registry entries, ${Object.keys(TRACKS_DATA).length} tracks, ${Object.keys(ENGAGEMENT_TRACKS_CACHE).length} engagement tracks`);
      
      return data;
    } catch (error) {
      ShaderLogger.error('Failed to load track registry:', error);
      // Return empty data structure on error
      const emptyData: TrackRegistryData = {
        TRACK_REGISTRY: {},
        TRACKS_DATA: {},
        ENGAGEMENT_TRACKS_CACHE: {},
        CACHE_METADATA: {
          fetchedAt: new Date().toISOString(),
          totalTracks: 0,
          engagementThreshold: 0,
          engagementTracks: 0,
          registryTracks: 0,
          uniqueTrackIdentifiers: 0,
          mergedAt: new Date().toISOString(),
        },
      };
      loadedData = emptyData;
      return emptyData;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Get loaded track registry data (synchronous)
 * Returns null if data hasn't been loaded yet
 * @returns Loaded data or null
 */
export function getLoadedTrackRegistry(): TrackRegistryData | null {
  return loadedData;
}

/**
 * Check if track registry data is loaded
 * @returns True if data is loaded
 */
export function isTrackRegistryLoaded(): boolean {
  return loadedData !== null;
}

