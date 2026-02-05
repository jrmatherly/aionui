/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Migration v16: Add global_models and user_model_overrides tables
 *
 * Global models allow administrators to define shared model configurations
 * that are automatically available to all users. Users can hide or override
 * these global models with their own configurations.
 */

import type Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import { dbLogger as log } from '@/common/logger';

/**
 * Global models configuration schema
 *
 * Priority (same pattern as GROUP_MAPPINGS):
 *   1. File at GLOBAL_MODELS_FILE (default /etc/aionui/global-models.json)
 *   2. GLOBAL_MODELS env var (JSON string)
 *
 * Example JSON:
 * [
 *   {
 *     "platform": "openai",
 *     "name": "OpenAI GPT-4",
 *     "api_key": "sk-xxx",
 *     "models": ["gpt-4", "gpt-4-turbo"],
 *     "base_url": "https://api.openai.com/v1"
 *   },
 *   {
 *     "platform": "anthropic",
 *     "name": "Anthropic Claude",
 *     "api_key": "sk-ant-xxx",
 *     "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229"]
 *   }
 * ]'
 */
export interface GlobalModelEnvConfig {
  platform: string;
  name: string;
  api_key?: string;
  models: string[];
  base_url?: string;
  capabilities?: string[];
  context_limit?: number;
  custom_headers?: Record<string, string>;
  enabled?: boolean;
  priority?: number;
}

export function migrate_v16_add_global_models(db: Database.Database): void {
  log.info('Migration v16: Adding global_models and user_model_overrides tables...');

  db.exec(`
    -- Admin-managed global model configurations
    CREATE TABLE IF NOT EXISTS global_models (
      id TEXT PRIMARY KEY,
      -- Provider configuration (matches IProvider structure)
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      -- API key stored encrypted (AES-256-GCM)
      encrypted_api_key TEXT,
      -- JSON array of model names
      models TEXT NOT NULL DEFAULT '[]',
      -- JSON array of capabilities (e.g., ["vision", "function_calling"])
      capabilities TEXT,
      -- Context token limit (optional)
      context_limit INTEGER,
      -- Custom HTTP headers as JSON object (for gateways)
      custom_headers TEXT,
      -- Administrative fields
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_global_models_enabled ON global_models(enabled);
    CREATE INDEX IF NOT EXISTS idx_global_models_platform ON global_models(platform);
    CREATE INDEX IF NOT EXISTS idx_global_models_priority ON global_models(priority DESC);

    -- Track user overrides for global models
    CREATE TABLE IF NOT EXISTS user_model_overrides (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      global_model_id TEXT NOT NULL,
      -- Override type: 'hidden' (user hid it), 'modified' (user has local copy)
      override_type TEXT NOT NULL CHECK(override_type IN ('hidden', 'modified')),
      -- If modified, stores the user's local provider ID
      local_provider_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (global_model_id) REFERENCES global_models(id) ON DELETE CASCADE,
      UNIQUE(user_id, global_model_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_model_overrides_user ON user_model_overrides(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_model_overrides_global_model ON user_model_overrides(global_model_id);
  `);

  log.info('Migration v16: Global models tables created');
}

/**
 * Encryption helpers for env var sync (mirrors GlobalModelService)
 */
function deriveEncryptionKey(jwtSecret: string): Buffer {
  const masterKey = crypto.createHash('sha256').update(jwtSecret).digest();
  return crypto.createHmac('sha256', masterKey).update('global_models').digest();
}

