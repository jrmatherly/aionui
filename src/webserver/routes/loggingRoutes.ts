/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin routes for logging configuration management.
 * All endpoints require admin role.
 */

import { adminLogger as log, getLogLevel, setLogLevel } from '@/common/logger';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { requireAdmin } from '@/webserver/auth/middleware/RoleMiddleware';
import { getDatabase } from '@process/database';
import type { Express, Request, Response } from 'express';
import { apiRateLimiter } from '../middleware/security';
import dgram from 'dgram';
import net from 'net';
import tls from 'tls';

/**
 * Logging configuration interface
 */
interface ILoggingConfig {
  id?: string;
  log_level: string;
  log_format: string;
  log_file?: string;
  retention_days: number;
  max_size_mb: number;
  destinations: string;
  otel_enabled: number;
  otel_endpoint?: string;
  otel_protocol?: string;
  otel_service_name?: string;
  otel_log_level?: string;
  syslog_enabled: number;
  syslog_host?: string;
  syslog_port?: number;
  syslog_protocol?: string;
  syslog_facility?: number;
  langfuse_enabled: number;
  langfuse_host?: string;
  langfuse_public_key?: string;
  langfuse_secret_key?: string;
  updated_by?: string;
  updated_at: number;
}

export function registerLoggingRoutes(app: Express): void {
  // Shared middleware stack: rate-limit → auth → admin-only
  const adminGuard = [apiRateLimiter, AuthMiddleware.authenticateToken, requireAdmin];

  /* ------------------------------------------------------------------ */
  /*  GET /api/admin/logging — get current logging configuration         */
  /* ------------------------------------------------------------------ */
  app.get('/api/admin/logging', ...adminGuard, (_req: Request, res: Response) => {
    try {
      const db = getDatabase().getRawDb();
      const config = db.prepare('SELECT * FROM logging_config WHERE id = ?').get('default') as ILoggingConfig | undefined;

      if (!config) {
        // Return defaults if no config exists
        res.json({
          success: true,
          config: {
            log_level: 'info',
            log_format: 'json',
            log_file: null,
            retention_days: 30,
            max_size_mb: 500,
            destinations: ['stdout'],
            otel_enabled: false,
            otel_endpoint: 'http://localhost:4318',
            otel_protocol: 'http',
            otel_service_name: 'aionui',
            otel_log_level: 'info',
            syslog_enabled: false,
            syslog_host: 'localhost',
            syslog_port: 514,
            syslog_protocol: 'udp',
            syslog_facility: 16,
            langfuse_enabled: false,
            langfuse_host: 'https://cloud.langfuse.com',
          },
        });
        return;
      }

      // Parse destinations JSON
      const destinations = JSON.parse(config.destinations);

      // Sanitize config (hide secret keys)
      const sanitized = {
        log_level: config.log_level,
        log_format: config.log_format,
        log_file: config.log_file,
        retention_days: config.retention_days,
        max_size_mb: config.max_size_mb,
        destinations,
        otel_enabled: config.otel_enabled === 1,
        otel_endpoint: config.otel_endpoint,
        otel_protocol: config.otel_protocol,
        otel_service_name: config.otel_service_name,
        otel_log_level: config.otel_log_level,
        syslog_enabled: config.syslog_enabled === 1,
        syslog_host: config.syslog_host,
        syslog_port: config.syslog_port,
        syslog_protocol: config.syslog_protocol,
        syslog_facility: config.syslog_facility,
        langfuse_enabled: config.langfuse_enabled === 1,
        langfuse_host: config.langfuse_host,
        langfuse_public_key: config.langfuse_public_key ? '***' : undefined,
        langfuse_secret_key: config.langfuse_secret_key ? '***' : undefined,
        updated_by: config.updated_by,
        updated_at: config.updated_at,
      };

      res.json({ success: true, config: sanitized });
    } catch (error) {
      log.error({ err: error }, 'Get logging config failed');
      res.status(500).json({ success: false, error: 'Failed to get logging configuration' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  PATCH /api/admin/logging — update logging configuration            */
  /* ------------------------------------------------------------------ */
  app.patch('/api/admin/logging', ...adminGuard, (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const updates = req.body as Partial<{
        log_level: string;
        log_format: string;
        log_file: string;
        retention_days: number;
        max_size_mb: number;
        destinations: string[];
        otel_enabled: boolean;
        otel_endpoint: string;
        otel_protocol: string;
        otel_service_name: string;
        otel_log_level: string;
        syslog_enabled: boolean;
        syslog_host: string;
        syslog_port: number;
        syslog_protocol: string;
        syslog_facility: number;
        langfuse_enabled: boolean;
        langfuse_host: string;
        langfuse_public_key: string;
        langfuse_secret_key: string;
      }>;

      // Validate log level if provided
      const VALID_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
      if (updates.log_level && !VALID_LEVELS.includes(updates.log_level)) {
        res.status(400).json({ success: false, error: `Invalid log level. Must be one of: ${VALID_LEVELS.join(', ')}` });
        return;
      }
      if (updates.log_format && !['json', 'pretty'].includes(updates.log_format)) {
        res.status(400).json({ success: false, error: 'Invalid log format. Must be json or pretty' });
        return;
      }
      if (updates.otel_log_level && !['debug', 'info', 'warn', 'error'].includes(updates.otel_log_level)) {
        res.status(400).json({ success: false, error: 'Invalid OTEL log level. Must be debug, info, warn, or error' });
        return;
      }

      const db = getDatabase().getRawDb();

      // Build UPDATE statement dynamically
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.log_level !== undefined) {
        fields.push('log_level = ?');
        values.push(updates.log_level);
      }
      if (updates.log_format !== undefined) {
        fields.push('log_format = ?');
        values.push(updates.log_format);
      }
      if (updates.log_file !== undefined) {
        fields.push('log_file = ?');
        values.push(updates.log_file || null);
      }
      if (updates.retention_days !== undefined) {
        fields.push('retention_days = ?');
        values.push(updates.retention_days);
      }
      if (updates.max_size_mb !== undefined) {
        fields.push('max_size_mb = ?');
        values.push(updates.max_size_mb);
      }
      if (updates.destinations !== undefined) {
        fields.push('destinations = ?');
        values.push(JSON.stringify(updates.destinations));
      }
      if (updates.otel_enabled !== undefined) {
        fields.push('otel_enabled = ?');
        values.push(updates.otel_enabled ? 1 : 0);
      }
      if (updates.otel_endpoint !== undefined) {
        fields.push('otel_endpoint = ?');
        values.push(updates.otel_endpoint);
      }
      if (updates.otel_protocol !== undefined) {
        fields.push('otel_protocol = ?');
        values.push(updates.otel_protocol);
      }
      if (updates.otel_service_name !== undefined) {
        fields.push('otel_service_name = ?');
        values.push(updates.otel_service_name);
      }
      if (updates.otel_log_level !== undefined) {
        fields.push('otel_log_level = ?');
        values.push(updates.otel_log_level);
      }
      if (updates.syslog_enabled !== undefined) {
        fields.push('syslog_enabled = ?');
        values.push(updates.syslog_enabled ? 1 : 0);
      }
      if (updates.syslog_host !== undefined) {
        fields.push('syslog_host = ?');
        values.push(updates.syslog_host);
      }
      if (updates.syslog_port !== undefined) {
        fields.push('syslog_port = ?');
        values.push(updates.syslog_port);
      }
      if (updates.syslog_protocol !== undefined) {
        fields.push('syslog_protocol = ?');
        values.push(updates.syslog_protocol);
      }
      if (updates.syslog_facility !== undefined) {
        fields.push('syslog_facility = ?');
        values.push(updates.syslog_facility);
      }
      if (updates.langfuse_enabled !== undefined) {
        fields.push('langfuse_enabled = ?');
        values.push(updates.langfuse_enabled ? 1 : 0);
      }
      if (updates.langfuse_host !== undefined) {
        fields.push('langfuse_host = ?');
        values.push(updates.langfuse_host);
      }
      if (updates.langfuse_public_key !== undefined && updates.langfuse_public_key !== '***') {
        fields.push('langfuse_public_key = ?');
        values.push(updates.langfuse_public_key);
      }
      if (updates.langfuse_secret_key !== undefined && updates.langfuse_secret_key !== '***') {
        fields.push('langfuse_secret_key = ?');
        values.push(updates.langfuse_secret_key);
      }

      // Always update audit fields
      fields.push('updated_by = ?', 'updated_at = ?');
      values.push(userId, Math.floor(Date.now() / 1000));

      // Add WHERE clause parameter
      values.push('default');

      const sql = `UPDATE logging_config SET ${fields.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...values);

      // Apply log level change immediately if requested
      if (updates.log_level) {
        setLogLevel(updates.log_level as any);
        log.info({ newLevel: updates.log_level }, 'Log level changed via admin API');
      }

      res.json({ success: true, message: 'Logging configuration updated' });
    } catch (error) {
      log.error({ err: error }, 'Update logging config failed');
      res.status(500).json({ success: false, error: 'Failed to update logging configuration' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  GET /api/admin/logging/level — get current runtime log level       */
  /* ------------------------------------------------------------------ */
  app.get('/api/admin/logging/level', ...adminGuard, (_req: Request, res: Response) => {
    try {
      const level = getLogLevel();
      res.json({ success: true, level });
    } catch (error) {
      log.error({ err: error }, 'Get log level failed');
      res.status(500).json({ success: false, error: 'Failed to get log level' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  POST /api/admin/logging/level — change runtime log level           */
  /* ------------------------------------------------------------------ */
  app.post('/api/admin/logging/level', ...adminGuard, (req: Request, res: Response) => {
    try {
      const { level } = req.body as { level?: string };

      const VALID_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
      if (!level || !VALID_LEVELS.includes(level)) {
        res.status(400).json({ success: false, error: `Invalid log level. Must be one of: ${VALID_LEVELS.join(', ')}` });
        return;
      }

      setLogLevel(level as any);
      log.info({ newLevel: level, userId: req.user!.id }, 'Log level changed at runtime');

      res.json({ success: true, level });
    } catch (error) {
      log.error({ err: error }, 'Set log level failed');
      res.status(500).json({ success: false, error: 'Failed to set log level' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  POST /api/admin/logging/test-syslog — test syslog connectivity     */
  /* ------------------------------------------------------------------ */
  app.post('/api/admin/logging/test-syslog', ...adminGuard, async (req: Request, res: Response) => {
    try {
      const { host, port, protocol } = req.body as { host?: string; port?: number; protocol?: string };

      if (!host || !port || !protocol) {
        res.status(400).json({ success: false, error: 'host, port, and protocol are required' });
        return;
      }

      const testMessage = '<134>1 2026-02-05T10:00:00Z aionui - - - - Test message from AionUI';

      if (protocol === 'udp') {
        // UDP test
        const client = dgram.createSocket('udp4');

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            client.close();
            reject(new Error('UDP send timeout'));
          }, 5000);

          client.send(testMessage, port, host, (err) => {
            clearTimeout(timeout);
            client.close();
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        res.json({ success: true, message: 'UDP syslog test successful (message sent)' });
      } else if (protocol === 'tcp') {
        // TCP test
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
            socket.write(testMessage + '\n', (err) => {
              socket.end();
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });

          socket.on('error', (err) => {
            reject(err);
          });

          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('TCP connection timeout'));
          });
        });

        res.json({ success: true, message: 'TCP syslog test successful (connection established)' });
      } else if (protocol === 'tls') {
        // TLS test
        await new Promise<void>((resolve, reject) => {
          const socket = tls.connect({ host, port, timeout: 5000, rejectUnauthorized: false }, () => {
            socket.write(testMessage + '\n', (err) => {
              socket.end();
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });

          socket.on('error', (err) => {
            reject(err);
          });

          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('TLS connection timeout'));
          });
        });

        res.json({ success: true, message: 'TLS syslog test successful (secure connection established)' });
      } else {
        res.status(400).json({ success: false, error: 'Invalid protocol. Must be udp, tcp, or tls' });
      }
    } catch (error) {
      log.error({ err: error }, 'Syslog test failed');
      res.status(500).json({
        success: false,
        error: `Syslog test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });
}
