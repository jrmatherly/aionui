/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Admin-only routes for user and global model management.
 * All endpoints require admin role.
 */

import { GROUP_MAPPINGS } from '@/webserver/auth/config/groupMappings';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { requireAdmin } from '@/webserver/auth/middleware/RoleMiddleware';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { GlobalModelService } from '@process/services/GlobalModelService';
import type { ICreateGlobalModelDTO, IUpdateGlobalModelDTO, UserRole } from '@process/database/types';
import type { Express, Request, Response } from 'express';
import { apiRateLimiter } from '../middleware/security';

/**
 * Sanitize a user record for API responses (strip sensitive fields).
 */
function sanitizeUser(u: ReturnType<typeof UserRepository.findById>) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    authMethod: u.auth_method,
    displayName: u.display_name,
    groups: u.groups ? JSON.parse(u.groups as string) : [],
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    lastLogin: u.last_login,
  };
}

const VALID_ROLES: UserRole[] = ['admin', 'user', 'viewer'];

export function registerAdminRoutes(app: Express): void {
  // Shared middleware stack: rate-limit → auth → admin-only
  const adminGuard = [apiRateLimiter, AuthMiddleware.authenticateToken, requireAdmin];

  /* ------------------------------------------------------------------ */
  /*  GET /api/admin/users — list all users                              */
  /* ------------------------------------------------------------------ */
  app.get('/api/admin/users', ...adminGuard, (_req: Request, res: Response) => {
    try {
      const users = UserRepository.listUsers().map(sanitizeUser);
      res.json({ success: true, users, total: users.length });
    } catch (error) {
      console.error('[Admin] List users error:', error);
      res.status(500).json({ success: false, error: 'Failed to list users' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  GET /api/admin/users/:id — get single user                         */
  /* ------------------------------------------------------------------ */
  app.get('/api/admin/users/:id', ...adminGuard, (req: Request, res: Response) => {
    try {
      const user = UserRepository.findById(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      res.json({ success: true, user: sanitizeUser(user) });
    } catch (error) {
      console.error('[Admin] Get user error:', error);
      res.status(500).json({ success: false, error: 'Failed to get user' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  PATCH /api/admin/users/:id/role — update user role                 */
  /* ------------------------------------------------------------------ */
  app.patch('/api/admin/users/:id/role', ...adminGuard, (req: Request, res: Response) => {
    try {
      const { role } = req.body as { role?: string };

      if (!role || !VALID_ROLES.includes(role as UserRole)) {
        res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
        return;
      }

      const user = UserRepository.findById(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      // Prevent removing your own admin role
      if (user.id === req.user!.id && role !== 'admin') {
        res.status(400).json({ success: false, error: 'Cannot remove your own admin role' });
        return;
      }

      UserRepository.updateRole(user.id, role as UserRole);
      res.json({ success: true, message: `User role updated to ${role}` });
    } catch (error) {
      console.error('[Admin] Update role error:', error);
      res.status(500).json({ success: false, error: 'Failed to update role' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  DELETE /api/admin/users/:id — deactivate user                      */
  /* ------------------------------------------------------------------ */
  app.delete('/api/admin/users/:id', ...adminGuard, (req: Request, res: Response) => {
    try {
      const userId = req.params.id;

      if (userId === req.user!.id) {
        res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        return;
      }

      const user = UserRepository.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      // For now, set role to 'viewer' as a soft deactivation
      // A proper soft-delete column can be added in Phase 4
      UserRepository.updateRole(userId, 'viewer');
      res.json({ success: true, message: 'User deactivated (role set to viewer)' });
    } catch (error) {
      console.error('[Admin] Delete user error:', error);
      res.status(500).json({ success: false, error: 'Failed to deactivate user' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  GET /api/admin/group-mappings — view current group→role mappings    */
  /* ------------------------------------------------------------------ */
  app.get('/api/admin/group-mappings', ...adminGuard, (_req: Request, res: Response) => {
    res.json({ success: true, mappings: GROUP_MAPPINGS });
  });

  /* ================================================================== */
  /*  GLOBAL MODELS MANAGEMENT                                          */
  /* ================================================================== */

  /* ------------------------------------------------------------------ */
  /*  GET /api/admin/models — list all global models                     */
  /* ------------------------------------------------------------------ */
  app.get('/api/admin/models', ...adminGuard, (req: Request, res: Response) => {
    try {
      const includeDisabled = req.query.includeDisabled === 'true';
      const service = GlobalModelService.getInstance();
      const models = service.listGlobalModels(includeDisabled);

      // Add API key hints for display
      const modelsWithHints = models.map((m) => ({
        ...m,
        apiKeyHint: service.getApiKeyHint(m.id),
      }));

      res.json({ success: true, models: modelsWithHints, total: modelsWithHints.length });
    } catch (error) {
      console.error('[Admin] List global models error:', error);
      res.status(500).json({ success: false, error: 'Failed to list global models' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  GET /api/admin/models/:id — get single global model                */
  /* ------------------------------------------------------------------ */
  app.get('/api/admin/models/:id', ...adminGuard, (req: Request, res: Response) => {
    try {
      const service = GlobalModelService.getInstance();
      const model = service.getGlobalModel(req.params.id);
      if (!model) {
        res.status(404).json({ success: false, error: 'Global model not found' });
        return;
      }
      res.json({
        success: true,
        model: {
          ...model,
          apiKeyHint: service.getApiKeyHint(model.id),
        },
      });
    } catch (error) {
      console.error('[Admin] Get global model error:', error);
      res.status(500).json({ success: false, error: 'Failed to get global model' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  POST /api/admin/models — create a new global model                 */
  /* ------------------------------------------------------------------ */
  app.post('/api/admin/models', ...adminGuard, (req: Request, res: Response) => {
    try {
      const dto = req.body as ICreateGlobalModelDTO;

      // Validate required fields
      if (!dto.platform || !dto.name) {
        res.status(400).json({ success: false, error: 'platform and name are required' });
        return;
      }

      const service = GlobalModelService.getInstance();
      const model = service.createGlobalModel(dto, req.user!.id);

      res.status(201).json({
        success: true,
        model: {
          ...model,
          apiKeyHint: service.getApiKeyHint(model.id),
        },
      });
    } catch (error) {
      console.error('[Admin] Create global model error:', error);
      res.status(500).json({ success: false, error: 'Failed to create global model' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  PATCH /api/admin/models/:id — update a global model                */
  /* ------------------------------------------------------------------ */
  app.patch('/api/admin/models/:id', ...adminGuard, (req: Request, res: Response) => {
    try {
      const dto = req.body as IUpdateGlobalModelDTO;
      const service = GlobalModelService.getInstance();
      const model = service.updateGlobalModel(req.params.id, dto);

      if (!model) {
        res.status(404).json({ success: false, error: 'Global model not found' });
        return;
      }

      res.json({
        success: true,
        model: {
          ...model,
          apiKeyHint: service.getApiKeyHint(model.id),
        },
      });
    } catch (error) {
      console.error('[Admin] Update global model error:', error);
      res.status(500).json({ success: false, error: 'Failed to update global model' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  DELETE /api/admin/models/:id — delete a global model               */
  /* ------------------------------------------------------------------ */
  app.delete('/api/admin/models/:id', ...adminGuard, (req: Request, res: Response) => {
    try {
      const service = GlobalModelService.getInstance();
      const deleted = service.deleteGlobalModel(req.params.id);

      if (!deleted) {
        res.status(404).json({ success: false, error: 'Global model not found' });
        return;
      }

      res.json({ success: true, message: 'Global model deleted' });
    } catch (error) {
      console.error('[Admin] Delete global model error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete global model' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  POST /api/admin/models/:id/toggle — enable/disable a global model  */
  /* ------------------------------------------------------------------ */
  app.post('/api/admin/models/:id/toggle', ...adminGuard, (req: Request, res: Response) => {
    try {
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'enabled must be a boolean' });
        return;
      }

      const service = GlobalModelService.getInstance();
      const model = service.updateGlobalModel(req.params.id, { enabled });

      if (!model) {
        res.status(404).json({ success: false, error: 'Global model not found' });
        return;
      }

      res.json({
        success: true,
        model: {
          ...model,
          apiKeyHint: service.getApiKeyHint(model.id),
        },
      });
    } catch (error) {
      console.error('[Admin] Toggle global model error:', error);
      res.status(500).json({ success: false, error: 'Failed to toggle global model' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  POST /api/admin/models/reorder — update priorities for all models  */
  /* ------------------------------------------------------------------ */
  app.post('/api/admin/models/reorder', ...adminGuard, (req: Request, res: Response) => {
    try {
      const { order } = req.body as { order?: string[] };
      if (!Array.isArray(order)) {
        res.status(400).json({ success: false, error: 'order must be an array of model IDs' });
        return;
      }

      const service = GlobalModelService.getInstance();

      // Update priority for each model (higher index = lower priority)
      order.forEach((id, index) => {
        service.updateGlobalModel(id, { priority: order.length - index });
      });

      const models = service.listGlobalModels(true);
      res.json({ success: true, models });
    } catch (error) {
      console.error('[Admin] Reorder global models error:', error);
      res.status(500).json({ success: false, error: 'Failed to reorder global models' });
    }
  });
}

export default registerAdminRoutes;
