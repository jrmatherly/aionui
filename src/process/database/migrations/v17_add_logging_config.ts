/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Migration v17: Add logging_config table
 *
 * Centralized logging configuration for runtime control of:
 * - Log levels and retention policies
 * - OpenTelemetry (OTEL) distributed tracing
 * - Syslog/SIEM forwarding
 * - Langfuse LLM observability
 *
 * Allows administrators to adjust logging behavior without redeploying.
 *
 * On first run the default row is seeded from environment variables so the
 * admin UI reflects the actual deployment configuration.  Subsequent starts
 * call {@link syncLoggingConfigFromEnv} to keep env-driven values in sync
 * without overwriting admin-made changes for fields the env doesn't set.
 */

import type Database from 'better-sqlite3';
import { dbLogger as log } from '@/common/logger';

/**
 * Read environment variables and return a partial logging config object.
 * Only keys that are explicitly set in the environment are included.
 */
function envToConfig(): Record<string, string | number> {
  const cfg: Record<string, string | number> = {};

  // Core
  const level = (process.env.LOG_LEVEL || '').toLowerCase();
  if (['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].includes(level)) {
    cfg.log_level = level;
  }
  if (process.env.LOG_RETENTION_DAYS) {
    const v = parseInt(process.env.LOG_RETENTION_DAYS, 10);
    if (!isNaN(v) && v >= 1) cfg.retention_days = v;
  }
  if (process.env.LOG_MAX_SIZE_MB) {
    const v = parseInt(process.env.LOG_MAX_SIZE_MB, 10);
    if (!isNaN(v) && v >= 10) cfg.max_size_mb = v;
  }

  // Destinations — derive from what's enabled
  const dests: string[] = ['stdout'];
  if (process.env.LOG_FILE) dests.push('file');
  if (process.env.SYSLOG_ENABLED === 'true') dests.push('syslog');
  if (process.env.OTEL_ENABLED === 'true') dests.push('otel');
  cfg.destinations = JSON.stringify(dests);

  // OpenTelemetry
  if (process.env.OTEL_ENABLED !== undefined) {
    cfg.otel_enabled = process.env.OTEL_ENABLED === 'true' ? 1 : 0;
  }
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) cfg.otel_endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (process.env.OTEL_EXPORTER_OTLP_PROTOCOL) cfg.otel_protocol = process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
  if (process.env.OTEL_SERVICE_NAME) cfg.otel_service_name = process.env.OTEL_SERVICE_NAME;

  // Syslog
  if (process.env.SYSLOG_ENABLED !== undefined) {
    cfg.syslog_enabled = process.env.SYSLOG_ENABLED === 'true' ? 1 : 0;
  }
  if (process.env.SYSLOG_HOST) cfg.syslog_host = process.env.SYSLOG_HOST;
  if (process.env.SYSLOG_PORT) {
    const v = parseInt(process.env.SYSLOG_PORT, 10);
    if (!isNaN(v)) cfg.syslog_port = v;
  }
  if (process.env.SYSLOG_PROTOCOL) cfg.syslog_protocol = process.env.SYSLOG_PROTOCOL;
  if (process.env.SYSLOG_FACILITY) {
    const v = parseInt(process.env.SYSLOG_FACILITY, 10);
    if (!isNaN(v)) cfg.syslog_facility = v;
  }

  // Langfuse
  if (process.env.LANGFUSE_ENABLED !== undefined) {
    cfg.langfuse_enabled = process.env.LANGFUSE_ENABLED === 'true' ? 1 : 0;
  }
  if (process.env.LANGFUSE_HOST) cfg.langfuse_host = process.env.LANGFUSE_HOST;
  if (process.env.LANGFUSE_PUBLIC_KEY) cfg.langfuse_public_key = process.env.LANGFUSE_PUBLIC_KEY;
  if (process.env.LANGFUSE_SECRET_KEY) cfg.langfuse_secret_key = process.env.LANGFUSE_SECRET_KEY;

  return cfg;
}

/**
 * Create the logging_config table and seed the default row from env vars.
 */
export function migrate_v17_add_logging_config(db: Database.Database): void {
  log.info('Migration v17: Adding logging_config table...');

  db.exec(`
    -- Centralized logging configuration
    CREATE TABLE IF NOT EXISTS logging_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      
      -- Core logging settings
      log_level TEXT NOT NULL DEFAULT 'info' CHECK(log_level IN ('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent')),
      retention_days INTEGER NOT NULL DEFAULT 30,
      max_size_mb INTEGER NOT NULL DEFAULT 500,
      
      -- Destination configuration (JSON array of enabled destinations)
      destinations TEXT NOT NULL DEFAULT '["stdout"]',
      
      -- OpenTelemetry settings
      otel_enabled INTEGER NOT NULL DEFAULT 0,
      otel_endpoint TEXT DEFAULT 'http://localhost:4318',
      otel_protocol TEXT DEFAULT 'http',
      otel_service_name TEXT DEFAULT 'aionui',
      
      -- Syslog/SIEM settings
      syslog_enabled INTEGER NOT NULL DEFAULT 0,
      syslog_host TEXT DEFAULT 'localhost',
      syslog_port INTEGER DEFAULT 514,
      syslog_protocol TEXT DEFAULT 'udp',
      syslog_facility INTEGER DEFAULT 16,
      
      -- Langfuse LLM observability settings
      langfuse_enabled INTEGER NOT NULL DEFAULT 0,
      langfuse_host TEXT DEFAULT 'https://cloud.langfuse.com',
      langfuse_public_key TEXT,
      langfuse_secret_key TEXT,
      
      -- Audit fields
      updated_by TEXT,
      updated_at INTEGER NOT NULL,
      
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );
  `);

  // Seed the default row from environment variables so the admin UI
  // reflects the actual deployment configuration out of the box.
  const env = envToConfig();
  const cols = ['id', 'updated_at', ...Object.keys(env)];
  const placeholders = cols.map(() => '?').join(', ');
  const vals: (string | number)[] = ['default', Math.floor(Date.now() / 1000), ...Object.values(env)];

  db.prepare(`INSERT OR IGNORE INTO logging_config (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);

  log.info({ envKeys: Object.keys(env) }, 'Migration v17: logging_config table created and seeded from env');
}

/**
 * Sync the logging_config default row from environment variables.
 *
 * Called on every startup (after migrations) so that changes to the
 * deployment's .env / docker-compose environment are reflected in the
 * admin UI without requiring a manual database edit.
 *
 * Only env vars that are explicitly set are synced — fields not present
 * in the environment are left at their current DB value (which may have
 * been changed via the admin UI).
 */
export function syncLoggingConfigFromEnv(db: Database.Database): void {
  const env = envToConfig();
  if (Object.keys(env).length === 0) return;

  const sets = Object.keys(env)
    .map((k) => `${k} = ?`)
    .join(', ');
  const vals = [...Object.values(env), 'default'];

  db.prepare(`UPDATE logging_config SET ${sets} WHERE id = ?`).run(...vals);
  log.debug({ envKeys: Object.keys(env) }, 'Synced logging_config from environment');
}
