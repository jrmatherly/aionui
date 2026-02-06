/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/webserver/config/constants';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for sensitive operations like login/register
 */
export const authRateLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter for general API requests (keyed by user ID when authenticated, else IP)
 */
export const apiRateLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 1000,
  max: 60,
  message: {
    error: 'Too many API requests, please slow down.',
  },
  keyGenerator: (req: Request) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
  // Disable IPv6 validation warning - we prefix keys with 'ip:' or 'user:' so raw IP isn't used as key
  validate: { keyGeneratorIpFallback: false },
});

/**
 * Rate limiter for file browsing and related operations
 */
export const fileOperationLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 1000,
  max: 30,
  message: {
    error: 'Too many file operations, please slow down.',
  },
});

/**
 * Rate limiter for sensitive operations by authenticated users (keyed by user ID, fallback to IP)
 */
export const authenticatedActionLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Too many sensitive actions, please try again later.',
  },
  keyGenerator: (req: Request) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
  // Disable IPv6 validation warning - we prefix keys with 'ip:' or 'user:' so raw IP isn't used as key
  validate: { keyGeneratorIpFallback: false },
});

/**
 * Attach CSRF token to response for client-side usage
 * tiny-csrf provides req.csrfToken() method to generate tokens
 * Token is set in both header (for SSR) and cookie (for client-side JS)
 */
export function attachCsrfToken(req: Request, res: Response, next: NextFunction): void {
  // tiny-csrf provides req.csrfToken() method
  if (typeof req.csrfToken === 'function') {
    const token = req.csrfToken();
    res.setHeader(CSRF_HEADER_NAME, token);
    res.locals.csrfToken = token;

    // Also set as a cookie so client-side JS can read it via document.cookie
    // Must NOT be httpOnly so JavaScript can access it
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by client-side JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }
  next();
}

/**
 * Generic rate limiter factory for static routes and other use cases
 */
export function createRateLimiter(options: Parameters<typeof rateLimit>[0]) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
}
