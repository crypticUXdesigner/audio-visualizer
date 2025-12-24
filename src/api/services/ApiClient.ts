// API Client Service
// Base HTTP client for making API requests with error handling and timeouts

import { API_CONFIG } from '../../config/constants.js';
import { withTimeout } from '../../utils/promises.js';
import type { AuthService } from './AuthService.js';
import type { ApiClientOptions, ApiError } from '../types/api.js';

export class ApiClient {
    baseUrl: string;
    authService: AuthService;
    
    constructor(baseUrl: string, authService: AuthService) {
        this.baseUrl = baseUrl;
        this.authService = authService;
    }
    
    /**
     * Make API request
     * 
     * @param endpoint - API endpoint (relative to baseUrl)
     * @param options - Request options
     * @param options.method - HTTP method
     * @param options.body - Request body (will be JSON stringified)
     * @param options.headers - Additional headers
     * @returns Parsed JSON response of type T
     * @throws ApiError If request fails or times out
     */
    async request<T = unknown>(endpoint: string, options: ApiClientOptions = {}): Promise<T> {
        const url = `${this.baseUrl}/${endpoint}`;
        const headers: Record<string, string> = {
            ...this.authService.getAuthHeaders(),
            ...options.headers,
        };
        
        // Use promise utility for timeout handling
        const fetchPromise = fetch(url, {
            method: options.method || 'POST',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: 'omit',
        }).then(async (response) => {
            if (!response.ok) {
                throw await this._handleErrorResponse(response, endpoint);
            }
            return response.json() as Promise<T>;
        });
        
        return withTimeout(
            fetchPromise,
            API_CONFIG.TIMEOUT,
            `Request to ${endpoint} timed out`
        );
    }
    
    /**
     * Handle error response and format error message
     * @private
     */
    async _handleErrorResponse(response: Response, endpoint: string): Promise<ApiError> {
        let errorText = '';
        try {
            errorText = await response.text();
        } catch (e) {
            errorText = response.statusText;
        }
        
        let errorMessage = `${response.status} ${response.statusText}`;
        
        // Try to parse as JSON error
        try {
            const errorJson = JSON.parse(errorText) as { message?: string; error?: string };
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
        
        const error = new Error(errorMessage) as ApiError;
        error.status = response.status;
        error.endpoint = endpoint;
        return error;
    }
}

