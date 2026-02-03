/**
 * @author Jason Matherly
 * @modified 2026-02-03
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Admin-only routes for user management.
 * All endpoints require admin role.
 */

import { GROUP_MAPPINGS } from '@/webserver/auth/config/groupMappings';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { requireAdmin } from '@/webserver/auth/middleware/RoleMiddleware';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import type { UserRole } from '@process/database/types';
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
}

export default registerAdminRoutes;
