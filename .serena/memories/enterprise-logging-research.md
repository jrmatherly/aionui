# Enterprise Logging & Observability System

**Created:** 2026-02-05  
**Author:** Bot42  
**Status:** ✅ Implemented (Phases 1-6 complete)

## Architecture

### Stack

| Component         | Implementation                                               |
| ----------------- | ------------------------------------------------------------ |
| Logger            | **Pino 10.x** — structured JSON, child loggers per component |
| Tracing           | **OpenTelemetry** — auto-instrumentation, OTLP export        |
| Request Tracing   | **Correlation ID** — AsyncLocalStorage, X-Request-ID header  |
| LLM Observability | **Langfuse** — configurable via admin UI + env vars          |
| SIEM Integration  | **Syslog** — RFC 5424, UDP/TCP/TLS, configurable facility    |
| Log Rotation      | **pino-roll** — size-based + time-based rotation             |
| Admin UI          | **LoggingSettings.tsx** — runtime config via REST API        |

### Core Module: `src/common/logger.ts`

- Root Pino logger with OTEL trace mixin (traceId/spanId in every log line)
- `createLogger(component)` factory for child loggers
- 17 pre-built component loggers: Auth, Database, OIDC, HTTP, WebSocket, Admin, Conversation, FileSystem, MCP, Gemini, ACP, Channel, Plugin, Models, Cron, Init, Session
- Environment-driven defaults: `LOG_LEVEL`, `LOG_FORMAT` (json/pretty), `LOG_FILE`
- Pretty-print in dev, JSON in production

### Key Files

```
src/common/logger.ts                          # Core logger + child loggers
src/process/telemetry/otel.ts                 # OTEL bootstrap (must be first import)
src/webserver/middleware/correlationId.ts      # Request ID propagation
src/webserver/routes/loggingRoutes.ts         # Admin REST API (380 lines)
src/renderer/pages/admin/LoggingSettings.tsx  # Admin UI page
```

### Database Schema

Logging config is stored in the existing SQLite database via `logging_config` table:

- `log_level`, `retention_days`, `max_size_mb`
- `syslog_enabled`, `syslog_host`, `syslog_port`, `syslog_protocol`, `syslog_facility`
- `otel_enabled`, `otel_endpoint`, `otel_protocol`, `otel_service_name`
- `langfuse_enabled`, `langfuse_host`, `langfuse_public_key`, `langfuse_secret_key`

### Environment Variables

All configurable in `.env`, `.env.example`, and `docker-compose.yml`:

| Variable                      | Default               | Description                 |
| ----------------------------- | --------------------- | --------------------------- |
| `LOG_LEVEL`                   | info (prod)           | trace/debug/info/warn/error |
| `LOG_FORMAT`                  | json (prod)           | json or pretty              |
| `LOG_FILE`                    | _(none)_              | Path for file logging       |
| `LOG_MAX_SIZE_MB`             | 100                   | Rotation size limit         |
| `LOG_RETENTION_DAYS`          | 30                    | Rotated file retention      |
| `OTEL_ENABLED`                | false                 | Enable OpenTelemetry        |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | http://localhost:4318 | OTLP collector URL          |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | http                  | http or grpc                |
| `OTEL_SERVICE_NAME`           | aionui                | Service identifier          |
| `SYSLOG_ENABLED`              | false                 | Enable syslog forwarding    |
| `SYSLOG_HOST`                 | localhost             | Syslog server               |
| `SYSLOG_PORT`                 | 514                   | Syslog port                 |
| `SYSLOG_PROTOCOL`             | udp                   | udp/tcp/tls                 |
| `SYSLOG_FACILITY`             | 16                    | Syslog facility (local0)    |
| `LANGFUSE_ENABLED`            | false                 | Enable Langfuse             |
| `LANGFUSE_HOST`               | cloud.langfuse.com    | Instance URL                |
| `LANGFUSE_PUBLIC_KEY`         | _(none)_              | API key                     |
| `LANGFUSE_SECRET_KEY`         | _(none)_              | API secret                  |

### Admin API Endpoints

```
GET  /api/admin/logging             # Get full logging config
PUT  /api/admin/logging             # Update logging config
GET  /api/admin/logging/level       # Get current log level
POST /api/admin/logging/level       # Set log level at runtime
POST /api/admin/logging/test-syslog # Test syslog connectivity
```

### Migration Progress

- **96% migration complete** (985 → 43 intentional console.\* calls)
- **~58 console.\* references remaining** in source (includes intentional startup banners and dev tooling)
- Previous doc sweep confirmed 43 intentional console.\* calls remaining after migration
- All new code uses Pino loggers exclusively
- Startup banners intentionally kept as console.log

### OTEL Auto-Instrumentation

Packages: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`

Automatically instruments:

- HTTP/HTTPS requests
- Express routes
- Fetch API
- Database drivers

### Middleware Stack Order

```
1. correlationIdMiddleware (early — generates/propagates X-Request-ID)
2. ... (auth, CSRF, etc.)
3. HTTP request/response logging (after auth — includes userId)
```

## Webpack Integration

**Pino MUST be externalized from webpack.** See `docker-packaging-constraints.md` for full details.

Summary: Pino's `"browser"` field in `package.json` causes webpack to load a console.log shim with zero transport support. All pino packages are in `config/webpack/webpack.config.ts` `externals` and `electron-builder.yml` `files`. Transport paths use `require.resolve()` for asar/worker-thread compatibility. The renderer webpack config does NOT externalize pino (it correctly uses the browser build).

## Patterns

### Creating a new component logger

```typescript
import { createLogger } from '@/common/logger';
const log = createLogger('MyComponent');

log.info({ userId, action }, 'User performed action');
log.error({ err: error, requestId }, 'Operation failed');
```

### Accessing correlation ID in any code

```typescript
import { getRequestId } from '@/webserver/middleware/correlationId';
const requestId = getRequestId(); // from AsyncLocalStorage
```
