/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { compare, hash } from 'bcrypt-ts';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AUTH_CONFIG } from '../../config/constants';
import type { AuthUser } from '../repository/UserRepository';
import { UserRepository } from '../repository/UserRepository';

interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'user' | 'viewer';
  authMethod: 'local' | 'oidc';
  iat?: number;
  exp?: number;
}

interface RefreshTokenPayload {
  userId: string;
  type: 'refresh';
  jti: string; // unique token ID for rotation tracking
  iat?: number;
  exp?: number;
}

type RawTokenPayload = Omit<TokenPayload, 'userId'> & {
  userId: string | number;
};

type RawRefreshTokenPayload = Omit<RefreshTokenPayload, 'userId'> & {
  userId: string | number;
};

interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}

// bcrypt-ts provides native Promise API, no callback wrappers needed
const hashPasswordAsync = (password: string, saltRounds: number): Promise<string> => hash(password, saltRounds);

const comparePasswordAsync = (password: string, hashValue: string): Promise<boolean> => compare(password, hashValue);

/**
 * Get database instance lazily to avoid circular dependency
 */
function getDb() {
  const { getDatabase } = require('@process/database/export');
  return getDatabase();
}

/**
 * Authentication Service - handles password hashing, token issuance, and validation
 *
 * Token architecture:
 * - Access tokens: Short-lived (15 min), used for API auth
 * - Refresh tokens: Long-lived (7 days), stored in DB, supports rotation & revocation
 * - Token blacklist: Persisted in SQLite, survives restarts
 */
export class AuthService {
  private static readonly SALT_ROUNDS = 13;
  private static jwtSecret: string | null = null;

