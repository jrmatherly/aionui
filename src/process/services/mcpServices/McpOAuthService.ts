/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MCPOAuthConfig } from '@office-ai/aioncli-core/dist/src/mcp/oauth-provider.js';
import { MCPOAuthProvider, OAUTH_DISPLAY_MESSAGE_EVENT } from '@office-ai/aioncli-core/dist/src/mcp/oauth-provider.js';
import { MCPOAuthTokenStorage } from '@office-ai/aioncli-core/dist/src/mcp/oauth-token-storage.js';
import { EventEmitter } from 'node:events';
import type { IMcpServer } from '../../../common/storage';
import { mcpLogger as log } from '@/common/logger';

export interface OAuthStatus {
  isAuthenticated: boolean;
  needsLogin: boolean;
  error?: string;
}

/**
 * MCP OAuth Service
 *
 * Responsible for managing the OAuth authentication flow for MCP servers
 * Uses @office-ai/aioncli-core OAuth functionality
 */
export class McpOAuthService {
  private oauthProvider: MCPOAuthProvider;
  private tokenStorage: MCPOAuthTokenStorage;
  private eventEmitter: EventEmitter;

  constructor() {
    this.tokenStorage = new MCPOAuthTokenStorage();
    this.oauthProvider = new MCPOAuthProvider(this.tokenStorage);
    this.eventEmitter = new EventEmitter();

    // Listen for OAuth display message events
    this.eventEmitter.on(OAUTH_DISPLAY_MESSAGE_EVENT, (message: string) => {
      log.info({ message }, 'OAuth Message');
      // Can be sent to frontend via WebSocket
    });
  }

  /**
   * Check if MCP server requires OAuth authentication
   * Determines by attempting to connect and checking the WWW-Authenticate header
   */
  async checkOAuthStatus(server: IMcpServer): Promise<OAuthStatus> {
    try {
      // Only HTTP/SSE transport types support OAuth
      if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
        return {
          isAuthenticated: true,
          needsLogin: false,
        };
      }

      const url = server.transport.url;
      if (!url) {
        return {
          isAuthenticated: false,
          needsLogin: false,
          error: 'No URL provided',
        };
      }

      // Try to access MCP server
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      // Check if 401 Unauthorized is returned
      if (response.status === 401) {
        const wwwAuthenticate = response.headers.get('WWW-Authenticate');

        if (wwwAuthenticate) {
          // Server requires OAuth authentication
          // Check if there is a stored token
          const credentials = await this.tokenStorage.getCredentials(server.name);

          if (credentials && credentials.token) {
            // Has token, but may be expired
            const isExpired = this.tokenStorage.isTokenExpired(credentials.token);

            return {
              isAuthenticated: !isExpired,
              needsLogin: isExpired,
              error: isExpired ? 'Token expired' : undefined,
            };
          }

          // No token, need to login
          return {
            isAuthenticated: false,
            needsLogin: true,
          };
        }
      }

      // Connection successful or no authentication required
      return {
        isAuthenticated: true,
        needsLogin: false,
      };
    } catch (error) {
      log.error({ err: error }, 'Error checking OAuth status');
      return {
        isAuthenticated: false,
        needsLogin: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute OAuth login flow
   */
  async login(server: IMcpServer, oauthConfig?: MCPOAuthConfig): Promise<{ success: boolean; error?: string }> {
    try {
      // Only HTTP/SSE transport types support OAuth
      if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
        return {
          success: false,
          error: 'OAuth only supported for HTTP/SSE transport',
        };
      }

      const url = server.transport.url;
      if (!url) {
        return {
          success: false,
          error: 'No URL provided',
        };
      }

      // If no OAuth config provided, try to discover from server
      let config = oauthConfig;
      if (!config) {
        // Use default config, OAuth provider will try auto-discovery
        config = {
          enabled: true,
        };
      }

      // Execute OAuth authentication flow
      await this.oauthProvider.authenticate(server.name, config, url, this.eventEmitter);

      log.info({ serverName: server.name }, 'OAuth login successful');
      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'OAuth login failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get valid access token
   */
  async getValidToken(server: IMcpServer, oauthConfig?: MCPOAuthConfig): Promise<string | null> {
    try {
      const config = oauthConfig || { enabled: true };
      return await this.oauthProvider.getValidToken(server.name, config);
    } catch (error) {
      log.error({ err: error }, 'Failed to get valid token');
      return null;
    }
  }

  /**
   * Logout (delete stored token)
   */
  async logout(serverName: string): Promise<void> {
    try {
      await this.tokenStorage.deleteCredentials(serverName);
      log.info({ serverName }, 'Logged out from server');
    } catch (error) {
      log.error({ err: error }, 'Failed to logout');
      throw error;
    }
  }

  /**
   * Get list of all authenticated servers
   */
  async getAuthenticatedServers(): Promise<string[]> {
    try {
      return await this.tokenStorage.listServers();
    } catch (error) {
      log.error({ err: error }, 'Failed to list servers');
      return [];
    }
  }

  /**
   * Get event emitter for listening to OAuth messages
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}

// Singleton export
export const mcpOAuthService = new McpOAuthService();
