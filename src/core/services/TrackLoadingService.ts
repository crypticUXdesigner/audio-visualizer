// Track Loading Service
// Handles loading tracks from API (engagement tracks and registry tracks)

import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import type { AudioControls } from '../../ui/PlaybackControls.js';
import type { TrackWithEngagement, TrackInfo, LoadTracksResult, GetTopEngagementTracksResult } from '../../types/api.js';

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
  audioControls: AudioControls | null;
  
  constructor(audioControls: AudioControls | null) {
    this.audioControls = audioControls;
  }
  
  /**
   * Load all tracks (engagement + registry)
   * 
   * This is the main entry point that loads both engagement tracks
   * and registry tracks, then sorts them alphabetically.
   * 
   * @param {Function} hideLoader - Callback to hide loading spinner
   * @param {AudioControls} audioControls - Optional audio controls (if not provided, uses this.audioControls)
   * @returns {Promise<void>}
   */
  async loadAllTracks(hideLoader?: () => void, audioControls?: AudioControls | null): Promise<void> {
    try {
      // Load track registry data from JSON files first
      const { ensureTrackRegistryLoaded } = await import('../../config/trackRegistry.js');
      await ensureTrackRegistryLoaded();
      
      // Dynamically import services to avoid circular dependencies
      const { loadTracks } = await import('../../api/TrackService.js');
      const { getTopEngagementTracks } = await import('../../api/EngagementService.js');
      const { getTrackIdentifier, getENGAGEMENT_TRACKS_CACHE, getTRACK_REGISTRY } = await import('../../config/trackRegistry.js');
      
      // Get loaded data
      const TRACK_REGISTRY = getTRACK_REGISTRY();
      const ENGAGEMENT_TRACKS_CACHE = getENGAGEMENT_TRACKS_CACHE();
      
      // Load engagement tracks first
      await this._loadEngagementTracks(getTopEngagementTracks, ENGAGEMENT_TRACKS_CACHE);
      
      // Then load registry tracks
      await this._loadRegistryTracks(loadTracks, getTrackIdentifier, TRACK_REGISTRY);
      
      // Sort all tracks alphabetically after loading
      // This will also auto-select and play a random track
      const controls = audioControls || this.audioControls;
      if (controls) {
        controls.sortTrackListAlphabetically();
      }
      
      // Handle URL parameters after tracks are loaded
      await this.handleURLTrackParams(controls);
      
      // Hide loader after API calls complete
      if (hideLoader) {
        hideLoader();
      }
    } catch (error) {
      ShaderLogger.error('Failed to load tracks from registry:', error);
      // Hide loader even on error
      if (hideLoader) {
        hideLoader();
      }
    }
  }
  
  /**
   * Handle URL parameters for track and time after tracks are loaded
   * @param {AudioControls} audioControls - Audio controls instance
   * @returns {Promise<void>}
   */
  async handleURLTrackParams(audioControls: AudioControls | null): Promise<void> {
    if (!audioControls) return;
    
    try {
      const { parseTrackURLParams } = await import('../../utils/urlParams.js');
      const { track, time } = parseTrackURLParams();
      
      if (!track) return;
      
      // Wait a bit for DOM to update with track options
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Find matching track by apiTrackId (preferred) or dataset.track (fallback for local files)
      const trackOptions = document.querySelectorAll('.track-option');
      
      const matchingOption = Array.from(trackOptions).find(
        option => {
          const optionElement = option as HTMLElement;
          const apiTrackId = optionElement.dataset.apiTrackId;
          const trackUrl = optionElement.dataset.track;
          
          // Match by apiTrackId first (for API tracks)
          if (apiTrackId && apiTrackId === track) {
            return true;
          }
          
          // Fallback: match by track URL (for local files or legacy support)
          if (trackUrl) {
            // Support both exact match and .mp3 extension matching
            const trackToLoad = track.endsWith('.mp3') ? track : `${track}.mp3`;
            return trackUrl === trackToLoad || 
                   trackUrl === track ||
                   trackUrl.toLowerCase() === trackToLoad.toLowerCase();
          }
          
          return false;
        }
      ) as HTMLElement | undefined;
      
      if (matchingOption) {
        // Use the track URL for loading (apiTrackId is just for identification)
        const filename = matchingOption.dataset.track;
        if (!filename) return;
        
        // Update UI
        trackOptions.forEach(opt => opt.classList.remove('active'));
        matchingOption.classList.add('active');
        
        const trackDropdownText = document.getElementById('trackDropdownText');
        if (trackDropdownText) {
          trackDropdownText.textContent = matchingOption.textContent || '';
        }
        audioControls.updateTrackTitle(matchingOption.textContent || '');
        audioControls.updateTrackCover(matchingOption);
        
        // Load track
        const trackBPM = matchingOption.dataset.trackBpm 
          ? parseFloat(matchingOption.dataset.trackBpm) 
          : undefined;
        
        await audioControls.loadTrack(filename, { bpm: trackBPM });
        
        // Seek to specified time if provided
        if (time !== undefined && time > 0) {
          const audioElement = audioControls.audioAnalyzer.audioElement;
          if (audioElement) {
            // Wait for metadata to be loaded before seeking
            if (audioElement.readyState >= 1) {
              // Metadata already loaded
              audioElement.currentTime = Math.min(time, audioElement.duration || 0);
            } else {
              // Wait for metadata
              audioElement.addEventListener('loadedmetadata', () => {
                audioElement.currentTime = Math.min(time, audioElement.duration || 0);
              }, { once: true });
            }
          }
        }
      } else {
        ShaderLogger.warn(`Track "${track}" from URL parameter not found`);
      }
    } catch (error) {
      ShaderLogger.warn('Error handling URL track parameters:', error);
    }
  }
  
  /**
   * Load engagement tracks from cache or API
   * @private
   */
  async _loadEngagementTracks(
    getTopEngagementTracks: (days: number, limit: number) => Promise<GetTopEngagementTracksResult>,
    ENGAGEMENT_TRACKS_CACHE: Record<string, TrackWithEngagement>
  ) {
    try {
      let engagementTracks: TrackWithEngagement[] = [];
      
      // Try to load from cache first
      try {
        if (ENGAGEMENT_TRACKS_CACHE && Object.keys(ENGAGEMENT_TRACKS_CACHE).length > 0) {
          // Convert cache object to array and sort by engagement score
          engagementTracks = Object.values(ENGAGEMENT_TRACKS_CACHE)
            .sort((a: TrackWithEngagement, b: TrackWithEngagement) => {
              const scoreA = a.engagementScore || a._engagementScore || 0;
              const scoreB = b.engagementScore || b._engagementScore || 0;
              return scoreB - scoreA;
            })
            .slice(0, 150); // Use top 150 from cache
          
          ShaderLogger.info(`Loaded ${engagementTracks.length} engagement tracks from cache`);
        }
      } catch (cacheError) {
        // Cache file doesn't exist or is invalid, fall back to API
        ShaderLogger.debug('No cache found, fetching from API...');
        const engagementResult = await getTopEngagementTracks(30, 150);
        
        if (engagementResult.success && engagementResult.tracks && engagementResult.tracks.length > 0) {
          engagementTracks = engagementResult.tracks;
          ShaderLogger.info(`Fetched ${engagementTracks.length} top engagement tracks from API`);
        }
      }
      
      if (engagementTracks.length > 0) {
        // Sort engagement tracks alphabetically by display name (case-insensitive)
        engagementTracks.sort((a: TrackWithEngagement, b: TrackWithEngagement) => {
          const nameA = (a.display_name || a.displayName || '').toLowerCase();
          const nameB = (b.display_name || b.displayName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        // Add engagement tracks to the list
        await this._addEngagementTracks(engagementTracks);
        
        ShaderLogger.info(`Added ${engagementTracks.length} engagement tracks to selection`);
        } else {
        ShaderLogger.debug('No engagement tracks found (this is optional)');
        }
      } catch (error) {
      ShaderLogger.warn('Failed to load engagement tracks (this is optional):', error);
      // Continue loading registry tracks even if engagement tracks fail
    }
  }
  
  /**
   * Add engagement tracks to UI
   * @private
   */
  async _addEngagementTracks(engagementTracks: TrackWithEngagement[]) {
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
          ShaderLogger.warn(`Failed to add engagement track "${displayName}":`, trackError);
          // Continue with next track
        }
      }
    }
  }
  
  /**
   * Load registry tracks in batches
   * @private
   */
  async _loadRegistryTracks(
    loadTracks: (tracks: TrackInfo[]) => Promise<LoadTracksResult>,
    getTrackIdentifier: (songName: string, username: string) => string | null,
    TRACK_REGISTRY: Record<string, string>
  ) {
    try {
      // Registry format: "songName|username": "tracks/identifier"
      const tracksToLoad = Object.keys(TRACK_REGISTRY).map(key => {
        const [songName, username] = key.split('|');
        return { songName, username };
      });
      
      ShaderLogger.info(`Loading all ${tracksToLoad.length} validated tracks from registry...`);
      
      // Sort tracks alphabetically by song name (case-insensitive)
      tracksToLoad.sort((a, b) => a.songName.toLowerCase().localeCompare(b.songName.toLowerCase()));
      
      // Get track identifiers for tracks that have them
      const tracksWithIdentifiers = tracksToLoad.map(track => ({
        ...track,
        trackIdentifier: getTrackIdentifier(track.songName, track.username),
      }));
      
      ShaderLogger.info(`Batch loading ${tracksWithIdentifiers.length} tracks from API...`);
      
      // Batch load all tracks in a single API call
      const batchResult = await loadTracks(tracksWithIdentifiers);
      
      if (batchResult.success) {
        // Process results and add tracks to the UI
        await this._addRegistryTracks(tracksWithIdentifiers, batchResult);
        
        const successfulTracks = Object.values(batchResult.results).filter((r) => r.success);
        ShaderLogger.info(`Batch loaded ${successfulTracks.length} tracks successfully`);
      } else {
        ShaderLogger.warn('Batch loading failed, falling back to individual loads');
        // Fallback to individual loading if batch fails
        await this._loadTracksIndividually(tracksToLoad);
      }
    } catch (error) {
      ShaderLogger.error('Failed to load registry tracks:', error);
      // Continue - don't break the app if registry loading fails
    }
  }
  
  /**
   * Add registry tracks to UI
   * @private
   */
  async _addRegistryTracks(tracksWithIdentifiers: TrackInfo[], batchResult: LoadTracksResult) {
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
            ShaderLogger.warn(`Failed to add track "${trackInfo.songName}":`, trackError);
            // Continue with next track
          }
        }
      } else {
        const errorMsg = result?.error || 'Unknown error';
        ShaderLogger.warn(`Failed to load API track "${trackInfo.songName}" (this is optional): ${errorMsg}`);
      }
    }
  }
  
  /**
   * Load tracks individually (fallback method)
   * @private
   */
  async _loadTracksIndividually(tracksToLoad: Array<{ songName: string; username: string }>) {
    for (const track of tracksToLoad) {
      try {
        if (this.audioControls) {
          await this.audioControls.addTrackFromAPI(track.songName, track.username, false);
        }
      } catch (error) {
        ShaderLogger.warn(`Failed to load API track "${track.songName}" (this is optional):`, error);
      }
    }
  }
}

