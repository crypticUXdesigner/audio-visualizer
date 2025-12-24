// API type definitions

export interface Track {
  name: string;
  display_name?: string;
  displayName?: string;
  contributor_names?: string[];
  contributorNames?: string[];
  mp3Url?: string;
  bpm?: number;
  duration?: number;
  create_time?: string;
  update_time?: string;
  [key: string]: unknown;
}

export interface ListTracksResponse {
  success: boolean;
  tracks: Track[];
  nextPageToken?: string;
}

export interface GetTrackResponse {
  success: boolean;
  track?: Track;
}

/**
 * Batch request for multiple API calls
 * @template TBody - Type of request body (defaults to unknown)
 */
export interface BatchRequest<TBody = unknown> {
  requests: Array<{
    service: string;
    method: string;
    body: TBody;
  }>;
}

/**
 * Batch response from multiple API calls
 * @template TData - Type of response data (defaults to unknown)
 */
export interface BatchResponse<TData = unknown> {
  responses: Array<{
    success: boolean;
    data?: TData;
    error?: string;
  }>;
}

export interface ApiClientOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiError extends Error {
  status?: number;
  endpoint?: string;
}

export interface AuthToken {
  token: string;
  expiresAt?: number;
}

/**
 * Track with engagement metrics
 * Used for tracks that have engagement scoring applied
 */
export interface TrackWithEngagement extends Track {
  engagementScore?: number;
  daysSinceCreation?: number;
  totalEngagement?: number;
  _engagementScore?: number;
  _daysSinceCreation?: number;
  _totalEngagement?: number;
  _plays?: number;
  _favorites?: number;
  _comments?: number;
}

/**
 * Track information for API requests
 */
export interface TrackInfo {
  songName: string;
  username: string;
  trackIdentifier?: string | null;
}

/**
 * Result of loading multiple tracks
 */
export interface LoadTracksResult {
  success: boolean;
  results: Record<string, {
    success: boolean;
    track: Track | null;
    error?: string;
  }>;
}

/**
 * Result of getting top engagement tracks
 */
export interface GetTopEngagementTracksResult {
  success: boolean;
  tracks: TrackWithEngagement[];
}

/**
 * Result of loading a single track
 */
export interface LoadTrackResult {
  success: boolean;
  track: Track | null;
  error?: string;
}

