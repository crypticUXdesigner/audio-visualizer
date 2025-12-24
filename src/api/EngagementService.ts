// Engagement Service API Client
// Handles engagement ranking logic: getTopEngagementTracks()
// Score calculations and monthly query strategy

import { safeCaptureException, safeSentrySpan } from '../core/monitoring/SentryInit.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import { listTracksByIds } from './TrackService.js';
import type { TrackWithEngagement, GetTopEngagementTracksResult } from '../types/api.js';

interface TimestampLike {
    seconds?: number;
    nanos?: number;
}

/**
 * Get top tracks by engagement score from the last N days
 * Engagement score = (plays + favorites + comments) / days_since_creation * 30
 * This normalizes engagement to a "per 30 days" rate
 * @param days - Number of days to look back (default: 30)
 * @param limit - Number of top tracks to return (default: 50)
 * @returns Top tracks sorted by engagement score
 */
export async function getTopEngagementTracks(
    _days: number = 30, 
    limit: number = 50
): Promise<GetTopEngagementTracksResult> {
    return safeSentrySpan(
        {
            op: 'http.client',
            name: 'Get Top Engagement Tracks',
        },
        async (span) => {
            try {
                // Fetch tracks from last 2 years by splitting into monthly chunks
                // This works around pagination limitations - each month query can return up to 100 tracks
                const today = new Date();
                const twoYearsAgo = new Date();
                twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
                
                ShaderLogger.info(`Fetching tracks from last 2 years for engagement ranking...`);
                ShaderLogger.debug(`Today: ${today.toISOString()}`);
                ShaderLogger.debug(`Will query monthly chunks to work around pagination limits`);
                ShaderLogger.debug(`Will calculate engagement scores and return top ${limit} tracks`);
                
                // Split 2 years into monthly chunks (24 months)
                const allTracks: Track[] = [];
                const maxPageSize = 100; // Max page size per request
                const monthsToQuery = 24;
                
                for (let monthOffset = 0; monthOffset < monthsToQuery; monthOffset++) {
                    const monthStart = new Date(twoYearsAgo);
                    monthStart.setMonth(monthStart.getMonth() + monthOffset);
                    
                    const monthEnd = new Date(monthStart);
                    monthEnd.setMonth(monthEnd.getMonth() + 1);
                    
                    const monthStartISO = monthStart.toISOString();
                    const monthEndISO = monthEnd.toISOString();
                    
                    // CEL filter for this specific month
                    const filter = `track.create_time >= timestamp("${monthStartISO}") && track.create_time < timestamp("${monthEndISO}")`;
                    
                    ShaderLogger.debug(`Querying month ${monthOffset + 1}/${monthsToQuery}: ${monthStartISO.split('T')[0]} to ${monthEndISO.split('T')[0]}`);
                    
                    try {
                        const result = await listTracksByIds({
                            filter: filter,
                            pageSize: maxPageSize,
                            orderBy: 'track.num_favorites desc',
                        });
                        
                        if (result.success && result.tracks && result.tracks.length > 0) {
                            allTracks.push(...result.tracks);
                            ShaderLogger.debug(`Found ${result.tracks.length} tracks (total: ${allTracks.length})`);
                        } else {
                            ShaderLogger.debug(`No tracks found for this month`);
                        }
                        
                        // Small delay between requests to be respectful to the API
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        ShaderLogger.warn(`Error querying month ${monthOffset + 1}:`, (error as Error).message);
                        // Continue with next month even if one fails
                    }
                }
                
                if (allTracks.length === 0) {
                    ShaderLogger.warn('No tracks found in the last 2 years');
                    return {
                        success: true,
                        tracks: [],
                    };
                }
                
                // Deduplicate tracks by track.name (tracks should only appear once, but be safe)
                const tracksMap = new Map<string, Track>();
                let duplicateCount = 0;
                for (const track of allTracks) {
                    const trackId = track.name || (track as { id?: string }).id;
                    if (trackId) {
                        if (tracksMap.has(trackId)) {
                            duplicateCount++;
                            // Keep the one with higher engagement metrics if duplicate
                            const existing = tracksMap.get(trackId)!;
                            const existingEngagement = ((existing as { num_plays?: number }).num_plays || (existing as { numPlays?: number }).numPlays || 0) + 
                                        ((existing as { num_favorites?: number }).num_favorites || (existing as { numFavorites?: number }).numFavorites || 0) + 
                                        ((existing as { num_comments?: number }).num_comments || (existing as { numComments?: number }).numComments || 0);
                            const newEngagement = ((track as { num_plays?: number }).num_plays || (track as { numPlays?: number }).numPlays || 0) + 
                                       ((track as { num_favorites?: number }).num_favorites || (track as { numFavorites?: number }).numFavorites || 0) + 
                                       ((track as { num_comments?: number }).num_comments || (track as { numComments?: number }).numComments || 0);
                            if (newEngagement > existingEngagement) {
                                tracksMap.set(trackId, track);
                            }
                        } else {
                            tracksMap.set(trackId, track);
                        }
                    }
                }
                
                const uniqueTracks = Array.from(tracksMap.values());
                
                ShaderLogger.info(`Ranking summary: ${allTracks.length} total tracks fetched`);
                if (duplicateCount > 0) {
                    ShaderLogger.debug(`Duplicates removed: ${duplicateCount}`);
                }
                ShaderLogger.debug(`Unique tracks: ${uniqueTracks.length}, Monthly queries: ${monthsToQuery}, Max per query: ${maxPageSize}`);
                ShaderLogger.info(`Calculating engagement scores for ${uniqueTracks.length} tracks...`);
                
                // Calculate engagement score for each track
                const tracksWithScores: TrackWithEngagement[] = uniqueTracks.map(track => {
                    // Get creation date
                    // Handle both snake_case (protobuf) and camelCase (JSON) field names
                    const createTime = (track as { create_time?: string | TimestampLike }).create_time || (track as { createTime?: string | TimestampLike }).createTime;
                    let daysSinceCreation = 1; // Default to 1 to avoid division by zero
                    
                    if (createTime) {
                        // Handle both timestamp object and ISO string
                        let createDate: Date;
                        if (typeof createTime === 'string') {
                            createDate = new Date(createTime);
                        } else if ((createTime as TimestampLike).seconds !== undefined) {
                            createDate = new Date((createTime as TimestampLike).seconds! * 1000);
                        } else if ((createTime as TimestampLike).seconds === 0 && (createTime as TimestampLike).nanos !== undefined) {
                            // Handle protobuf timestamp with seconds and nanos
                            createDate = new Date((createTime as TimestampLike).seconds! * 1000 + (createTime as TimestampLike).nanos! / 1000000);
                        } else {
                            // Fallback: try to convert to string (shouldn't normally reach here)
                            createDate = new Date(String(createTime));
                        }
                        
                        if (!isNaN(createDate.getTime())) {
                            const diffTime = today.getTime() - createDate.getTime();
                            daysSinceCreation = Math.max(1, diffTime / (1000 * 60 * 60 * 24)); // Convert to days, min 1
                        }
                    }
                    
                    // Get metrics (default to 0 if not available)
                    // Handle both snake_case (protobuf) and camelCase (JSON) field names
                    const plays = (track as { num_plays?: number }).num_plays || (track as { numPlays?: number }).numPlays || 0;
                    const favorites = (track as { num_favorites?: number }).num_favorites || (track as { numFavorites?: number }).numFavorites || 0;
                    const comments = (track as { num_comments?: number }).num_comments || (track as { numComments?: number }).numComments || 0;
                    
                    // Calculate engagement score
                    // Formula: (plays + favorites + comments) / days_since_creation * 30
                    // This gives us "engagement per 30 days" as a normalized metric
                    const totalEngagement = plays + favorites + comments;
                    const engagementScore = (totalEngagement / daysSinceCreation) * 30;
                    
                    return {
                        ...track,
                        _engagementScore: engagementScore,
                        _daysSinceCreation: daysSinceCreation,
                        _totalEngagement: totalEngagement,
                        _plays: plays,
                        _favorites: favorites,
                        _comments: comments,
                    };
                });
                
                // Sort by engagement score (descending)
                tracksWithScores.sort((a, b) => (b._engagementScore || 0) - (a._engagementScore || 0));
                
                // Get top N tracks
                const topTracks = tracksWithScores.slice(0, limit);
                
                ShaderLogger.debug(`Tracks with scores: ${tracksWithScores.length}`);
                
                span.setAttribute('tracks.total', allTracks.length);
                span.setAttribute('tracks.unique', uniqueTracks.length);
                span.setAttribute('tracks.duplicates', duplicateCount);
                span.setAttribute('tracks.returned', topTracks.length);
                span.setAttribute('filter.years', 2);
                span.setAttribute('query.strategy', 'monthly_chunks');
                span.setAttribute('query.months', monthsToQuery);
                
                return {
                    success: true,
                    tracks: topTracks.map(t => {
                        // Include engagement metrics in the returned track object
                        const { _engagementScore, _daysSinceCreation, _totalEngagement, _plays, _favorites, _comments, ...trackData } = t;
                        return {
                            ...trackData,
                            engagementScore: _engagementScore,
                            daysSinceCreation: _daysSinceCreation,
                            totalEngagement: _totalEngagement,
                        };
                    }),
                };
            } catch (error) {
                ShaderLogger.error('Failed to get top engagement tracks:', error);
                safeCaptureException(error as Error);
                throw error;
            }
        }
    );
}

