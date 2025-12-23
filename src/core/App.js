// Visual Player Application
// Main application class containing all application logic

import { safeCaptureException, safeSentrySpan } from './monitoring/SentryInit.js';
import { AudioAnalyzer } from './audio/AudioAnalyzer.js';
import { generateColorsFromOklch, rgbToHex, normalizeColor, hexToRgb, rgbToOklch, interpolateHue, calculateThresholds } from './color/ColorGenerator.js';
import { ColorModulator } from './color/ColorModulator.js';
import { ShaderManager } from '../shaders/ShaderManager.js';
import heightmapConfig from '../shaders/configs/heightmap.js';
import { colorPresets } from '../config/color-presets.js';
import { AudioControls } from '../ui/PlaybackControls.js';
import { ColorPresetSwitcher } from '../ui/ColorControls.js';
import { DevTools } from '../../tools/DevTools.js';
import { ShaderSwitcher } from '../ui/ShaderControls.js';
import { initializeApp } from './AppInitializer.js';

export class VisualPlayer {
    constructor() {
        this.audioAnalyzer = null;
        this.shaderManager = null;
        this.colors = null;
        this.colorConfig = null;
        this.colorModulator = null;
        this.audioControls = null;
        this.colorPresetSwitcher = null;
        this.shaderSwitcher = null;
        this.devTools = null;
        
        // Color initialization state
        this.isInitializingColors = false;
        this.colorsInitialized = false;
    }
    
