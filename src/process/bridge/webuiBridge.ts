/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/ipcBridge';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { AUTH_CONFIG, SERVER_CONFIG } from '@/webserver/config/constants';
import crypto from 'crypto';
import { ipcMain } from 'electron';
import { WebuiService } from './services/WebuiService';
// Preload webserver module to avoid startup delay
import { cleanupWebAdapter } from '@/webserver/adapter';
import { startWebServerWithInstance } from '@/webserver/index';
import { httpLogger as log } from '@/common/logger';

// WebUI server instance reference
let webServerInstance: {
  server: import('http').Server;
  wss: import('ws').WebSocketServer;
  port: number;
  allowRemote: boolean;
} | null = null;

// QR Token store (in-memory, short-lived)
// Added allowLocalOnly flag to restrict local mode to local network only
const qrTokenStore = new Map<string, { expiresAt: number; used: boolean; allowLocalOnly: boolean }>();

// QR Token validity: 5 minutes
const QR_TOKEN_EXPIRY = 5 * 60 * 1000;

/**
 * Generate QR login URL directly (for server-side use on startup)
 */
export function generateQRLoginUrlDirect(port: number, allowRemote: boolean): { qrUrl: string; expiresAt: number } {
  // Clean up expired tokens
  cleanupExpiredTokens();

  // Generate random token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + QR_TOKEN_EXPIRY;

  // Store token
  const allowLocalOnly = !allowRemote;
  qrTokenStore.set(token, { expiresAt, used: false, allowLocalOnly });

  // Build QR URL
  const lanIP = WebuiService.getLanIP();
  const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
  const qrUrl = `${baseUrl}/qr-login?token=${token}`;

  return { qrUrl, expiresAt };
}

/**
 * Check if IP is localhost or local network address
 */
function isLocalIP(ip: string): boolean {
  if (!ip) return false;
  // Handle IPv6 localhost format
  const cleanIP = ip.replace(/^::ffff:/, '');

  // localhost
  if (cleanIP === '127.0.0.1' || cleanIP === 'localhost' || cleanIP === '::1') {
    return true;
  }

  // Private network addresses
  // 10.0.0.0/8
  if (cleanIP.startsWith('10.')) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIP)) return true;
  // 192.168.0.0/16
  if (cleanIP.startsWith('192.168.')) return true;
  // Link-local
  if (cleanIP.startsWith('169.254.')) return true;

  return false;
}

/**
 * Verify QR token directly (for authRoutes, no IPC needed)
 *
 * @param qrToken - QR token string
 * @param clientIP - Client IP address (for local network restriction)
 */
export async function verifyQRTokenDirect(qrToken: string, clientIP?: string): Promise<{ success: boolean; data?: { sessionToken: string; username: string }; msg?: string }> {
  try {
    // Check if token exists
    const tokenData = qrTokenStore.get(qrToken);
    if (!tokenData) {
      return {
        success: false,
        msg: 'Invalid or expired QR token',
      };
    }

    // Check if expired
    if (Date.now() > tokenData.expiresAt) {
      qrTokenStore.delete(qrToken);
      return {
        success: false,
        msg: 'QR token has expired',
      };
    }

    // Check if already used
    if (tokenData.used) {
      qrTokenStore.delete(qrToken);
      return {
        success: false,
        msg: 'QR token has already been used',
      };
    }

    // P0 Security fix: Check local network restriction
    if (tokenData.allowLocalOnly && clientIP && !isLocalIP(clientIP)) {
      log.warn({ clientIP }, 'QR token rejected: non-local IP attempted to use local-only token');
      return {
        success: false,
        msg: 'QR login is only allowed from local network',
      };
    }

    // Mark as used
    tokenData.used = true;

    // Get admin user
    const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
    if (!adminUser) {
      return {
        success: false,
        msg: 'Admin user not found',
      };
    }

    // Generate session token
    const sessionToken = AuthService.generateToken(adminUser);

    // Update last login time
    UserRepository.updateLastLogin(adminUser.id);

    // Delete used QR token
    qrTokenStore.delete(qrToken);

    return {
      success: true,
      data: {
        sessionToken,
        username: adminUser.username,
      },
    };
  } catch (error) {
    log.error({ err: error }, 'Verify QR token error');
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'Failed to verify QR token',
    };
  }
}

