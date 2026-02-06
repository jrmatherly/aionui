/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * GlobalModelService - Admin-managed shared model configurations
 *
 * Provides:
 * - CRUD operations for global models (admin only)
 * - Encrypted API key storage (AES-256-GCM)
 * - Model resolution (user models + visible global models)
 * - User hide/unhide operations
 */

import { modelLogger as log } from '@/common/logger';
import type { IProvider, ModelCapability } from '@/common/storage';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type { ICreateGlobalModelDTO, IGlobalModel, IGlobalModelRow, IGlobalModelWithKey, IUpdateGlobalModelDTO, IUserModelOverride, UserRole } from '../database/types';
import { GROUP_MAPPINGS } from '@/webserver/auth/config/groupMappings';

/**
 * Singleton service for managing global models
 */
export class GlobalModelService {
  private static instance: GlobalModelService | null = null;
  private db: Database.Database;
  private masterKey: Buffer;

  private constructor(db: Database.Database, jwtSecret: string) {
    this.db = db;
    // Derive a 32-byte key from JWT_SECRET using SHA-256
    this.masterKey = crypto.createHash('sha256').update(jwtSecret).digest();
  }

  static initialize(db: Database.Database, jwtSecret: string): GlobalModelService {
    if (!GlobalModelService.instance) {
      GlobalModelService.instance = new GlobalModelService(db, jwtSecret);
    }
    return GlobalModelService.instance;
  }

  static getInstance(): GlobalModelService {
    if (!GlobalModelService.instance) {
      throw new Error('[GlobalModelService] Service not initialized. Call initialize() first.');
    }
    return GlobalModelService.instance;
  }

  // ========================================
  // Encryption helpers
  // ========================================

  /**
   * Derive encryption key for global models
   * Uses a constant salt since these are not user-specific
   */
  private deriveKey(): Buffer {
    return crypto.createHmac('sha256', this.masterKey).update('global_models').digest();
  }

