// Unified Track Configuration
// Combines track registry and engagement tracks cache
// Last updated: 2025-12-19T20:56:29.315Z
//
// Structure:
// - TRACK_REGISTRY: Maps "songName|username" -> "tracks/identifier" (for backward compatibility)
// - TRACKS_DATA: Maps "tracks/identifier" -> full track object (all tracks with complete data)
// - ENGAGEMENT_TRACKS_CACHE: Subset of TRACKS_DATA for engagement tracks only
//
// NOTE: Data is now loaded from JSON files at runtime via trackRegistryLoader.ts

import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import type { Track } from '../types/api.js';
import { loadTrackRegistry, getLoadedTrackRegistry, type TrackRegistryData } from './trackRegistryLoader.js';

// Cache for loaded data
let _trackRegistryData: TrackRegistryData | null = null;

/**
 * Get track registry data (loads if not already loaded)
 * @returns Promise that resolves with track registry data
 */
async function getTrackRegistryData(): Promise<TrackRegistryData> {
  if (!_trackRegistryData) {
    _trackRegistryData = await loadTrackRegistry();
  }
  return _trackRegistryData;
}

/**
 * Get track registry data synchronously (returns null if not loaded)
 * @returns Track registry data or null
 */
function getTrackRegistryDataSync(): TrackRegistryData | null {
  return _trackRegistryData || getLoadedTrackRegistry();
}

// Re-export for backward compatibility
export async function ensureTrackRegistryLoaded(): Promise<void> {
  _trackRegistryData = await loadTrackRegistry();
}

// Helper functions (from original track-registry.js)
/**
 * Get track identifier from registry
 * @param {string} songName - Song name
 * @param {string} username - Username
 * @returns {string|null} Track identifier or null if not found
 */
export function getTrackIdentifier(songName: string, username: string): string | null {
  const data = getTrackRegistryDataSync();
  if (!data) {
    ShaderLogger.warn('Track registry not loaded yet. Call ensureTrackRegistryLoaded() first.');
    return null;
  }
  const key = `${songName}|${username}`;
  return data.TRACK_REGISTRY[key] || null;
}

/**
 * Get full track data by identifier
 * @param {string} trackIdentifier - Track identifier (e.g., "tracks/abc123")
 * @returns {object|null} Full track object or null if not found
 */
export function getTrackData(trackIdentifier: string): Track | null {
  const data = getTrackRegistryDataSync();
  if (!data) {
    ShaderLogger.warn('Track registry not loaded yet. Call ensureTrackRegistryLoaded() first.');
    return null;
  }
  return data.TRACKS_DATA[trackIdentifier] || null;
}

/**
 * Get engagement track by identifier
 * @param {string} trackIdentifier - Track identifier
 * @returns {object|null} Engagement track object or null if not found
 */
export function getEngagementTrack(trackIdentifier: string): Track | null {
  const data = getTrackRegistryDataSync();
  if (!data) {
    ShaderLogger.warn('Track registry not loaded yet. Call ensureTrackRegistryLoaded() first.');
    return null;
  }
  return data.ENGAGEMENT_TRACKS_CACHE[trackIdentifier] || null;
}

/**
 * Save track identifier to registry (in-memory only, requires code update for persistence)
 * @param {string} songName - Song name
 * @param {string} username - Username
 * @param {string} trackIdentifier - Track identifier (e.g., "tracks/abc123")
 */
export function saveTrackIdentifier(songName: string, username: string, trackIdentifier: string): void {
  const data = getTrackRegistryDataSync();
  if (!data) {
    ShaderLogger.warn('Track registry not loaded yet. Call ensureTrackRegistryLoaded() first.');
    return;
  }
  const key = `${songName}|${username}`;
  data.TRACK_REGISTRY[key] = trackIdentifier;
  ShaderLogger.info(`Track identifier saved: ${key} -> ${trackIdentifier}`);
  ShaderLogger.debug(`Update src/config/tracks-config.js with: "${key}": "${trackIdentifier}",`);
}

/**
 * Transform old track ID to new track ID format
 * @param {string} oldId - Old track identifier
 * @returns {string} New track identifier in format "tracks/{transformed_id}"
 */
