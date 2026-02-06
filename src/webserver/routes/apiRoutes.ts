/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBrandingConfig } from '@/common/branding';
import { httpLogger as log } from '@/common/logger';
import { GlobalModelService } from '@process/services/GlobalModelService';
import { scopeToUser } from '@/webserver/auth/middleware/DataScopeMiddleware';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import type { Express, Request, Response } from 'express';
import directoryApi from '../directoryApi';
import { apiRateLimiter } from '../middleware/security';
import knowledgeRoutes from './knowledgeRoutes';
import pythonRoutes from './pythonRoutes';

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
      log.error({ err: error }, 'Branding failed');
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
   * Helper to parse user groups from request
   * Groups are stored as JSON string in the database
   */
  const parseUserGroups = (groupsJson: string | null | undefined): string[] | null => {
    if (!groupsJson) return null;
    try {
      const parsed = JSON.parse(groupsJson);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  /**
   * Get visible global models for the current user
   * GET /api/models/global
   *
   * Returns global models that are enabled, not hidden by the user,
   * and accessible based on group membership.
   */
  app.get('/api/models/global', apiRateLimiter, validateApiAccess, scopeToUser, (req: Request, res: Response) => {
    try {
      const userId = req.scopedUserId!;
      const userGroups = parseUserGroups(req.user?.groups);
      const userRole = req.user?.role ?? 'user';
      const service = GlobalModelService.getInstance();
      const models = service.getVisibleGlobalModels(userId, userGroups, userRole);
      res.json({ success: true, models });
    } catch (error) {
      log.error({ err: error }, 'Get global models failed');
      res.status(500).json({ success: false, error: 'Failed to get global models' });
    }
  });

  /**
   * Get hidden global models for the current user
   * GET /api/models/global/hidden
   *
   * Returns global models that the user has hidden
   * (filtered by group access - only shows models they would have access to).
   */
  app.get('/api/models/global/hidden', apiRateLimiter, validateApiAccess, scopeToUser, (req: Request, res: Response) => {
    try {
      const userId = req.scopedUserId!;
      const userGroups = parseUserGroups(req.user?.groups);
      const userRole = req.user?.role ?? 'user';
      const service = GlobalModelService.getInstance();
      const models = service.getHiddenGlobalModels(userId, userGroups, userRole);
      res.json({ success: true, models });
    } catch (error) {
      log.error({ err: error }, 'Get hidden global models failed');
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
      log.error({ err: error }, 'Get global model detail failed');
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
      log.error({ err: error }, 'Hide global model failed');
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
      log.error({ err: error }, 'Unhide global model failed');
      res.status(500).json({ success: false, error: 'Failed to unhide global model' });
    }
  });

  /* ================================================================== */
  /*  PYTHON ENVIRONMENT API                                            */
  /* ================================================================== */

  /**
   * Python Environment API
   * /api/python/*
   *
   * Endpoints for managing per-user Python environments via mise.
   * - GET /status - Workspace status (Python version, venv, packages)
   * - GET /packages - List installed packages
   * - GET /version - Get mise/Python version info
   * - POST /install - Install a package
   * - POST /install-requirements - Install from requirements.txt
   * - POST /reset - Reset Python environment
   */
  app.use('/api/python', apiRateLimiter, validateApiAccess, scopeToUser, pythonRoutes);

  /**
   * Knowledge Base API
   * /api/knowledge/*
   *
   * Endpoints for managing per-user LanceDB knowledge bases.
   * - GET /status - Knowledge base status (docs, chunks, storage)
   * - GET /documents - List indexed documents
   * - GET /search - Search knowledge base (vector/fts/hybrid)
   * - POST /ingest - Ingest a document
   * - DELETE /document/:source - Delete document by source
   * - POST /reindex - Rebuild indexes
   * - GET /versions - List version history
   * - POST /restore - Restore to a specific version
   * - POST /clear - Clear all data (requires confirmation)
   */
  app.use('/api/knowledge', apiRateLimiter, validateApiAccess, scopeToUser, knowledgeRoutes);

  /**
   * Generic API endpoint
   * GET /api
   */
  app.use('/api', apiRateLimiter, validateApiAccess, scopeToUser, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
