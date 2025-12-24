// Audio Loader Module
// Handles audio track loading, audio element management, and source node creation

import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';
import { EventListenerManager } from '../../utils/eventListenerManager.js';

/**
 * Options for loading audio tracks
 */
export interface LoadTrackOptions {
    bpm?: number;
    volume?: number;
    startTime?: number;
    // Allow additional properties for future extensibility
    [key: string]: unknown;
}

export class AudioLoader {
    audioContext: AudioContext;
    splitter: ChannelSplitterNode;
    
    // Audio element and source
    audioElement: HTMLAudioElement | null = null;
    source: MediaElementAudioSourceNode | null = null;
    
    // Event listener manager for proper cleanup
    private eventListenerManager: EventListenerManager;
    
    constructor(audioContext: AudioContext, splitter: ChannelSplitterNode) {
        this.audioContext = audioContext;
        this.splitter = splitter;
        
        // Audio element and source
        this.audioElement = null;
        this.source = null;
        
        // Initialize event listener manager
        this.eventListenerManager = new EventListenerManager();
    }
    
    /**
     * Load an audio track
     * @param filePath - Path or URL to audio file
     * @param options - Loading options
     * @param onMetadataLoaded - Callback when metadata is loaded
     * @returns The loaded audio element
     */
    async loadTrack(
        filePath: string,
        _options: LoadTrackOptions = {},
        onMetadataLoaded: ((audioElement: HTMLAudioElement) => void) | null = null
    ): Promise<HTMLAudioElement> {
        try {
            // Resume audio context if suspended (browser autoplay policy)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Stop current if playing
            if (this.audioElement) {
                this.audioElement.pause();
                if (this.source) {
                    this.source.disconnect();
                }
            }
            
            // Check if it's a full URL (http/https) - use as-is
            let cleanPath: string;
            if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                cleanPath = filePath;
            } else {
                // Get base URL from Vite (handles both dev and production)
                const baseUrl = import.meta.env.BASE_URL || '/';
                
                // Normalize the path: if it starts with /, remove it; otherwise use as-is
                // Then prepend base URL
                const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
                const absolutePath = baseUrl + normalizedPath;
                
                // Ensure base URL doesn't have double slashes
                cleanPath = absolutePath.replace(/([^:]\/)\/+/g, '$1');
            }
            
            // Remove old listeners if they exist (cleanup before creating new audio element)
            if (this.audioElement) {
                this.eventListenerManager.removeAll(this.audioElement);
            }
            
            // Create audio element
            this.audioElement = new Audio(cleanPath);
            this.audioElement.crossOrigin = 'anonymous'; // For CORS when using API later
            
            // Ensure playbackRate is 1.0 (normal speed)
            if (this.audioElement.playbackRate !== 1.0) {
                ShaderLogger.warn(`Audio playbackRate is ${this.audioElement.playbackRate}, resetting to 1.0`);
                this.audioElement.playbackRate = 1.0;
            }
            
            // Define event listeners
            const onLoadedMetadata = () => {
                // Metadata loaded - audio is ready
                if (onMetadataLoaded && this.audioElement) {
                    onMetadataLoaded(this.audioElement);
                }
            };
            
            const onError = (e: Event) => {
                ShaderLogger.error('Audio loading error:', e, this.audioElement?.error);
            };
            
            const onCanPlay = () => {
                // Audio can start playing
            };
            
            // Add event listeners using EventListenerManager for proper tracking
            this.eventListenerManager.add(this.audioElement, 'loadedmetadata', onLoadedMetadata);
            this.eventListenerManager.add(this.audioElement, 'error', onError);
            this.eventListenerManager.add(this.audioElement, 'canplay', onCanPlay);
            
            // Create source node
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            
            // Connect to splitter for stereo analysis
            // Note: Caller (AudioAnalyzer) will handle connecting to analysers and destination
            this.source.connect(this.splitter);
            
            return this.audioElement;
        } catch (error) {
            ShaderLogger.error('Error loading track:', error);
            throw error;
        }
    }
    
    /**
     * Get the current audio element
     * @returns HTMLAudioElement or null
     */
    getAudioElement(): HTMLAudioElement | null {
        return this.audioElement;
    }
    
    /**
     * Get the current source node
     * @returns MediaElementAudioSourceNode or null
     */
    getSource(): MediaElementAudioSourceNode | null {
        return this.source;
    }
    
    /**
     * Clean up and disconnect audio resources
     */
    cleanup(): void {
        if (this.audioElement) {
            this.audioElement.pause();
            // Remove all tracked event listeners
            this.eventListenerManager.removeAll(this.audioElement);
        }
        
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        
        // Clean up all event listeners
        this.eventListenerManager.cleanup();
        
        this.audioElement = null;
    }
}

