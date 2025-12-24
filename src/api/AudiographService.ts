// Audiograph Service API Client
// Handles audiograph/waveform API: getAudiographs()

import { safeCaptureException, safeSentrySpan } from '../core/monitoring/SentryInit.js';
import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import { API_CONFIG } from '../config/constants.js';
import { withTimeout } from '../utils/promises.js';

/**
 * Audiograph data structure from API
 */
export interface Audiograph {
    resource_name?: string;
    rms?: number[];
    graphs?: Array<{ values?: number[] }>;
    // Allow additional properties from API
    [key: string]: unknown;
}

/**
 * Request structure for GetAudiographs
 */
export interface GetAudiographsRequest {
    resource_names: string[];
    resolution: number;
    channels: number;
}

/**
 * Response structure from GetAudiographs API
 */
export interface GetAudiographsResponse {
    audiographs?: Audiograph[];
    // Allow additional response properties
    [key: string]: unknown;
}

interface GetAudiographsResult {
    success: boolean;
    audiographs: Audiograph[];
    error?: string;
}

/**
 * Get the API token from environment variables (optional for public endpoints)
 * @returns The API token, or null if not set
 */
async function getToken(): Promise<string | null> {
    const token = import.meta.env.VITE_AUDIOTOOL_API_TOKEN;
    return token || null;
}

/**
 * Call the AudiographService using Connect RPC format
 * @param method - The RPC method name (e.g., "GetAudiographs")
 * @param request - The request payload
 * @returns The response
 */
async function callAudiographService(method: string, request: GetAudiographsRequest): Promise<GetAudiographsResponse> {
    const token = await getToken();
    const baseUrl = 'https://rpc.audiotool.com';
    const serviceName = 'audiotool.audiograph.v1.AudiographService';
    const url = `${baseUrl}/${serviceName}/${method}`;
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    ShaderLogger.info(`🎨 Calling AudiographService.${method}`);
    
    // Use promise utility for timeout handling
    const fetchPromise = fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(request),
        credentials: 'omit',
    }).then(async (response) => {
        if (!response.ok) {
            let errorText = '';
            try {
                errorText = await response.text();
            } catch (e) {
                errorText = response.statusText;
            }
            
            const errorMessage = `AudiographService.${method} failed: ${response.status} ${errorText}`;
            throw new Error(errorMessage);
        }
        
        return response.json() as Promise<GetAudiographsResponse>;
    });
    
    return withTimeout(
        fetchPromise,
        API_CONFIG.TIMEOUT,
        `AudiographService.${method} request timed out`
    );
}

/**
 * Get audiograph waveform data for tracks
 * @param trackNames - Track name(s) in format "tracks/{id}"
 * @param resolution - Resolution (120, 240, 480, 960, 1920, 3840)
 * @param stereo - Whether to get stereo (true) or mono (false)
 * @returns Audiograph data with RMS values
 */
export async function getAudiographs(
    trackNames: string | string[], 
    resolution: number = 1920, 
    stereo: boolean = false
): Promise<GetAudiographsResult> {
    return safeSentrySpan(
        {
            op: 'http.client',
            name: 'Get Audiographs',
        },
        async (span) => {
            try {
                // Normalize to array
                const names = Array.isArray(trackNames) ? trackNames : [trackNames];
                
                // Ensure track names are in correct format
                const normalizedNames = names.map(name => 
                    name.startsWith('tracks/') ? name : `tracks/${name}`
                );
                
                const request: GetAudiographsRequest = {
                    resource_names: normalizedNames,
                    resolution: resolution,
                    channels: stereo ? 2 : 1, // 2 = STEREO, 1 = MONO
                };
                
                ShaderLogger.info(`Fetching audiographs for ${normalizedNames.length} track(s) at ${resolution}px resolution`);
                
                const result = await callAudiographService('GetAudiographs', request);
                
                span.setAttribute('audiographs.count', result.audiographs?.length || 0);
                span.setAttribute('audiographs.resolution', resolution);
                span.setAttribute('audiographs.stereo', stereo);
                
                return {
                    success: true,
                    audiographs: result.audiographs || [],
                };
            } catch (error) {
                ShaderLogger.error('Failed to get audiographs:', error);
                safeCaptureException(error as Error);
                return {
                    success: false,
                    audiographs: [],
                    error: (error as Error).message || String(error),
                };
            }
        }
    );
}

