// Authentication Service
// Handles authentication for Audiotool API

import { getEnv } from '../../config/env.js';

/**
 * Production fallback client ID for public API access
 * This is a public client ID and safe to include in production builds
 */
const PRODUCTION_CLIENT_ID = '1fe600a2-08f7-4a15-953e-23d0c975ce55';

/**
 * AuthService - Manages API authentication
 * 
 * Handles loading and providing authentication credentials (tokens, client IDs)
 * for API requests. Supports both Bearer token and client ID authentication.
 */
export class AuthService {
    token: string | null;
    clientId: string | null;
    
    constructor() {
        this.token = null;
        this.clientId = null;
        this._loadCredentials();
    }
    
    /**
     * Load credentials from environment variables
     * @private
     */
    _loadCredentials(): void {
        this.token = getEnv('VITE_AUDIOTOOL_API_TOKEN') || null;
        
        // Client ID: use env var if available, otherwise use production fallback
        const envClientId = getEnv('VITE_AUDIOTOOL_CLIENT_ID');
        if (envClientId) {
            this.clientId = envClientId;
        } else if (!getEnv('DEV', false)) {
            // Production fallback - public client ID for API access
            this.clientId = PRODUCTION_CLIENT_ID;
        } else {
            this.clientId = null;
        }
    }
    
    /**
     * Get authentication headers for API requests
     * 
     * @returns Headers object with Content-Type and optional Authorization
     */
    getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
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
     * @returns Description of authentication method being used
     */
    getAuthMethod(): string {
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
     * @returns True if Bearer token is available
     */
    isAuthenticated(): boolean {
        return !!this.token;
    }
    
    /**
     * Get client ID (if available)
     * 
     * @returns Client ID or null
     */
    getClientId(): string | null {
        return this.clientId;
    }
    
    /**
     * Get masked client ID for logging (shows first 8 characters)
     * 
     * @returns Masked client ID
     */
    getMaskedClientId(): string {
        if (!this.clientId) return 'none';
        return `${this.clientId.substring(0, 8)}...`;
    }
}

