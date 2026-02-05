/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * HTTP request/response logging middleware.
 *
 * Logs all HTTP requests with:
 * - Request details: method, path, query, user-agent
 * - Response details: status code, response time
 * - Correlation: requestId for distributed tracing
 * - Security: userId if authenticated (from JWT/session)
 *
 * Excludes:
 * - Health check endpoints (/health, /api/health)
 * - Static assets (extensionless paths are assumed to be API/HTML routes)
 */

import type { NextFunction, Request, Response } from 'express';
import { httpLogger } from '@/common/logger';
import { getRequestId } from './correlationId';

/**
 * Paths to skip logging (health checks, noisy endpoints).
 */
const SKIP_PATHS = new Set(['/health', '/api/health', '/api/health/ready', '/api/health/live']);

/**
 * Common static asset extensions to skip.
 */
const STATIC_EXTENSIONS = new Set(['.js', '.css', '.map', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot']);

/**
 * Check if a path should be logged.
 */
function shouldLogPath(path: string): boolean {
  // Skip explicit health check paths
  if (SKIP_PATHS.has(path)) {
    return false;
  }

  // Skip static assets (by extension)
  const ext = path.substring(path.lastIndexOf('.'));
  if (STATIC_EXTENSIONS.has(ext.toLowerCase())) {
    return false;
  }

  return true;
}

/**
 * Extract user ID from request (JWT or session).
 * Assumes AuthMiddleware has already attached user to req.user.
 */
function getUserId(req: Request): string | undefined {
  // Adjust based on your auth middleware's shape
  // Common patterns: req.user?.id, req.user?.sub, req.userId
  const user = (req as any).user;
  return user?.id || user?.sub || user?.userId;
}

/**
 * HTTP request/response logging middleware.
 *
 * Must be registered AFTER:
 * - correlationIdMiddleware (for requestId)
 * - AuthMiddleware (for userId)
 *
 * Logs on response finish, capturing final status code and duration.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;

  // Skip logging for excluded paths
  if (!shouldLogPath(path)) {
    return next();
  }

  const startTime = Date.now();
  const requestId = getRequestId();
  const method = req.method;
  const userId = getUserId(req);

  // Capture response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    httpLogger[level](
      {
        requestId,
        method,
        path,
        statusCode,
        duration_ms: duration,
        userId,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      },
      `${method} ${path} ${statusCode} ${duration}ms`
    );
  });

  next();
}
