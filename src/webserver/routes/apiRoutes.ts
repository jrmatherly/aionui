/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { scopeToUser } from '@/webserver/auth/middleware/DataScopeMiddleware';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import type { Express, Request, Response } from 'express';
import directoryApi from '../directoryApi';
import { apiRateLimiter } from '../middleware/security';

/**
 * Register API routes
 *
 * All /api routes are authenticated + user-scoped via scopeToUser:
 *   req.user      → authenticated user (id, username, role, auth_method)
 *   req.scopedUserId → userId whose data should be accessed
 *                      (admin can override via ?userId= query param)
 */
export function registerApiRoutes(app: Express): void {
  const validateApiAccess = TokenMiddleware.validateToken({ responseType: 'json' });

  /**
   * Directory API
   * /api/directory/*
   */
  app.use('/api/directory', apiRateLimiter, validateApiAccess, scopeToUser, directoryApi);

  /**
   * Generic API endpoint
   * GET /api
   */
  app.use('/api', apiRateLimiter, validateApiAccess, scopeToUser, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
