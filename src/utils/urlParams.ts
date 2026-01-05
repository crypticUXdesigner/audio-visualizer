/**
 * URL Parameter Utilities
 * Handles parsing and building URL parameters for track and time
 */

export interface URLTrackParams {
    track?: string;
    time?: number;
}

/**
 * Parse URL parameters for track and time
 * @returns Object with track name and optional start time in seconds
 */
export function parseTrackURLParams(): URLTrackParams {
    const urlParams = new URLSearchParams(window.location.search);
    const track = urlParams.get('track');
    const timeParam = urlParams.get('time') || urlParams.get('t');
    
    let time: number | undefined;
    if (timeParam) {
        const parsed = parseFloat(timeParam);
        if (!isNaN(parsed) && parsed >= 0) {
            time = parsed;
        }
    }
    
    return {
        track: track || undefined,
        time
    };
}

/**
 * Build URL with track and time parameters
 * Preserves existing debug parameter if present
 * @param track - Track filename or identifier
 * @param time - Optional time in seconds
 * @param preserveDebug - Whether to preserve debug parameter (default: true)
 * @returns URL string with parameters
 */
export function buildTrackURL(track: string, time?: number, preserveDebug: boolean = true): string {
    const url = new URL(window.location.href);
    
    // Remove existing track and time params
    url.searchParams.delete('track');
    url.searchParams.delete('time');
    url.searchParams.delete('t');
    
    // Add new track parameter
    url.searchParams.set('track', track);
    
    // Add time parameter if provided
    if (time !== undefined && time > 0) {
        url.searchParams.set('time', time.toFixed(2));
    }
    
    // Preserve debug parameter if it exists and preserveDebug is true
    if (!preserveDebug) {
        url.searchParams.delete('debug');
    }
    // If preserveDebug is true and debug exists, it's already in the URL, so we keep it
    
    return url.toString();
}

