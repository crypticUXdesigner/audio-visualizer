// Batch Service
// Handles batch operations for API calls

import { listTracksByIds } from '../TrackService.js';
import { API_CONFIG } from '../../config/constants.js';
import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import type { Track } from '../../types/api.js';

interface ListTracksResult {
    success: boolean;
    tracks?: Track[];
    nextPageToken?: string;
}

/**
 * BatchService - Handles batch loading of tracks
 * 
 * Efficiently loads multiple tracks in batches to avoid API limits
 * and improve performance.
 */
export class BatchService {
    batchSize: number;
    
    constructor() {
        this.batchSize = API_CONFIG.BATCH_SIZE;
    }
    
    /**
     * Batch load tracks by their identifiers
     * 
     * Uses ListTracks API with CEL filters to load multiple tracks
     * in a single request per batch.
     * 
     * @param trackIdentifiers - Array of track identifiers (format: "tracks/{id}")
     * @returns Map of track identifier to track data
     * @throws Error If batch loading fails
     */
    async batchLoadTracks(trackIdentifiers: string[]): Promise<Record<string, Track>> {
        const tracksMap: Record<string, Track> = {};
        const totalBatches = Math.ceil(trackIdentifiers.length / this.batchSize);
        
        ShaderLogger.info(`Batch loading ${trackIdentifiers.length} tracks from API (${totalBatches} ${totalBatches === 1 ? 'batch' : 'batches'})`);
        
        // Process in batches to avoid filter size limits
        for (let i = 0; i < trackIdentifiers.length; i += this.batchSize) {
            const batch = trackIdentifiers.slice(i, i + this.batchSize);
            const filter = this._buildFilter(batch);
            
            const result = await listTracksByIds({
                filter: filter,
                pageSize: this.batchSize,
            }) as ListTracksResult;
            
            if (result.success && result.tracks) {
                result.tracks.forEach(track => {
                    if (track.name) {
                        tracksMap[track.name] = track;
                    }
                });
            }
        }
        
        const fetchedCount = Object.keys(tracksMap).length;
        const notFoundCount = trackIdentifiers.length - fetchedCount;
        
        ShaderLogger.info(`Loaded ${fetchedCount}/${trackIdentifiers.length} tracks from API${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}`);
        
        return tracksMap;
    }
    
    /**
     * Build CEL filter for batch of track identifiers
     * 
     * Creates a filter like: track.name == "tracks/123" || track.name == "tracks/456" || ...
     * 
     * @param trackIdentifiers - Array of track identifiers
     * @returns CEL filter string
     * @private
     */
    _buildFilter(trackIdentifiers: string[]): string {
        return trackIdentifiers
            .map(name => `track.name == "${name}"`)
            .join(' || ');
    }
    
    /**
     * Set batch size
     * 
     * @param size - New batch size (default: 50)
     */
    setBatchSize(size: number): void {
        this.batchSize = size;
    }
    
    /**
     * Get current batch size
     * 
     * @returns Current batch size
     */
    getBatchSize(): number {
        return this.batchSize;
    }
}

