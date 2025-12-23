// Audio Loader Module
// Handles audio track loading, audio element management, and source node creation

export class AudioLoader {
    constructor(audioContext, splitter) {
        this.audioContext = audioContext;
        this.splitter = splitter;
        
        // Audio element and source
        this.audioElement = null;
        this.source = null;
        
        // Event listener references for cleanup
        this._onLoadedMetadata = null;
        this._onError = null;
        this._onCanPlay = null;
    }
    
    /**
     * Load an audio track
     * @param {string} filePath - Path or URL to audio file
     * @param {Object} options - Loading options
     * @param {Function} onMetadataLoaded - Callback when metadata is loaded
     * @returns {Promise<HTMLAudioElement>} The loaded audio element
     */
    async loadTrack(filePath, options = {}, onMetadataLoaded = null) {
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
            let cleanPath;
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
            if (this.audioElement && this._onLoadedMetadata) {
                this.audioElement.removeEventListener('loadedmetadata', this._onLoadedMetadata);
                this.audioElement.removeEventListener('error', this._onError);
                this.audioElement.removeEventListener('canplay', this._onCanPlay);
            }
            
            // Create audio element
            this.audioElement = new Audio(cleanPath);
            this.audioElement.crossOrigin = 'anonymous'; // For CORS when using API later
            
            // Ensure playbackRate is 1.0 (normal speed)
            if (this.audioElement.playbackRate !== 1.0) {
                console.warn(`⚠️  Audio playbackRate is ${this.audioElement.playbackRate}, resetting to 1.0`);
                this.audioElement.playbackRate = 1.0;
            }
            
            // Store event listener references for cleanup
            this._onLoadedMetadata = () => {
                // Metadata loaded - audio is ready
                if (onMetadataLoaded) {
                    onMetadataLoaded(this.audioElement);
                }
            };
            
            this._onError = (e) => {
                console.error('Audio loading error:', e, this.audioElement.error);
            };
            
            this._onCanPlay = () => {
                // Audio can start playing
            };
            
            // Add event listeners to track audio loading and metadata
            this.audioElement.addEventListener('loadedmetadata', this._onLoadedMetadata);
            this.audioElement.addEventListener('error', this._onError);
            this.audioElement.addEventListener('canplay', this._onCanPlay);
            
            // Create source node
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            
            // Connect to splitter for stereo analysis
            // Note: Caller (AudioAnalyzer) will handle connecting to analysers and destination
            this.source.connect(this.splitter);
            
            return this.audioElement;
        } catch (error) {
            console.error('Error loading track:', error);
            throw error;
        }
    }
    
    /**
     * Get the current audio element
     * @returns {HTMLAudioElement|null}
     */
    getAudioElement() {
        return this.audioElement;
    }
    
    /**
     * Get the current source node
     * @returns {MediaElementAudioSourceNode|null}
     */
    getSource() {
        return this.source;
    }
    
    /**
     * Clean up and disconnect audio resources
     */
    cleanup() {
        if (this.audioElement) {
            this.audioElement.pause();
            if (this._onLoadedMetadata) {
                this.audioElement.removeEventListener('loadedmetadata', this._onLoadedMetadata);
            }
            if (this._onError) {
                this.audioElement.removeEventListener('error', this._onError);
            }
            if (this._onCanPlay) {
                this.audioElement.removeEventListener('canplay', this._onCanPlay);
            }
        }
        
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        
        this.audioElement = null;
        this._onLoadedMetadata = null;
        this._onError = null;
        this._onCanPlay = null;
    }
}

