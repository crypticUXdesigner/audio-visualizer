// Track Service API Client
// Core API client for track operations: getTrack(), getTracks(), loadTrack(), loadTracks()

import { safeCaptureException, safeSentrySpan } from '../core/monitoring/SentryInit.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import { getTrackIdentifier } from '../config/trackRegistry.js';
import { AuthService } from './services/AuthService.js';
import { ApiClient } from './services/ApiClient.js';
import { BatchService } from './services/BatchService.js';
import type { Track, ListTracksResponse, GetTrackResponse, TrackInfo, LoadTracksResult, LoadTrackResult } from '../types/api.js';

// Initialize services (singleton instances)
const authService = new AuthService();
const apiClient = new ApiClient('https://rpc.audiotool.com', authService);
const batchService = new BatchService();
const serviceName = 'audiotool.track.v1.TrackService';

interface ListTracksOptions {
    filter?: string;
    pageSize?: number;
    pageToken?: string;
    orderBy?: string;
}

interface ListTracksRequest {
    filter: string;
    page_size: number;
    page_token: string;
    order_by: string;
}

/**
 * Call the TrackService using Connect RPC format
 * 
 * @param method - The RPC method name (e.g., "ListTracks", "GetTrack")
 * @param request - The request payload
 * @returns The JSON response
 */
async function callTrackService<T = unknown>(method: string, request: unknown): Promise<T> {
    ShaderLogger.debug(`Using ${authService.getAuthMethod()} for ${method}`);
    
    const endpoint = `${serviceName}/${method}`;
    return await apiClient.request<T>(endpoint, {
        method: 'POST',
        body: request,
    });
}

/**
 * List tracks with a filter - RESTRICTED TO EXACT TRACK ID FILTERS ONLY
 * Only allows filters that specify exact track IDs (no open-ended search)
 * @param options - List options
 * @param options.filter - CEL filter with exact track names only
 * @param options.pageSize - Number of results per page
 * @returns List of tracks
 */
export async function listTracksByIds(options: ListTracksOptions = {}): Promise<ListTracksResponse> {
    return safeSentrySpan(
        {
            op: 'http.client',
            name: 'List Audiotool Tracks By IDs',
        },
        async (span) => {
            try {
                const request: ListTracksRequest = {
                    filter: options.filter || '',
                    page_size: options.pageSize || 50,
                    page_token: options.pageToken || '',
                    order_by: options.orderBy || 'track.create_time desc',
                };
                
                const result = await callTrackService<{ tracks?: Track[]; next_page_token?: string }>('ListTracks', request);
                
                span.setAttribute('tracks.count', result.tracks?.length || 0);
                
                return {
                    success: true,
                    tracks: result.tracks || [],
                    nextPageToken: result.next_page_token || '',
                };
            } catch (error) {
                ShaderLogger.error('Failed to list tracks:', error);
                safeCaptureException(error as Error);
                throw error;
            }
        }
    );
}

/**
 * Get a specific track by name
 * @param trackName - Track name in format "tracks/{id}" or just "{id}"
 * @returns Track information
 */
export async function getTrack(trackName: string): Promise<GetTrackResponse> {
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
                
                const result = await callTrackService<{ track?: Track }>('GetTrack', request);
                
                if (result.track) {
                    span.setAttribute('track.id', result.track.name);
                    span.setAttribute('track.name', result.track.display_name || result.track.displayName || '');
                    return {
                        success: true,
                        track: result.track,
                    };
                } else {
                    throw new Error('Track not found in response');
                }
            } catch (error) {
                ShaderLogger.error('Failed to get track:', error);
                safeCaptureException(error as Error);
                throw error;
            }
        }
    );
}

/**
 * Get multiple tracks by their identifiers - uses batch loading with ListTracks
 * @param trackNames - Array of track names in format "tracks/{id}" or just "{id}"
 * @returns Object mapping track names to track information
 */
export async function getTracks(trackNames: string[]): Promise<{ success: boolean; tracks: Record<string, Track> }> {
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
                
                // Use BatchService to load tracks
                const tracksMap = await batchService.batchLoadTracks(normalizedNames);
                
                const fetchedCount = Object.keys(tracksMap).length;
                span.setAttribute('tracks.requested', normalizedNames.length);
                span.setAttribute('tracks.found', fetchedCount);
                span.setAttribute('batches', Math.ceil(normalizedNames.length / batchService.getBatchSize()));
                
                return {
                    success: true,
                    tracks: tracksMap,
                };
            } catch (error) {
                ShaderLogger.error('Failed to get tracks:', error);
                safeCaptureException(error as Error);
                throw error;
            }
        }
    );
}

/**
 * Load multiple tracks by their identifiers - REGISTRY ONLY MODE
 * @param tracks - Array of track info objects
 * @returns Object mapping (songName|username) keys to track information
 */
export async function loadTracks(tracks: TrackInfo[]): Promise<LoadTracksResult> {
    return safeSentrySpan(
        {
            op: 'http.client',
            name: 'Load Multiple Audiotool Tracks',
        },
        async (span) => {
            try {
                const results: Record<string, { success: boolean; track: Track | null; error?: string }> = {};
                const tracksWithIds: TrackInfo[] = [];
                const tracksWithoutIds: TrackInfo[] = [];
                
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
                    const trackIdentifiers = tracksWithIds.map(t => t.trackIdentifier!);
                    const batchResult = await getTracks(trackIdentifiers);
                    
                    if (batchResult.success && batchResult.tracks) {
                        tracksWithIds.forEach(trackInfo => {
                            const track = batchResult.tracks[trackInfo.trackIdentifier!];
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
                    ShaderLogger.info(`Registry lookup: ${successCount} found, ${notFoundCount} not in registry`);
                }
                
                span.setAttribute('tracks.total', tracks.length);
                span.setAttribute('tracks.found', tracksWithIds.length);
                span.setAttribute('tracks.not_in_registry', tracksWithoutIds.length);
                
                return {
                    success: true,
                    results: results,
                };
            } catch (error) {
                ShaderLogger.error('Failed to load tracks:', error);
                safeCaptureException(error as Error);
                throw error;
            }
        }
    );
}

/**
 * Load a track by identifier - REGISTRY ONLY MODE
 * Only loads tracks that exist in the registry (170+ validated tracks)
 * @param songName - Name of the song
 * @param username - Username (deprecated, used for registry lookup only)
 * @param trackIdentifier - Optional track identifier to use directly
 * @returns Track information
 */
export async function loadTrack(
    songName: string, 
    username: string, 
    trackIdentifier: string | null = null
): Promise<LoadTrackResult> {
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
                    ShaderLogger.warn(errorMsg);
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
                const result = await getTrack(trackIdentifier);
                // Convert GetTrackResponse to LoadTrackResult (undefined -> null)
                return {
                    success: result.success,
                    track: result.track ?? null,
                    error: result.success ? undefined : 'Track not found'
                };
            } catch (error) {
                return {
                    success: false,
                    track: null,
                    error: (error as Error).message || String(error),
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
    (window as { AudiotoolTrackService?: typeof import('./TrackService.js') }).AudiotoolTrackService = {
        getTrack: getTrack,
        getTracks: getTracks,
        loadTrack: loadTrack,
        loadTracks: loadTracks,
        listTracksByIds: listTracksByIds,
        // getAudiographs moved to AudiographService
        // getTopEngagementTracks moved to EngagementService
        // Search methods removed - registry-only mode
    };
}