function encryptApiKey(plaintext: string, jwtSecret: string): string {
  const key = deriveEncryptionKey(jwtSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Load global models from file or environment variable
 *
 * Priority (same pattern as GROUP_MAPPINGS):
 *   1. File at GLOBAL_MODELS_FILE (default /etc/aionui/global-models.json)
 *   2. GLOBAL_MODELS env var (JSON string)
 *   3. Empty array (no pre-configured models)
 */
function loadGlobalModelsConfig(): GlobalModelEnvConfig[] {
  // 1. Try file (only when explicitly configured or default path exists)
  const configPath = process.env.GLOBAL_MODELS_FILE || '/etc/aionui/global-models.json';
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const models = JSON.parse(content) as GlobalModelEnvConfig[];
    if (!Array.isArray(models)) {
      throw new Error('Global models config must be a JSON array');
    }
    log.info({ count: models.length, configPath }, 'Loaded global models from file');
    return models;
  } catch (error) {
    // File doesn't exist or isn't readable — fall through to env var check
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ err: error, configPath }, 'Failed to load global models from file');
    }
  }

  // 2. Try env var
  const envValue = process.env.GLOBAL_MODELS;
  if (envValue && envValue.trim()) {
    try {
      const models = JSON.parse(envValue) as GlobalModelEnvConfig[];
      if (!Array.isArray(models)) {
        throw new Error('GLOBAL_MODELS must be a JSON array');
      }
      log.info({ count: models.length }, 'Loaded global models from GLOBAL_MODELS env var');
      return models;
    } catch (err) {
      log.error({ err }, 'Failed to parse GLOBAL_MODELS env var');
    }
  }

  // 3. No config
  return [];
}

/**
 * Sync global models from file or environment variable
 *
 * Called on every startup to ensure configured models exist in DB.
 * Uses upsert logic: creates new models, updates existing ones (by name match).
 * Does NOT delete models that aren't in the config.
 *
 * @param db - Database instance
 * @param jwtSecret - JWT secret for API key encryption
 */
export function syncGlobalModelsFromEnv(db: Database.Database, jwtSecret: string): void {
  const models = loadGlobalModelsConfig();

  if (models.length === 0) {
    log.debug('No global models configured, skipping sync');
    return;
  }

  log.info({ count: models.length }, 'Syncing global models from environment');

  const now = Math.floor(Date.now() / 1000);
  const systemUserId = 'system'; // Models created via env are attributed to 'system'

  // Prepare statements
  const findByName = db.prepare('SELECT id FROM global_models WHERE name = ?');
  const insertModel = db.prepare(`
    INSERT INTO global_models (
      id, platform, name, base_url, encrypted_api_key, models,
      capabilities, context_limit, custom_headers, enabled, priority,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateModel = db.prepare(`
    UPDATE global_models SET
      platform = ?,
      base_url = ?,
      encrypted_api_key = COALESCE(?, encrypted_api_key),
      models = ?,
      capabilities = ?,
      context_limit = ?,
      custom_headers = ?,
      enabled = ?,
      priority = ?,
      updated_at = ?
    WHERE id = ?
  `);

  for (const config of models) {
    // Validate required fields
    if (!config.platform || !config.name || !config.models || !Array.isArray(config.models)) {
      log.warn({ config }, 'Skipping invalid global model config (missing platform, name, or models)');
      continue;
    }

    try {
      const existing = findByName.get(config.name) as { id: string } | undefined;

      const encryptedKey = config.api_key ? encryptApiKey(config.api_key, jwtSecret) : null;
      const modelsJson = JSON.stringify(config.models);
      const capabilitiesJson = config.capabilities ? JSON.stringify(config.capabilities) : null;
      const headersJson = config.custom_headers ? JSON.stringify(config.custom_headers) : null;
      const enabled = config.enabled !== false ? 1 : 0;
      const priority = config.priority ?? 0;

      if (existing) {
        // Update existing model (don't overwrite API key if not provided in env)
        updateModel.run(
          config.platform,
          config.base_url || '',
          encryptedKey, // null if not provided, COALESCE keeps existing
          modelsJson,
          capabilitiesJson,
          config.context_limit ?? null,
          headersJson,
          enabled,
          priority,
          now,
          existing.id
        );
        log.info({ name: config.name, id: existing.id }, 'Updated global model from env');
      } else {
        // Create new model
        const id = `gm_${crypto.randomUUID()}`;
        insertModel.run(id, config.platform, config.name, config.base_url || '', encryptedKey, modelsJson, capabilitiesJson, config.context_limit ?? null, headersJson, enabled, priority, systemUserId, now, now);
        log.info({ name: config.name, id }, 'Created global model from env');
      }
    } catch (err) {
      log.error({ err, name: config.name }, 'Failed to sync global model from env');
    }
  }

  log.info({ count: models.length }, 'Global models sync from env complete');
}
