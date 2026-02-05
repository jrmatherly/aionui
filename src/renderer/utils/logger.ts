/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser-safe structured logger for the renderer process.
 *
 * Uses Pino's browser build which wraps console.* with:
 * - Level filtering (respects LOG_LEVEL)
 * - Structured JSON objects (component, context)
 * - Child logger pattern (same API as main process logger)
 *
 * Webpack resolves `pino` → `pino/browser.js` automatically via the
 * `browser` field in pino's package.json.
 *
 * Usage:
 *   import { createLogger } from '@/renderer/utils/logger';
 *   const log = createLogger('MyComponent');
 *   log.info({ userId }, 'Action performed');
 *   log.error({ err: error }, 'Operation failed');
 */

import pino from 'pino';

/**
 * Default log level for the renderer process.
 * In development, show debug and above. In production, info and above.
 */
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Root logger instance for the renderer process.
 *
 * In browser mode, Pino outputs to the browser console with level filtering.
 * The `asObject` option outputs structured objects instead of formatted strings,
 * making logs searchable in browser DevTools.
 */
const rootLogger = pino({
  level: isDev ? 'debug' : 'warn',
  browser: {
    // In dev: use default console output (readable in DevTools)
    // In prod: structured objects for potential transmit/aggregation
    asObject: !isDev,
  },
});

/**
 * Create a child logger with a component name.
 * Mirrors the API from `src/common/logger.ts` for consistency.
 *
 * @param component - Component or module name (e.g., 'Settings', 'ChatHistory')
 * @returns A Pino child logger instance
 */
export function createLogger(component: string): pino.Logger {
  return rootLogger.child({ component });
}

export default rootLogger;