/**
 * Clean up expired QR tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [token, data] of qrTokenStore.entries()) {
    if (data.expiresAt < now || data.used) {
      qrTokenStore.delete(token);
    }
  }
}

/**
 * Set WebUI server instance (called from webserver/index.ts)
 */
export function setWebServerInstance(instance: typeof webServerInstance): void {
  webServerInstance = instance;
}

/**
 * Get WebUI server instance
 */
export function getWebServerInstance(): typeof webServerInstance {
  return webServerInstance;
}

/**
 * Initialize WebUI IPC bridge
 */
export function initWebuiBridge(): void {
  // Get WebUI status
  webui.getStatus.provider(async () => {
    return WebuiService.handleAsync(async () => {
      const status = await WebuiService.getStatus(webServerInstance);
      return { success: true, data: status };
    }, 'Get status');
  });

  // Start WebUI
  webui.start.provider(async ({ port: requestedPort, allowRemote }) => {
    try {
      if (webServerInstance) {
        return {
          success: false,
          msg: 'WebUI is already running',
        };
      }

      const port = requestedPort ?? SERVER_CONFIG.DEFAULT_PORT;
      const remote = allowRemote ?? false;

      // Use preloaded module
      const instance = await startWebServerWithInstance(port, remote);
      webServerInstance = instance;

      // Get server info
      const status = await WebuiService.getStatus(webServerInstance);
      const localUrl = `http://localhost:${port}`;
      const lanIP = WebuiService.getLanIP();
      const networkUrl = remote && lanIP ? `http://${lanIP}:${port}` : undefined;
      const initialPassword = status.initialPassword;

      // Emit status changed event
      webui.statusChanged.emit({
        running: true,
        port,
        localUrl,
        networkUrl,
      });

      return {
        success: true,
        data: {
          port,
          localUrl,
          networkUrl,
          lanIP: lanIP ?? undefined,
          initialPassword,
        },
      };
    } catch (error) {
      log.error({ err: error }, 'Start error');
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to start WebUI',
      };
    }
  });

  // Stop WebUI
  webui.stop.provider(async () => {
    try {
      if (!webServerInstance) {
        return {
          success: false,
          msg: 'WebUI is not running',
        };
      }

      const { server, wss } = webServerInstance;

      // Close all WebSocket connections
      wss.clients.forEach((client) => {
        client.close(1000, 'Server shutting down');
      });

      // Close server
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Cleanup WebSocket broadcaster registration
      cleanupWebAdapter();

      webServerInstance = null;

      // Emit status changed event
      webui.statusChanged.emit({
        running: false,
      });

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'Stop error');
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to stop WebUI',
      };
    }
  });

  // Change password (no current password required)
  webui.changePassword.provider(async ({ newPassword }) => {
    return WebuiService.handleAsync(async () => {
      await WebuiService.changePassword(newPassword);
      return { success: true };
    }, 'Change password');
  });

  // Reset password (generate new random password)
  // Note: Since @office-ai/platform bridge provider doesn't support return values,
  // we emit the result via emitter, frontend listens to resetPasswordResult event
  webui.resetPassword.provider(async () => {
    const result = await WebuiService.handleAsync(async () => {
      const newPassword = await WebuiService.resetPassword();
      return { success: true, data: { newPassword } };
    }, 'Reset password');

    // Emit result via emitter
    if (result.success && result.data) {
      webui.resetPasswordResult.emit({ success: true, newPassword: result.data.newPassword });
    } else {
      webui.resetPasswordResult.emit({ success: false, msg: result.msg });
    }

    return result;
  });

  // Generate QR login token
  webui.generateQRToken.provider(async () => {
    // Check webServerInstance status
    if (!webServerInstance) {
      return {
        success: false,
        msg: 'WebUI is not running. Please start WebUI first.',
      };
    }

    try {
      // Clean up expired tokens
      cleanupExpiredTokens();

      // Get server configuration
      const { port, allowRemote } = webServerInstance;

      // Generate random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + QR_TOKEN_EXPIRY;

      // Store token
      // If not in remote mode, restrict to local network only
      const allowLocalOnly = !allowRemote;
      qrTokenStore.set(token, { expiresAt, used: false, allowLocalOnly });

      // Build QR URL
      const lanIP = WebuiService.getLanIP();
      const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
      const qrUrl = `${baseUrl}/qr-login?token=${token}`;

      return {
        success: true,
        data: {
          token,
          expiresAt,
          qrUrl,
        },
      };
    } catch (error) {
      log.error({ err: error }, 'Generate QR token error');
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to generate QR token',
      };
    }
  });

  // Verify QR token
  webui.verifyQRToken.provider(async ({ qrToken }) => {
    try {
      // Check if token exists
      const tokenData = qrTokenStore.get(qrToken);
      if (!tokenData) {
        return {
          success: false,
          msg: 'Invalid or expired QR token',
        };
      }

      // Check if expired
      if (Date.now() > tokenData.expiresAt) {
        qrTokenStore.delete(qrToken);
        return {
          success: false,
          msg: 'QR token has expired',
        };
      }

      // Check if already used
      if (tokenData.used) {
        qrTokenStore.delete(qrToken);
        return {
          success: false,
          msg: 'QR token has already been used',
        };
      }

      // Mark as used
      tokenData.used = true;

      // Get admin user
      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (!adminUser) {
        return {
          success: false,
          msg: 'Admin user not found',
        };
      }

      // Generate session token
      const sessionToken = AuthService.generateToken(adminUser);

      // Update last login time
      UserRepository.updateLastLogin(adminUser.id);

      // Delete used QR token
      qrTokenStore.delete(qrToken);

      return {
        success: true,
        data: {
          sessionToken,
          username: adminUser.username,
        },
      };
    } catch (error) {
      log.error({ err: error }, 'Verify QR token error');
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to verify QR token',
      };
    }
  });

  // ===== Direct IPC handlers (bypass bridge library) =====
  // These handlers return results directly, without relying on emitter pattern

  // Direct IPC: Reset password
  ipcMain.handle('webui-direct-reset-password', async () => {
    return WebuiService.handleAsync(async () => {
      const newPassword = await WebuiService.resetPassword();
      return { success: true, newPassword };
    }, 'Direct IPC: Reset password');
  });

  // Direct IPC: Get status
  ipcMain.handle('webui-direct-get-status', async () => {
    return WebuiService.handleAsync(async () => {
      const status = await WebuiService.getStatus(webServerInstance);
      return { success: true, data: status };
    }, 'Direct IPC: Get status');
  });

  // Direct IPC: Change password (no current password required)
  ipcMain.handle('webui-direct-change-password', async (_event, { newPassword }: { newPassword: string }) => {
    return WebuiService.handleAsync(async () => {
      await WebuiService.changePassword(newPassword);
      return { success: true };
    }, 'Direct IPC: Change password');
  });

  // Direct IPC: Generate QR token
  ipcMain.handle('webui-direct-generate-qr-token', async () => {
    // Check webServerInstance status
    if (!webServerInstance) {
      return {
        success: false,
        msg: 'WebUI is not running. Please start WebUI first.',
      };
    }

    try {
      // Clean up expired tokens
      cleanupExpiredTokens();

      // Get server configuration
      const { port, allowRemote } = webServerInstance;

      // Generate random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + QR_TOKEN_EXPIRY;

      // Store token
      const allowLocalOnly = !allowRemote;
      qrTokenStore.set(token, { expiresAt, used: false, allowLocalOnly });

      // Build QR URL
      const lanIP = WebuiService.getLanIP();
      const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
      const qrUrl = `${baseUrl}/qr-login?token=${token}`;

      return {
        success: true,
        data: {
          token,
          expiresAt,
          qrUrl,
        },
      };
    } catch (error) {
      log.error({ err: error }, 'Direct IPC: Generate QR token error');
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to generate QR token',
      };
    }
  });
}
