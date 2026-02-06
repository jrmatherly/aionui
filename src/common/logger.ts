/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized structured logging for AionUI.
 *
 * Uses Pino for high-performance JSON logging with:
 * - Named child loggers per component (replaces [Tag] console.log patterns)
 * - Configurable log level via LOG_LEVEL env var
 * - Pretty-print for development, JSON for production
 * - File output support via LOG_FILE env var
 * - Electron + Node.js compatible
 *
 * Usage:
 *   import { logger, createLogger } from '@/common/logger';
 *
 *   // Root logger (general use)
 *   logger.info('Server started');
 *   logger.error({ err }, 'Request failed');
 *
 *   // Component child logger (replaces [Tag] prefix pattern)
 *   const log = createLogger('Auth');
 *   log.info('User login successful');       // → {"component":"Auth","msg":"User login successful"}
 *   log.error({ userId }, 'Login failed');   // → {"component":"Auth","userId":"...","msg":"Login failed"}
 *
 * Environment variables:
 *   LOG_LEVEL   - trace|debug|info|warn|error|fatal|silent (default: info)
 *   LOG_FORMAT  - json|pretty (default: pretty in dev, json in production)
 *   LOG_FILE    - File path for log output (optional, writes JSON regardless of LOG_FORMAT)
 */

import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

// ============================================================
// Configuration
// ============================================================

/** Valid Pino log levels */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const VALID_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

/**
 * Determine if we're in a production-like environment.
 * Docker containers set NODE_ENV=production; Electron dev sets nothing or 'development'.
 */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Resolve log level from environment with validation.
 */
function resolveLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (VALID_LEVELS.includes(envLevel)) return envLevel;
  return isProduction ? 'info' : 'debug';
}

/**
 * Determine log format (json or pretty).
 */
function resolveFormat(): 'json' | 'pretty' {
  const envFormat = (process.env.LOG_FORMAT || '').toLowerCase();
  if (envFormat === 'json' || envFormat === 'pretty') return envFormat;
  return isProduction ? 'json' : 'pretty';
}

// ============================================================
// Transport configuration
// ============================================================

/**
 * Resolve a transport module to its absolute path.
 *
 * Pino transports run in worker threads via thread-stream. The worker does
 * `require(target)` where target is the transport name. When running inside
 * an Electron asar archive or a webpack-bundled context, short module names
 * like 'pino-roll' may not resolve because the worker's module search paths
 * differ from the main process. Using require.resolve() in the main process
 * (where node_modules ARE accessible) converts to an absolute path that the
 * worker thread can always load.
 */
function resolveTransport(name: string): string {
  try {
    return require.resolve(name);
  } catch {
    // Fallback to bare name (works when node_modules is on the search path)
    return name;
  }
}

/**
 * Build Pino transport targets.
 *
 * In production: JSON to stdout (Docker/k8s log drivers handle the rest)
 * In development: Pretty-printed to stdout
 * If LOG_FILE is set: Also write JSON to file with rotation (pino-roll)
 * If SYSLOG_ENABLED: Forward to syslog/SIEM (RFC 5424 compliant)
 */
function buildTransport(): pino.TransportMultiOptions | pino.TransportSingleOptions | undefined {
  const format = resolveFormat();
  const logFile = process.env.LOG_FILE;
  const syslogEnabled = process.env.SYSLOG_ENABLED === 'true';

  const targets: pino.TransportTargetOptions[] = [];

  if (format === 'pretty') {
    targets.push({
      target: resolveTransport('pino-pretty'),
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: '{if component}[{component}] {end}{msg}',
      },
    });
  } else {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    });
  }

  // Optional file output with rotation (always JSON for machine parsing)
  if (logFile) {
    const maxSizeMB = parseInt(process.env.LOG_MAX_SIZE_MB || '100', 10);
    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);

    targets.push({
      target: resolveTransport('pino-roll'),
      options: {
        file: logFile,
        // Rotate by size (MB)
        size: `${maxSizeMB}M`,
        // Rotate daily
        frequency: 'daily',
        // Keep files for retention period (approximate via maxFiles)
        // Daily rotation → maxFiles = retentionDays
        // Note: pino-roll doesn't have built-in retention, but maxFiles limits old file count
        maxFiles: retentionDays,
        mkdir: true,
      },
    });
  }

  // Optional syslog forwarding (SIEM integration)
  if (syslogEnabled) {
    const syslogHost = process.env.SYSLOG_HOST || 'localhost';
    const syslogPort = parseInt(process.env.SYSLOG_PORT || '514', 10);
    const syslogProtocol = process.env.SYSLOG_PROTOCOL || 'udp';
    const syslogFacility = parseInt(process.env.SYSLOG_FACILITY || '16', 10); // local0 = 16

    targets.push({
      target: resolveTransport('pino-syslog'),
      options: {
        host: syslogHost,
        port: syslogPort,
        protocol: syslogProtocol as 'tcp' | 'udp' | 'tls',
        facility: syslogFacility,
        appname: 'aionui',
        // RFC 5424 format (structured data)
        format: 'rfc5424',
        // Include structured data in syslog message
        includeProperties: ['component', 'requestId', 'userId', 'traceId', 'spanId'],
      },
    });
  }

  if (targets.length === 1) {
    return targets[0];
  }

  return { targets };
}

