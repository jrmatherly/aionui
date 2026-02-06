---
paths:
  - 'src/process/database/**'
---

# Database Module Conventions

<!-- @author Jason Matherly -->
<!-- @modified 2026-02-06 -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

## Current State

- **Schema version**: v18 (`CURRENT_DB_VERSION = 18` in `schema.ts`)
- **Engine**: better-sqlite3 ^12.6.2 — synchronous API, runs in main process only
- **WAL mode**: Enabled for concurrent read/write performance
- **Database location**: `{userData}/config/aionui.db`
- **IPC bridge**: Renderer process accesses database exclusively via IPC calls to main process

## Migration Conventions

- **Scaffolding skill**: Use `.claude/skills/db-migrate/SKILL.md` to generate new migrations
- Always use `IF NOT EXISTS` / `IF EXISTS` in DDL statements for idempotency
- All migrations run in a **single transaction** — if any step fails, everything rolls back
- Prefer `ALTER TABLE ADD COLUMN` over destructive table recreation
- Each migration has `up()` and `down()` methods; test both directions
- One migration = one logical change (small, focused migrations)
- Check for column existence before ALTER to handle re-runs gracefully

## Key Files

- `schema.ts` — Initial schema definition + `CURRENT_DB_VERSION`
- `migrations.ts` — All migration definitions (`ALL_MIGRATIONS` array) + helpers
- `migrations/` — External migration files for v14+
- `index.ts` — `AionUIDatabase` class (CRUD operations, migration runner)
- `export.ts` — Public API surface (backup, restore, migration status)

## Full Documentation

See [`src/process/database/README.md`](../../src/process/database/README.md) for complete architecture, API reference, and usage examples.
