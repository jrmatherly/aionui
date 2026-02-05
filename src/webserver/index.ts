/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpLogger as log } from '@/common/logger';
import { generateQRLoginUrlDirect } from '@/process/bridge/webuiBridge';
import { OIDC_CONFIG } from '@/webserver/auth/config/oidcConfig';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { OidcService } from '@/webserver/auth/service/OidcService';
import { execSync } from 'child_process';
import express from 'express';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { WebSocketServer } from 'ws';
import { initWebAdapter } from './adapter';
import { AUTH_CONFIG, SERVER_CONFIG } from './config/constants';
import { registerAdminRoutes } from './routes/adminRoutes';
import { registerApiRoutes } from './routes/apiRoutes';
import { registerAuthRoutes } from './routes/authRoutes';
import { registerLoggingRoutes } from './routes/loggingRoutes';
import { registerStaticRoutes } from './routes/staticRoutes';
import { setupBasicMiddleware, setupCors, setupErrorHandler } from './setup';

// Express Request type extension is defined in src/webserver/types/express.d.ts

const DEFAULT_ADMIN_USERNAME = AUTH_CONFIG.DEFAULT_USER.USERNAME;

// Store initial password (in memory, for first-time display)
let initialAdminPassword: string | null = null;

type QRCodeTerminal = {
  generate: (text: string, options?: { small?: boolean }, cb?: (qr: string) => void) => void;
};

function loadQRCodeTerminal(): QRCodeTerminal | null {
  try {
    const module = require('qrcode-terminal') as QRCodeTerminal;
    return module;
  } catch {
    return null;
  }
}

/**
 * Get initial admin password (only for first-time display)
 */
export function getInitialAdminPassword(): string | null {
  return initialAdminPassword;
}

/**
 * Clear initial admin password (called after user changes password)
 */
export function clearInitialAdminPassword(): void {
  initialAdminPassword = null;
}

/**
 * Get LAN IP address using os.networkInterfaces()
 */
