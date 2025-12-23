// Track Service API Client
// Core API client for track operations: getTrack(), getTracks(), loadTrack(), loadTracks()
// Authentication handling and base RPC calls

import { safeCaptureException, safeSentrySpan } from '../core/monitoring/SentryInit.js';
import { getTrackIdentifier } from '../config/trackRegistry.js';

/**
 * Get the API token from environment variables (optional for public endpoints)
 * Token is NOT required - the app works with public endpoints using client ID.
 * For development, create a .env.local file with: VITE_AUDIOTOOL_API_TOKEN=your_token
 * @returns {Promise<string|null>} The API token, or null if not set
 */
async function getToken() {
  const token = import.meta.env.VITE_AUDIOTOOL_API_TOKEN;
  return token || null;
}

/**
 * Get the client ID from environment variables (optional)
 * In production, uses a public client ID. In development, uses environment variable or null.
 * @returns {string|null} The client ID if set
 */
function getClientId() {
  const clientId = import.meta.env.VITE_AUDIOTOOL_CLIENT_ID;
  
  if (clientId) {
    return clientId;
  }
  
  // Production fallback - public client ID for API access
  if (!import.meta.env.DEV) {
    return '1fe600a2-08f7-4a15-953e-23d0c975ce55';
  }
  
  return null;
}

/**
 * Call the TrackService using Connect RPC format
 * Connect RPC supports JSON encoding via the ?encoding=json query parameter
 * @param {string} method - The RPC method name (e.g., "ListTracks", "GetTrack")
 * @param {object} request - The request payload
 * @returns {Promise<Response>} The fetch response
 */