  /**
   * Encrypt API key for storage
   */
  private encrypt(plaintext: string): string {
    const key = this.deriveKey();
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /**
   * Decrypt API key from storage
   */
  private decrypt(encryptedStr: string): string {
    if (!encryptedStr) return '';
    const [ivB64, authTagB64, ciphertextB64] = encryptedStr.split(':');
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new Error('Invalid encrypted API key format');
    }
    const key = this.deriveKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  /**
   * Get API key hint (last 4 characters)
   */
  private getKeyHint(apiKey: string): string {
    if (!apiKey || apiKey.length < 4) return '****';
    return `****${apiKey.slice(-4)}`;
  }

  // ========================================
  // Group access control helpers
  // ========================================

  /**
   * Check if a user has access to a model based on group membership
   *
   * Access rules:
   * 1. Admins always have access (bypass all restrictions)
   * 2. No allowed_groups or empty array = everyone has access
   * 3. Otherwise, user must have at least one matching group
   *
   * Group matching supports both:
   * - Direct group ID match (user's groups contain the ID)
   * - Group name resolution via GROUP_MAPPINGS (name → ID)
   *
   * @param userGroups - User's group IDs from OIDC token (or null for local auth)
   * @param userRole - User's role (admin bypasses restrictions)
   * @param allowedGroups - Model's allowed groups (null/empty = everyone)
   */
  private hasGroupAccess(userGroups: string[] | null, userRole: UserRole, allowedGroups: string[] | null | undefined): boolean {
    // Admin bypass: admins see all models
    if (userRole === 'admin') return true;

    // No restrictions = everyone has access
    if (!allowedGroups || allowedGroups.length === 0) return true;

    // Local auth users without groups: only unrestricted models
    if (!userGroups || userGroups.length === 0) return false;

    // Check each allowed group
    for (const allowed of allowedGroups) {
      // Direct group ID match
      if (userGroups.includes(allowed)) return true;

      // Group name → ID resolution via GROUP_MAPPINGS
      const mapping = GROUP_MAPPINGS.find((m) => m.groupName === allowed);
      if (mapping && userGroups.includes(mapping.groupId)) return true;
    }

    return false;
  }

  // ========================================
  // Row conversion helpers
  // ========================================

  private rowToGlobalModel(row: IGlobalModelRow): IGlobalModel {
    return {
      id: row.id,
      platform: row.platform,
      name: row.name,
      base_url: row.base_url,
      models: JSON.parse(row.models || '[]'),
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined,
      context_limit: row.context_limit ?? undefined,
      custom_headers: row.custom_headers ? JSON.parse(row.custom_headers) : undefined,
      enabled: row.enabled === 1,
      priority: row.priority,
      allowed_groups: row.allowed_groups ? JSON.parse(row.allowed_groups) : null,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private rowToGlobalModelWithKey(row: IGlobalModelRow): IGlobalModelWithKey {
    return {
      ...this.rowToGlobalModel(row),
      api_key: row.encrypted_api_key ? this.decrypt(row.encrypted_api_key) : '',
    };
  }

  /**
   * Convert IGlobalModel to IProvider for model resolution
   */
  private globalModelToProvider(model: IGlobalModelWithKey): IProvider {
    // Convert string capabilities to ModelCapability objects if needed
    let capabilities: ModelCapability[] | undefined;
    if (model.capabilities && model.capabilities.length > 0) {
      // Check if already in the correct format or needs conversion
      if (typeof model.capabilities[0] === 'string') {
        // Convert string array to ModelCapability array
        capabilities = (model.capabilities as unknown as string[]).map((cap) => ({
          type: cap as ModelCapability['type'],
        }));
      } else {
        capabilities = model.capabilities as unknown as ModelCapability[];
      }
    }

    return {
      id: model.id,
      platform: model.platform,
      name: model.name,
      baseUrl: model.base_url,
      apiKey: model.api_key,
      model: model.models,
      capabilities,
      contextLimit: model.context_limit,
      customHeaders: model.custom_headers,
      isGlobal: true,
    };
  }

  // ========================================
  // Admin CRUD operations
  // ========================================

  /**
   * Create a new global model (admin only)
   */
  createGlobalModel(dto: ICreateGlobalModelDTO, adminId: string): IGlobalModel {
    const id = `gm_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO global_models (
        id, platform, name, base_url, encrypted_api_key, models,
        capabilities, context_limit, custom_headers, enabled, priority,
        allowed_groups, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const allowedGroupsJson = dto.allowed_groups?.length ? JSON.stringify(dto.allowed_groups) : null;

    stmt.run(id, dto.platform, dto.name, dto.base_url || '', dto.api_key ? this.encrypt(dto.api_key) : null, JSON.stringify(dto.models || []), dto.capabilities ? JSON.stringify(dto.capabilities) : null, dto.context_limit ?? null, dto.custom_headers ? JSON.stringify(dto.custom_headers) : null, dto.enabled !== false ? 1 : 0, dto.priority ?? 0, allowedGroupsJson, adminId, now, now);

    log.info({ modelId: id, name: dto.name, allowedGroups: dto.allowed_groups }, 'Global model created');
    return this.getGlobalModel(id)!;
  }

  /**
   * Update an existing global model (admin only)
   */
  updateGlobalModel(id: string, dto: IUpdateGlobalModelDTO): IGlobalModel | null {
    const existing = this.getGlobalModelRow(id);
    if (!existing) return null;

    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (dto.platform !== undefined) {
      updates.push('platform = ?');
      values.push(dto.platform);
    }
    if (dto.name !== undefined) {
      updates.push('name = ?');
      values.push(dto.name);
    }
    if (dto.base_url !== undefined) {
      updates.push('base_url = ?');
      values.push(dto.base_url);
    }
    if (dto.api_key !== undefined) {
      updates.push('encrypted_api_key = ?');
      values.push(dto.api_key ? this.encrypt(dto.api_key) : null);
    }
    if (dto.models !== undefined) {
      updates.push('models = ?');
      values.push(JSON.stringify(dto.models));
    }
    if (dto.capabilities !== undefined) {
      updates.push('capabilities = ?');
      values.push(dto.capabilities ? JSON.stringify(dto.capabilities) : null);
    }
    if (dto.context_limit !== undefined) {
      updates.push('context_limit = ?');
      values.push(dto.context_limit);
    }
    if (dto.custom_headers !== undefined) {
      updates.push('custom_headers = ?');
      values.push(dto.custom_headers ? JSON.stringify(dto.custom_headers) : null);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(dto.enabled ? 1 : 0);
    }
    if (dto.priority !== undefined) {
      updates.push('priority = ?');
      values.push(dto.priority);
    }
    if (dto.allowed_groups !== undefined) {
      updates.push('allowed_groups = ?');
      // null or empty array = clear restrictions (everyone)
      values.push(dto.allowed_groups?.length ? JSON.stringify(dto.allowed_groups) : null);
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE global_models SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    log.info({ modelId: id }, 'Global model updated');
    return this.getGlobalModel(id);
  }

  /**
   * Delete a global model (admin only)
   */
  deleteGlobalModel(id: string): boolean {
    // Also delete any user overrides for this model
    this.db.prepare('DELETE FROM user_model_overrides WHERE global_model_id = ?').run(id);
    const result = this.db.prepare('DELETE FROM global_models WHERE id = ?').run(id);
    log.info({ modelId: id }, 'Global model deleted');
    return result.changes > 0;
  }

  /**
   * Get a single global model by ID (without decrypted key)
   */
  getGlobalModel(id: string): IGlobalModel | null {
    const row = this.getGlobalModelRow(id);
    return row ? this.rowToGlobalModel(row) : null;
  }

  /**
   * Get raw row from database
   */
  private getGlobalModelRow(id: string): IGlobalModelRow | null {
    const stmt = this.db.prepare('SELECT * FROM global_models WHERE id = ?');
    return stmt.get(id) as IGlobalModelRow | null;
  }

  /**
   * List all global models (admin view, no decrypted keys)
   */
  listGlobalModels(includeDisabled = false): IGlobalModel[] {
    const sql = includeDisabled ? 'SELECT * FROM global_models ORDER BY priority DESC, name ASC' : 'SELECT * FROM global_models WHERE enabled = 1 ORDER BY priority DESC, name ASC';
    const rows = this.db.prepare(sql).all() as IGlobalModelRow[];
    return rows.map((row) => this.rowToGlobalModel(row));
  }

  /**
   * Get API key hint for display (e.g., "****abc1")
   */
  getApiKeyHint(id: string): string {
    const row = this.getGlobalModelRow(id);
    if (!row || !row.encrypted_api_key) return '';
    try {
      const key = this.decrypt(row.encrypted_api_key);
      return this.getKeyHint(key);
    } catch {
      return '****';
    }
  }

  // ========================================
  // User operations
  // ========================================

  /**
   * Get user's model overrides
   */
  getUserOverrides(userId: string): IUserModelOverride[] {
    const stmt = this.db.prepare('SELECT * FROM user_model_overrides WHERE user_id = ?');
    return stmt.all(userId) as IUserModelOverride[];
  }

  /**
   * Hide a global model for a user
   */
  hideGlobalModel(userId: string, globalModelId: string): void {
    const id = `umo_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO user_model_overrides (id, user_id, global_model_id, override_type, created_at, updated_at)
      VALUES (?, ?, ?, 'hidden', ?, ?)
      ON CONFLICT(user_id, global_model_id) DO UPDATE SET
        override_type = 'hidden',
        local_provider_id = NULL,
        updated_at = excluded.updated_at
    `);
    stmt.run(id, userId, globalModelId, now, now);
    log.info({ userId, globalModelId }, 'User hid global model');
  }

  /**
   * Unhide a global model for a user
   */
  unhideGlobalModel(userId: string, globalModelId: string): void {
    const stmt = this.db.prepare('DELETE FROM user_model_overrides WHERE user_id = ? AND global_model_id = ?');
    stmt.run(userId, globalModelId);
    log.info({ userId, globalModelId }, 'User unhid global model');
  }

  /**
   * Mark a global model as modified by user (user has local copy)
   */
  markAsModified(userId: string, globalModelId: string, localProviderId: string): void {
    const id = `umo_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO user_model_overrides (id, user_id, global_model_id, override_type, local_provider_id, created_at, updated_at)
      VALUES (?, ?, ?, 'modified', ?, ?, ?)
      ON CONFLICT(user_id, global_model_id) DO UPDATE SET
        override_type = 'modified',
        local_provider_id = excluded.local_provider_id,
        updated_at = excluded.updated_at
    `);
    stmt.run(id, userId, globalModelId, localProviderId, now, now);
    log.info({ userId, globalModelId, localProviderId }, 'User modified global model');
  }

  // ========================================
  // Model resolution
  // ========================================

  /**
   * Get effective models for a user
   * Combines user's local models with visible global models
   *
   * @param userId - User ID
   * @param localModels - User's locally configured models (from ProcessConfig)
   * @param userGroups - User's OIDC group IDs (null for local auth users)
   * @param userRole - User's role (admin bypasses group restrictions)
   * @returns Merged list of IProvider
   */
  getEffectiveModels(userId: string, localModels: IProvider[], userGroups?: string[] | null, userRole?: UserRole): IProvider[] {
    const result: IProvider[] = [];
    const seenIds = new Set<string>();
    const effectiveRole = userRole ?? 'user';
    const effectiveGroups = userGroups ?? null;

    // 1. Add user's local models (highest priority)
    for (const model of localModels) {
      result.push(model);
      seenIds.add(model.id);
    }

    // 2. Get user's overrides
    const overrides = this.getUserOverrides(userId);
    const hiddenGlobalIds = new Set(overrides.filter((o) => o.override_type === 'hidden').map((o) => o.global_model_id));

    // 3. Get enabled global models with decrypted keys
    const globalRows = this.db.prepare('SELECT * FROM global_models WHERE enabled = 1 ORDER BY priority DESC, name ASC').all() as IGlobalModelRow[];

    for (const row of globalRows) {
      // Skip if user has hidden this global model
      if (hiddenGlobalIds.has(row.id)) continue;

      // Skip if user has a local model with same ID
      if (seenIds.has(row.id)) continue;

      // Skip if user doesn't have group access
      const allowedGroups = row.allowed_groups ? JSON.parse(row.allowed_groups) : null;
      if (!this.hasGroupAccess(effectiveGroups, effectiveRole, allowedGroups)) continue;

      // Convert to IProvider and add
      const modelWithKey = this.rowToGlobalModelWithKey(row);
      result.push(this.globalModelToProvider(modelWithKey));
      seenIds.add(row.id);
    }

    return result;
  }

  /**
   * Get visible global models for a user (without merging with local)
   * Used for UI to show which global models are available
   *
   * @param userId - User ID
   * @param userGroups - User's OIDC group IDs (null for local auth users)
   * @param userRole - User's role (admin bypasses group restrictions)
   */
  getVisibleGlobalModels(userId: string, userGroups?: string[] | null, userRole?: UserRole): IGlobalModel[] {
    const overrides = this.getUserOverrides(userId);
    const hiddenGlobalIds = new Set(overrides.filter((o) => o.override_type === 'hidden').map((o) => o.global_model_id));

    return this.listGlobalModels(false)
      .filter((m) => !hiddenGlobalIds.has(m.id))
      .filter((m) => this.hasGroupAccess(userGroups ?? null, userRole ?? 'user', m.allowed_groups));
  }

  /**
   * Get hidden global models for a user
   * Used for UI to show which global models are hidden
   * Note: Only shows models the user would have access to if they weren't hidden
   *
   * @param userId - User ID
   * @param userGroups - User's OIDC group IDs (null for local auth users)
   * @param userRole - User's role (admin bypasses group restrictions)
   */
  getHiddenGlobalModels(userId: string, userGroups?: string[] | null, userRole?: UserRole): IGlobalModel[] {
    const overrides = this.getUserOverrides(userId);
    const hiddenGlobalIds = new Set(overrides.filter((o) => o.override_type === 'hidden').map((o) => o.global_model_id));

    return this.listGlobalModels(true)
      .filter((m) => hiddenGlobalIds.has(m.id))
      .filter((m) => this.hasGroupAccess(userGroups ?? null, userRole ?? 'user', m.allowed_groups));
  }

  // ========================================
  // Embedding model helpers
  // ========================================

  /**
   * Find a global model that supports embeddings
   * Looks for models with "embedding" in their name or capabilities
   *
   * @returns Embedding config with base_url, api_key, and model name, or null if not found
   */
  getEmbeddingConfig(): { base_url: string; api_key: string; model: string } | null {
    const models = this.listGlobalModels(false); // Only enabled models

    // First, look for models with embedding capability
    for (const model of models) {
      if (model.capabilities?.some((c) => c.toLowerCase().includes('embedding'))) {
        const withKey = this.getGlobalModelWithKey(model.id);
        if (withKey) {
          // Find an embedding model name
          const embeddingModel = model.models.find((m) => m.toLowerCase().includes('embedding')) || model.models[0] || 'text-embedding-3-small';
          return {
            base_url: model.base_url || '',
            api_key: withKey.api_key || '',
            model: embeddingModel,
          };
        }
      }
    }

    // Then, look for models with "embedding" in the model names
    for (const model of models) {
      const embeddingModelName = model.models.find((m) => m.toLowerCase().includes('embedding'));
      if (embeddingModelName) {
        const withKey = this.getGlobalModelWithKey(model.id);
        if (withKey) {
          return {
            base_url: model.base_url || '',
            api_key: withKey.api_key || '',
            model: embeddingModelName,
          };
        }
      }
    }

    // No embedding model found in Global Models
    log.debug('No embedding model found in Global Models');
    return null;
  }

  /**
   * Get global model with decrypted API key (internal use only)
   */
  private getGlobalModelWithKey(id: string): IGlobalModelWithKey | null {
    const row = this.getGlobalModelRow(id);
    if (!row) return null;

    const model = this.rowToGlobalModel(row);
    const api_key = row.encrypted_api_key ? this.decrypt(row.encrypted_api_key) : '';

    return { ...model, api_key };
  }
}

// Export singleton getter
export function getGlobalModelService(): GlobalModelService {
  return GlobalModelService.getInstance();
}
