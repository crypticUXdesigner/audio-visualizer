// Audiotool Track Service Client
// Uses the TrackService protobuf definitions to access published tracks

import Sentry from './SentryInit.js';
import { safeCaptureException } from './SentryInit.js';
import { getTrackIdentifier, saveTrackIdentifier } from '../config/track-registry.js';

/**
 * Get the API token from environment variables (optional for public endpoints)
 * @returns {Promise<string|null>} The API token, or null if not set
 */
async function getToken() {
  let token = import.meta.env.VITE_AUDIOTOOL_API_TOKEN;
  
  // Hardcoded fallback for development (remove in production!)
  if (!token && (import.meta.env.DEV || import.meta.env.MODE === 'development')) {
    console.warn('⚠️  Using hardcoded token fallback (env var not loaded). This should only happen in development.');
    token = 'at_pat_sbhF-KMueYzAEctwFzwQlQ6tHwtsy_zkDlre5iypZDA';
  }
  
  // Token is optional for public endpoints - return null if not set
  return token || null;
}

/**
 * Get the client ID from environment variables (optional)
 * @returns {string|null} The client ID if set
 */
function getClientId() {
  // Try environment variable first
  let clientId = import.meta.env.VITE_AUDIOTOOL_CLIENT_ID;
  
  // Only use hardcoded fallback in production builds (not in dev)
  // In dev, let it work without client ID if not explicitly set
  if (!clientId && !import.meta.env.DEV && import.meta.env.MODE === 'production') {
    clientId = '1fe600a2-08f7-4a15-953e-23d0c975ce55';
  }
  
  return clientId || null;
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
  const url = `${baseUrl}/${serviceName}/${method}?encoding=json`;
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Add Authorization header only if token is available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Include client ID in headers only if explicitly set via environment variable
  // This matches the previous behavior where dev worked without client ID
  // The hardcoded fallback is only for production builds, but we don't send it as a header
  // unless explicitly configured, as some APIs don't require/want it
  if (import.meta.env.VITE_AUDIOTOOL_CLIENT_ID) {
    headers['X-Client-Id'] = import.meta.env.VITE_AUDIOTOOL_CLIENT_ID;
  }
  
  // Log authentication method being used (for debugging)
  if (token) {
    console.log(`🔐 Using Bearer token authentication for ${method}`);
  } else if (clientId) {
    console.log(`🔑 Using client ID only for ${method} (public API) - Client ID: ${clientId.substring(0, 8)}...`);
  } else {
    console.log(`🌐 Making unauthenticated request for ${method} (public API)`);
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(request),
  });
  
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
 * Search for tracks
 * @param {object} options - Search options
 * @param {string} options.filter - CEL filter (e.g., 'track.display_name == "trust fund"')
 * @param {string} options.contributorName - Filter by contributor (e.g., 'users/dquerg')
 * @param {number} options.pageSize - Number of results per page
 * @param {string} options.orderBy - Sort order
 * @returns {Promise<object>} List of tracks
 */
