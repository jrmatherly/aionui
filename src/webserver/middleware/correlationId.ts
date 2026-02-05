/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Correlation ID middleware for distributed tracing.
 *
 * Extracts or generates a unique request ID that follows the request through
 * the entire application stack. This ID is:
 * - Read from X-Request-ID header if present (from upstream proxies/gateways)
 * - Generated as a UUID if not present
 * - Set on the response X-Request-ID header for client correlation
 * - Stored in AsyncLocalStorage for access in downstream code without prop drilling
 *
 * The correlation ID enables:
 * - End-to-end request tracing across services
 * - Log aggregation and filtering by request
 * - Debugging distributed transactions
 */

import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Storage for the current request's correlation ID.
 * Available anywhere in the request context via getRequestId().
 */
const requestIdStorage = new AsyncLocalStorage<string>();

/**
 * Express middleware that manages request correlation IDs.
 *
 * Priority:
 * 1. X-Request-ID header (from upstream proxy/gateway)
 * 2. Generate new UUID v4
 *
 * The ID is:
 * - Attached to req.id for Express access
 * - Stored in AsyncLocalStorage for global access
 * - Sent back in response X-Request-ID header
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract or generate correlation ID
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  // Attach to request object
  req.id = requestId;

  // Set response header for client correlation
  res.setHeader('X-Request-ID', requestId);

  // Store in AsyncLocalStorage for downstream access
  requestIdStorage.run(requestId, () => {
    next();
  });
}

/**
 * Get the current request's correlation ID from any point in the call stack.
 *
 * @returns The correlation ID, or undefined if called outside request context
 *
 * @example
 *   import { getRequestId } from '@/webserver/middleware/correlationId';
 *
 *   function someDeepFunction() {
 *     const requestId = getRequestId();
 *     logger.info({ requestId }, 'Processing request');
 *   }
 */
export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}
