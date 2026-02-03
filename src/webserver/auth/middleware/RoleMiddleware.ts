/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@process/database/types';

/**
 * RBAC Middleware — enforce role-based access on routes.
 *
 * Usage:
 *   router.get('/admin/users', requireAdmin, handler);
 *   router.get('/resource',    requireRole('admin', 'user'), handler);
 *
 * Must be placed AFTER TokenMiddleware.validateToken() so that
 * `req.user` (including `role`) is already attached.
 */

/**
 * Create middleware that requires the authenticated user to have one of the
 * specified roles. Returns 403 if the user's role is not in the list.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}

/** Convenience: only admins */
export const requireAdmin = requireRole('admin');

/** Convenience: admins and regular users (excludes viewers) */
export const requireUser = requireRole('admin', 'user');