function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
      // Skip internal addresses (127.0.0.1) and IPv6
      const isIPv4 = net.family === 'IPv4';
      const isNotInternal = !net.internal;
      if (isIPv4 && isNotInternal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * Get public IP address (Linux headless only)
 */
function getPublicIP(): string | null {
  // Only try to get public IP on Linux headless environment
  const isLinuxHeadless = process.platform === 'linux' && !process.env.DISPLAY;
  if (!isLinuxHeadless) {
    return null;
  }

  try {
    // Use curl to get public IP (with 2 second timeout)
    const publicIP = execSync('curl -s --max-time 2 ifconfig.me || curl -s --max-time 2 api.ipify.org', {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();

    // Validate IPv4 address format
    if (publicIP && /^(\d{1,3}\.){3}\d{1,3}$/.test(publicIP)) {
      return publicIP;
    }
  } catch {
    // Ignore errors (firewall, network issues, etc.)
  }

  return null;
}

/**
 * Get server IP address (prefer public IP, fallback to LAN IP)
 */
function getServerIP(): string | null {
  // 1. Linux headless: try to get public IP
  const publicIP = getPublicIP();
  if (publicIP) {
    return publicIP;
  }

  // 2. All platforms: get LAN IP (Windows/Mac/Linux)
  return getLanIP();
}

/**
 * Initialize default admin account if no users exist
 *
 * Uses AIONUI_ADMIN_PASSWORD env var if set, otherwise generates a random password.
 * Only runs when the admin account has no valid password (first run or blank password).
 * If the admin already has a password in the database, this is a no-op — the env var
 * will NOT overwrite a previously set password on container restart.
 *
 * @returns Initial credentials (only on first creation)
 */
async function initializeDefaultAdmin(): Promise<{ username: string; password: string } | null> {
  const username = DEFAULT_ADMIN_USERNAME;

  const systemUser = UserRepository.getSystemUser();
  const existingAdmin = UserRepository.findByUsername(username);

  // Treat existing admin with valid password as already initialized
  const hasValidPassword = (user: typeof existingAdmin): boolean => !!user && typeof user.password_hash === 'string' && user.password_hash.trim().length > 0;

  // Skip initialization if a valid admin already exists
  if (hasValidPassword(existingAdmin)) {
    return null;
  }

  // Use env var password if provided, otherwise generate a random one
  const envPassword = process.env.AIONUI_ADMIN_PASSWORD?.trim();
  const isEnvProvided = !!envPassword && envPassword.length > 0;
  const password = isEnvProvided ? envPassword : AuthService.generateRandomPassword();

  try {
    const hashedPassword = await AuthService.hashPassword(password);

    if (existingAdmin) {
      // Case 1: admin row exists but password is blank -> refresh password and expose credentials
      UserRepository.updatePassword(existingAdmin.id, hashedPassword);
      initialAdminPassword = password; // Store initial password
      return { username, password };
    }

    if (systemUser) {
      // Case 2: only placeholder system user exists -> update username/password in place
      UserRepository.setSystemUserCredentials(username, hashedPassword);
      initialAdminPassword = password; // Store initial password
      return { username, password };
    }

    // Case 3: fresh install with no users -> create admin user explicitly
    UserRepository.createUser(username, hashedPassword);
    initialAdminPassword = password; // Store initial password
    return { username, password };
  } catch (error) {
    log.error({ err: error }, 'Failed to initialize default admin account');
    return null;
  }
}

/**
 * Display initial credentials in console
 */
function displayInitialCredentials(credentials: { username: string; password: string }, localUrl: string, allowRemote: boolean, networkUrl?: string): void {
  const port = parseInt(localUrl.split(':').pop() || '3000', 10);
  const { qrUrl } = generateQRLoginUrlDirect(port, allowRemote);

  console.log('\n' + '='.repeat(70));
  console.log('🎉 AionUI Web Server Started Successfully!');
  console.log('='.repeat(70));
  console.log(`\n📍 Local URL:    ${localUrl}`);

  if (allowRemote && networkUrl && networkUrl !== localUrl) {
    console.log(`📍 Network URL:  ${networkUrl}`);
  }

  // Display QR Code
  console.log('\n📱 Scan QR Code to Login (expires in 5 mins)');
  const qrcode = loadQRCodeTerminal();
  if (qrcode) {
    qrcode.generate(qrUrl, { small: true }, (qr: string) => {
      console.log(qr);
    });
  } else {
    console.log('QRCode output disabled: qrcode-terminal is not installed.');
  }
  console.log(`   QR URL: ${qrUrl}`);

  // Display traditional credentials as fallback
  const isEnvPassword = !!process.env.AIONUI_ADMIN_PASSWORD?.trim();
  console.log('\n🔐 Or Use Initial Admin Credentials:');
  console.log(`   Username: ${credentials.username}`);
  if (isEnvPassword) {
    console.log('   Password: (set via AIONUI_ADMIN_PASSWORD)');
  } else {
    console.log(`   Password: ${credentials.password}`);
    console.log('\n⚠️  Please change the password after first login!');
  }

  console.log('='.repeat(70) + '\n');
}

/**
 * WebUI server instance type
 */
export interface WebServerInstance {
  server: import('http').Server;
  wss: import('ws').WebSocketServer;
  port: number;
  allowRemote: boolean;
}

/**
 * Start web server and return instance (for IPC calls)
 *
 * @param port Server port
 * @param allowRemote Allow remote access
 * @returns Server instance
 */
export async function startWebServerWithInstance(port: number, allowRemote = false): Promise<WebServerInstance> {
  // Set server configuration
  SERVER_CONFIG.setServerConfig(port, allowRemote);

  // Create Express app and server
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Initialize default admin account
  const initialCredentials = await initializeDefaultAdmin();

  // Initialize OIDC if enabled (graceful degradation on failure)
  if (OIDC_CONFIG.enabled) {
    try {
      await OidcService.initialize();
      log.info('OIDC authentication enabled');
    } catch (error) {
      log.warn({ err: error }, 'Failed to initialize OIDC — only local admin login available');
    }
  }

  // Configure middleware
  setupBasicMiddleware(app);
  setupCors(app, port, allowRemote);

  // Register routes
  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerLoggingRoutes(app);
  registerApiRoutes(app);
  registerStaticRoutes(app);

  // Setup error handler (must be last)
  setupErrorHandler(app);

  // Start server
  // Listen on 0.0.0.0 (all interfaces) or 127.0.0.1 (local only) based on allowRemote
  const host = allowRemote ? SERVER_CONFIG.REMOTE_HOST : SERVER_CONFIG.DEFAULT_HOST;
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const localUrl = `http://localhost:${port}`;
      const serverIP = getServerIP();
      const displayUrl = serverIP ? `http://${serverIP}:${port}` : localUrl;

      // Display initial credentials (if first startup)
      if (initialCredentials) {
        displayInitialCredentials(initialCredentials, localUrl, allowRemote, displayUrl);
      } else {
        if (allowRemote && serverIP && serverIP !== 'localhost') {
          console.log(`\n   🚀 Local access: ${localUrl}`);
          console.log(`   🚀 Network access: ${displayUrl}\n`);
        } else {
          console.log(`\n   🚀 WebUI started: ${localUrl}\n`);
        }
      }

      // Initialize WebSocket adapter
      initWebAdapter(wss);

      resolve({
        server,
        wss,
        port,
        allowRemote,
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.error({ port }, 'Port already in use');
      } else {
        log.error({ err }, 'Server error');
      }
      reject(err);
    });
  });
}

/**
 * Start web server (CLI mode, auto-opens browser)
 *
 * @param port Server port
 * @param allowRemote Allow remote access
 */
export async function startWebServer(port: number, allowRemote = false): Promise<void> {
  // Reuse startWebServerWithInstance
  await startWebServerWithInstance(port, allowRemote);

  // No longer auto-open browser, user can manually visit the URL printed in console
}
