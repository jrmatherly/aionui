/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type Database from 'better-sqlite3';
import { migrate_v14_add_user_api_keys } from './migrations/v14_add_user_api_keys';

/**
 * Migration script definition
 */
export interface IMigration {
  version: number; // Target version after this migration
  name: string; // Migration name for logging
  up: (db: Database.Database) => void; // Upgrade script
  down: (db: Database.Database) => void; // Downgrade script (for rollback)
}

/**
 * Migration v0 -> v1: Initial schema
 * This is handled by initSchema() in schema.ts
 */
const migration_v1: IMigration = {
  version: 1,
  name: 'Initial schema',
  up: (_db) => {
    // Already handled by initSchema()
    console.log('[Migration v1] Initial schema created by initSchema()');
  },
  down: (db) => {
    // Drop all tables (only core tables now)
    db.exec(`
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS conversations;
      DROP TABLE IF EXISTS users;
    `);
    console.log('[Migration v1] Rolled back: All tables dropped');
  },
};

/**
 * Migration v1 -> v2: Add indexes for better performance
 * Example of a schema change migration
 */
const migration_v2: IMigration = {
  version: 2,
  name: 'Add performance indexes',
  up: (db) => {
    db.exec(`
      -- Add composite index for conversation messages lookup
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc
        ON messages(conversation_id, created_at DESC);

      -- Add index for message search by type
      CREATE INDEX IF NOT EXISTS idx_messages_type_created
        ON messages(type, created_at DESC);

      -- Add index for user conversations lookup
      CREATE INDEX IF NOT EXISTS idx_conversations_user_type
        ON conversations(user_id, type);
    `);
    console.log('[Migration v2] Added performance indexes');
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_messages_conv_created_desc;
      DROP INDEX IF EXISTS idx_messages_type_created;
      DROP INDEX IF EXISTS idx_conversations_user_type;
    `);
    console.log('[Migration v2] Rolled back: Removed performance indexes');
  },
};

/**
 * Migration v2 -> v3: Add full-text search support [REMOVED]
 *
 * Note: FTS functionality has been removed as it's not currently needed.
 * Will be re-implemented when search functionality is added to the UI.
 */
const migration_v3: IMigration = {
  version: 3,
  name: 'Add full-text search (skipped)',
  up: (_db) => {
    // FTS removed - will be re-added when search functionality is implemented
    console.log('[Migration v3] FTS support skipped (removed, will be added back later)');
  },
  down: (db) => {
    // Clean up FTS table if it exists from older versions
    db.exec(`
      DROP TABLE IF EXISTS messages_fts;
    `);
    console.log('[Migration v3] Rolled back: Removed full-text search');
  },
};

/**
 * Migration v3 -> v4: Removed (user_preferences table no longer needed)
 */
const migration_v4: IMigration = {
  version: 4,
  name: 'Removed user_preferences table',
  up: (_db) => {
    // user_preferences table removed from schema
    console.log('[Migration v4] Skipped (user_preferences table removed)');
  },
  down: (_db) => {
    console.log('[Migration v4] Rolled back: No-op (user_preferences table removed)');
  },
};

/**
 * Migration v4 -> v5: Remove FTS table
 * Cleanup for FTS removal - ensures all databases have consistent schema
 */
const migration_v5: IMigration = {
  version: 5,
  name: 'Remove FTS table',
  up: (db) => {
    // Remove FTS table created by old v3 migration
    db.exec(`
      DROP TABLE IF EXISTS messages_fts;
    `);
    console.log('[Migration v5] Removed FTS table (cleanup for FTS removal)');
  },
  down: (_db) => {
    // If rolling back, we don't recreate FTS table (it's deprecated)
    console.log('[Migration v5] Rolled back: FTS table remains removed (deprecated feature)');
  },
};

/**
 * Migration v5 -> v6: Add jwt_secret column to users table
 * Store JWT secret per user for better security and management
 */
const migration_v6: IMigration = {
  version: 6,
  name: 'Add jwt_secret to users table',
  up: (db) => {
    // Check if jwt_secret column already exists
    const tableInfo = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const hasJwtSecret = tableInfo.some((col) => col.name === 'jwt_secret');

    if (!hasJwtSecret) {
      // Add jwt_secret column to users table
      db.exec(`ALTER TABLE users ADD COLUMN jwt_secret TEXT;`);
      console.log('[Migration v6] Added jwt_secret column to users table');
    } else {
      console.log('[Migration v6] jwt_secret column already exists, skipping');
    }
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, need to recreate table
    db.exec(`
      CREATE TABLE users_backup AS SELECT id, username, email, password_hash, avatar_path, created_at, updated_at, last_login FROM users;
      DROP TABLE users;
      ALTER TABLE users_backup RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    console.log('[Migration v6] Rolled back: Removed jwt_secret column from users table');
  },
};