async function callTrackService(method, request) {
  const token = await getToken();
  const clientId = getClientId();
  const baseUrl = 'https://rpc.audiotool.com';
  const serviceName = 'audiotool.track.v1.TrackService';
  // Connect RPC JSON format: add ?encoding=json for JSON encoding
  const url = `${baseUrl}/${serviceName}/${method}`;
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Add Authorization header only if token is available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Log authentication method being used (for debugging)
  if (token) {
    console.log(`🔐 Using Bearer token authentication for ${method}`);
  } else if (clientId) {
    console.log(`🔑 Using client ID only for ${method} (public API) - Client ID: ${clientId.substring(0, 8)}...`);
  } else {
    console.log(`🌐 Making unauthenticated request for ${method} (public API)`);
  }
  
  // Add timeout handling for API calls
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(request),
      credentials: 'omit',
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`TrackService.${method} request timed out after 30 seconds`);
    }
    throw error;
  }
  
  clearTimeout(timeoutId);
  
  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch (e) {
      errorText = response.statusText;
    }
    
    // Try to parse as JSON error
    let errorMessage = `TrackService.${method} failed: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.message) {
        errorMessage = errorJson.message;
      } else if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch (e) {
      if (errorText) {
        errorMessage += ` - ${errorText}`;
      }
    }
    
    // Provide helpful error message for authentication issues
    if (response.status === 401 || response.status === 403) {
      if (!token && !clientId) {
        errorMessage += '\n💡 Tip: Public API may require client ID. Set VITE_AUDIOTOOL_CLIENT_ID in your environment.';
      } else if (!token && clientId) {
        errorMessage += '\n💡 Tip: This endpoint may require a Bearer token. Set VITE_AUDIOTOOL_API_TOKEN in your environment.';
      }
    }
    
    throw new Error(errorMessage);
  }
  
  const jsonResponse = await response.json();
  return jsonResponse;
}

/**
 * List tracks with a filter - RESTRICTED TO EXACT TRACK ID FILTERS ONLY
 * Only allows filters that specify exact track IDs (no open-ended search)
 * @param {object} options - List options
 * @param {string} options.filter - CEL filter with exact track names only
 * @param {number} options.pageSize - Number of results per page
 * @returns {Promise<object>} List of tracks
 */
export async function listTracksByIds(options = {}) {
  return safeSentrySpan(
    {
      op: 'http.client',
      name: 'List Audiotool Tracks By IDs',
    },
    async (span) => {
      try {
        const request = {
          filter: options.filter || '',
          page_size: options.pageSize || 50,
          page_token: options.pageToken || '',
          order_by: options.orderBy || 'track.create_time desc',
        };
        
        const result = await callTrackService('ListTracks', request);
        
        span.setAttribute('tracks.count', result.tracks?.length || 0);
        
        return {
          success: true,
          tracks: result.tracks || [],
          nextPageToken: result.next_page_token || '',
        };
      } catch (error) {
        console.error('❌ Failed to list tracks:', error);
        safeCaptureException(error);
        throw error;
      }
    }
  );
}

/**
 * Get a specific track by name
 * @param {string} trackName - Track name in format "tracks/{id}" or just "{id}"
 * @returns {Promise<object>} Track information
 */
export async function getTrack(trackName) {
  return safeSentrySpan(
    {
      op: 'http.client',
      name: 'Get Audiotool Track',
    },
    async (span) => {
      try {
        // Ensure track name is in correct format
        const normalizedName = trackName.startsWith('tracks/') 
          ? trackName 
          : `tracks/${trackName}`;
        
        const request = {
          name: normalizedName,
        };
        
        const result = await callTrackService('GetTrack', request);
        
        if (result.track) {
          span.setAttribute('track.id', result.track.name);
          span.setAttribute('track.name', result.track.display_name);
          return {
            success: true,
            track: result.track,
          };
        } else {
          throw new Error('Track not found in response');
        }
      } catch (error) {
        console.error('❌ Failed to get track:', error);
        safeCaptureException(error);
        throw error;
      }
    }
  );
}

/**
 * Get multiple tracks by their identifiers - uses batch loading with ListTracks
 * @param {string[]} trackNames - Array of track names in format "tracks/{id}" or just "{id}"
 * @returns {Promise<object>} Object mapping track names to track information
 */
export async function getTracks(trackNames) {
  return safeSentrySpan(
    {
      op: 'http.client',
      name: 'Get Multiple Audiotool Tracks',
    },
    async (span) => {
      try {
        if (!trackNames || trackNames.length === 0) {
          return {
            success: true,
            tracks: {},
          };
        }
        
        // Normalize track names to correct format
        const normalizedNames = trackNames.map(name => 
          name.startsWith('tracks/') ? name : `tracks/${name}`
        );
        
        const tracksMap = {};
        const batchSize = 50; // API page size limit
        const totalBatches = Math.ceil(normalizedNames.length / batchSize);
        
        console.log(`🎵 Batch loading ${normalizedNames.length} tracks from API (${totalBatches} ${totalBatches === 1 ? 'batch' : 'batches'})`);
        
        // Process in batches to avoid filter size limits
        for (let i = 0; i < normalizedNames.length; i += batchSize) {
          const batch = normalizedNames.slice(i, i + batchSize);
          
          // Build CEL filter: track.name == "tracks/123" || track.name == "tracks/456" || ...
          const filter = batch
            .map(name => `track.name == "${name}"`)
            .join(' || ');
          
          const result = await listTracksByIds({
            filter: filter,
            pageSize: batchSize,
          });
          
          if (result.success && result.tracks) {
            result.tracks.forEach(track => {
              if (track.name) {
                tracksMap[track.name] = track;
              }
            });
          }
        }
        
        const fetchedCount = Object.keys(tracksMap).length;
        const notFoundCount = normalizedNames.length - fetchedCount;
        
        console.log(`✅ Loaded ${fetchedCount}/${normalizedNames.length} tracks from API${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}`);
        
        span.setAttribute('tracks.requested', normalizedNames.length);
        span.setAttribute('tracks.found', fetchedCount);
        span.setAttribute('batches', Math.ceil(normalizedNames.length / batchSize));
        
        return {
          success: true,
          tracks: tracksMap,
        };
      } catch (error) {
        console.error('❌ Failed to get tracks:', error);
        safeCaptureException(error);
        throw error;
      }
    }
  );
}

/**
 * Load multiple tracks by their identifiers - REGISTRY ONLY MODE
 * @param {Array<{songName: string, username: string, trackIdentifier: string}>} tracks - Array of track info objects
 * @returns {Promise<object>} Object mapping (songName|username) keys to track information
 */
export async function loadTracks(tracks) {
  return safeSentrySpan(
    {
      op: 'http.client',
      name: 'Load Multiple Audiotool Tracks',
    },
    async (span) => {
      try {
        const results = {};
        const tracksWithIds = [];
        const tracksWithoutIds = [];
        
        // Separate tracks into those with registry IDs and those without
        tracks.forEach(track => {
          const identifier = track.trackIdentifier || getTrackIdentifier(track.songName, track.username);
          if (identifier) {
            tracksWithIds.push({
              ...track,
              trackIdentifier: identifier,
            });
          } else {
            tracksWithoutIds.push(track);
          }
        });
        
        // Load tracks with identifiers
        if (tracksWithIds.length > 0) {
          const trackIdentifiers = tracksWithIds.map(t => t.trackIdentifier);
          const batchResult = await getTracks(trackIdentifiers);
          
          if (batchResult.success && batchResult.tracks) {
            tracksWithIds.forEach(trackInfo => {
              const track = batchResult.tracks[trackInfo.trackIdentifier];
              const key = `${trackInfo.songName}|${trackInfo.username}`;
              if (track) {
                results[key] = {
                  success: true,
                  track: track,
                };
              } else {
                results[key] = {
                  success: false,
                  track: null,
                  error: `Track ${trackInfo.trackIdentifier} not found`,
                };
              }
            });
          }
        }
        
        // ⛔ REGISTRY-ONLY MODE: Tracks not in registry are rejected
        for (const trackInfo of tracksWithoutIds) {
          const key = `${trackInfo.songName}|${trackInfo.username}`;
          results[key] = {
          success: false,
          track: null,
          error: `Track "${trackInfo.songName}" by ${trackInfo.username} not found in registry. Only 170+ validated tracks can be loaded.`,
          };
        }
        
        const successCount = tracksWithIds.length;
        const notFoundCount = tracksWithoutIds.length;
        
        if (notFoundCount > 0) {
          console.log(`📦 Registry lookup: ${successCount} found, ${notFoundCount} not in registry`);
        }
        
        span.setAttribute('tracks.total', tracks.length);
        span.setAttribute('tracks.found', tracksWithIds.length);
        span.setAttribute('tracks.not_in_registry', tracksWithoutIds.length);
        
        return {
          success: true,
          results: results,
        };
      } catch (error) {
        console.error('❌ Failed to load tracks:', error);
        safeCaptureException(error);
        throw error;
      }
    }
  );
}

/**
 * Load a track by identifier - REGISTRY ONLY MODE
 * Only loads tracks that exist in the registry (170+ validated tracks)
 * @param {string} songName - Name of the song
 * @param {string} username - Username (deprecated, used for registry lookup only)
 * @param {string|null} trackIdentifier - Optional track identifier to use directly
 * @returns {Promise<object>} Track information
 */
export async function loadTrack(songName, username, trackIdentifier = null) {
  return safeSentrySpan(
    {
      op: 'http.client',
      name: 'Load Audiotool Track',
    },
    async (span) => {
      try {
        // Try to get identifier from registry if not provided
        if (!trackIdentifier) {
          trackIdentifier = getTrackIdentifier(songName, username);
        }
        
        // ⛔ REGISTRY-ONLY MODE: Only load tracks from registry
        if (!trackIdentifier) {
          const errorMsg = `Track "${songName}" by ${username} not found in registry. Only 170+ validated tracks can be loaded.`;
          console.warn(`⚠️  ${errorMsg}`);
          span.setAttribute('method', 'registry_only');
          span.setAttribute('found_in_registry', false);
          return {
            success: false,
            track: null,
            error: errorMsg,
          };
        }
        
        // Use direct lookup by identifier
        span.setAttribute('method', 'registry');
        span.setAttribute('found_in_registry', true);
        return await getTrack(trackIdentifier);
      } catch (error) {
        return {
          success: false,
          track: null,
          error: error.message || String(error),
        };
      }
    }
  );
}

// ⛔ findTrack() - REMOVED - Search functionality disabled (registry-only mode)
// ⛔ loadTrackInfo() - REMOVED - Search functionality disabled (registry-only mode)

// Note: getAudiographs() moved to ../api/AudiographService.js
// Note: getTopEngagementTracks() moved to ../api/EngagementService.js

// Export for use in browser console or other modules
// ⛔ REGISTRY-ONLY MODE: Only validated tracks from registry can be loaded
if (typeof window !== 'undefined') {
  window.AudiotoolTrackService = {
    getTrack: getTrack,
    getTracks: getTracks,
    loadTrack: loadTrack,
    loadTracks: loadTracks,
    // getAudiographs moved to AudiographService
    // getTopEngagementTracks moved to EngagementService
    // Search methods removed - registry-only mode
  };
}
