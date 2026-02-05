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
 */

import type Database from 'better-sqlite3';
import { dbLogger as log } from '@/common/logger';

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
      -- Example: ["stdout", "file", "syslog", "otel"]
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

    -- Insert default configuration
    INSERT OR IGNORE INTO logging_config (id, updated_at) 
    VALUES ('default', strftime('%s', 'now'));
  `);

  log.info('Migration v17: Logging configuration table created');
}