/**
 * Migration v6 -> v7: Add Personal Assistant tables
 * Supports remote interaction through messaging platforms (Telegram, Slack, Discord)
 */
const migration_v7: IMigration = {
  version: 7,
  name: 'Add Personal Assistant tables',
  up: (db) => {
    // Assistant plugins configuration
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_plugins (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type);
      CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled);
    `);

    // Authorized users whitelist
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_users (
        id TEXT PRIMARY KEY,
        platform_user_id TEXT NOT NULL,
        platform_type TEXT NOT NULL,
        display_name TEXT,
        authorized_at INTEGER NOT NULL,
        last_active INTEGER,
        session_id TEXT,
        UNIQUE(platform_user_id, platform_type)
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_users_platform ON assistant_users(platform_type, platform_user_id);
    `);

    // User sessions
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_type TEXT NOT NULL CHECK(agent_type IN ('gemini', 'acp', 'codex')),
        conversation_id TEXT,
        workspace TEXT,
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES assistant_users(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user ON assistant_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_assistant_sessions_conversation ON assistant_sessions(conversation_id);
    `);

    // Pending pairing requests
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_pairing_codes (
        code TEXT PRIMARY KEY,
        platform_user_id TEXT NOT NULL,
        platform_type TEXT NOT NULL,
        display_name TEXT,
        requested_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'expired'))
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_pairing_expires ON assistant_pairing_codes(expires_at);
      CREATE INDEX IF NOT EXISTS idx_assistant_pairing_status ON assistant_pairing_codes(status);
    `);

    console.log('[Migration v7] Added Personal Assistant tables');
  },
  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS assistant_pairing_codes;
      DROP TABLE IF EXISTS assistant_sessions;
      DROP TABLE IF EXISTS assistant_users;
      DROP TABLE IF EXISTS assistant_plugins;
    `);
    console.log('[Migration v7] Rolled back: Removed Personal Assistant tables');
  },
};

/**
 * Migration v7 -> v8: Add source column to conversations table
 * Adds source column to identify conversation origin
 */
const migration_v8: IMigration = {
  version: 8,
  name: 'Add source column to conversations',
  up: (db) => {
    // Add source column to conversations table
    db.exec(`
      ALTER TABLE conversations ADD COLUMN source TEXT CHECK(source IN ('aionui', 'telegram'));
    `);

    // Create index for efficient source-based queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source);
      CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC);
    `);

    console.log('[Migration v8] Added source column to conversations table');
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, need to recreate table
    // For simplicity, just drop the indexes (column will remain)
    db.exec(`
      DROP INDEX IF EXISTS idx_conversations_source;
      DROP INDEX IF EXISTS idx_conversations_source_updated;
    `);
    console.log('[Migration v8] Rolled back: Removed source indexes');
  },
};

/**
 * Migration v8 -> v9: Add cron_jobs table for scheduled tasks
 */