export async function listTracks(options = {}) {
  return Sentry.startSpan(
    {
      op: 'http.client',
      name: 'List Audiotool Tracks',
    },
    async (span) => {
      try {
        // Build filter
        let filter = options.filter || '';
        
        // If contributorName is provided, add it to the filter
        // CEL syntax for checking membership in repeated field: "value" in field
        if (options.contributorName && !filter.includes('contributor_names')) {
          const contributorFilter = `"${options.contributorName}" in track.contributor_names`;
          filter = filter ? `${filter} && ${contributorFilter}` : contributorFilter;
        }
        
        const request = {
          filter: filter,
          page_size: options.pageSize || 50,
          page_token: options.pageToken || '',
          order_by: options.orderBy || 'track.create_time desc',
        };
        
        console.log('🔍 Searching tracks with filter:', filter);
        
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
  return Sentry.startSpan(
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
        
        console.log(`🎵 Fetching track: ${normalizedName}`);
        
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
 * Load a track by identifier or search by name only
 * Tries identifier first (fast), falls back to search if not found
 * @param {string} songName - Name of the song
 * @param {string} username - Username of the artist (used for registry key only, not for search)
 * @param {string|null} trackIdentifier - Optional track identifier to use directly
 * @returns {Promise<object>} Track information
 */
export async function loadTrack(songName, username, trackIdentifier = null) {
  return Sentry.startSpan(
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
        
        if (trackIdentifier) {
          // Use direct lookup by identifier (faster, no search)
          console.log(`🎵 Loading "${songName}" using stored identifier: ${trackIdentifier}`);
          span.setAttribute('method', 'direct');
          return await getTrack(trackIdentifier);
        } else {
          // Fall back to search by name only (no artist filter in API, but will filter results by username if provided)
          console.log(`🎵 Loading "${songName}" from Audiotool TrackService (searching by name only...)`);
          span.setAttribute('method', 'search');
          const searchResult = await findTrack(songName, username);
          
          // Save identifier to registry if search was successful and username is provided
          if (searchResult.success && searchResult.track?.name && username) {
            saveTrackIdentifier(songName, username, searchResult.track.name);
          }
          
          return searchResult;
        }
      } catch (error) {
        // If direct lookup fails, try search as fallback
        if (trackIdentifier) {
          console.warn(`⚠️  Direct lookup failed for ${trackIdentifier}, falling back to search...`);
          span.setAttribute('method', 'search_fallback');
          const searchResult = await findTrack(songName, username);
          
          // Save identifier to registry if search was successful and username is provided
          if (searchResult.success && searchResult.track?.name && username) {
            saveTrackIdentifier(songName, username, searchResult.track.name);
          }
          
          // If search also fails, return gracefully
          if (!searchResult.success) {
            return searchResult;
          }
          return searchResult;
        }
        // If no identifier and error occurred, return gracefully
        console.warn(`⚠️  Failed to load track "${songName}":`, error.message || error);
        return {
          success: false,
          track: null,
          error: error.message || String(error),
        };
      }
    }
  );
}

/**
 * Search for a track by name only (no artist filter in API, but can filter results by username)
 * @param {string} songName - Name of the song
 * @param {string} username - Optional username to filter results (checks contributor_names)
 * @returns {Promise<object>} Track information
 */
export async function findTrack(songName, username = null) {
  return Sentry.startSpan(
    {
      op: 'http.client',
      name: 'Find Audiotool Track',
    },
    async (span) => {
      try {
        console.log(`🎵 Searching for "${songName}"...`);
        
        // Search by display name only (no contributor filter)
        const result = await listTracks({
          filter: `track.display_name == "${songName}"`,
          pageSize: 20,
          orderBy: 'track.create_time desc',
        });
        
        if (!result.success || !result.tracks || result.tracks.length === 0) {
          // Return a graceful failure instead of throwing
          console.warn(`⚠️  Track "${songName}" not found`);
          return {
            success: false,
            track: null,
            error: `Track "${songName}" not found`,
          };
        }
        
        // If multiple tracks found and username provided, try to find one matching the username
        let track = result.tracks[0];
        
        if (username && result.tracks.length > 1) {
          // Try to find track by matching contributor
          const usernameLower = username.toLowerCase();
          const matchingTrack = result.tracks.find(t => 
            t.contributor_names?.some(name => 
              name.toLowerCase().includes(usernameLower) || 
              name.toLowerCase().includes('tomderry') ||
              name.toLowerCase().includes('timderry')
            )
          );
          
          if (matchingTrack) {
            track = matchingTrack;
            console.log(`✅ Found track by ${username} among ${result.tracks.length} results`);
          } else {
            console.log(`⚠️  No track found by ${username}, using first result (${result.tracks.length} total)`);
          }
        }
        
        // Note: We can't save identifier here because we don't have username
        // The identifier will be saved in loadTrack if username is provided
        
        span.setAttribute('track.id', track.name);
        span.setAttribute('track.name', track.display_name);
        
        return {
          success: true,
          track: track,
        };
      } catch (error) {
        // Log error but return gracefully instead of throwing
        console.warn(`⚠️  Failed to find track "${songName}":`, error.message || error);
        safeCaptureException(error);
        return {
          success: false,
          track: null,
          error: error.message || String(error),
        };
      }
    }
  );
}

/**
 * Load and log information for a specific track
 * @param {string} songName - Name of the song
 * @param {string} username - Username of the artist
 */
export async function loadTrackInfo(songName = 'trust fund', username = 'dquerg') {
  return Sentry.startSpan(
    {
      op: 'http.client',
      name: 'Load Track Information',
    },
    async (span) => {
      try {
        const result = await findTrack(songName, username);
        
        if (!result.success || !result.track) {
          throw new Error('Failed to find track');
        }
        
        const track = result.track;
        
        // Log all the information
        console.log('\n' + '='.repeat(60));
        console.log(`🎵 TRACK INFORMATION: "${track.display_name}"`);
        console.log('='.repeat(60));
        
        const duration = track.play_duration 
          ? `${Math.floor(track.play_duration.seconds || 0)}s` 
          : 'unknown';
        
        const info = {
          // Basic Info
          id: track.name,
          name: track.name,
          displayName: track.display_name,
          description: track.description || '(no description)',
          
          // Artist Info
          contributors: track.contributor_names || [],
          
          // Audio Info
          bpm: track.bpm || 'unknown',
          duration: duration,
          genre: track.genre_name || '',
          
          // Audio URLs
          mp3Url: track.mp3_url,
          oggUrl: track.ogg_url,
          wavUrl: track.wav_url,
          hlsUrl: track.hls_url,
          
          // Metadata
          tags: track.tags || [],
          license: track.license || 'UNSPECIFIED',
          downloadAllowed: track.download_allowed || false,
          remixAllowed: track.remix_allowed || false,
          
          // Stats
          numFavorites: track.num_favorites || 0,
          numPlays: track.num_plays || 0,
          numDownloads: track.num_downloads || 0,
          numComments: track.num_comments || 0,
          favoritedByUser: track.favorited_by_user || false,
          
          // URLs
          coverUrl: track.cover_url,
          snapshotUrl: track.snapshot_url,
          
          // Timestamps
          createdAt: track.create_time ? new Date(track.create_time.seconds * 1000).toISOString() : 'unknown',
          updatedAt: track.update_time ? new Date(track.update_time.seconds * 1000).toISOString() : 'unknown',
        };
        
        // Log formatted information
        console.log('\n📋 BASIC INFORMATION:');
        console.log(`   ID: ${info.id}`);
        console.log(`   Name: ${info.displayName}`);
        console.log(`   Description: ${info.description}`);
        
        console.log('\n👤 ARTISTS:');
        console.log(`   Contributors: ${info.contributors.length > 0 ? info.contributors.join(', ') : '(none)'}`);
        
        console.log('\n🎼 AUDIO PROPERTIES:');
        console.log(`   BPM: ${info.bpm}`);
        console.log(`   Duration: ${info.duration}`);
        console.log(`   Genre: ${info.genre || '(none)'}`);
        
        console.log('\n🔗 AUDIO URLs:');
        if (info.mp3Url) console.log(`   MP3: ${info.mp3Url}`);
        if (info.oggUrl) console.log(`   OGG: ${info.oggUrl}`);
        if (info.wavUrl) console.log(`   WAV: ${info.wavUrl}`);
        if (info.hlsUrl) console.log(`   HLS: ${info.hlsUrl}`);
        
        console.log('\n🏷️  METADATA:');
        console.log(`   Tags: ${info.tags.length > 0 ? info.tags.join(', ') : '(no tags)'}`);
        console.log(`   License: ${info.license}`);
        console.log(`   Download Allowed: ${info.downloadAllowed ? 'Yes' : 'No'}`);
        console.log(`   Remix Allowed: ${info.remixAllowed ? 'Yes' : 'No'}`);
        
        console.log('\n📊 STATISTICS:');
        console.log(`   Plays: ${info.numPlays}`);
        console.log(`   Favorites: ${info.numFavorites}`);
        console.log(`   Downloads: ${info.numDownloads}`);
        console.log(`   Comments: ${info.numComments}`);
        console.log(`   Favorited by you: ${info.favoritedByUser ? 'Yes' : 'No'}`);
        
        console.log('\n🖼️  MEDIA:');
        if (info.coverUrl) console.log(`   Cover: ${info.coverUrl}`);
        if (info.snapshotUrl) console.log(`   Snapshot: ${info.snapshotUrl}`);
        
        console.log('\n📅 TIMESTAMPS:');
        console.log(`   Created: ${info.createdAt}`);
        console.log(`   Updated: ${info.updatedAt}`);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Track information loaded successfully!');
        console.log('='.repeat(60) + '\n');
        
        // Set span attributes
        span.setAttribute('track.id', info.id);
        span.setAttribute('track.name', info.displayName);
        span.setAttribute('track.contributors', info.contributors.join(', '));
        span.setAttribute('track.bpm', info.bpm);
        
        return {
          success: true,
          track: info,
          rawTrack: track,
        };
      } catch (error) {
        console.error('❌ Failed to load track information:', error);
        
        if (error.message && error.message.includes('403')) {
          console.error('💡 Tip: Your API token may need to be refreshed or you may need different permissions.');
          console.error('💡 Check your token at: https://beta.audiotool.com/');
        }
        
        safeCaptureException(error);
        throw error;
      }
    }
  );
}

// Export for use in browser console or other modules
if (typeof window !== 'undefined') {
  window.AudiotoolTrackService = {
    listTracks: listTracks,
    getTrack: getTrack,
    loadTrack: loadTrack,
    findTrack: findTrack,
    loadTrackInfo: loadTrackInfo,
  };
}

