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
import { dbLogger as log } from '@/common/logger';

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