  /** In-memory blacklist cache to avoid hitting SQLite on every request */
  private static blacklistCache: Map<string, number> = new Map();
  private static readonly BLACKLIST_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  private static blacklistCleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Add token to blacklist (called on logout)
   * Persists to SQLite and caches in memory
   */
  public static blacklistToken(token: string): void {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const expiresAt = decoded?.exp ?? Math.floor(Date.now() / 1000) + Math.floor(AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE / 1000);

      // Persist to database
      try {
        const db = getDb();
        db.blacklistToken(tokenHash, expiresAt);
      } catch {
        // DB not available (e.g. shutdown) — in-memory only
      }

      // Cache in memory
      this.blacklistCache.set(tokenHash, expiresAt * 1000);
      this.startBlacklistCleanup();
    } catch {
      const fallbackExpiry = Math.floor(Date.now() / 1000) + Math.floor(AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE / 1000);
      try {
        const db = getDb();
        db.blacklistToken(tokenHash, fallbackExpiry);
      } catch {
        /* ignore */
      }
      this.blacklistCache.set(tokenHash, fallbackExpiry * 1000);
    }
  }

  /**
   * Check if token is blacklisted (checks memory cache first, then DB)
   */
  public static isTokenBlacklisted(token: string): boolean {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Check in-memory cache first
    const cachedExpiry = this.blacklistCache.get(tokenHash);
    if (cachedExpiry) {
      if (Date.now() > cachedExpiry) {
        this.blacklistCache.delete(tokenHash);
        return false;
      }
      return true;
    }

    // Check persistent store
    try {
      const db = getDb();
      const result = db.isTokenBlacklisted(tokenHash);
      if (result.success && result.data) {
        // Warm the cache
        const decoded = jwt.decode(token) as { exp?: number } | null;
        if (decoded?.exp) {
          this.blacklistCache.set(tokenHash, decoded.exp * 1000);
        }
        return true;
      }
    } catch {
      // DB not available — rely on cache only
    }

    return false;
  }

  /**
   * Periodic cleanup of expired entries from both memory cache and DB
   */
  private static startBlacklistCleanup(): void {
    if (this.blacklistCleanupTimer) return;

    this.blacklistCleanupTimer = setInterval(() => {
      // Clean in-memory cache
      const now = Date.now();
      for (const [hash, expiry] of this.blacklistCache.entries()) {
        if (now > expiry) this.blacklistCache.delete(hash);
      }

      // Clean persistent store
      try {
        const db = getDb();
        db.cleanupExpiredBlacklist();
        db.cleanupExpiredRefreshTokens();
      } catch {
        /* ignore */
      }
    }, this.BLACKLIST_CLEANUP_INTERVAL);

    this.blacklistCleanupTimer.unref();
  }

  /**
   * Generate a high-entropy random secret key
   */
  private static generateSecretKey(): string {
    // Always rely on randomness for unpredictability
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Load or create the JWT secret and cache it in memory
   *
   * JWT secret is stored in the admin user's row in users table
   */
  public static getJwtSecret(): string {
    if (this.jwtSecret) {
      return this.jwtSecret;
    }

    // Prefer env var for deploy-time override
    if (process.env.JWT_SECRET) {
      this.jwtSecret = process.env.JWT_SECRET;
      return this.jwtSecret;
    }

    try {
      // Read jwt_secret from admin user in database
      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (adminUser && adminUser.jwt_secret) {
        this.jwtSecret = adminUser.jwt_secret;
        return this.jwtSecret;
      }

      // Generate new secret and save to admin user
      if (adminUser) {
        const newSecret = this.generateSecretKey();
        UserRepository.updateJwtSecret(adminUser.id, newSecret);
        this.jwtSecret = newSecret;
        return this.jwtSecret;
      }

      // Fallback: If admin user does not exist (should not happen)
      console.warn('[AuthService] Admin user not found, using temporary secret');
      this.jwtSecret = this.generateSecretKey();
      return this.jwtSecret;
    } catch (error) {
      console.error('Failed to get/save JWT secret:', error);
      this.jwtSecret = this.generateSecretKey();
      return this.jwtSecret;
    }
  }

  /**
   * Rotate the JWT secret to invalidate all existing tokens
   */
  public static invalidateAllTokens(): void {
    try {
      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (!adminUser) {
        console.warn('[AuthService] Admin user not found, cannot invalidate tokens');
        return;
      }

      const newSecret = this.generateSecretKey();
      UserRepository.updateJwtSecret(adminUser.id, newSecret);
      this.jwtSecret = newSecret;
    } catch (error) {
      console.error('Failed to invalidate tokens:', error);
    }
  }

  /**
   * Hash password using bcrypt
   */
  public static hashPassword(password: string): Promise<string> {
    return hashPasswordAsync(password, this.SALT_ROUNDS);
  }

  /**
   * Verify whether the password matches the stored hash
   */
  public static verifyPassword(password: string, hash: string): Promise<boolean> {
    return comparePasswordAsync(password, hash);
  }

  /**
   * Generate short-lived access token (15 min)
   */
  public static generateToken(user: Pick<AuthUser, 'id' | 'username' | 'role' | 'auth_method'>): string {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role ?? 'user',
      authMethod: user.auth_method ?? 'local',
    };

    return jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: AUTH_CONFIG.TOKEN.ACCESS_EXPIRY,
      issuer: 'aionui',
      audience: 'aionui-webui',
    });
  }

  /**
   * Generate long-lived refresh token (7 days)
   * Stored in database for revocation and rotation tracking
   */
  public static generateRefreshToken(userId: string): string {
    const jti = crypto.randomBytes(16).toString('hex');

    const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
      userId,
      type: 'refresh',
      jti,
    };

    const token = jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: AUTH_CONFIG.TOKEN.REFRESH_EXPIRY,
      issuer: 'aionui',
      audience: 'aionui-refresh',
    });

    // Store hash in DB for revocation
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + AUTH_CONFIG.TOKEN.REFRESH_EXPIRY_SECONDS;

    try {
      const db = getDb();
      db.storeRefreshToken(jti, userId, tokenHash, expiresAt);
    } catch (error) {
      console.error('[AuthService] Failed to store refresh token:', error);
    }

    return token;
  }

  /**
   * Verify a refresh token — checks JWT validity and DB revocation status
   */
  public static verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      if (this.isTokenBlacklisted(token)) return null;

      const decoded = jwt.verify(token, this.getJwtSecret(), {
        issuer: 'aionui',
        audience: 'aionui-refresh',
      }) as RawRefreshTokenPayload;

      if (decoded.type !== 'refresh') return null;

      // Verify token exists and is not revoked in DB
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      try {
        const db = getDb();
        const result = db.findRefreshToken(tokenHash);
        if (!result.success || !result.data) return null;
      } catch {
        // DB not available — allow if JWT is valid
      }

      return {
        ...decoded,
        userId: this.normalizeUserId(decoded.userId),
      };
    } catch {
      return null;
    }
  }

  /**
   * Rotate a refresh token: revoke old, issue new
   * Returns null if the old token is invalid/revoked
   */
  public static rotateRefreshToken(oldToken: string): { accessToken: string; refreshToken: string } | null {
    const decoded = this.verifyRefreshToken(oldToken);
    if (!decoded) return null;

    // Look up user to get current role/auth_method for the new access token
    const user = UserRepository.findById(decoded.userId);
    if (!user) return null;

    // Revoke old refresh token
    const oldHash = crypto.createHash('sha256').update(oldToken).digest('hex');
    const newRefreshToken = this.generateRefreshToken(decoded.userId);
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    try {
      const db = getDb();
      db.revokeRefreshToken(oldHash, newHash);
    } catch {
      /* best effort */
    }

    const accessToken = this.generateToken(user);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Revoke all refresh tokens for a user (password change, forced logout)
   */
  public static revokeAllUserTokens(userId: string): void {
    try {
      const db = getDb();
      db.revokeAllUserRefreshTokens(userId);
    } catch (error) {
      console.error('[AuthService] Failed to revoke user tokens:', error);
    }
  }

  /**
   * Normalize database user id into a consistent string
   *
   * Note: In new architecture, all user IDs are already strings (e.g., "auth_1234567890_abc")
   * This function simply ensures the ID is a string type.
   */
  private static normalizeUserId(rawId: string | number): string {
    return String(rawId);
  }

  /**
   * Verify standard WebUI session token validity
   */
  public static verifyToken(token: string): TokenPayload | null {
    try {
      // Check blacklist first
      if (this.isTokenBlacklisted(token)) {
        return null;
      }

      const decoded = jwt.verify(token, this.getJwtSecret(), {
        issuer: 'aionui',
        audience: 'aionui-webui',
      }) as RawTokenPayload;

      return {
        ...decoded,
        userId: this.normalizeUserId(decoded.userId),
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
        return null;
      }
      console.error('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Verify WebSocket token
   *
   * Reuses Web login token (audience: aionui-webui)
   *
   * @param token - JWT token string
   * @returns Token payload if valid, null otherwise
   */
  public static verifyWebSocketToken(token: string): TokenPayload | null {
    try {
      // Check blacklist first
      if (this.isTokenBlacklisted(token)) {
        return null;
      }

      const decoded = jwt.verify(token, this.getJwtSecret(), {
        issuer: 'aionui',
        audience: 'aionui-webui', // Uses the same audience as Web login
      }) as RawTokenPayload;

      return {
        ...decoded,
        userId: this.normalizeUserId(decoded.userId),
      };
    } catch (error) {
      console.error('WebSocket token verification failed:', error);
      return null;
    }
  }

  /**
   * Refresh a session token without enforcing expiry check
   */
  public static refreshToken(token: string): string | null {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    // Skip expiry check when refreshing token
    return this.generateToken({
      id: this.normalizeUserId(decoded.userId),
      username: decoded.username,
      role: decoded.role,
      auth_method: decoded.authMethod,
    });
  }

  /**
   * Generate a random password with required complexity
   */
  public static generateRandomPassword(): string {
    const baseLength = 12;
    const lengthVariance = 5;
    const passwordLength = baseLength + crypto.randomInt(0, lengthVariance);

    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%^&*';
    const allChars = lowercase + uppercase + digits + special;

    const ensureCategory = (chars: string) => chars[crypto.randomInt(0, chars.length)];

    const passwordChars: string[] = [ensureCategory(lowercase), ensureCategory(uppercase), ensureCategory(digits), ensureCategory(special)];

    const remainingLength = Math.max(passwordLength - passwordChars.length, 0);
    for (let i = 0; i < remainingLength; i++) {
      const index = crypto.randomInt(0, allChars.length);
      passwordChars.push(allChars[index]);
    }

    // Shuffle to avoid predictable category order
    for (let i = passwordChars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
    }

    return passwordChars.join('');
  }

  /**
   * Generate random credentials for initial bootstrap
   */
  public static generateUserCredentials(): UserCredentials {
    // Username length fixed to 6-8 chars for memorability
    const usernameLength = crypto.randomInt(6, 9); // 6-8 chars
    const usernameChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let username = '';
    for (let i = 0; i < usernameLength; i++) {
      username += usernameChars[crypto.randomInt(0, usernameChars.length)];
    }

    return {
      username,
      password: this.generateRandomPassword(),
      createdAt: Date.now(),
    };
  }

  /**
   * Validate password strength (simplified for local WebUI)
   */
  public static validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Only require minimum length
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must be less than 128 characters long');
    }

    // Block obvious weak passwords
    const weakPasswords = ['password', '12345678', '123456789', 'qwertyui', 'abcdefgh'];
    if (weakPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common, please choose a stronger one');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate username format requirements
   */
  public static validateUsername(username: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }

    if (username.length > 32) {
      errors.push('Username must be less than 32 characters long');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, hyphens, and underscores');
    }

    if (/^[_-]|[_-]$/.test(username)) {
      errors.push('Username cannot start or end with hyphen or underscore');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate a high-entropy session identifier
   */
  public static generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Perform constant-time comparison to mitigate timing attacks
   */
  public static async constantTimeVerify(provided: string, expected: string, hashProvided = false): Promise<boolean> {
    // Ensure constant-time comparison routine
    const start = process.hrtime.bigint();

    let result: boolean;
    if (hashProvided) {
      result = await comparePasswordAsync(provided, expected);
    } else {
      result = crypto.timingSafeEqual(Buffer.from(provided.padEnd(expected.length, '0')), Buffer.from(expected.padEnd(provided.length, '0')));
    }

    // Add minimum delay to prevent timing attacks
    const elapsed = process.hrtime.bigint() - start;
    const minDelay = BigInt(50_000_000); // 50ms in nanoseconds
    if (elapsed < minDelay) {
      const delayMs = Number((minDelay - elapsed) / BigInt(1_000_000));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return result;
  }
}

export default AuthService;
