// Track Loading Service
// Handles loading tracks from API (engagement tracks and registry tracks)

import { UI_CONFIG } from '../../config/constants.js';

/**
 * TrackLoadingService - Manages track loading from API
 * 
 * Handles:
 * - Loading engagement tracks from cache or API
 * - Loading registry tracks in batches
 * - Adding tracks to UI controls
 * - Error handling and logging
 */
export class TrackLoadingService {
  constructor(audioControls) {
    this.audioControls = audioControls;
  }
  
  /**
   * Load all tracks (engagement + registry)
   * 
   * This is the main entry point that loads both engagement tracks
   * and registry tracks, then sorts them alphabetically.
   * 
   * @param {Function} hideLoader - Callback to hide loading spinner
   * @returns {Promise<void>}
   */
  async loadAllTracks(hideLoader) {
    try {
      // Dynamically import services to avoid circular dependencies
      const { loadTracks } = await import('../../api/TrackService.js');
      const { getTopEngagementTracks } = await import('../../api/EngagementService.js');
      const { getTrackIdentifier, TRACK_REGISTRY, ENGAGEMENT_TRACKS_CACHE } = await import('../../config/trackRegistry.js');
      
      // Load engagement tracks first
      await this._loadEngagementTracks(getTopEngagementTracks, ENGAGEMENT_TRACKS_CACHE);
      
      // Then load registry tracks
      await this._loadRegistryTracks(loadTracks, getTrackIdentifier, TRACK_REGISTRY);
      
      // Sort all tracks alphabetically after loading
      if (this.audioControls) {
        this.audioControls.sortTrackListAlphabetically();
      }
      
      // Hide loader after API calls complete
      if (hideLoader) {
        hideLoader();
      }
    } catch (error) {
      console.error('❌ Failed to load tracks from registry:', error);
      // Hide loader even on error
      if (hideLoader) {
        hideLoader();
      }
    }
  }
  
