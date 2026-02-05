/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from 'express';
import { SERVER_CONFIG } from '@/webserver/config/constants';

/**
 * Sanitize a string for safe logging (prevents log injection attacks).
 */
function sanitizeForLog(str: string | undefined): string {
  if (!str) return '';
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}

/**
 * Origin-based CSRF guard for endpoints excluded from tiny-csrf.
 *
 * Validates that the request's Origin (or Referer) header matches
 * one of our allowed origins. Blocks cross-site requests even when
 * the endpoint is excluded from the CSRF token middleware.
 *
 * This follows OWASP's "Verifying Origin with Standard Headers" guidance:
 * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */
export function originGuard(req: Request, res: Response, next: NextFunction): void {
  // Only protect state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Same-origin requests (e.g. curl, direct server calls) don't send Origin
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // If no Origin and no Referer, this is a same-origin or non-browser request — allow
  // (SameSite cookie attribute already blocks cross-site cookie sending)
  if (!origin && !referer) {
    next();
    return;
  }

  // Build allowed origins set
  const port = SERVER_CONFIG._currentConfig.port;
  const allowedOrigins = new Set<string>([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

  // Add configured base URL
  if (process.env.SERVER_BASE_URL) {
    try {
      const url = new URL(process.env.SERVER_BASE_URL);
      allowedOrigins.add(url.origin);
    } catch {
      /* ignore invalid URL */
    }
  }

  // Add extra allowed origins
  const extras = (process.env.AIONUI_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const extra of extras) {
    try {
      const url = new URL(extra);
      allowedOrigins.add(url.origin);
    } catch {
      /* ignore */
    }
  }

  // Add LAN IP if remote mode
  if (SERVER_CONFIG.isRemoteMode) {
    try {
      const { getLanIP } = require('@/webserver/setup');
      const lanIP = getLanIP?.();
      if (lanIP) {
        allowedOrigins.add(`http://${lanIP}:${port}`);
      }
    } catch {
      /* ignore */
    }
  }

  // Check Origin header first (most reliable)
  if (origin) {
    if (allowedOrigins.has(origin)) {
      next();
      return;
    }
    console.warn(`[OriginGuard] Blocked request from origin: ${sanitizeForLog(origin)} to ${sanitizeForLog(req.method)} ${sanitizeForLog(req.path)}`);
    res.status(403).json({ success: false, error: 'Forbidden: cross-origin request blocked' });
    return;
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (allowedOrigins.has(refererUrl.origin)) {
        next();
        return;
      }
    } catch {
      /* invalid referer */
    }
    console.warn(`[OriginGuard] Blocked request from referer: ${sanitizeForLog(referer)} to ${sanitizeForLog(req.method)} ${sanitizeForLog(req.path)}`);
    res.status(403).json({ success: false, error: 'Forbidden: cross-origin request blocked' });
    return;
  }

  next();
}
