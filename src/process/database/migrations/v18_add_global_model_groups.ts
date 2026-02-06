/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Migration v18: Add allowed_groups to global_models
 *
 * Enables group-based access control for global models:
 * - NULL = available to everyone (default, backward compatible)
 * - JSON array of group names = restricted to those groups
 *
 * Groups are matched by name against GROUP_MAPPINGS, which provides
 * the groupName → groupId resolution. Admins bypass restrictions.
 */

import type Database from 'better-sqlite3';
import { dbLogger as log } from '@/common/logger';

export function migrate_v18_add_global_model_groups(db: Database.Database): void {
  log.info('Migration v18: Adding allowed_groups to global_models...');

  // Check if column already exists
  const columns = db.prepare("PRAGMA table_info('global_models')").all() as { name: string }[];
  const hasColumn = columns.some((c) => c.name === 'allowed_groups');

  if (!hasColumn) {
    db.exec(`
      -- Add allowed_groups column (NULL = available to everyone)
      ALTER TABLE global_models ADD COLUMN allowed_groups TEXT;
    `);
    log.info('Migration v18: Added allowed_groups column to global_models');
  } else {
    log.info('Migration v18: allowed_groups column already exists, skipping');
  }

  log.info('Migration v18: Complete');
}
