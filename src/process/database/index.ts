/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingCodeRow, IChannelPairingRequest, IChannelPluginConfig, IChannelSession, IChannelSessionRow, IChannelUser, IChannelUserRow, PluginStatus, PluginType } from '@/channels/types';
import { rowToChannelSession, rowToChannelUser, rowToPairingRequest } from '@/channels/types';
import { decryptCredentials, encryptCredentials } from '@/channels/utils/credentialCrypto';
import { ensureDirectory, getDataPath } from '@process/utils';
import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrations as executeMigrations } from './migrations';
import { syncLoggingConfigFromEnv } from './migrations/v17_add_logging_config';
import { CURRENT_DB_VERSION, getDatabaseVersion, initSchema, setDatabaseVersion } from './schema';
import type { IConversationRow, IMessageRow, IOrgDirectories, IOrgMember, IOrganization, IPaginatedResult, IQueryResult, ITeam, ITeamDirectories, ITeamMember, IUser, IUserDirectories, MemberRole, TChatConversation, TMessage } from './types';
import { conversationToRow, messageToRow, rowToConversation, rowToMessage } from './types';
import { uuid } from '@/common/utils';
import { randomUUID } from 'crypto';
import { dbLogger as log } from '@/common/logger';

/**
 * Main database class for AionUi
 * Uses better-sqlite3 for fast, synchronous SQLite operations
 */
export class AionUIDatabase {
  private db: Database.Database;
  private readonly defaultUserId = 'system_default_user';
  private readonly systemPasswordPlaceholder = '';

  constructor() {
    const finalPath = path.join(getDataPath(), 'aionui.db');
    log.info({ path: finalPath }, 'Initializing database');

    const dir = path.dirname(finalPath);
    ensureDirectory(dir);

    try {
      this.db = new BetterSqlite3(finalPath);
      this.initialize();
    } catch (error) {
      log.error({ err: error }, 'Failed to initialize, attempting recovery');
      // Try to recover by closing and recreating database
      try {
        if (this.db) {
          this.db.close();
        }
      } catch (e) {
        // Ignore close errors
      }

      // Backup corrupted database file
      if (fs.existsSync(finalPath)) {
        const backupPath = `${finalPath}.backup.${Date.now()}`;
        try {
          fs.renameSync(finalPath, backupPath);
          log.info({ backupPath }, 'Backed up corrupted database');
        } catch (e) {
          log.error({ err: e }, 'Failed to backup corrupted database');
          // If backup fails, try to delete instead
          try {
            fs.unlinkSync(finalPath);
            log.info('Deleted corrupted database file');
          } catch (e2) {
            log.error({ err: e2 }, 'Failed to delete corrupted database');
            throw new Error('Database is corrupted and cannot be recovered. Please manually delete: ' + finalPath);
          }
        }
      }

      // Retry with fresh database file
      this.db = new BetterSqlite3(finalPath);
      this.initialize();
    }
  }

  private initialize(): void {
    try {
      initSchema(this.db);

      // Check and run migrations if needed
      const currentVersion = getDatabaseVersion(this.db);
      if (currentVersion < CURRENT_DB_VERSION) {
        this.runMigrations(currentVersion, CURRENT_DB_VERSION);
        setDatabaseVersion(this.db, CURRENT_DB_VERSION);
      }

      this.ensureSystemUser();

      // Sync logging_config from environment variables on every startup
      // so .env / docker-compose changes are reflected in the admin UI.
      this.syncLoggingEnv();
    } catch (error) {
      log.error({ err: error }, 'Initialization failed');
      throw error;
    }
  }

  private runMigrations(from: number, to: number): void {
    executeMigrations(this.db, from, to);
  }

  /** Sync logging_config default row from env vars (runs every startup). */
  private syncLoggingEnv(): void {
    try {
      syncLoggingConfigFromEnv(this.db);
    } catch (error) {
      // Non-fatal — table may not exist on very old DBs being migrated
      log.warn({ err: error }, 'Could not sync logging config from env');
    }
  }

