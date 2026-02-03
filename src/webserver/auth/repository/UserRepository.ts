/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/database/export';
import type { AuthMethod, IQueryResult, IUser, UserRole } from '@process/database/types';

/**
 * Authentication user type containing essential auth + RBAC fields
 */
export type AuthUser = Pick<IUser, 'id' | 'username' | 'password_hash' | 'jwt_secret' | 'role' | 'auth_method' | 'oidc_subject' | 'display_name' | 'groups' | 'created_at' | 'updated_at' | 'last_login'>;

/**
 * Unwrap database query result, throw error on failure
 * @param result - Query result
 * @param errorMessage - Error message
 * @returns Unwrapped data
 */
function unwrap<T>(result: IQueryResult<T>, errorMessage: string): T {
  if (!result.success || typeof result.data === 'undefined' || result.data === null) {
    throw new Error(result.error || errorMessage);
  }
  return result.data;
}

/**
 * Map database user record to auth user object
 * @param row - Database user record
 * @returns Auth user object
 */
function mapUser(row: IUser): AuthUser {
  return {
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    jwt_secret: row.jwt_secret ?? null,
    role: row.role ?? 'user',
    auth_method: row.auth_method ?? 'local',
    oidc_subject: row.oidc_subject ?? null,
    display_name: row.display_name ?? null,
    groups: row.groups ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login: row.last_login ?? null,
  };
}

/**
 * User Repository - Provides user data access interface
 */
export const UserRepository = {
  /**
   * Check if any users exist in the system
   * @returns Whether users exist
   */
  hasUsers(): boolean {
    const db = getDatabase();
    const result = db.hasUsers();
    if (!result.success) {
      throw new Error(result.error || 'Failed to check users');
    }
    // Database layer already ignores placeholder rows without passwords
    return Boolean(result.data);
  },

  getSystemUser(): AuthUser | null {
    const db = getDatabase();
    const system = db.getSystemUser();
    if (!system) {
      return null;
    }
    return mapUser(system);
  },

  setSystemUserCredentials(username: string, passwordHash: string): void {
    const db = getDatabase();
    db.setSystemUserCredentials(username, passwordHash);
  },

  /**
   * Create a new user
   * @param username - Username
   * @param passwordHash - Password hash
   * @returns Created user
   */
  createUser(username: string, passwordHash: string): AuthUser {
    const db = getDatabase();
    const result = db.createUser(username, undefined, passwordHash);
    const user = unwrap(result, 'Failed to create user');
    return mapUser(user);
  },

  /**
   * Find user by username
   * @param username - Username
   * @returns User object or null
   */
  findByUsername(username: string): AuthUser | null {
    const db = getDatabase();
    const result = db.getUserByUsername(username);
    if (!result.success || !result.data) {
      return null;
    }
    return mapUser(result.data);
  },

  /**
   * Find user by ID
   * @param id - User ID
   * @returns User object or null
   */
  findById(id: string): AuthUser | null {
    const db = getDatabase();
    const result = db.getUser(id);
    if (!result.success || !result.data) {
      return null;
    }
    return mapUser(result.data);
  },

  /**
   * Get list of all users
   * @returns Array of users
   */
  listUsers(): AuthUser[] {
    const db = getDatabase();
    const result = db.getAllUsers();
    if (!result.success || !result.data) {
      return [];
    }
    return result.data.map(mapUser);
  },

  /**
   * Count total number of users
   * @returns Number of users
   */
  countUsers(): number {
    const db = getDatabase();
    const result = db.getUserCount();
    if (!result.success) {
      throw new Error(result.error || 'Failed to count users');
    }
    return result.data ?? 0;
  },

  /**
   * Update user password
   * @param userId - User ID
   * @param passwordHash - New password hash
   */
  updatePassword(userId: string, passwordHash: string): void {
    const db = getDatabase();
    const result = db.updateUserPassword(userId, passwordHash);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update user password');
    }
  },

  /**
   * Update user's last login time
   * @param userId - User ID
   */
  updateLastLogin(userId: string): void {
    const db = getDatabase();
    const result = db.updateUserLastLogin(userId);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update last login');
    }
  },

  /**
   * Update user's JWT secret
   * @param userId - User ID
   * @param jwtSecret - JWT secret string
   */
  updateJwtSecret(userId: string, jwtSecret: string): void {
    const db = getDatabase();
    const result = db.updateUserJwtSecret(userId, jwtSecret);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update JWT secret');
    }
  },

  /**
   * Find user by OIDC subject identifier
   * @param oidcSubject - OIDC subject (e.g., EntraID object ID)
   * @returns User object or null
   */
  findByOidcSubject(oidcSubject: string): AuthUser | null {
    const db = getDatabase();
    const result = db.getUserByOidcSubject(oidcSubject);
    if (!result.success || !result.data) {
      return null;
    }
    return mapUser(result.data);
  },

  /**
   * Create a user via OIDC provisioning (JIT)
   * @param params - OIDC user parameters
   * @returns Created user
   */
  createOidcUser(params: { username: string; oidcSubject: string; displayName?: string; email?: string; role: UserRole; groups?: string[] }): AuthUser {
    const db = getDatabase();
    const result = db.createOidcUser(params);
    const user = unwrap(result, 'Failed to create OIDC user');
    return mapUser(user);
  },

  /**
   * Update OIDC user info on subsequent logins
   * @param userId - User ID
   * @param updates - Fields to update
   */
  updateOidcUserInfo(
    userId: string,
    updates: {
      role?: UserRole;
      groups?: string[];
      displayName?: string;
    }
  ): void {
    const db = getDatabase();
    const result = db.updateOidcUserInfo(userId, updates);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update OIDC user info');
    }
  },

  /**
   * Update user role (admin override)
   * @param userId - User ID
   * @param role - New role
   */
  updateRole(userId: string, role: UserRole): void {
    const db = getDatabase();
    const result = db.updateUserRole(userId, role);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update user role');
    }
  },
};