const migration_v9: IMigration = {
  version: 9,
  name: 'Add cron_jobs table',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        -- Basic info
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,

        -- Schedule
        schedule_kind TEXT NOT NULL,       -- 'at' | 'every' | 'cron'
        schedule_value TEXT NOT NULL,      -- timestamp | ms | cron expr
        schedule_tz TEXT,                  -- timezone (optional)
        schedule_description TEXT NOT NULL, -- human-readable description

        -- Target
        payload_message TEXT NOT NULL,

        -- Metadata (for management)
        conversation_id TEXT NOT NULL,     -- Which conversation created this
        conversation_title TEXT,           -- For display in UI
        agent_type TEXT NOT NULL,          -- 'gemini' | 'claude' | 'codex' | etc.
        created_by TEXT NOT NULL,          -- 'user' | 'agent'
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

        -- Runtime state
        next_run_at INTEGER,
        last_run_at INTEGER,
        last_status TEXT,                  -- 'ok' | 'error' | 'skipped'
        last_error TEXT,                   -- Error message if failed
        run_count INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3
      );

      -- Index for querying jobs by conversation (frontend management)
      CREATE INDEX IF NOT EXISTS idx_cron_jobs_conversation ON cron_jobs(conversation_id);

      -- Index for scheduler to find next jobs to run
      CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at) WHERE enabled = 1;

      -- Index for querying by agent type (if needed)
      CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_type ON cron_jobs(agent_type);
    `);
    console.log('[Migration v9] Added cron_jobs table');
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_cron_jobs_agent_type;
      DROP INDEX IF EXISTS idx_cron_jobs_next_run;
      DROP INDEX IF EXISTS idx_cron_jobs_conversation;
      DROP TABLE IF EXISTS cron_jobs;
    `);
    console.log('[Migration v9] Rolled back: Removed cron_jobs table');
  },
};

/**
 * Migration v9 -> v10: Add multi-user auth columns to users table
 * Adds role, auth_method, oidc_subject, display_name, and groups columns
 * for OIDC SSO and RBAC support.
 */
const migration_v10: IMigration = {
  version: 10,
  name: 'Add multi-user auth columns to users table',
  up: (db) => {
    const tableInfo = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    // role: admin | user | viewer (default 'user' for new users)
    if (!existingColumns.has('role')) {
      db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user', 'viewer'));`);
    }

    // auth_method: local | oidc (default 'local' for existing users)
    if (!existingColumns.has('auth_method')) {
      db.exec(`ALTER TABLE users ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'local' CHECK(auth_method IN ('local', 'oidc'));`);
    }

    // oidc_subject: unique identifier from OIDC provider (e.g., EntraID object ID)
    if (!existingColumns.has('oidc_subject')) {
      db.exec(`ALTER TABLE users ADD COLUMN oidc_subject TEXT;`);
    }

    // display_name: human-readable name from OIDC claims
    if (!existingColumns.has('display_name')) {
      db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT;`);
    }

    // groups: JSON array of group IDs from OIDC token
    if (!existingColumns.has('groups')) {
      db.exec(`ALTER TABLE users ADD COLUMN groups TEXT;`);
    }

    // Mark existing system_default_user (admin) with role='admin', auth_method='local'
    db.exec(`UPDATE users SET role = 'admin', auth_method = 'local' WHERE id = 'system_default_user';`);

    // Add unique index for OIDC subject lookups (enforces one user per OIDC subject)
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_subject ON users(oidc_subject) WHERE oidc_subject IS NOT NULL;`);
    // Add index for role-based queries
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`);
    // Add index for auth method queries
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_auth_method ON users(auth_method);`);

    console.log('[Migration v10] Added multi-user auth columns (role, auth_method, oidc_subject, display_name, groups)');
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN before 3.35.0, so just drop indexes
    db.exec(`
      DROP INDEX IF EXISTS idx_users_oidc_subject;
      DROP INDEX IF EXISTS idx_users_role;
      DROP INDEX IF EXISTS idx_users_auth_method;
    `);
    // Reset admin role back (column stays but won't cause issues)
    db.exec(`UPDATE users SET role = 'user' WHERE id = 'system_default_user';`);
    console.log('[Migration v10] Rolled back: Removed multi-user auth indexes');
  },
};

