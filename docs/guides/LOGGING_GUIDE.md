# Logging & Observability Guide

AionUI includes enterprise-grade logging with structured output, distributed tracing, SIEM forwarding, and LLM observability.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      AionUI Application                  │
├─────────────────────────────────────────────────────────┤
│  Pino Structured Logging (JSON)                         │
│  ├─ stdout (Docker log drivers)                         │
│  ├─ File (pino-roll rotation)                           │
│  ├─ Syslog (RFC 5424 to SIEM)                           │
│  └─ OTEL mixin (traceId/spanId)                         │
├─────────────────────────────────────────────────────────┤
│  OpenTelemetry (Distributed Tracing)                    │
│  ├─ Auto-instrumentation (Express, HTTP, SQLite)        │
│  ├─ OTLP Export (HTTP/gRPC)                             │
│  └─ Correlation with logs via requestId                 │
├─────────────────────────────────────────────────────────┤
│  Langfuse (LLM Observability)                           │
│  ├─ Generation tracing                                  │
│  ├─ Conversation tracking                               │
│  └─ Token usage/cost analysis                           │
└─────────────────────────────────────────────────────────┘
           │                │                │
           ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ ELK/Loki │    │ Jaeger/  │    │ Langfuse │
    │  Stack   │    │ Datadog  │    │  Cloud   │
    └──────────┘    └──────────┘    └──────────┘
```

## Components

### Structured Logging (Pino)

All logging uses [Pino](https://getpino.io/) with child loggers per component. Output is JSON for machine parsing.

```typescript
import { createLogger } from '@/common/logger';
const log = createLogger('MyComponent');

log.info({ userId, requestId }, 'Processing request');
// → {"level":"info","component":"MyComponent","userId":"abc","requestId":"xyz","msg":"Processing request"}
```

**17 component loggers** cover the full application (auth, agents, database, WebSocket, channels, etc.).

### Request Tracing & Correlation IDs

Every HTTP request gets a unique correlation ID via `AsyncLocalStorage`:

- Auto-generated UUID v4 per request
- Supports `X-Request-ID` header passthrough from upstream proxies
- Injected into all downstream log entries
- Health checks and static assets are excluded from logging

**Key files:**

- `src/webserver/middleware/correlationId.ts` — AsyncLocalStorage-based tracking
- `src/webserver/middleware/requestLogger.ts` — HTTP request/response logging with timing

### OpenTelemetry (Distributed Tracing)

Auto-instrumentation for Express, HTTP, fetch, and SQLite. Trace and span IDs are injected into Pino log entries for correlation.

**Key file:** `src/process/telemetry/otel.ts`

### Syslog / SIEM Forwarding

RFC 5424 compliant syslog output supporting UDP, TCP, and TLS protocols. Structured data fields include component, requestId, traceId, and userId.

### Langfuse (LLM Observability)

Singleton service for tracing LLM generations, conversations, and token usage.

```typescript
import { LangfuseService } from '@/process/services/LangfuseService';

LangfuseService.traceGeneration({
  name: 'chat-completion',
  input: { prompt },
  output: { response },
  model: 'gpt-4',
  userId,
  totalTokens: 150,
});
```

**Key file:** `src/process/services/LangfuseService.ts`

### Log Rotation (pino-roll)

Automatic log file rotation by size and time:

- Rotates when file exceeds configured size
- Daily rotation at midnight
- Retention controlled by file count
- Old files automatically deleted

## Environment Variables

### Core Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `LOG_FILE` | *(none)* | File path for log output (e.g., `/var/log/aionui/app.log`) |
| `LOG_MAX_SIZE_MB` | `100` | Max log file size before rotation |
| `LOG_RETENTION_DAYS` | `30` | Number of rotated files to keep |

### OpenTelemetry

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP collector endpoint |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http` | Export protocol (`http` or `grpc`) |
| `OTEL_SERVICE_NAME` | `aionui` | Service name in traces |

### Syslog / SIEM

| Variable | Default | Description |
|----------|---------|-------------|
| `SYSLOG_ENABLED` | `false` | Enable syslog forwarding |
| `SYSLOG_HOST` | `localhost` | Syslog server hostname |
| `SYSLOG_PORT` | `514` | Syslog server port |
| `SYSLOG_PROTOCOL` | `udp` | Transport protocol (`udp`, `tcp`, `tls`) |
| `SYSLOG_FACILITY` | `16` | Syslog facility code (16 = local0) |

### Langfuse

| Variable | Default | Description |
|----------|---------|-------------|
| `LANGFUSE_ENABLED` | `false` | Enable LLM observability |
| `LANGFUSE_HOST` | `https://cloud.langfuse.com` | Langfuse instance URL |
| `LANGFUSE_PUBLIC_KEY` | *(none)* | Langfuse public API key |
| `LANGFUSE_SECRET_KEY` | *(none)* | Langfuse secret API key |

## Admin UI

Admins can configure all logging settings at runtime via **Settings → Logging** (or the Admin menu → Logging Settings):

- **Core settings:** Log level, file output, retention
- **OpenTelemetry:** Enable/disable, endpoint configuration
- **Syslog/SIEM:** Enable/disable, server configuration with connectivity test
- **Langfuse:** Enable/disable, API key configuration

Runtime log level changes take effect immediately without restart.

**Key files:**

- `src/renderer/pages/admin/LoggingSettings.tsx` — Admin UI
- `src/webserver/routes/loggingRoutes.ts` — REST API

### Admin API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/logging` | Get current logging configuration |
| `PATCH` | `/api/admin/logging` | Update configuration (admin only) |
| `GET` | `/api/admin/logging/level` | Get current runtime log level |
| `POST` | `/api/admin/logging/level` | Change log level at runtime |
| `POST` | `/api/admin/logging/test-syslog` | Test syslog connectivity |

All endpoints require authentication and admin role. Secret keys are sanitized in responses.

## Database Schema

Logging configuration is stored in `logging_config` (schema v17) as a singleton row. See `src/process/database/migrations/v17_add_logging_config.ts`.

## Using Logging in Code

### Creating a Component Logger

```typescript
import { createLogger } from '@/common/logger';
const log = createLogger('KnowledgeBase');

log.info({ userId, docCount: 5 }, 'Ingestion complete');
log.error({ err: error, fileId }, 'Failed to process document');
log.warn({ userId }, 'Approaching storage limit');
```

### Accessing Correlation ID

```typescript
import { getRequestId } from '@/webserver/middleware/correlationId';

const requestId = getRequestId(); // From AsyncLocalStorage
log.info({ requestId }, 'Operation started');
```

## Production Deployment Checklist

- [ ] Set `LOG_LEVEL=info` (or `warn` for high-traffic environments)
- [ ] Enable file logging with appropriate path and permissions
- [ ] Configure retention (`LOG_RETENTION_DAYS`, `LOG_MAX_SIZE_MB`)
- [ ] If using OTEL: Enable and configure collector endpoint
- [ ] If using SIEM: Enable syslog and test connectivity via admin UI
- [ ] If using Langfuse: Set API credentials and enable
- [ ] Verify correlation between logs and traces using `requestId`
- [ ] Configure Docker log driver for container-level log management

## References

- [Pino Documentation](https://getpino.io/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/)
- [Langfuse Documentation](https://langfuse.com/docs)
- [RFC 5424 — The Syslog Protocol](https://datatracker.ietf.org/doc/html/rfc5424)
