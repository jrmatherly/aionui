/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBrandingConfig } from '@/common/branding';
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
   * Branding API (public - no auth required)
   * GET /api/branding
   *
   * Returns branding configuration from environment variables.
   * Used by login page and other pre-auth UI components.
   */
  app.get('/api/branding', apiRateLimiter, (_req: Request, res: Response) => {
    try {
      const config = getBrandingConfig();
      res.json(config);
    } catch (error) {
      console.error('[API] Branding error:', error);
      res.status(500).json({ error: 'Failed to get branding config' });
    }
  });

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