/**
 * Migration v11: Add refresh tokens and persistent token blacklist tables
 *
 * Supports access+refresh token pattern and survives restarts.
 */
const migration_v11: IMigration = {
  version: 11,
  name: 'add_refresh_tokens_and_blacklist',
  up: (db) => {
    // Refresh tokens table — stores active refresh tokens for rotation/revocation
    db.exec(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        revoked INTEGER NOT NULL DEFAULT 0,
        replaced_by TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
    `);

    // Persistent token blacklist — survives server restarts
    db.exec(`
      CREATE TABLE IF NOT EXISTS token_blacklist (
        token_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);
    `);

    console.log('[Migration v11] Added refresh_tokens and token_blacklist tables');
  },
  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS token_blacklist;
      DROP TABLE IF EXISTS refresh_tokens;
    `);
    console.log('[Migration v11] Rolled back: Removed refresh_tokens and token_blacklist tables');
  },
};

/**
 * Migration v11 -> v12: Add avatar_url column to users table
 * Store user profile photos as base64 data URLs from Microsoft Graph
 */
const migration_v12: IMigration = {
  version: 12,
  name: 'Add avatar_url to users table',
  up: (db) => {
    const tableInfo = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const hasAvatarUrl = tableInfo.some((col) => col.name === 'avatar_url');

    if (!hasAvatarUrl) {
      db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT;`);
      console.log('[Migration v12] Added avatar_url column to users table');
    } else {
      console.log('[Migration v12] avatar_url column already exists, skipping');
    }
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly before 3.35.0
    // For rollback, just log — column will remain but won't be used
    console.log('[Migration v12] Rolled back: avatar_url column remains (cannot drop in older SQLite)');
  },
};

/**
 * Migration v12 -> v13: Add 'lark' to assistant_plugins type constraint
 * Adds 'lark' as a valid plugin type for the Lark/Feishu channel integration.
 */
const migration_v13: IMigration = {
  version: 13,
  name: 'Add lark to assistant_plugins type constraint',
  up: (db) => {
    // SQLite doesn't support ALTER TABLE to modify CHECK constraints
    // We need to recreate the table with the new constraint
    db.exec(`
      -- Create new table with updated constraint
      CREATE TABLE IF NOT EXISTS assistant_plugins_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord', 'lark')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Copy data from old table (if exists)
      INSERT OR IGNORE INTO assistant_plugins_new SELECT * FROM assistant_plugins;

      -- Drop old table
      DROP TABLE IF EXISTS assistant_plugins;

      -- Rename new table
      ALTER TABLE assistant_plugins_new RENAME TO assistant_plugins;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type);
      CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled);
    `);

    console.log('[Migration v13] Added lark to assistant_plugins type constraint');
  },
  down: (db) => {
    // Rollback: recreate table without lark type (data with lark type will be lost)
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_plugins_old (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('telegram', 'slack', 'discord')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        status TEXT CHECK(status IN ('created', 'initializing', 'ready', 'starting', 'running', 'stopping', 'stopped', 'error')),
        last_connected INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO assistant_plugins_old SELECT * FROM assistant_plugins WHERE type != 'lark';

      DROP TABLE IF EXISTS assistant_plugins;

      ALTER TABLE assistant_plugins_old RENAME TO assistant_plugins;

      CREATE INDEX IF NOT EXISTS idx_assistant_plugins_type ON assistant_plugins(type);
      CREATE INDEX IF NOT EXISTS idx_assistant_plugins_enabled ON assistant_plugins(enabled);
    `);
    console.log('[Migration v13] Rolled back: Removed lark from assistant_plugins type constraint');
  },
};

