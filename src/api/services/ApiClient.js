// API Client Service
// Base HTTP client for making API requests with error handling and timeouts

import { API_CONFIG } from '../../config/constants.js';

/**
 * ApiClient - Base HTTP client for API requests
 * 
 * Handles:
 * - Request timeouts
 * - Error response parsing
 * - Authentication header injection
 * - Error message formatting
 */
export class ApiClient {
  constructor(baseUrl, authService) {
    this.baseUrl = baseUrl;
    this.authService = authService;
  }
  
  /**
   * Make API request
   * 
   * @param {string} endpoint - API endpoint (relative to baseUrl)
   * @param {Object} [options={}] - Request options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {Object} [options.body] - Request body (will be JSON stringified)
   * @param {Object} [options.headers={}] - Additional headers
   * @returns {Promise<Object>} Parsed JSON response
   * @throws {Error} If request fails or times out
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/${endpoint}`;
    const headers = {
      ...this.authService.getAuthHeaders(),
      ...options.headers,
    };
    
    // Add timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
    
    try {
      const response = await fetch(url, {
        method: options.method || 'POST',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: 'omit',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw await this._handleErrorResponse(response, endpoint);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request to ${endpoint} timed out after ${API_CONFIG.TIMEOUT}ms`);
      }
      
      throw error;
    }
  }
  
  /**
   * Handle error response and format error message
   * @private
   */
  async _handleErrorResponse(response, endpoint) {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch (e) {
      errorText = response.statusText;
    }
    
    let errorMessage = `${response.status} ${response.statusText}`;
    
    // Try to parse as JSON error
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.error || errorMessage;
    } catch (e) {
      if (errorText) {
        errorMessage += ` - ${errorText}`;
      }
    }
    
    // Add helpful hints for authentication issues
    if (response.status === 401 || response.status === 403) {
      if (!this.authService.isAuthenticated() && !this.authService.getClientId()) {
        errorMessage += '\n💡 Tip: Public API may require client ID. Set VITE_AUDIOTOOL_CLIENT_ID in your environment.';
      } else if (!this.authService.isAuthenticated() && this.authService.getClientId()) {
        errorMessage += '\n💡 Tip: This endpoint may require a Bearer token. Set VITE_AUDIOTOOL_API_TOKEN in your environment.';
      }
    }
    
    const error = new Error(errorMessage);
    error.status = response.status;
    error.endpoint = endpoint;
    return error;
  }
}