export function transformOldTrackId(oldId: string): string {
  let transformed = oldId.toLowerCase();
  transformed = transformed.replace(/%/g, 'x-');
  transformed = transformed.replace(/\*/g, 'y-');
  transformed = transformed.replace(/\./g, 'z-');
  return `tracks/${transformed}`;
}

/**
 * Get TRACK_REGISTRY (for backward compatibility)
 * Returns empty object if not loaded - use ensureTrackRegistryLoaded() first
 */
export function getTRACK_REGISTRY(): Record<string, string> {
  const data = getTrackRegistryDataSync();
  return data?.TRACK_REGISTRY || {};
}

/**
 * Get TRACKS_DATA (for backward compatibility)
 * Returns empty object if not loaded - use ensureTrackRegistryLoaded() first
 */
export function getTRACKS_DATA(): Record<string, Track> {
  const data = getTrackRegistryDataSync();
  return data?.TRACKS_DATA || {};
}

/**
 * Get ENGAGEMENT_TRACKS_CACHE (for backward compatibility)
 * Returns empty object if not loaded - use ensureTrackRegistryLoaded() first
 */
export function getENGAGEMENT_TRACKS_CACHE(): Record<string, Track> {
  const data = getTrackRegistryDataSync();
  return data?.ENGAGEMENT_TRACKS_CACHE || {};
}

// Export constants for backward compatibility (will be populated after loading)
// These are getters that return the loaded data
export const TRACK_REGISTRY: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop) {
    const data = getTrackRegistryDataSync();
    if (!data) {
      ShaderLogger.warn('TRACK_REGISTRY accessed before loading. Call ensureTrackRegistryLoaded() first.');
      return undefined;
    }
    return data.TRACK_REGISTRY[prop as string];
  },
  ownKeys() {
    const data = getTrackRegistryDataSync();
    return data ? Object.keys(data.TRACK_REGISTRY) : [];
  },
  has(_target, prop) {
    const data = getTrackRegistryDataSync();
    return data ? prop in data.TRACK_REGISTRY : false;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const data = getTrackRegistryDataSync();
    if (!data) return undefined;
    const value = data.TRACK_REGISTRY[prop as string];
    return value !== undefined ? { enumerable: true, configurable: true, value } : undefined;
  },
});

export const TRACKS_DATA: Record<string, Track> = new Proxy({} as Record<string, Track>, {
  get(_target, prop) {
    const data = getTrackRegistryDataSync();
    if (!data) {
      ShaderLogger.warn('TRACKS_DATA accessed before loading. Call ensureTrackRegistryLoaded() first.');
      return undefined;
    }
    return data.TRACKS_DATA[prop as string];
  },
  ownKeys() {
    const data = getTrackRegistryDataSync();
    return data ? Object.keys(data.TRACKS_DATA) : [];
  },
  has(_target, prop) {
    const data = getTrackRegistryDataSync();
    return data ? prop in data.TRACKS_DATA : false;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const data = getTrackRegistryDataSync();
    if (!data) return undefined;
    const value = data.TRACKS_DATA[prop as string];
    return value !== undefined ? { enumerable: true, configurable: true, value } : undefined;
  },
});

export const ENGAGEMENT_TRACKS_CACHE: Record<string, Track> = new Proxy({} as Record<string, Track>, {
  get(_target, prop) {
    const data = getTrackRegistryDataSync();
    if (!data) {
      ShaderLogger.warn('ENGAGEMENT_TRACKS_CACHE accessed before loading. Call ensureTrackRegistryLoaded() first.');
      return undefined;
    }
    return data.ENGAGEMENT_TRACKS_CACHE[prop as string];
  },
  ownKeys() {
    const data = getTrackRegistryDataSync();
    return data ? Object.keys(data.ENGAGEMENT_TRACKS_CACHE) : [];
  },
  has(_target, prop) {
    const data = getTrackRegistryDataSync();
    return data ? prop in data.ENGAGEMENT_TRACKS_CACHE : false;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const data = getTrackRegistryDataSync();
    if (!data) return undefined;
    const value = data.ENGAGEMENT_TRACKS_CACHE[prop as string];
    return value !== undefined ? { enumerable: true, configurable: true, value } : undefined;
  },
});
