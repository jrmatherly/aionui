/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// CSRF token cookie/header identifiers (shared by server & WebUI)
export const CSRF_COOKIE_NAME = 'aionui-csrf-token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
/**
 * Centralized configuration management
 */

// Authentication configuration
export const AUTH_CONFIG = {
  // Token configuration
  TOKEN: {
    // Short-lived access token expiry (used for API auth)
    ACCESS_EXPIRY: '15m' as const,
    // Long-lived refresh token expiry (used for silent token renewal)
    REFRESH_EXPIRY: '7d' as const,
    // Refresh token expiry in seconds (for DB storage)
    REFRESH_EXPIRY_SECONDS: 7 * 24 * 60 * 60,
    // Legacy session expiry (kept for backward compatibility with existing tokens)
    SESSION_EXPIRY: '24h' as const,
    // WebSocket token expiry - Currently WebSocket reuses web login token, reserved for future independent token scheme
    WEBSOCKET_EXPIRY: '5m' as const,
    // Cookie max-age in milliseconds (aligned with refresh token expiry)
    COOKIE_MAX_AGE: 7 * 24 * 60 * 60 * 1000,
    // WebSocket token max-age - Currently unused, reserved for future independent token scheme
    WEBSOCKET_TOKEN_MAX_AGE: 5 * 60,
  },

  // Rate limiting configuration
  RATE_LIMIT: {
    // Max login attempts
    LOGIN_MAX_ATTEMPTS: 5,
    // Max register attempts
    REGISTER_MAX_ATTEMPTS: 3,
    // Rate limit window in milliseconds
    WINDOW_MS: 15 * 60 * 1000,
  },

  // Default user configuration
  DEFAULT_USER: {
    // Default admin username
    USERNAME: 'admin' as const,
  },

  // Cookie configuration
  COOKIE: {
    // Cookie name
    NAME: 'aionui-session' as const,
    OPTIONS: {
      // httpOnly flag
      httpOnly: true,
      // secure flag, enable under HTTPS
      secure: false,
      // SameSite strategy
      sameSite: 'strict' as const,
    },
  },
} as const;

// WebSocket configuration
export const WEBSOCKET_CONFIG = {
  // Heartbeat interval in ms
  HEARTBEAT_INTERVAL: 30000,
  // Heartbeat timeout in ms
  HEARTBEAT_TIMEOUT: 60000,
  CLOSE_CODES: {
    // Policy violation close code
    POLICY_VIOLATION: 1008,
    // Normal close code
    NORMAL_CLOSURE: 1000,
  },
} as const;

// Server configuration
export const SERVER_CONFIG = {
  // Default listen host
  DEFAULT_HOST: '127.0.0.1' as const,
  // Remote mode listen host
  REMOTE_HOST: '0.0.0.0' as const,
  // Default port
  DEFAULT_PORT: 25808,
  // Request body size limit
  BODY_LIMIT: '10mb' as const,

  /**
   * Internal state: Current server configuration
   */
  _currentConfig: {
    host: '127.0.0.1' as string,
    port: 25808 as number,
    allowRemote: false as boolean,
  },

  /**
   * Set server configuration (called when webserver starts)
   */
  setServerConfig(port: number, allowRemote: boolean): void {
    this._currentConfig.port = port;
    this._currentConfig.host = allowRemote ? '0.0.0.0' : '127.0.0.1';
    this._currentConfig.allowRemote = allowRemote;
  },

  /**
   * Check if remote access mode is enabled
   */
  get isRemoteMode(): boolean {
    return this._currentConfig.allowRemote;
  },

  /**
   * Get base URL for URL parsing
   * Priority: Environment variable > Current server config > Default
   */
  get BASE_URL(): string {
    if (process.env.SERVER_BASE_URL) {
      return process.env.SERVER_BASE_URL;
    }

    const host = this._currentConfig.host === '0.0.0.0' ? '127.0.0.1' : this._currentConfig.host;
    return `http://${host}:${this._currentConfig.port}`;
  },
} as const;

/**
 * Get dynamic cookie options (secure flag based on HTTPS configuration)
 *
 * Security: Only enable secure flag when HTTPS is configured
 *
 * Note: In remote mode with HTTP, cookies still work (secure=false)
 * Recommend configuring HTTPS in production and setting AIONUI_HTTPS=true
 */
export function getCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge?: number;
} {
  // Only enable secure flag when HTTPS is explicitly configured
  const isHttps = process.env.AIONUI_HTTPS === 'true' || (process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true');

  return {
    httpOnly: AUTH_CONFIG.COOKIE.OPTIONS.httpOnly,
    // In HTTP environment secure=false, allows cookies to work over non-HTTPS connections
    secure: isHttps,
    // Remote HTTP mode needs 'lax' to support cross-site requests (access from different IPs)
    sameSite: SERVER_CONFIG.isRemoteMode && !isHttps ? 'lax' : AUTH_CONFIG.COOKIE.OPTIONS.sameSite,
  };
}

// Security configuration
export const SECURITY_CONFIG = {
  HEADERS: {
    // Clickjacking protection
    FRAME_OPTIONS: 'DENY',
    // No MIME sniffing
    CONTENT_TYPE_OPTIONS: 'nosniff',
    // XSS protection header
    XSS_PROTECTION: '1; mode=block',
    // Referrer policy
    REFERRER_POLICY: 'strict-origin-when-cross-origin',
    // Content-Security-Policy for development
    CSP_DEV: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' ws: wss: blob:; media-src 'self' blob:;",
    // Content-Security-Policy for production
    CSP_PROD: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' ws: wss: blob:; media-src 'self' blob:;",
  },
  CSRF: {
    COOKIE_NAME: CSRF_COOKIE_NAME,
    HEADER_NAME: CSRF_HEADER_NAME,
    TOKEN_LENGTH: 32,
    COOKIE_OPTIONS: {
      httpOnly: false,
      sameSite: 'strict' as const,
      secure: false,
      path: '/',
    },
  },
} as const;
