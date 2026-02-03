/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from 'express';

/**
 * Data Scope Middleware — determines which user's data a request should access.
 *
 * - Regular users: `req.scopedUserId` = their own user ID (always).
 * - Admins: defaults to their own ID, but can override with `?userId=<id>`
 *   query parameter to inspect another user's data.
 *
 * Must be placed AFTER TokenMiddleware.validateToken() so that `req.user`
 * (including `role`) is already attached.
 *
 * Usage:
 *   router.get('/conversations', scopeToUser, handler);
 *   // handler reads `req.scopedUserId` instead of `req.user.id`
 */
export function scopeToUser(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;

  if (!user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  // Default: scope to the authenticated user
  let targetUserId = user.id;

  // Admins can override via query parameter
  if (user.role === 'admin' && typeof req.query.userId === 'string' && req.query.userId.trim()) {
    targetUserId = req.query.userId.trim();
  }

  req.scopedUserId = targetUserId;
  next();
}