    /**
     * Check if debug mode is enabled via URL parameter
     * @returns {boolean} True if ?debug is in the URL
     */
    isDebugMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has('debug');
    }
    
    async init() {
        // Set debug mode class on html element (already set by inline script, but ensure it's set)
        if (this.isDebugMode()) {
            document.documentElement.classList.add('debug-mode');
        }
        
        // Delegate initialization to AppInitializer
        return initializeApp(this);
    }
    
    /**
     * Show loading spinner
     */
    showLoader() {
        const loader = document.getElementById('appLoader');
        if (loader) {
            loader.classList.remove('hidden');
        }
    }
    
    /**
     * Hide loading spinner
     */
    hideLoader() {
        const loader = document.getElementById('appLoader');
        if (loader) {
            loader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                if (loader.classList.contains('hidden')) {
                    loader.style.display = 'none';
                }
            }, 300);
        }
        
        // Show controls after initial loading completes
        if (this.audioControls) {
            this.audioControls.showControls();
        }
    }
    
    /**
     * Fade in the shader canvas after first color update
     */
    fadeInCanvas() {
        const canvas = document.getElementById('backgroundCanvas');
        if (!canvas) return;
        
        console.log('fadeInCanvas called, opacity:', window.getComputedStyle(canvas).opacity);
        
        // First add the 'ready' class to enable transitions
        canvas.classList.add('ready');
        
        // Force a reflow to ensure the ready state is rendered
        canvas.offsetHeight; // eslint-disable-line no-unused-expressions
        
        // Use double RAF to ensure browser has painted
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                canvas.classList.add('visible');
                console.log('Fading in shader canvas - transition started');
            });
        });
    }
    
    /**
     * Show user-friendly error message for initialization failures
     * @param {Error} error - The error that occurred
     */
    showInitializationError(error) {
        // Hide loader on error
        this.hideLoader();
        
        // Create error message element if it doesn't exist
        let errorElement = document.getElementById('init-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'init-error-message';
            errorElement.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 30px 40px;
                border-radius: 12px;
                z-index: 10000;
                font-family: 'Lexend', sans-serif;
                font-size: 16px;
                max-width: 600px;
                text-align: center;
                box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
            `;
            document.body.appendChild(errorElement);
        }
        
        const errorMessage = error.message || 'Unknown error occurred';
        errorElement.innerHTML = `
            <h2 style="margin: 0 0 15px 0; font-size: 20px;">Initialization Error</h2>
            <p style="margin: 0 0 20px 0; line-height: 1.5;">${errorMessage}</p>
            <p style="margin: 0; font-size: 14px; opacity: 0.8;">Please refresh the page or check your browser's WebGL and audio support.</p>
        `;
        
        console.error('Initialization error displayed to user:', error);
    }
    
    initializeColors(skipFrequencyUpdate = false, audioData = null) {
        if (this.isInitializingColors) {
            return;
        }
        
        this.isInitializingColors = true;
        
        try {
            // Get color config (potentially modified by color modulator)
            let configToUse = this.colorConfig;
            
            // If color modulator exists and audio data is provided, get modified config
            if (this.colorModulator && audioData) {
                configToUse = this.colorModulator.update(audioData);
            }
            
            const generatedColors = generateColorsFromOklch(configToUse);
            
            // Map color1-color10 to color, color2-color10 format
            // Always create new object to ensure reference changes (important for preset switching)
            const newColors = {
                color: normalizeColor(generatedColors.color1),
                color2: normalizeColor(generatedColors.color2),
                color3: normalizeColor(generatedColors.color3),
                color4: normalizeColor(generatedColors.color4),
                color5: normalizeColor(generatedColors.color5),
                color6: normalizeColor(generatedColors.color6),
                color7: normalizeColor(generatedColors.color7),
                color8: normalizeColor(generatedColors.color8),
                color9: normalizeColor(generatedColors.color9),
                color10: normalizeColor(generatedColors.color10)
            };
            
            this.colors = newColors;
            this.colorsInitialized = true;
            
            // Calculate thresholds from curve
            const thresholdCurve = configToUse.thresholdCurve || [0.2, 0.2, 1.0, 0.7];
            const thresholds = calculateThresholds(thresholdCurve, 10);
            
            // Update shader manager with colors (this will update render loop with new colors)
            if (this.shaderManager) {
                this.shaderManager.setColors(this.colors);
                
                // Set threshold uniforms
                if (this.shaderManager.activeShader) {
                    const shader = this.shaderManager.activeShader;
                    shader.setUniform('uThreshold1', thresholds[0]);
                    shader.setUniform('uThreshold2', thresholds[1]);
                    shader.setUniform('uThreshold3', thresholds[2]);
                    shader.setUniform('uThreshold4', thresholds[3]);
                    shader.setUniform('uThreshold5', thresholds[4]);
                    shader.setUniform('uThreshold6', thresholds[5]);
                    shader.setUniform('uThreshold7', thresholds[6]);
                    shader.setUniform('uThreshold8', thresholds[7]);
                    shader.setUniform('uThreshold9', thresholds[8]);
                    shader.setUniform('uThreshold10', thresholds[9]);
                }
            }
            
            // Update color control sliders
            if (this.colorPresetSwitcher && this.colorPresetSwitcher.updateSlidersFromConfig) {
                this.colorPresetSwitcher.updateSlidersFromConfig(this.colorConfig);
            }
            
            // Update waveform scrubber colors
            if (this.audioControls && this.audioControls.waveformScrubber) {
                this.audioControls.waveformScrubber.setColors(this.colors);
            }
            
            // Set initial title colors
            if (this.audioControls) {
                this.audioControls.setColors(this.colors);
            }
            
            console.log('Colors initialized/updated:', Object.keys(this.colors).length, 'colors');
        } finally {
            this.isInitializingColors = false;
        }
    }
    
    /**
     * Update dynamic colors based on audio data (called from render loop)
     * @param {Object} audioData - Audio analysis data
     */
    updateDynamicColors(audioData) {
        if (!this.colorModulator || !audioData || !this.colorsInitialized) {
            return;
        }
        
        // Update title display with audio reactivity
        if (this.audioControls) {
            const currentShaderName = this.shaderManager?.activeShader?.config?.name || '';
            this.audioControls.updateTitleDisplayAudioReactivity(audioData, currentShaderName);
        }
        
        // Update color modulator with audio data
        const modifiedConfig = this.colorModulator.update(audioData);
        
        // Check if config actually changed (performance optimization)
        // We'll regenerate colors - the modulator handles change detection internally
        // But we need to avoid infinite loops, so we'll use a flag
        
        // Generate colors from modified config
        const generatedColors = generateColorsFromOklch(modifiedConfig);
        
        // Map to color format
        const newColors = {
            color: normalizeColor(generatedColors.color1),
            color2: normalizeColor(generatedColors.color2),
            color3: normalizeColor(generatedColors.color3),
            color4: normalizeColor(generatedColors.color4),
            color5: normalizeColor(generatedColors.color5),
            color6: normalizeColor(generatedColors.color6),
            color7: normalizeColor(generatedColors.color7),
            color8: normalizeColor(generatedColors.color8),
            color9: normalizeColor(generatedColors.color9),
            color10: normalizeColor(generatedColors.color9)
        };
        
        // Update colors if they changed
        let colorsChanged = false;
        if (!this.colors) {
            colorsChanged = true;
        } else {
            // Check if any color changed significantly (increased threshold for smoother updates)
            for (const key in newColors) {
                if (!this.colors[key] || 
                    Math.abs(this.colors[key][0] - newColors[key][0]) > 0.015 ||
                    Math.abs(this.colors[key][1] - newColors[key][1]) > 0.015 ||
                    Math.abs(this.colors[key][2] - newColors[key][2]) > 0.015) {
                    colorsChanged = true;
                    break;
                }
            }
        }
        
        if (colorsChanged) {
            this.colors = newColors;
            
            // Update shader manager with new colors
            if (this.shaderManager) {
                this.shaderManager.setColors(this.colors);
            }
            
            // Update waveform scrubber colors
            if (this.audioControls && this.audioControls.waveformScrubber) {
                this.audioControls.waveformScrubber.setColors(this.colors);
            }
            
            // Update audio controls title colors
            if (this.audioControls) {
                this.audioControls.setColors(this.colors);
            }
        }
    }
    
    initUI() {
        // Initialize audio controls
        this.audioControls = new AudioControls(this.audioAnalyzer, this.shaderManager);
        
        // Update title with current track (if any)
        const trackDropdownText = document.getElementById('trackDropdownText');
        if (trackDropdownText && trackDropdownText.textContent) {
            this.audioControls.updateTrackTitle(trackDropdownText.textContent);
        }
        
        // Set up track change callback for random color preset selection
        this.audioControls.onTrackChange = () => {
            if (this.colorPresetSwitcher) {
                this.colorPresetSwitcher.selectRandomPreset();
            }
        };
        
        // Load tracks from TrackService dynamically using batch loading
        // This happens asynchronously so it doesn't block initialization
        setTimeout(async () => {
            try {
                // Import the batch loading function
                const { loadTracks } = await import('../api/TrackService.js');
                const { getTopEngagementTracks } = await import('../api/EngagementService.js');
                const { getTrackIdentifier, TRACK_REGISTRY, ENGAGEMENT_TRACKS_CACHE } = await import('../config/trackRegistry.js');
                
                // First, load top engagement tracks from cache (or API fallback)
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
                        for (const track of engagementTracks) {
                            // Handle both snake_case (protobuf) and camelCase (JSON) field names
                            const displayName = track.display_name || track.displayName;
                            if (this.audioControls && displayName) {
                                // Extract username from contributor_names if available
                                const contributorNames = track.contributor_names || track.contributorNames || [];
                                const username = contributorNames.length > 0
                                    ? contributorNames[0].replace('users/', '')
                                    : 'audiotool';
                                
                                await this.audioControls.addTrackFromAPI(
                                    displayName,
                                    username,
                                    false,
                                    track, // Pass pre-loaded track
                                    false  // Append (will sort all tracks together at the end)
                                );
                            }
                        }
                        
                        console.log(`✅ Added ${engagementTracks.length} engagement tracks to selection`);
                    } else {
                        console.log('ℹ️  No engagement tracks found (this is optional)');
                    }
                } catch (error) {
                    console.warn('⚠️  Failed to load engagement tracks (this is optional):', error);
                    // Continue loading registry tracks even if engagement tracks fail
                }
                
                // Then, load tracks from the validated registry (170+ tracks)
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
                    for (const trackInfo of tracksWithIdentifiers) {
                        const key = `${trackInfo.songName}|${trackInfo.username}`;
                        const result = batchResult.results[key];
                        
                        if (result && result.success && result.track) {
                            // Add track to UI using pre-loaded track data (avoids duplicate API call)
                            if (this.audioControls) {
                                await this.audioControls.addTrackFromAPI(
                                    trackInfo.songName, 
                                    trackInfo.username, 
                                    false, 
                                    result.track // Pass pre-loaded track
                                );
                            }
                        } else {
                            const errorMsg = result?.error || 'Unknown error';
                            console.warn(`⚠️  Failed to load API track "${trackInfo.songName}" (this is optional): ${errorMsg}`);
                        }
                    }
                    
                    console.log(`✅ Batch loaded ${Object.values(batchResult.results).filter(r => r.success).length} tracks successfully`);
                } else {
                    console.warn('⚠️  Batch loading failed, falling back to individual loads');
                    // Fallback to individual loading if batch fails
                    for (const track of tracksToLoad) {
                        this.loadAPITrack(track.songName, track.username).catch(error => {
                            console.warn(`Failed to load API track "${track.songName}" (this is optional):`, error);
                        });
                    }
                }
                
                // Sort all tracks alphabetically after loading
                if (this.audioControls) {
                    this.audioControls.sortTrackListAlphabetically();
                }
                
                // Hide loader after API calls complete
                this.hideLoader();
            } catch (error) {
                console.error('❌ Failed to load tracks from registry:', error);
                // Hide loader even on error
                this.hideLoader();
            }
        }, 1000); // Wait 1 second after initialization to load API tracks
        
        // Initialize color preset switcher
        this.colorPresetSwitcher = new ColorPresetSwitcher(
            colorPresets,
            (presetConfig) => {
                // Update color config and regenerate colors
                // Deep merge to preserve structure
                if (presetConfig.baseHue) this.colorConfig.baseHue = presetConfig.baseHue;
                if (presetConfig.darkest) Object.assign(this.colorConfig.darkest, presetConfig.darkest);
                if (presetConfig.brightest) Object.assign(this.colorConfig.brightest, presetConfig.brightest);
                if (presetConfig.interpolationCurve) this.colorConfig.interpolationCurve = presetConfig.interpolationCurve;
                
                // Calculate and store actual hue values for sliders
                if (presetConfig.baseHue && presetConfig.darkest.hueOffset !== undefined) {
                    const baseRgb = hexToRgb(presetConfig.baseHue);
                    const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
                    this.colorConfig.darkest.hue = interpolateHue(baseH, baseH + presetConfig.darkest.hueOffset, 1.0);
                }
                if (presetConfig.baseHue && presetConfig.brightest.hueOffset !== undefined) {
                    const baseRgb = hexToRgb(presetConfig.baseHue);
                    const [baseL, baseC, baseH] = rgbToOklch(baseRgb);
                    this.colorConfig.brightest.hue = interpolateHue(baseH, baseH + presetConfig.brightest.hueOffset, 1.0);
                }
                
                // Update color modulator with new base config
                if (this.colorModulator) {
                    this.colorModulator.setBaseConfig(this.colorConfig);
                }
                
                // Regenerate colors (this will update shader manager)
                this.initializeColors();
            },
            (property, value, target) => {
                // Handle individual property changes from sliders
                if (target === 'darkest' && this.colorConfig.darkest) {
                    this.colorConfig.darkest[property] = value;
                } else if (target === 'brightest' && this.colorConfig.brightest) {
                    this.colorConfig.brightest[property] = value;
                }
                
                // Update color modulator with new base config
                if (this.colorModulator) {
                    this.colorModulator.setBaseConfig(this.colorConfig);
                }
                
                // Regenerate colors
                this.initializeColors();
            },
            () => {
                // Provide current color config when menu opens
                return this.colorConfig;
            },
            this.audioControls // Pass audioControls for menu open/close behavior
        );
        
        // Initialize shader switcher
        this.shaderSwitcher = new ShaderSwitcher(
            this.shaderManager,
            (shaderName) => {
                // Optional callback when shader changes
                console.log(`Shader switched to: ${shaderName}`);
            },
            this.audioControls // Pass audioControls for menu open/close behavior
        );
        
        // Shader parameter panel removed - controls are now hardcoded
    }
    
    initDevTools() {
        this.devTools = new DevTools();
    }
    
    initTopControls() {
        // Initialize default loudness controls state (for backward compatibility)
        window._loudnessControls = {
            loudnessAnimationEnabled: true,
            loudnessThreshold: 0.1
        };
        
    }
    
    /**
     * Load a track from the Audiotool TrackService and add it to the track selection
     * @param {string} songName - Name of the song
     * @param {string} username - Username (deprecated, not used)
     * @param {boolean} autoLoad - Whether to automatically load the track after adding
     */
    async loadAPITrack(songName, username, autoLoad = false) {
        if (!this.audioControls) {
            console.warn('AudioControls not initialized yet');
            return;
        }
        
        try {
            const result = await this.audioControls.addTrackFromAPI(songName, username, autoLoad);
            if (result) {
                console.log(`✅ Successfully added "${songName}" to track selection`);
            }
            // If result is null, track wasn't found - already logged in addTrackFromAPI, skip silently
        } catch (error) {
            // Only log unexpected errors, not "track not found" errors
            if (!error.message?.includes('not found') && !error.message?.includes('Failed to load')) {
                console.warn(`⚠️  Unexpected error loading track "${songName}" by ${username}:`, error.message || error);
            }
        }
    }
    
    exposeGlobalAPI() {
        // Expose color presets globally for backward compatibility
        window.colorPresets = colorPresets;
        
        // Expose getColorForFrequencyRange for frequency visualizer
        window.getColorForFrequencyRange = (minHz, maxHz) => {
            if (!this.colors || !this.colors.color) {
                return '#ffffff';
            }
            
            const centerHz = (minHz + maxHz) / 2;
            
            // Map frequency bands to colors
            if (centerHz >= 11314) return rgbToHex(this.colors.color);
            if (centerHz >= 5657) return rgbToHex(this.colors.color2);
            if (centerHz >= 2828) return rgbToHex(this.colors.color3);
            if (centerHz >= 1414) return rgbToHex(this.colors.color4);
            if (centerHz >= 707) return rgbToHex(this.colors.color5);
            if (centerHz >= 354) return rgbToHex(this.colors.color6);
            if (centerHz >= 177) return rgbToHex(this.colors.color7);
            if (centerHz >= 44) return rgbToHex(this.colors.color8);
            return rgbToHex(this.colors.color9);
        };
        
        // Expose BackgroundShader API for backward compatibility
        window.BackgroundShader = {
            setColorConfig: (newConfig) => {
                Object.assign(this.colorConfig, newConfig);
                this.initializeColors();
            },
            getColorConfig: () => {
                return JSON.parse(JSON.stringify(this.colorConfig));
            },
            regenerateColors: () => {
                this.initializeColors();
            },
            setParameter: (name, value) => {
                if (this.shaderManager) {
                    return this.shaderManager.setParameter(name, value);
                }
                return false;
            },
            getParameter: (name) => {
                if (this.shaderManager) {
                    return this.shaderManager.getParameter(name);
                }
                return null;
            }
        };
        
        // Expose main app instance
        window.VisualPlayer = this;
    }
}

