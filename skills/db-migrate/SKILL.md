---
name: db-migrate
description: 'Scaffold a new Better-SQLite3 database migration following project conventions'
---

# Database Migration Scaffolder

Scaffold a new database migration for AionUI's Better-SQLite3 schema.

## Workflow

### 1. Read current version

Read `CURRENT_DB_VERSION` from `src/process/database/schema.ts`. It is currently `17`.

### 2. Determine next version

Set `N = CURRENT_DB_VERSION + 1`.

### 3. Get migration description

Ask the user for a short snake_case description (e.g., `add_audit_log`). This becomes the filename suffix.

### 4. Create migration file

Create `src/process/database/migrations/vN_description.ts` following the pattern from existing migrations like `v17_add_logging_config.ts`:

- Author header: `@author Jason Matherly` with SPDX license identifier
- Import `type Database from 'better-sqlite3'` and `dbLogger as log` from `@/common/logger`
- Export function named `migrate_vN_description`
- Use the Better-SQLite3 synchronous DDL method with `CREATE TABLE IF NOT EXISTS`
- Use `db.prepare().run()` for DML (parameterized statements)
- Log at start and completion of migration
- Foreign keys reference `users(id)` for audit fields
- Integer booleans (0/1) for SQLite boolean fields
- `updated_at INTEGER NOT NULL` for timestamps (Unix epoch seconds)
- IDs as `TEXT PRIMARY KEY` (UUID-based)

If env sync is needed (like v16 global_models or v17 logging_config), also export a `syncXxxFromEnv` function in the same file.

### 5. Register migration in `src/process/database/migrations.ts`

- Import the migration function at the top (alongside existing v14-v17 imports)
- Add a `migration_vN` constant with `version`, `name`, `up`, and `down` functions
- The `down` function should include `DROP TABLE IF EXISTS` or reverse the changes
- Append `migration_vN` to the `ALL_MIGRATIONS` array

### 6. Bump version in `src/process/database/schema.ts`

Update `CURRENT_DB_VERSION` from `N-1` to `N`.

### 7. Wire env sync (only if applicable)

If the migration exports a `syncXxxFromEnv` function, update `src/process/database/index.ts`:

- Import the sync function alongside the existing imports from v16/v17
- Add a private method in `AionUIDatabase` (follow `syncLoggingEnv` / `syncGlobalModelsEnv` pattern)
- Call it in `initialize()` after the existing sync calls

## Conventions

| Rule       | Detail                                                           |
| ---------- | ---------------------------------------------------------------- |
| DDL        | Better-SQLite3 synchronous API with `CREATE TABLE IF NOT EXISTS` |
| DML        | `db.prepare().run()` for parameterized statements                |
| Booleans   | Integer 0/1 (SQLite has no native boolean)                       |
| Timestamps | `INTEGER NOT NULL` storing Unix epoch seconds                    |
| Audit FKs  | `FOREIGN KEY (field) REFERENCES users(id)`                       |
| IDs        | `TEXT PRIMARY KEY` (UUID-based)                                  |
| Rollback   | `down` must reverse `up` (typically `DROP TABLE IF EXISTS`)      |
| Logging    | Use `dbLogger as log` from `@/common/logger`                     |

## Reference Files

- `src/process/database/schema.ts` -- CURRENT_DB_VERSION and initSchema
- `src/process/database/migrations.ts` -- migration registry and runner
- `src/process/database/migrations/v16_add_global_models.ts` -- env sync example with encryption
- `src/process/database/migrations/v17_add_logging_config.ts` -- env sync example (simpler)
- `src/process/database/index.ts` -- AionUIDatabase class with startup sync wiring
