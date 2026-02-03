/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import type { Express, Request, Response } from 'express';
import directoryApi from '../directoryApi';
import { apiRateLimiter } from '../middleware/security';

/**
 * Register API routes
 */
export function registerApiRoutes(app: Express): void {
  const validateApiAccess = TokenMiddleware.validateToken({ responseType: 'json' });

  /**
   * Directory API
   * /api/directory/*
   */
  app.use('/api/directory', apiRateLimiter, validateApiAccess, directoryApi);

  /**
   * Generic API endpoint
   * GET /api
   */
  app.use('/api', apiRateLimiter, validateApiAccess, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
