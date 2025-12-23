// Authentication Service
// Handles authentication for Audiotool API

/**
 * AuthService - Manages API authentication
 * 
 * Handles loading and providing authentication credentials (tokens, client IDs)
 * for API requests. Supports both Bearer token and client ID authentication.
 */
export class AuthService {
  constructor() {
    this.token = null;
    this.clientId = null;
    this._loadCredentials();
  }
  
  /**
   * Load credentials from environment variables
   * @private
   */
  _loadCredentials() {
    this.token = import.meta.env.VITE_AUDIOTOOL_API_TOKEN || null;
    
    // Client ID: use env var if available, otherwise use production fallback
    const envClientId = import.meta.env.VITE_AUDIOTOOL_CLIENT_ID;
    if (envClientId) {
      this.clientId = envClientId;
    } else if (!import.meta.env.DEV) {
      // Production fallback - public client ID for API access
      this.clientId = '1fe600a2-08f7-4a15-953e-23d0c975ce55';
    } else {
      this.clientId = null;
    }
  }
  
  /**
   * Get authentication headers for API requests
   * 
   * @returns {Object} Headers object with Content-Type and optional Authorization
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }
  
  /**
   * Get authentication method description (for logging)
   * 
   * @returns {string} Description of authentication method being used
   */
  getAuthMethod() {
    if (this.token) {
      return 'Bearer token';
    }
    if (this.clientId) {
      return 'Client ID';
    }
    return 'Unauthenticated';
  }
  
  /**
   * Check if authenticated with Bearer token
   * 
   * @returns {boolean} True if Bearer token is available
   */
  isAuthenticated() {
    return !!this.token;
  }
  
  /**
   * Get client ID (if available)
   * 
   * @returns {string|null} Client ID or null
   */
  getClientId() {
    return this.clientId;
  }
  
  /**
   * Get masked client ID for logging (shows first 8 characters)
   * 
   * @returns {string} Masked client ID
   */
  getMaskedClientId() {
    if (!this.clientId) return 'none';
    return `${this.clientId.substring(0, 8)}...`;
  }
}

