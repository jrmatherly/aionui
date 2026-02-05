/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * OpenTelemetry bootstrap for distributed tracing.
 *
 * This module initializes the OpenTelemetry NodeSDK with auto-instrumentation
 * for common libraries (HTTP, fetch, database drivers, etc.).
 *
 * IMPORTANT: This MUST be imported before any other application code to ensure
 * instrumentation patches are applied before libraries are loaded.
 *
 * Usage in main entry point:
 *   import './process/telemetry/otel'; // First import!
 *   import express from 'express';      // Now instrumented
 *
 * Configuration via environment variables:
 *   OTEL_ENABLED - Enable/disable OTEL (default: false)
 *   OTEL_SERVICE_NAME - Service identifier (default: 'aionui')
 *   OTEL_EXPORTER_OTLP_ENDPOINT - OTLP collector endpoint (default: http://localhost:4318)
 *   OTEL_EXPORTER_OTLP_PROTOCOL - Protocol (http/grpc, default: http)
 *
 * When enabled, traces are exported to the OTLP endpoint. Structured logs
 * automatically include traceId and spanId for correlation.
 */

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { createLogger } from '@/common/logger';

const log = createLogger('OTEL');
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * Check if OpenTelemetry is enabled.
 */
function isOtelEnabled(): boolean {
  return process.env.OTEL_ENABLED === 'true';
}

/**
 * Get service name from environment or default.
 */
function getServiceName(): string {
  return process.env.OTEL_SERVICE_NAME || 'aionui';
}

/**
 * Get service version from package.json (if available).
 */
function getServiceVersion(): string {
  try {
    const pkg = require('../../../package.json');
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get OTLP exporter endpoint.
 */
function getOtlpEndpoint(): string {
  return process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
}

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK with auto-instrumentation.
 *
 * Call this BEFORE any other imports in your application entry point.
 *
 * Auto-instruments:
 * - HTTP/HTTPS (Express, native http/https)
 * - fetch (Node.js 18+)
 * - better-sqlite3 (if installed)
 * - And many other common libraries
 *
 * @returns NodeSDK instance if enabled, null otherwise
 */
export function initializeOtel(): NodeSDK | null {
  if (!isOtelEnabled()) {
    log.info('OpenTelemetry disabled (OTEL_ENABLED != true)');
    return null;
  }

  try {
    // Enable diagnostic logging for troubleshooting (only in debug mode)
    if (process.env.OTEL_LOG_LEVEL === 'debug') {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }

    const serviceName = getServiceName();
    const serviceVersion = getServiceVersion();
    const otlpEndpoint = getOtlpEndpoint();

    log.info({ serviceName, serviceVersion }, 'Initializing OpenTelemetry');
    log.info({ endpoint: otlpEndpoint }, 'OTLP endpoint');

    // Create trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
      // Optional: Add authentication headers
      // headers: {
      //   'Authorization': `Bearer ${process.env.OTEL_AUTH_TOKEN}`
      // },
    });

    // Create SDK with resource attributes and auto-instrumentation
    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: serviceVersion,
      }),
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable specific instrumentations if needed
          // '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    // Start the SDK
    sdk.start();
    log.info('OpenTelemetry SDK started successfully');

    // Graceful shutdown on process termination
    process.on('SIGTERM', async () => {
      try {
        await sdk?.shutdown();
        log.info('OpenTelemetry SDK shut down successfully');
      } catch (error) {
        log.error({ err: error }, 'Error shutting down OpenTelemetry SDK');
      } finally {
        process.exit(0);
      }
    });

    return sdk;
  } catch (error) {
    log.error({ err: error }, 'Failed to initialize OpenTelemetry');
    return null;
  }
}

/**
 * Shutdown the OpenTelemetry SDK (for graceful app termination).
 */
export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

// Auto-initialize if OTEL is enabled
initializeOtel();
