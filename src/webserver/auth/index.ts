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
export { TokenMiddleware, TokenUtils, createAuthMiddleware } from './middleware/TokenMiddleware';
export type { TokenPayload } from './middleware/TokenMiddleware';

// Repository
export { RateLimitStore } from './repository/RateLimitStore';
export { UserRepository } from './repository/UserRepository';
export type { AuthUser } from './repository/UserRepository';

// Service
export { AuthService } from './service/AuthService';