/**
 * Migration v13 -> v14: Add user_api_keys table for per-user API key storage
 * Supports multi-user mode where each user can bring their own API keys
 */
const migration_v14: IMigration = {
  version: 14,
  name: 'Add user_api_keys table',
  up: (db) => {
    migrate_v14_add_user_api_keys(db);
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_user_api_keys_user_id;
      DROP TABLE IF EXISTS user_api_keys;
    `);
    console.log('[Migration v14] Rolled back: Removed user_api_keys table');
  },
};

/**
 * All migrations in order
 */
export const ALL_MIGRATIONS: IMigration[] = [migration_v1, migration_v2, migration_v3, migration_v4, migration_v5, migration_v6, migration_v7, migration_v8, migration_v9, migration_v10, migration_v11, migration_v12, migration_v13, migration_v14];

/**
 * Get migrations needed to upgrade from one version to another
 */
export function getMigrationsToRun(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > fromVersion && m.version <= toVersion).sort((a, b) => a.version - b.version);
}

/**
 * Get migrations needed to downgrade from one version to another
 */
export function getMigrationsToRollback(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > toVersion && m.version <= fromVersion).sort((a, b) => b.version - a.version);
}

/**
 * Run migrations in a transaction
 */
export function runMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
  if (fromVersion === toVersion) {
    console.log('[Migrations] Already at target version');
    return;
  }

  if (fromVersion > toVersion) {
    throw new Error(`[Migrations] Downgrade not supported in production. Use rollbackMigration() for testing only.`);
  }

  const migrations = getMigrationsToRun(fromVersion, toVersion);

  if (migrations.length === 0) {
    console.log(`[Migrations] No migrations needed from v${fromVersion} to v${toVersion}`);
    return;
  }

  console.log(`[Migrations] Running ${migrations.length} migrations from v${fromVersion} to v${toVersion}`);

  // Run all migrations in a single transaction
  const runAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Running migration v${migration.version}: ${migration.name}`);
        migration.up(db);

        console.log(`[Migrations] ✓ Migration v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Migration v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }
  });

  try {
    runAll();
    console.log(`[Migrations] All migrations completed successfully`);
  } catch (error) {
    console.error('[Migrations] Migration failed, all changes rolled back:', error);
    throw error;
  }
}

/**
 * Rollback migrations (for testing/emergency use)
 * WARNING: This can cause data loss!
 */
export function rollbackMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
  if (fromVersion <= toVersion) {
    throw new Error('[Migrations] Cannot rollback to a higher or equal version');
  }

  const migrations = getMigrationsToRollback(fromVersion, toVersion);

  if (migrations.length === 0) {
    console.log(`[Migrations] No rollback needed from v${fromVersion} to v${toVersion}`);
    return;
  }

  console.log(`[Migrations] Rolling back ${migrations.length} migrations from v${fromVersion} to v${toVersion}`);
  console.warn('[Migrations] WARNING: This may cause data loss!');

  // Run all rollbacks in a single transaction
  const rollbackAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Rolling back migration v${migration.version}: ${migration.name}`);
        migration.down(db);

        console.log(`[Migrations] ✓ Rollback v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Rollback v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }
  });

  try {
    rollbackAll();
    console.log(`[Migrations] All rollbacks completed successfully`);
  } catch (error) {
    console.error('[Migrations] Rollback failed:', error);
    throw error;
  }
}

/**
 * Get migration history
 * Now simplified - just returns the current version
 */
export function getMigrationHistory(db: Database.Database): Array<{ version: number; name: string; timestamp: number }> {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  // Return a simple array with just the current version
  return [
    {
      version: currentVersion,
      name: `Current schema version`,
      timestamp: Date.now(),
    },
  ];
}

/**
 * Check if a specific migration has been applied
 * Now simplified - checks if current version >= target version
 */
export function isMigrationApplied(db: Database.Database, version: number): boolean {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  return currentVersion >= version;
}
