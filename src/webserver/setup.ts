/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import crypto from 'crypto';
import type { Express } from 'express';
import express from 'express';
import { networkInterfaces } from 'os';
import csrf from 'tiny-csrf';
import { correlationIdMiddleware } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { attachCsrfToken } from './middleware/security';
import { initLogger, httpLogger } from '@/common/logger';

/**
 * Get LAN IP address for CORS configuration
 */
function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
      // Node.js 18.4+ returns number (4/6), older versions return string ('IPv4'/'IPv6')
      const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      const isNotInternal = !net.internal;
      if (isIPv4 && isNotInternal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * Get or generate CSRF secret
 *
 * CSRF secret must be exactly 32 characters for AES-256-CBC
 *
 * Priority: Environment variable > Random generation (different on each startup)
 */
function getCsrfSecret(): string {
  // Prefer environment variable
  if (process.env.CSRF_SECRET && process.env.CSRF_SECRET.length === 32) {
    return process.env.CSRF_SECRET;
  }

  // Generate random 32-character secret (16 bytes hex encoded)
  const randomSecret = crypto.randomBytes(16).toString('hex');
  initLogger.info('Generated random CSRF secret for this session');
  return randomSecret;
}

// Generate once at module load, remains constant for process lifetime
const CSRF_SECRET = getCsrfSecret();

/**
 * Configure basic middleware for Express app
 */
export function setupBasicMiddleware(app: Express): void {
  // Trust proxy — required when deployed behind a reverse proxy (nginx, Traefik, Caddy).
  // Without this, Express ignores X-Forwarded-Proto/X-Forwarded-For headers, so
  // req.protocol always returns 'http', req.ip returns the proxy's IP, and
  // secure cookies may not be set correctly even with AIONUI_HTTPS=true.
  // Values: true (trust all), number (hop count), string (trusted subnets), false (disabled).
  const trustProxy = process.env.AIONUI_TRUST_PROXY;
  if (trustProxy && trustProxy !== 'false') {
    // If it's a number (hop count), parse it; otherwise pass the string value directly
    const parsed = Number(trustProxy);
    app.set('trust proxy', !isNaN(parsed) ? parsed : trustProxy === 'true' ? true : trustProxy);
    initLogger.info({ trustProxy: app.get('trust proxy') }, 'Express trust proxy enabled');
  }

  // Correlation ID (must be early for downstream middleware/logging)
  app.use(correlationIdMiddleware);

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CSRF Protection using tiny-csrf (CodeQL compliant)
  // Must be applied after cookieParser and before routes
  app.use(cookieParser('cookie-parser-secret'));
  // P1 Security fix: Enable CSRF for login (frontend already uses withCsrfToken)
  // Only exclude QR login (has its own one-time token protection)
  app.use(
    csrf(
      CSRF_SECRET,
      ['POST', 'PUT', 'DELETE', 'PATCH'], // Protected methods
      ['/login', '/logout', '/api/auth/qr-login', '/api/auth/refresh', /^\/api\/admin\//], // Excluded: login form, logout, QR login, token refresh, and admin API (JWT + role-protected)
      [] // No service worker URLs
    )
  );
  app.use(attachCsrfToken); // Attach token to response headers

  // Security middleware
  app.use(AuthMiddleware.securityHeadersMiddleware);
  app.use(AuthMiddleware.requestLoggingMiddleware);

  // HTTP request/response logging (after auth for userId context)
  app.use(requestLoggerMiddleware);
}

/**
 * Configure CORS based on server mode
 */
function normalizeOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const portSuffix = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${url.hostname}${portSuffix}`;
  } catch (error) {
    return null;
  }
}

function getConfiguredOrigins(port: number, allowRemote: boolean): Set<string> {
  const baseOrigins = new Set<string>([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

  // When remote access is enabled, automatically add LAN IP
  if (allowRemote) {
    const lanIP = getLanIP();
    if (lanIP) {
      const origin = `http://${lanIP}:${port}`;
      baseOrigins.add(origin);
      httpLogger.info({ origin }, 'Added LAN IP to allowed origins');
    }
  }

  if (process.env.SERVER_BASE_URL) {
    const normalizedBase = normalizeOrigin(process.env.SERVER_BASE_URL);
    if (normalizedBase) {
      baseOrigins.add(normalizedBase);
    }
  }

  const extraOrigins = (process.env.AIONUI_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  extraOrigins.forEach((origin) => baseOrigins.add(origin));

  return baseOrigins;
}

export function setupCors(app: Express, port: number, allowRemote: boolean): void {
  const allowedOrigins = getConfiguredOrigins(port, allowRemote);

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) {
          // Requests like curl or same-origin don't send an Origin header
          callback(null, true);
          return;
        }

        if (origin === 'null') {
          callback(null, true);
          return;
        }

        const normalizedOrigin = normalizeOrigin(origin);
        if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    })
  );
}

/**
 * Configure error handling middleware (must be registered last)
 */
export function setupErrorHandler(app: Express): void {
  app.use(errorHandler);
}