// ============================================================
// OpenTelemetry Integration
// ============================================================

/**
 * Pino mixin that injects OpenTelemetry trace context into every log.
 *
 * Adds traceId and spanId from the active OTEL span, enabling correlation
 * between structured logs and distributed traces in observability platforms
 * (Datadog, New Relic, Honeycomb, etc.).
 *
 * When OTEL is disabled or no active span exists, returns empty object.
 */
function otelMixin(): Record<string, string> {
  try {
    const activeContext = context.active();
    const span = trace.getSpan(activeContext);
    if (span) {
      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    }
  } catch {
    // OTEL not initialized or error accessing span - silently ignore
  }
  return {};
}

// ============================================================
// Logger instances
// ============================================================

/**
 * Root logger instance.
 * Use `createLogger(component)` for component-specific child loggers.
 */
export const logger: pino.Logger = pino({
  level: resolveLevel(),
  transport: buildTransport(),
  // Base bindings included in every log line
  base: {
    service: 'aionui',
  },
  // Mixin to inject OpenTelemetry trace context
  mixin: otelMixin,
  // Serialize Error objects properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  // Timestamp as ISO string for human readability + machine parsing
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a named child logger for a component.
 *
 * Replaces the `console.log('[ComponentName] ...')` pattern with structured logging.
 * The component name appears in every log entry, enabling filtering and aggregation.
 *
 * @example
 *   const log = createLogger('Database');
 *   log.info('Migration complete');
 *   // Output: {"level":"info","component":"Database","msg":"Migration complete",...}
 *
 * @example
 *   const log = createLogger('Auth');
 *   log.info({ userId: 'abc' }, 'Login successful');
 *   // Output: {"level":"info","component":"Auth","userId":"abc","msg":"Login successful",...}
 */
export function createLogger(component: string): pino.Logger {
  return logger.child({ component });
}

// ============================================================
// Pre-built component loggers (most common components)
// ============================================================

// These cover the top ~20 tagged log patterns found in the codebase.
// Additional loggers can be created on-demand with createLogger().

/** Authentication & authorization */
export const authLogger = createLogger('Auth');

/** Database operations & migrations */
export const dbLogger = createLogger('Database');

/** OIDC/SSO provider */
export const oidcLogger = createLogger('OIDC');

/** Web server & HTTP */
export const httpLogger = createLogger('HTTP');

/** WebSocket connections */
export const wsLogger = createLogger('WebSocket');

/** Admin operations */
export const adminLogger = createLogger('Admin');

/** Conversation management */
export const conversationLogger = createLogger('Conversation');

/** File system bridge */
export const fsLogger = createLogger('FileSystem');

/** MCP server management */
export const mcpLogger = createLogger('MCP');

/** Gemini agent/CLI */
export const geminiLogger = createLogger('Gemini');

/** ACP agent framework */
export const acpLogger = createLogger('ACP');

/** Channel/messaging plugins */
export const channelLogger = createLogger('Channel');

/** Plugin manager */
export const pluginLogger = createLogger('Plugin');

/** Global model service */
export const modelLogger = createLogger('Models');

/** Cron/scheduler service */
export const cronLogger = createLogger('Cron');

/** Initialization & startup */
export const initLogger = createLogger('Init');

/** mise environment service (Python workspace management) */
export const miseLogger = createLogger('Mise');

/** Knowledge base / RAG operations */
export const kbLogger = createLogger('KnowledgeBase');

// ============================================================
// Utility functions
// ============================================================

/**
 * Log and re-throw an error (useful in catch blocks).
 */
export function logAndThrow(log: pino.Logger, err: unknown, message: string): never {
  log.error({ err }, message);
  throw err;
}

/**
 * Get the current log level.
 */
export function getLogLevel(): string {
  return logger.level;
}

/**
 * Dynamically change log level at runtime (e.g., via admin API).
 */
export function setLogLevel(level: LogLevel): void {
  if (VALID_LEVELS.includes(level)) {
    logger.level = level;
    logger.info({ newLevel: level }, 'Log level changed');
  }
}

export default logger;