  private ensureSystemUser(): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO users (id, username, email, password_hash, avatar_path, role, auth_method, created_at, updated_at, last_login, jwt_secret)
         VALUES (?, ?, NULL, ?, NULL, 'admin', 'local', ?, ?, NULL, NULL)`
      )
      .run(this.defaultUserId, this.defaultUserId, this.systemPasswordPlaceholder, now, now);
  }

  getSystemUser(): IUser | null {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(this.defaultUserId) as IUser | undefined;
    return user ?? null;
  }

  setSystemUserCredentials(username: string, passwordHash: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE users
         SET username = ?, password_hash = ?, updated_at = ?, created_at = COALESCE(created_at, ?)
         WHERE id = ?`
      )
      .run(username, passwordHash, now, now, this.defaultUserId);
  }
  /**
   * Get the underlying better-sqlite3 database instance.
   * Used by services that need direct SQL access (e.g., UserApiKeyService).
   */
  getRawDb(): Database.Database {
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * ==================
   * User operations
   * ==================
   */

  /**
   * Create a new user in the database
   *
   * @param username - Username (unique identifier)
   * @param email - User email (optional)
   * @param passwordHash - Hashed password (use bcrypt)
   * @returns Query result with created user data
   */
  createUser(username: string, email: string | undefined, passwordHash: string): IQueryResult<IUser> {
    try {
      const userId = `user_${Date.now()}`;
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, avatar_path, role, auth_method, created_at, updated_at, last_login)
        VALUES (?, ?, ?, ?, NULL, 'user', 'local', ?, ?, NULL)
      `);

      stmt.run(userId, username, email ?? null, passwordHash, now, now);

      return {
        success: true,
        data: {
          id: userId,
          username,
          email,
          password_hash: passwordHash,
          role: 'user' as const,
          auth_method: 'local' as const,
          created_at: now,
          updated_at: now,
          last_login: null,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user by user ID
   *
   * @param userId - User ID to query
   * @returns Query result with user data or error if not found
   */
  getUser(userId: string): IQueryResult<IUser> {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as IUser | undefined;

      if (!user) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user by username (used for authentication)
   *
   * @param username - Username to query
   * @returns Query result with user data or null if not found
   */
  getUserByUsername(username: string): IQueryResult<IUser | null> {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as IUser | undefined;

      return {
        success: true,
        data: user ?? null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Get all users (excluding system default user)
   *
   * @returns Query result with array of all users ordered by creation time
   */
  getAllUsers(): IQueryResult<IUser[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC');
      const rows = stmt.all() as IUser[];

      return {
        success: true,
        data: rows,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * Get total count of users (excluding system default user)
   *
   * @returns Query result with user count
   */
  getUserCount(): IQueryResult<number> {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
      const row = stmt.get() as { count: number };

      return {
        success: true,
        data: row.count,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: 0,
      };
    }
  }

  /**
   * Check if any users exist in the database
   *
   * @returns Query result with boolean indicating if users exist
   */
  hasUsers(): IQueryResult<boolean> {
    try {
      // Count only accounts with a non-empty password to ignore placeholder entries
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM users WHERE password_hash IS NOT NULL AND TRIM(password_hash) != ''`);
      const row = stmt.get() as { count: number };
      return {
        success: true,
        data: row.count > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update user's last login timestamp
   *
   * @param userId - User ID to update
   * @returns Query result with success status
   */
  updateUserLastLogin(userId: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?').run(now, now, userId);
      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: false,
      };
    }
  }

  /**
   * Update user's password hash
   *
   * @param userId - User ID to update
   * @param newPasswordHash - New hashed password (use bcrypt)
   * @returns Query result with success status
   */
  updateUserPassword(userId: string, newPasswordHash: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newPasswordHash, now, userId);
      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: false,
      };
    }
  }

  /**
   * Update user's JWT secret
   */
  updateUserJwtSecret(userId: string, jwtSecret: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET jwt_secret = ?, updated_at = ? WHERE id = ?').run(jwtSecret, now, userId);
      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: false,
      };
    }
  }

  /**
   * ==================
   * Conversation operations
   * ==================
   */

  createConversation(conversation: TChatConversation, userId: string = this.defaultUserId): IQueryResult<TChatConversation> {
    try {
      const row = conversationToRow(conversation, userId);

      const stmt = this.db.prepare(`
        INSERT INTO conversations (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(row.id, row.user_id, row.name, row.type, row.extra, row.model, row.status, row.source, row.created_at, row.updated_at);

      return {
        success: true,
        data: conversation,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getConversation(conversationId: string): IQueryResult<TChatConversation> {
    try {
      const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as IConversationRow | undefined;

      if (!row) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      return {
        success: true,
        data: rowToConversation(row),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get conversation with its owner userId
   * Used for per-user API key injection when spawning CLI agents
   * @param conversationId - Conversation ID to query
   */
  getConversationWithUserId(conversationId: string): IQueryResult<{ conversation: TChatConversation; userId: string }> {
    try {
      const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as IConversationRow | undefined;

      if (!row) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      return {
        success: true,
        data: {
          conversation: rowToConversation(row),
          userId: row.user_id,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get the latest conversation by source type
   */
  getLatestConversationBySource(source: 'aionui' | 'telegram', userId: string = this.defaultUserId): IQueryResult<TChatConversation | null> {
    try {
      const finalUserId = userId;
      const row = this.db
        .prepare(
          `
          SELECT * FROM conversations
          WHERE user_id = ? AND source = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `
        )
        .get(finalUserId, source) as IConversationRow | undefined;

      return {
        success: true,
        data: row ? rowToConversation(row) : null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getUserConversations(userId: string = this.defaultUserId, page = 0, pageSize = 50): IPaginatedResult<TChatConversation> {
    try {
      const finalUserId = userId;

      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?').get(finalUserId) as {
        count: number;
      };

      const rows = this.db
        .prepare(
          `
            SELECT *
            FROM conversations
            WHERE user_id = ?
            ORDER BY updated_at DESC LIMIT ?
            OFFSET ?
          `
        )
        .all(finalUserId, pageSize, page * pageSize) as IConversationRow[];

      return {
        data: rows.map(rowToConversation),
        total: countResult.count,
        page,
        pageSize,
        hasMore: (page + 1) * pageSize < countResult.count,
      };
    } catch (error: any) {
      log.error({ err: error }, 'Get conversations error');
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  }

  updateConversation(conversationId: string, updates: Partial<TChatConversation>): IQueryResult<boolean> {
    try {
      const existing = this.getConversation(conversationId);
      if (!existing.success || !existing.data) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      const updated = {
        ...existing.data,
        ...updates,
        modifyTime: Date.now(),
      } as TChatConversation;
      const row = conversationToRow(updated, this.defaultUserId);

      const stmt = this.db.prepare(`
        UPDATE conversations
        SET name       = ?,
            extra      = ?,
            model      = ?,
            status     = ?,
            updated_at = ?
        WHERE id = ?
      `);

      stmt.run(row.name, row.extra, row.model, row.status, row.updated_at, conversationId);

      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  deleteConversation(conversationId: string): IQueryResult<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM conversations WHERE id = ?');
      const result = stmt.run(conversationId);

      return {
        success: true,
        data: result.changes > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ==================
   * Message operations
   * ==================
   */

  insertMessage(message: TMessage): IQueryResult<TMessage> {
    try {
      const row = messageToRow(message);

      const stmt = this.db.prepare(`
        INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(row.id, row.conversation_id, row.msg_id, row.type, row.content, row.position, row.status, row.created_at);

      return {
        success: true,
        data: message,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getConversationMessages(conversationId: string, page = 0, pageSize = 100, order = 'ASC'): IPaginatedResult<TMessage> {
    try {
      const countResult = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(conversationId) as {
        count: number;
      };

      const rows = this.db
        .prepare(
          `
            SELECT *
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ${order} LIMIT ?
            OFFSET ?
          `
        )
        .all(conversationId, pageSize, page * pageSize) as IMessageRow[];

      return {
        data: rows.map(rowToMessage),
        total: countResult.count,
        page,
        pageSize,
        hasMore: (page + 1) * pageSize < countResult.count,
      };
    } catch (error: any) {
      log.error({ err: error }, 'Get messages error');
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  }

  /**
   * Update a message in the database
   * @param messageId - Message ID to update
   * @param message - Updated message data
   */
  updateMessage(messageId: string, message: TMessage): IQueryResult<boolean> {
    try {
      const row = messageToRow(message);

      const stmt = this.db.prepare(`
        UPDATE messages
        SET type     = ?,
            content  = ?,
            position = ?,
            status   = ?
        WHERE id = ?
      `);

      const result = stmt.run(row.type, row.content, row.position, row.status, messageId);

      return {
        success: true,
        data: result.changes > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  deleteMessage(messageId: string): IQueryResult<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
      const result = stmt.run(messageId);

      return {
        success: true,
        data: result.changes > 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  deleteConversationMessages(conversationId: string): IQueryResult<number> {
    try {
      const stmt = this.db.prepare('DELETE FROM messages WHERE conversation_id = ?');
      const result = stmt.run(conversationId);

      return {
        success: true,
        data: result.changes,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get message by msg_id and conversation_id
   * Used for finding existing messages to update (e.g., streaming text accumulation)
   */
  getMessageByMsgId(conversationId: string, msgId: string, type: TMessage['type']): IQueryResult<TMessage | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT *
        FROM messages
        WHERE conversation_id = ?
          AND msg_id = ?
          AND type = ?
        ORDER BY created_at DESC LIMIT 1
      `);

      const row = stmt.get(conversationId, msgId, type) as IMessageRow | undefined;

      return {
        success: true,
        data: row ? rowToMessage(row) : null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ==================
   * Channel Plugin operations
   * ==================
   */

  /**
   * Get all assistant plugins
   */
  getChannelPlugins(): IQueryResult<IChannelPluginConfig[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM assistant_plugins ORDER BY created_at ASC').all() as Array<{
        id: string;
        type: string;
        name: string;
        enabled: number;
        config: string;
        status: string | null;
        last_connected: number | null;
        created_at: number;
        updated_at: number;
      }>;

      const plugins: IChannelPluginConfig[] = rows.map((row) => {
        const storedConfig = JSON.parse(row.config || '{}');
        // Decrypt credentials when loading
        const decryptedCredentials = decryptCredentials(storedConfig.credentials);

        return {
          id: row.id,
          type: row.type as PluginType,
          name: row.name,
          enabled: row.enabled === 1,
          credentials: decryptedCredentials,
          config: storedConfig.config,
          status: (row.status as PluginStatus) || 'stopped',
          lastConnected: row.last_connected ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });

      return { success: true, data: plugins };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get assistant plugin by ID
   */
  getChannelPlugin(pluginId: string): IQueryResult<IChannelPluginConfig | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_plugins WHERE id = ?').get(pluginId) as
        | {
            id: string;
            type: string;
            name: string;
            enabled: number;
            config: string;
            status: string | null;
            last_connected: number | null;
            created_at: number;
            updated_at: number;
          }
        | undefined;

      if (!row) {
        return { success: true, data: null };
      }

      const storedConfig = JSON.parse(row.config || '{}');
      // Decrypt credentials when loading
      const decryptedCredentials = decryptCredentials(storedConfig.credentials);

      const plugin: IChannelPluginConfig = {
        id: row.id,
        type: row.type as PluginType,
        name: row.name,
        enabled: row.enabled === 1,
        credentials: decryptedCredentials,
        config: storedConfig.config,
        status: (row.status as PluginStatus) || 'stopped',
        lastConnected: row.last_connected ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return { success: true, data: plugin };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update assistant plugin
   */
  upsertChannelPlugin(plugin: IChannelPluginConfig): IQueryResult<boolean> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO assistant_plugins (id, type, name, enabled, config, status, last_connected, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          enabled = excluded.enabled,
          config = excluded.config,
          status = excluded.status,
          last_connected = excluded.last_connected,
          updated_at = excluded.updated_at
      `);

      // Encrypt credentials before storing
      const encryptedCredentials = encryptCredentials(plugin.credentials);

      // Store both credentials and config in the config column
      const storedConfig = {
        credentials: encryptedCredentials,
        config: plugin.config,
      };

      stmt.run(plugin.id, plugin.type, plugin.name, plugin.enabled ? 1 : 0, JSON.stringify(storedConfig), plugin.status, plugin.lastConnected ?? null, plugin.createdAt || now, now);

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update assistant plugin status
   */
  updateChannelPluginStatus(pluginId: string, status: PluginStatus, lastConnected?: number): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE assistant_plugins SET status = ?, last_connected = COALESCE(?, last_connected), updated_at = ? WHERE id = ?').run(status, lastConnected ?? null, now, pluginId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete assistant plugin
   */
  deleteChannelPlugin(pluginId: string): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM assistant_plugins WHERE id = ?').run(pluginId);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ==================
   * Channel User operations
   * ==================
   */

  /**
   * Get all authorized assistant users
   */
  getChannelUsers(): IQueryResult<IChannelUser[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM assistant_users ORDER BY authorized_at DESC').all() as IChannelUserRow[];
      return { success: true, data: rows.map(rowToChannelUser) };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get assistant user by platform user ID
   */
  getChannelUserByPlatform(platformUserId: string, platformType: PluginType): IQueryResult<IChannelUser | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_users WHERE platform_user_id = ? AND platform_type = ?').get(platformUserId, platformType) as IChannelUserRow | undefined;

      return { success: true, data: row ? rowToChannelUser(row) : null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create assistant user (authorize)
   */
  createChannelUser(user: IChannelUser): IQueryResult<IChannelUser> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO assistant_users (id, platform_user_id, platform_type, display_name, authorized_at, last_active, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(user.id, user.platformUserId, user.platformType, user.displayName ?? null, user.authorizedAt, user.lastActive ?? null, user.sessionId ?? null);

      return { success: true, data: user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update assistant user's last active time
   */
  updateChannelUserActivity(userId: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE assistant_users SET last_active = ? WHERE id = ?').run(now, userId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete assistant user (revoke authorization)
   */
  deleteChannelUser(userId: string): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM assistant_users WHERE id = ?').run(userId);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ==================
   * Channel Session operations
   * ==================
   */

  /**
   * Get all active assistant sessions
   */
  getChannelSessions(): IQueryResult<IChannelSession[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM assistant_sessions ORDER BY last_activity DESC').all() as IChannelSessionRow[];
      return { success: true, data: rows.map(rowToChannelSession) };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get assistant session by user ID
   */
  getChannelSessionByUser(userId: string): IQueryResult<IChannelSession | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_sessions WHERE user_id = ?').get(userId) as IChannelSessionRow | undefined;
      return { success: true, data: row ? rowToChannelSession(row) : null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update assistant session
   */
  upsertChannelSession(session: IChannelSession): IQueryResult<boolean> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO assistant_sessions (id, user_id, agent_type, conversation_id, workspace, created_at, last_activity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          agent_type = excluded.agent_type,
          conversation_id = excluded.conversation_id,
          workspace = excluded.workspace,
          last_activity = excluded.last_activity
      `);

      stmt.run(session.id, session.userId, session.agentType, session.conversationId ?? null, session.workspace ?? null, session.createdAt || now, session.lastActivity || now);

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete assistant session
   */
  deleteChannelSession(sessionId: string): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM assistant_sessions WHERE id = ?').run(sessionId);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ==================
   * Channel Pairing Code operations
   * ==================
   */

  /**
   * Get all pending pairing requests
   */
  getPendingPairingRequests(): IQueryResult<IChannelPairingRequest[]> {
    try {
      const now = Date.now();
      const rows = this.db.prepare("SELECT * FROM assistant_pairing_codes WHERE status = 'pending' AND expires_at > ? ORDER BY requested_at DESC").all(now) as IChannelPairingCodeRow[];
      return { success: true, data: rows.map(rowToPairingRequest) };
    } catch (error: any) {
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get pairing request by code
   */
  getPairingRequestByCode(code: string): IQueryResult<IChannelPairingRequest | null> {
    try {
      const row = this.db.prepare('SELECT * FROM assistant_pairing_codes WHERE code = ?').get(code) as IChannelPairingCodeRow | undefined;
      return { success: true, data: row ? rowToPairingRequest(row) : null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create pairing request
   */
  createPairingRequest(request: IChannelPairingRequest): IQueryResult<IChannelPairingRequest> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO assistant_pairing_codes (code, platform_user_id, platform_type, display_name, requested_at, expires_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(request.code, request.platformUserId, request.platformType, request.displayName ?? null, request.requestedAt, request.expiresAt, request.status);

      return { success: true, data: request };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update pairing request status
   */
  updatePairingRequestStatus(code: string, status: IChannelPairingRequest['status']): IQueryResult<boolean> {
    try {
      const result = this.db.prepare('UPDATE assistant_pairing_codes SET status = ? WHERE code = ?').run(status, code);
      return { success: true, data: result.changes > 0 };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete expired pairing requests
   */
  cleanupExpiredPairingRequests(): IQueryResult<number> {
    try {
      const now = Date.now();
      const result = this.db.prepare("DELETE FROM assistant_pairing_codes WHERE expires_at < ? OR status != 'pending'").run(now);
      return { success: true, data: result.changes };
    } catch (error: any) {
      return { success: false, error: error.message, data: 0 };
    }
  }

  /**
   * ==================
   * Multi-user auth operations
   * ==================
   */

  /**
   * Get user by OIDC subject identifier
   */
  getUserByOidcSubject(oidcSubject: string): IQueryResult<IUser | null> {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE oidc_subject = ?').get(oidcSubject) as IUser | undefined;
      return {
        success: true,
        data: user ?? null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Create a user via OIDC provisioning (JIT - Just In Time)
   */
  createOidcUser(params: { username: string; oidcSubject: string; displayName?: string; email?: string; role: string; groups?: string[]; avatarUrl?: string }): IQueryResult<IUser> {
    try {
      const userId = `user_${randomUUID()}`;
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role, auth_method, oidc_subject, display_name, groups, avatar_url, created_at, updated_at)
        VALUES (?, ?, ?, '', ?, 'oidc', ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(userId, params.username, params.email ?? null, params.role, params.oidcSubject, params.displayName ?? null, params.groups ? JSON.stringify(params.groups) : null, params.avatarUrl ?? null, now, now);

      return {
        success: true,
        data: {
          id: userId,
          username: params.username,
          email: params.email,
          password_hash: '',
          role: params.role as IUser['role'],
          auth_method: 'oidc' as const,
          oidc_subject: params.oidcSubject,
          display_name: params.displayName ?? null,
          groups: params.groups ? JSON.stringify(params.groups) : null,
          avatar_url: params.avatarUrl ?? null,
          created_at: now,
          updated_at: now,
          last_login: null,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update OIDC user info on subsequent logins
   */
  updateOidcUserInfo(
    userId: string,
    updates: {
      role?: string;
      groups?: string[];
      displayName?: string;
      avatarUrl?: string;
    }
  ): IQueryResult<boolean> {
    try {
      const now = Date.now();
      const setClauses: string[] = ['updated_at = ?'];
      const params: any[] = [now];

      if (updates.role !== undefined) {
        setClauses.push('role = ?');
        params.push(updates.role);
      }
      if (updates.groups !== undefined) {
        setClauses.push('groups = ?');
        params.push(JSON.stringify(updates.groups));
      }
      if (updates.displayName !== undefined) {
        setClauses.push('display_name = ?');
        params.push(updates.displayName);
      }
      if (updates.avatarUrl !== undefined) {
        setClauses.push('avatar_url = ?');
        params.push(updates.avatarUrl);
      }

      params.push(userId);
      this.db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update user role (admin override)
   */
  updateUserRole(userId: string, role: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, userId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update the owner of a conversation (used for multi-user assignment)
   */
  updateConversationUserId(conversationId: string, userId: string): IQueryResult<boolean> {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE conversations SET user_id = ?, updated_at = ? WHERE id = ?').run(userId, now, conversationId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── Refresh Tokens ───────────────────────────────────────────────

  /**
   * Store a refresh token hash for a user
   */
  storeRefreshToken(id: string, userId: string, tokenHash: string, expiresAt: number): IQueryResult<boolean> {
    try {
      this.db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(id, userId, tokenHash, expiresAt, Math.floor(Date.now() / 1000));
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Find a valid (non-revoked, non-expired) refresh token by its hash
   */
  findRefreshToken(tokenHash: string): IQueryResult<{ id: string; user_id: string; expires_at: number } | null> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const row = this.db.prepare('SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > ?').get(tokenHash, now) as { id: string; user_id: string; expires_at: number } | undefined;
      return { success: true, data: row ?? null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke a refresh token (and record its replacement)
   */
  revokeRefreshToken(tokenHash: string, replacedBy?: string): IQueryResult<boolean> {
    try {
      this.db.prepare('UPDATE refresh_tokens SET revoked = 1, replaced_by = ? WHERE token_hash = ?').run(replacedBy ?? null, tokenHash);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke all refresh tokens for a user (e.g. on password change or forced logout)
   */
  revokeAllUserRefreshTokens(userId: string): IQueryResult<boolean> {
    try {
      this.db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0').run(userId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up expired refresh tokens
   */
  cleanupExpiredRefreshTokens(): IQueryResult<number> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const result = this.db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ? OR revoked = 1').run(now);
      return { success: true, data: result.changes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── Token Blacklist (Persistent) ──────────────────────────────────

  /**
   * Add a token hash to the persistent blacklist
   */
  blacklistToken(tokenHash: string, expiresAt: number): IQueryResult<boolean> {
    try {
      this.db.prepare('INSERT OR IGNORE INTO token_blacklist (token_hash, expires_at, created_at) VALUES (?, ?, ?)').run(tokenHash, expiresAt, Math.floor(Date.now() / 1000));
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a token hash is blacklisted
   */
  isTokenBlacklisted(tokenHash: string): IQueryResult<boolean> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const row = this.db.prepare('SELECT 1 FROM token_blacklist WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now);
      return { success: true, data: !!row };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up expired blacklist entries
   */
  cleanupExpiredBlacklist(): IQueryResult<number> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const result = this.db.prepare('DELETE FROM token_blacklist WHERE expires_at < ?').run(now);
      return { success: true, data: result.changes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── User Directories (Per-User Isolation) ──────────────────────────

  /**
   * Get user directories by user ID
   */
  getUserDirectories(userId: string): IQueryResult<IUserDirectories | null> {
    try {
      const row = this.db.prepare('SELECT * FROM user_directories WHERE user_id = ?').get(userId) as IUserDirectories | undefined;
      return { success: true, data: row || null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update user directories
   */
  upsertUserDirectories(dirs: Omit<IUserDirectories, 'id' | 'created_at' | 'updated_at'>): IQueryResult<IUserDirectories> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const id = `udir_${dirs.user_id}`;

      this.db
        .prepare(
          `INSERT INTO user_directories (id, user_id, base_dir, cache_dir, work_dir, skills_dir, assistants_dir, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           base_dir = excluded.base_dir,
           cache_dir = excluded.cache_dir,
           work_dir = excluded.work_dir,
           skills_dir = excluded.skills_dir,
           assistants_dir = excluded.assistants_dir,
           updated_at = excluded.updated_at`
        )
        .run(id, dirs.user_id, dirs.base_dir, dirs.cache_dir, dirs.work_dir, dirs.skills_dir ?? null, dirs.assistants_dir ?? null, now, now);

      return {
        success: true,
        data: {
          id,
          ...dirs,
          created_at: now,
          updated_at: now,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete user directories
   */
  deleteUserDirectories(userId: string): IQueryResult<boolean> {
    try {
      this.db.prepare('DELETE FROM user_directories WHERE user_id = ?').run(userId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── Organizations ────────────────────────────────────────────────

  /**
   * Create organization
   */
  createOrganization(org: Omit<IOrganization, 'id' | 'created_at' | 'updated_at'>): IQueryResult<IOrganization> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const id = `org_${uuid()}`;

      this.db.prepare('INSERT INTO organizations (id, name, slug, description, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, org.name, org.slug, org.description ?? null, org.settings ?? null, now, now);

      return {
        success: true,
        data: {
          id,
          ...org,
          created_at: now,
          updated_at: now,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organization by ID
   */
  getOrganization(orgId: string): IQueryResult<IOrganization | null> {
    try {
      const row = this.db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as IOrganization | undefined;
      return { success: true, data: row || null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organization by slug
   */
  getOrganizationBySlug(slug: string): IQueryResult<IOrganization | null> {
    try {
      const row = this.db.prepare('SELECT * FROM organizations WHERE slug = ?').get(slug) as IOrganization | undefined;
      return { success: true, data: row || null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all organizations for a user
   */
  getUserOrganizations(userId: string): IQueryResult<IOrganization[]> {
    try {
      const rows = this.db
        .prepare(
          `SELECT o.* FROM organizations o
         INNER JOIN org_members om ON o.id = om.org_id
         WHERE om.user_id = ?
         ORDER BY o.name`
        )
        .all(userId) as IOrganization[];
      return { success: true, data: rows };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── Teams ────────────────────────────────────────────────────────

  /**
   * Create team
   */
  createTeam(team: Omit<ITeam, 'id' | 'created_at' | 'updated_at'>): IQueryResult<ITeam> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const id = `team_${uuid()}`;

      this.db.prepare('INSERT INTO teams (id, org_id, name, slug, description, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, team.org_id, team.name, team.slug, team.description ?? null, team.settings ?? null, now, now);

      return {
        success: true,
        data: {
          id,
          ...team,
          created_at: now,
          updated_at: now,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team by ID
   */
  getTeam(teamId: string): IQueryResult<ITeam | null> {
    try {
      const row = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as ITeam | undefined;
      return { success: true, data: row || null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all teams in an organization
   */
  getOrganizationTeams(orgId: string): IQueryResult<ITeam[]> {
    try {
      const rows = this.db.prepare('SELECT * FROM teams WHERE org_id = ? ORDER BY name').all(orgId) as ITeam[];
      return { success: true, data: rows };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all teams for a user
   */
  getUserTeams(userId: string): IQueryResult<ITeam[]> {
    try {
      const rows = this.db
        .prepare(
          `SELECT t.* FROM teams t
         INNER JOIN team_members tm ON t.id = tm.team_id
         WHERE tm.user_id = ?
         ORDER BY t.name`
        )
        .all(userId) as ITeam[];
      return { success: true, data: rows };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── Memberships ──────────────────────────────────────────────────

  /**
   * Add user to organization
   */
  addOrgMember(orgId: string, userId: string, role: MemberRole): IQueryResult<IOrgMember> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const id = `om_${uuid()}`;

      this.db.prepare('INSERT INTO org_members (id, org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)').run(id, orgId, userId, role, now);

      return {
        success: true,
        data: { id, org_id: orgId, user_id: userId, role, joined_at: now },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Add user to team
   */
  addTeamMember(teamId: string, userId: string, role: MemberRole): IQueryResult<ITeamMember> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const id = `tm_${uuid()}`;

      this.db.prepare('INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)').run(id, teamId, userId, role, now);

      return {
        success: true,
        data: { id, team_id: teamId, user_id: userId, role, joined_at: now },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organization members
   */
  getOrgMembers(orgId: string): IQueryResult<Array<IOrgMember & { user: IUser }>> {
    try {
      const rows = this.db
        .prepare(
          `SELECT om.*, u.id as u_id, u.username, u.email, u.display_name, u.avatar_url, u.role as u_role
         FROM org_members om
         INNER JOIN users u ON om.user_id = u.id
         WHERE om.org_id = ?
         ORDER BY om.role, u.username`
        )
        .all(orgId) as any[];

      const members = rows.map((row) => ({
        id: row.id,
        org_id: row.org_id,
        user_id: row.user_id,
        role: row.role as MemberRole,
        joined_at: row.joined_at,
        user: {
          id: row.u_id,
          username: row.username,
          email: row.email,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          role: row.u_role,
        } as IUser,
      }));

      return { success: true, data: members };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team members
   */
  getTeamMembers(teamId: string): IQueryResult<Array<ITeamMember & { user: IUser }>> {
    try {
      const rows = this.db
        .prepare(
          `SELECT tm.*, u.id as u_id, u.username, u.email, u.display_name, u.avatar_url, u.role as u_role
         FROM team_members tm
         INNER JOIN users u ON tm.user_id = u.id
         WHERE tm.team_id = ?
         ORDER BY tm.role, u.username`
        )
        .all(teamId) as any[];

      const members = rows.map((row) => ({
        id: row.id,
        team_id: row.team_id,
        user_id: row.user_id,
        role: row.role as MemberRole,
        joined_at: row.joined_at,
        user: {
          id: row.u_id,
          username: row.username,
          email: row.email,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          role: row.u_role,
        } as IUser,
      }));

      return { success: true, data: members };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove user from organization (also removes from all org teams)
   */
  removeOrgMember(orgId: string, userId: string): IQueryResult<boolean> {
    try {
      // Get all team IDs in this org
      const teams = this.db.prepare('SELECT id FROM teams WHERE org_id = ?').all(orgId) as { id: string }[];
      const teamIds = teams.map((t) => t.id);

      // Remove from all teams in org
      if (teamIds.length > 0) {
        this.db.prepare(`DELETE FROM team_members WHERE user_id = ? AND team_id IN (${teamIds.map(() => '?').join(',')})`).run(userId, ...teamIds);
      }

      // Remove from org
      this.db.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?').run(orgId, userId);

      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove user from team
   */
  removeTeamMember(teamId: string, userId: string): IQueryResult<boolean> {
    try {
      this.db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── Team/Org Directories ─────────────────────────────────────────

  /**
   * Get team directories
   */
  getTeamDirectories(teamId: string): IQueryResult<ITeamDirectories | null> {
    try {
      const row = this.db.prepare('SELECT * FROM team_directories WHERE team_id = ?').get(teamId) as ITeamDirectories | undefined;
      return { success: true, data: row || null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Upsert team directories
   */
  upsertTeamDirectories(dirs: Omit<ITeamDirectories, 'id' | 'created_at' | 'updated_at'>): IQueryResult<ITeamDirectories> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const id = `tdir_${dirs.team_id}`;

      this.db
        .prepare(
          `INSERT INTO team_directories (id, team_id, base_dir, shared_skills_dir, shared_assistants_dir, shared_workspace_dir, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(team_id) DO UPDATE SET
           base_dir = excluded.base_dir,
           shared_skills_dir = excluded.shared_skills_dir,
           shared_assistants_dir = excluded.shared_assistants_dir,
           shared_workspace_dir = excluded.shared_workspace_dir,
           updated_at = excluded.updated_at`
        )
        .run(id, dirs.team_id, dirs.base_dir, dirs.shared_skills_dir ?? null, dirs.shared_assistants_dir ?? null, dirs.shared_workspace_dir ?? null, now, now);

      return {
        success: true,
        data: { id, ...dirs, created_at: now, updated_at: now },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organization directories
   */
  getOrgDirectories(orgId: string): IQueryResult<IOrgDirectories | null> {
    try {
      const row = this.db.prepare('SELECT * FROM org_directories WHERE org_id = ?').get(orgId) as IOrgDirectories | undefined;
      return { success: true, data: row || null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Upsert organization directories
   */
  upsertOrgDirectories(dirs: Omit<IOrgDirectories, 'id' | 'created_at' | 'updated_at'>): IQueryResult<IOrgDirectories> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const id = `odir_${dirs.org_id}`;

      this.db
        .prepare(
          `INSERT INTO org_directories (id, org_id, base_dir, shared_skills_dir, shared_assistants_dir, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id) DO UPDATE SET
           base_dir = excluded.base_dir,
           shared_skills_dir = excluded.shared_skills_dir,
           shared_assistants_dir = excluded.shared_assistants_dir,
           updated_at = excluded.updated_at`
        )
        .run(id, dirs.org_id, dirs.base_dir, dirs.shared_skills_dir ?? null, dirs.shared_assistants_dir ?? null, now, now);

      return {
        success: true,
        data: { id, ...dirs, created_at: now, updated_at: now },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
    log.info('Vacuum completed');
  }
}

// Export singleton instance
let dbInstance: AionUIDatabase | null = null;

export function getDatabase(): AionUIDatabase {
  if (!dbInstance) {
    dbInstance = new AionUIDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
