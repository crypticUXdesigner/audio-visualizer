// Audiograph Service API Client
// Handles audiograph/waveform API: getAudiographs()

import { safeCaptureException, safeSentrySpan } from '../core/monitoring/SentryInit.js';
import { API_CONFIG } from '../config/constants.js';

/**
 * Get the API token from environment variables (optional for public endpoints)
 * @returns {Promise<string|null>} The API token, or null if not set
 */
async function getToken() {
  const token = import.meta.env.VITE_AUDIOTOOL_API_TOKEN;
  return token || null;
}

/**
 * Call the AudiographService using Connect RPC format
 * @param {string} method - The RPC method name (e.g., "GetAudiographs")
 * @param {object} request - The request payload
 * @returns {Promise<object>} The response
 */
async function callAudiographService(method, request) {
  const token = await getToken();
  const baseUrl = 'https://rpc.audiotool.com';
  const serviceName = 'audiotool.audiograph.v1.AudiographService';
  const url = `${baseUrl}/${serviceName}/${method}`;
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  console.log(`🎨 Calling AudiographService.${method}`);
  
  // Add timeout handling for API calls
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
  
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(request),
      credentials: 'omit',
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`AudiographService.${method} request timed out after 30 seconds`);
    }
    throw error;
  }
  
  clearTimeout(timeoutId);
  
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
  
  return await response.json();
}

/**
 * Get audiograph waveform data for tracks
 * @param {string|string[]} trackNames - Track name(s) in format "tracks/{id}"
 * @param {number} resolution - Resolution (120, 240, 480, 960, 1920, 3840)
 * @param {boolean} stereo - Whether to get stereo (true) or mono (false)
 * @returns {Promise<object>} Audiograph data with RMS values
 */
export async function getAudiographs(trackNames, resolution = 1920, stereo = false) {
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
        
        const request = {
          resource_names: normalizedNames,
          resolution: resolution,
          channels: stereo ? 2 : 1, // 2 = STEREO, 1 = MONO
        };
        
        console.log(`📊 Fetching audiographs for ${normalizedNames.length} track(s) at ${resolution}px resolution`);
        
        const result = await callAudiographService('GetAudiographs', request);
        
        span.setAttribute('audiographs.count', result.audiographs?.length || 0);
        span.setAttribute('audiographs.resolution', resolution);
        span.setAttribute('audiographs.stereo', stereo);
        
        return {
          success: true,
          audiographs: result.audiographs || [],
        };
      } catch (error) {
        console.error('❌ Failed to get audiographs:', error);
        safeCaptureException(error);
        return {
          success: false,
          audiographs: [],
          error: error.message || String(error),
        };
      }
    }
  );
}