  /**
   * Load engagement tracks from cache or API
   * @private
   */
  async _loadEngagementTracks(getTopEngagementTracks, ENGAGEMENT_TRACKS_CACHE) {
    try {
      let engagementTracks = [];
      
      // Try to load from cache first
      try {
        if (ENGAGEMENT_TRACKS_CACHE && Object.keys(ENGAGEMENT_TRACKS_CACHE).length > 0) {
          // Convert cache object to array and sort by engagement score
          engagementTracks = Object.values(ENGAGEMENT_TRACKS_CACHE)
            .sort((a, b) => {
              const scoreA = a.engagementScore || a._engagementScore || 0;
              const scoreB = b.engagementScore || b._engagementScore || 0;
              return scoreB - scoreA;
            })
            .slice(0, 150); // Use top 150 from cache
          
          console.log(`✅ Loaded ${engagementTracks.length} engagement tracks from cache`);
        }
      } catch (cacheError) {
        // Cache file doesn't exist or is invalid, fall back to API
        console.log('ℹ️  No cache found, fetching from API...');
        const engagementResult = await getTopEngagementTracks(30, 150);
        
        if (engagementResult.success && engagementResult.tracks && engagementResult.tracks.length > 0) {
          engagementTracks = engagementResult.tracks;
          console.log(`✅ Fetched ${engagementTracks.length} top engagement tracks from API`);
        }
      }
      
      if (engagementTracks.length > 0) {
        // Sort engagement tracks alphabetically by display name (case-insensitive)
        engagementTracks.sort((a, b) => {
          const nameA = (a.display_name || a.displayName || '').toLowerCase();
          const nameB = (b.display_name || b.displayName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        // Add engagement tracks to the list
        await this._addEngagementTracks(engagementTracks);
        
        console.log(`✅ Added ${engagementTracks.length} engagement tracks to selection`);
      } else {
        console.log('ℹ️  No engagement tracks found (this is optional)');
      }
    } catch (error) {
      console.warn('⚠️  Failed to load engagement tracks (this is optional):', error);
      // Continue loading registry tracks even if engagement tracks fail
    }
  }
  
  /**
   * Add engagement tracks to UI
   * @private
   */
  async _addEngagementTracks(engagementTracks) {
    for (const track of engagementTracks) {
      // Handle both snake_case (protobuf) and camelCase (JSON) field names
      const displayName = track.display_name || track.displayName;
      if (this.audioControls && displayName) {
        // Extract username from contributor_names if available
        const contributorNames = track.contributor_names || track.contributorNames || [];
        const username = contributorNames.length > 0
          ? contributorNames[0].replace('users/', '')
          : 'audiotool';
        
        try {
          await this.audioControls.addTrackFromAPI(
            displayName,
            username,
            false,
            track, // Pass pre-loaded track
            false  // Append (will sort all tracks together at the end)
          );
        } catch (trackError) {
          console.warn(`⚠️  Failed to add engagement track "${displayName}":`, trackError);
          // Continue with next track
        }
      }
    }
  }
  
  /**
   * Load registry tracks in batches
   * @private
   */
  async _loadRegistryTracks(loadTracks, getTrackIdentifier, TRACK_REGISTRY) {
    try {
      // Registry format: "songName|username": "tracks/identifier"
      const tracksToLoad = Object.keys(TRACK_REGISTRY).map(key => {
        const [songName, username] = key.split('|');
        return { songName, username };
      });
      
      console.log(`📦 Loading all ${tracksToLoad.length} validated tracks from registry...`);
      
      // Sort tracks alphabetically by song name (case-insensitive)
      tracksToLoad.sort((a, b) => a.songName.toLowerCase().localeCompare(b.songName.toLowerCase()));
      
      // Get track identifiers for tracks that have them
      const tracksWithIdentifiers = tracksToLoad.map(track => ({
        ...track,
        trackIdentifier: getTrackIdentifier(track.songName, track.username),
      }));
      
      console.log(`📦 Batch loading ${tracksWithIdentifiers.length} tracks from API...`);
      
      // Batch load all tracks in a single API call
      const batchResult = await loadTracks(tracksWithIdentifiers);
      
      if (batchResult.success) {
        // Process results and add tracks to the UI
        await this._addRegistryTracks(tracksWithIdentifiers, batchResult);
        
        console.log(`✅ Batch loaded ${Object.values(batchResult.results).filter(r => r.success).length} tracks successfully`);
      } else {
        console.warn('⚠️  Batch loading failed, falling back to individual loads');
        // Fallback to individual loading if batch fails
        await this._loadTracksIndividually(tracksToLoad);
      }
    } catch (error) {
      console.error('❌ Failed to load registry tracks:', error);
      // Continue - don't break the app if registry loading fails
    }
  }
  
  /**
   * Add registry tracks to UI
   * @private
   */
  async _addRegistryTracks(tracksWithIdentifiers, batchResult) {
    for (const trackInfo of tracksWithIdentifiers) {
      const key = `${trackInfo.songName}|${trackInfo.username}`;
      const result = batchResult.results[key];
      
      if (result && result.success && result.track) {
        // Add track to UI using pre-loaded track data (avoids duplicate API call)
        if (this.audioControls) {
          try {
            await this.audioControls.addTrackFromAPI(
              trackInfo.songName, 
              trackInfo.username, 
              false, 
              result.track // Pass pre-loaded track
            );
          } catch (trackError) {
            console.warn(`⚠️  Failed to add track "${trackInfo.songName}":`, trackError);
            // Continue with next track
          }
        }
      } else {
        const errorMsg = result?.error || 'Unknown error';
        console.warn(`⚠️  Failed to load API track "${trackInfo.songName}" (this is optional): ${errorMsg}`);
      }
    }
  }
  
  /**
   * Load tracks individually (fallback method)
   * @private
   */
  async _loadTracksIndividually(tracksToLoad) {
    for (const track of tracksToLoad) {
      try {
        if (this.audioControls) {
          await this.audioControls.addTrackFromAPI(track.songName, track.username, false);
        }
      } catch (error) {
        console.warn(`Failed to load API track "${track.songName}" (this is optional):`, error);
      }
    }
  }
}

