/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBrandingConfig } from '@/common/branding';
import { GlobalModelService } from '@process/services/GlobalModelService';
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

  /* ================================================================== */
  /*  USER GLOBAL MODELS API                                            */
  /* ================================================================== */

  /**
   * Get visible global models for the current user
   * GET /api/models/global
   *
   * Returns global models that are enabled and not hidden by the user.
   */
  app.get('/api/models/global', apiRateLimiter, validateApiAccess, scopeToUser, (req: Request, res: Response) => {
    try {
      const userId = req.scopedUserId!;
      const service = GlobalModelService.getInstance();
      const models = service.getVisibleGlobalModels(userId);
      res.json({ success: true, models });
    } catch (error) {
      console.error('[API] Get global models error:', error);
      res.status(500).json({ success: false, error: 'Failed to get global models' });
    }
  });

  /**
   * Get hidden global models for the current user
   * GET /api/models/global/hidden
   *
   * Returns global models that the user has hidden.
   */
  app.get('/api/models/global/hidden', apiRateLimiter, validateApiAccess, scopeToUser, (req: Request, res: Response) => {
    try {
      const userId = req.scopedUserId!;
      const service = GlobalModelService.getInstance();
      const models = service.getHiddenGlobalModels(userId);
      res.json({ success: true, models });
    } catch (error) {
      console.error('[API] Get hidden global models error:', error);
      res.status(500).json({ success: false, error: 'Failed to get hidden global models' });
    }
  });

  /**
   * Get a single global model's details (for copy-to-local)
   * GET /api/models/global/:id
   *
   * Returns the global model metadata (no decrypted API key for security).
   */
  app.get('/api/models/global/:id', apiRateLimiter, validateApiAccess, scopeToUser, (req: Request, res: Response) => {
    try {
      const service = GlobalModelService.getInstance();
      const model = service.getGlobalModel(req.params.id);
      if (!model) {
        res.status(404).json({ success: false, error: 'Global model not found' });
        return;
      }
      res.json({ success: true, model });
    } catch (error) {
      console.error('[API] Get global model detail error:', error);
      res.status(500).json({ success: false, error: 'Failed to get global model details' });
    }
  });

  /**
   * Hide a global model for the current user
   * POST /api/models/global/:id/hide
   */
  app.post('/api/models/global/:id/hide', apiRateLimiter, validateApiAccess, scopeToUser, (req: Request, res: Response) => {
    try {
      const userId = req.scopedUserId!;
      const globalModelId = req.params.id;
      const service = GlobalModelService.getInstance();

      // Verify the model exists
      const model = service.getGlobalModel(globalModelId);
      if (!model) {
        res.status(404).json({ success: false, error: 'Global model not found' });
        return;
      }

      service.hideGlobalModel(userId, globalModelId);
      res.json({ success: true, message: 'Global model hidden' });
    } catch (error) {
      console.error('[API] Hide global model error:', error);
      res.status(500).json({ success: false, error: 'Failed to hide global model' });
    }
  });

  /**
   * Unhide a global model for the current user
   * POST /api/models/global/:id/unhide
   */
  app.post('/api/models/global/:id/unhide', apiRateLimiter, validateApiAccess, scopeToUser, (req: Request, res: Response) => {
    try {
      const userId = req.scopedUserId!;
      const globalModelId = req.params.id;
      const service = GlobalModelService.getInstance();
      service.unhideGlobalModel(userId, globalModelId);
      res.json({ success: true, message: 'Global model unhidden' });
    } catch (error) {
      console.error('[API] Unhide global model error:', error);
      res.status(500).json({ success: false, error: 'Failed to unhide global model' });
    }
  });

  /**
   * Generic API endpoint
   * GET /api
   */
  app.use('/api', apiRateLimiter, validateApiAccess, scopeToUser, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
