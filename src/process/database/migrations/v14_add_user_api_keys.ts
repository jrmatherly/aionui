/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

import type Database from 'better-sqlite3';
import { dbLogger as log } from '@/common/logger';

export function migrate_v14_add_user_api_keys(db: Database.Database): void {
  log.info('Migration v14: Adding user_api_keys table');

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      key_hint TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, provider)
    );

    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
  `);

  log.info('Migration v14: user_api_keys table created');
}
