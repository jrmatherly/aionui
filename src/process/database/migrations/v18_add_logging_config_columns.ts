/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Migration v18: Add missing columns to logging_config
 *
 * Adds log_format, log_file, and otel_log_level columns that were present
 * as environment variables but not stored in the database or shown in the
 * admin Logging Settings UI.
 */

import type Database from 'better-sqlite3';
import { dbLogger as log } from '@/common/logger';

export function migrate_v18_add_logging_config_columns(db: Database.Database): void {
  log.info('Migration v18: Adding log_format, log_file, otel_log_level to logging_config...');

  // SQLite requires one ALTER TABLE per column
  db.exec(`
    ALTER TABLE logging_config ADD COLUMN log_format TEXT NOT NULL DEFAULT 'json'
      CHECK(log_format IN ('json', 'pretty'));
  `);

  db.exec(`
    ALTER TABLE logging_config ADD COLUMN log_file TEXT DEFAULT NULL;
  `);

  db.exec(`
    ALTER TABLE logging_config ADD COLUMN otel_log_level TEXT NOT NULL DEFAULT 'info'
      CHECK(otel_log_level IN ('debug', 'info', 'warn', 'error'));
  `);

  // Seed from env vars if present
  const updates: string[] = [];
  const values: (string | number)[] = [];

  const format = (process.env.LOG_FORMAT || '').toLowerCase();
  if (format === 'json' || format === 'pretty') {
    updates.push('log_format = ?');
    values.push(format);
  }

  if (process.env.LOG_FILE) {
    updates.push('log_file = ?');
    values.push(process.env.LOG_FILE);
  }

  const otelLogLevel = (process.env.OTEL_LOG_LEVEL || '').toLowerCase();
  if (['debug', 'info', 'warn', 'error'].includes(otelLogLevel)) {
    updates.push('otel_log_level = ?');
    values.push(otelLogLevel);
  }

  if (updates.length > 0) {
    values.push('default');
    db.prepare(`UPDATE logging_config SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  log.info('Migration v18: logging_config columns added');
}
