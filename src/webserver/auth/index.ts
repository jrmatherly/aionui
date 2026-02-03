/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authentication module unified export entry
 *
 * Directory Structure:
 * - middleware/   : Middleware layer, handles request validation and interception
 * - repository/   : Data access layer, handles data storage and queries
 * - service/      : Business logic layer, core authentication functionality
 */

// Middleware
export { AuthMiddleware } from './middleware/AuthMiddleware';
export { scopeToUser } from './middleware/DataScopeMiddleware';
export { originGuard } from './middleware/OriginGuard';
export { requireAdmin, requireRole, requireUser } from './middleware/RoleMiddleware';
export { TokenMiddleware, TokenUtils, createAuthMiddleware } from './middleware/TokenMiddleware';
export type { TokenPayload } from './middleware/TokenMiddleware';

// Repository
export { RateLimitStore } from './repository/RateLimitStore';
export { UserRepository } from './repository/UserRepository';
export type { AuthUser } from './repository/UserRepository';

// Config
export { OIDC_CONFIG } from './config/oidcConfig';
export type { IOidcConfig } from './config/oidcConfig';
export { GROUP_MAPPINGS, resolveRoleFromGroups } from './config/groupMappings';
export type { IGroupRoleMapping } from './config/groupMappings';

// Service
export { AuthService } from './service/AuthService';
export { OidcService } from './service/OidcService';
export type { OidcCallbackResult } from './service/OidcService';
