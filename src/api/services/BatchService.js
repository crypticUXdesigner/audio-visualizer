// Batch Service
// Handles batch operations for API calls

import { listTracksByIds } from '../TrackService.js';
import { API_CONFIG } from '../../config/constants.js';

/**
 * BatchService - Handles batch loading of tracks
 * 
 * Efficiently loads multiple tracks in batches to avoid API limits
 * and improve performance.
 */
export class BatchService {
  constructor() {
    this.batchSize = API_CONFIG.BATCH_SIZE;
  }
  
  /**
   * Batch load tracks by their identifiers
   * 
   * Uses ListTracks API with CEL filters to load multiple tracks
   * in a single request per batch.
   * 
   * @param {string[]} trackIdentifiers - Array of track identifiers (format: "tracks/{id}")
   * @returns {Promise<Object>} Map of track identifier to track data
   * @throws {Error} If batch loading fails
   */
  async batchLoadTracks(trackIdentifiers) {
    const tracksMap = {};
    const totalBatches = Math.ceil(trackIdentifiers.length / this.batchSize);
    
    console.log(`🎵 Batch loading ${trackIdentifiers.length} tracks from API (${totalBatches} ${totalBatches === 1 ? 'batch' : 'batches'})`);
    
    // Process in batches to avoid filter size limits
    for (let i = 0; i < trackIdentifiers.length; i += this.batchSize) {
      const batch = trackIdentifiers.slice(i, i + this.batchSize);
      const filter = this._buildFilter(batch);
      
      const result = await listTracksByIds({
        filter: filter,
        pageSize: this.batchSize,
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
    const notFoundCount = trackIdentifiers.length - fetchedCount;
    
    console.log(`✅ Loaded ${fetchedCount}/${trackIdentifiers.length} tracks from API${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}`);
    
    return tracksMap;
  }
  
  /**
   * Build CEL filter for batch of track identifiers
   * 
   * Creates a filter like: track.name == "tracks/123" || track.name == "tracks/456" || ...
   * 
   * @param {string[]} trackIdentifiers - Array of track identifiers
   * @returns {string} CEL filter string
   * @private
   */
  _buildFilter(trackIdentifiers) {
    return trackIdentifiers
      .map(name => `track.name == "${name}"`)
      .join(' || ');
  }
  
  /**
   * Set batch size
   * 
   * @param {number} size - New batch size (default: 50)
   */
  setBatchSize(size) {
    this.batchSize = size;
  }
  
  /**
   * Get current batch size
   * 
   * @returns {number} Current batch size
   */
  getBatchSize() {
    return this.batchSize;
  }
}

