# Enterprise Logging Infrastructure - Implementation Summary

**Author:** Jason Matherly  
**Date:** 2026-02-05  
**Status:** ✅ Complete (Phases 3-6)

## Overview

Enterprise-grade logging infrastructure for AionUI featuring structured logging, distributed tracing, SIEM forwarding, and LLM observability.

## Implemented Phases

### ✅ Phase 3: Request Tracing + Correlation IDs

**Files Created:**
- `src/webserver/middleware/correlationId.ts` - AsyncLocalStorage-based request ID tracking
- `src/webserver/middleware/requestLogger.ts` - HTTP request/response logging

**Files Modified:**
- `src/webserver/setup.ts` - Registered middleware
- `src/webserver/types/express.d.ts` - Extended Request type

**Features:**
- Unique request ID generation (UUID v4)
- X-Request-ID header passthrough support
- AsyncLocalStorage for downstream access
- HTTP request/response logging with timing
- Automatic user ID injection (from auth context)
- Health check and static asset filtering

**Commit:** `94570d62` - feat(logging): add request tracing and correlation ID middleware

---

### ✅ Phase 4: OpenTelemetry Integration

**Packages Installed:**
- `@opentelemetry/api`
- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/resources`
- `@opentelemetry/semantic-conventions`

**Files Created:**
- `src/process/telemetry/otel.ts` - OTEL SDK bootstrap and initialization

**Files Modified:**
- `src/common/logger.ts` - Added OTEL mixin for traceId/spanId injection
- `deploy/docker/.env.example` - Added OTEL environment variables

**Features:**
- Auto-instrumentation for Express, HTTP, fetch, SQLite
- OTLP trace export to collector
- Automatic trace/span context injection into logs
- Graceful initialization (disabled by default)
- Service name and version tagging

**Environment Variables:**
```bash
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http
OTEL_SERVICE_NAME=aionui
OTEL_LOG_LEVEL=info
```

**Commit:** `fa6d7d77` - feat(logging): add OpenTelemetry distributed tracing integration

---

### ✅ Phase 5: Syslog/SIEM Forwarding

**Packages Installed:**
- `pino-syslog`
- `pino-abstract-transport`

**Files Modified:**
- `src/common/logger.ts` - Added syslog transport with RFC 5424 compliance
- `deploy/docker/.env.example` - Added syslog configuration

**Features:**
- RFC 5424 compliant syslog output
- UDP, TCP, and TLS protocol support
- Configurable facility codes
- Structured data forwarding (component, requestId, traceId, userId)
- Multiple transport targets (stdout + file + syslog)

**Environment Variables:**
```bash
SYSLOG_ENABLED=false
SYSLOG_HOST=syslog.example.com
SYSLOG_PORT=514
SYSLOG_PROTOCOL=udp
SYSLOG_FACILITY=16  # local0
```

**Commit:** `9d77be63` - feat(logging): add syslog/SIEM forwarding support

---

### ✅ Phase 6a: Database Migration v17

**Files Created:**
- `src/process/database/migrations/v17_add_logging_config.ts` - Logging configuration table

**Files Modified:**
- `src/process/database/migrations.ts` - Registered migration v17

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS logging_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  log_level TEXT NOT NULL DEFAULT 'info',
  retention_days INTEGER NOT NULL DEFAULT 30,
  max_size_mb INTEGER NOT NULL DEFAULT 500,
  destinations TEXT NOT NULL DEFAULT '["stdout"]',
  
  -- OTEL settings
  otel_enabled INTEGER NOT NULL DEFAULT 0,
  otel_endpoint TEXT DEFAULT 'http://localhost:4318',
  otel_protocol TEXT DEFAULT 'http',
  otel_service_name TEXT DEFAULT 'aionui',
  
  -- Syslog settings
  syslog_enabled INTEGER NOT NULL DEFAULT 0,
  syslog_host TEXT DEFAULT 'localhost',
  syslog_port INTEGER DEFAULT 514,
  syslog_protocol TEXT DEFAULT 'udp',
  syslog_facility INTEGER DEFAULT 16,
  
  -- Langfuse settings
  langfuse_enabled INTEGER NOT NULL DEFAULT 0,
  langfuse_host TEXT DEFAULT 'https://cloud.langfuse.com',
  langfuse_public_key TEXT,
  langfuse_secret_key TEXT,
  
  -- Audit fields
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);
```

---

### ✅ Phase 6b: Admin API Routes

**Files Created:**
- `src/webserver/routes/loggingRoutes.ts` - Admin-only logging configuration endpoints

**Files Modified:**
- `src/webserver/index.ts` - Registered logging routes

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/logging` | Get current logging configuration |
| PATCH | `/api/admin/logging` | Update configuration (admin only) |
| GET | `/api/admin/logging/level` | Get current runtime log level |
| POST | `/api/admin/logging/level` | Change log level at runtime |
| POST | `/api/admin/logging/test-syslog` | Test syslog connectivity |

**Security:**
- All endpoints require authentication + admin role
- Rate-limited via `apiRateLimiter`
- Secret keys sanitized in responses (displayed as `***`)

**Commit:** `cb4284ea` - feat(logging): add logging configuration database and admin API

---

### ✅ Phase 6c: Admin UI Page

**Files Created:**
- `src/renderer/pages/admin/LoggingSettings.tsx` - Admin UI for logging configuration

**Files Modified:**
- `src/renderer/router.tsx` - Registered `/admin/logging` route
- `src/renderer/components/UserMenu/index.tsx` - Added "Logging Settings" menu item

**Features:**
- Core logging settings (level, retention, max size)
- OpenTelemetry configuration (endpoint, protocol, service name)
- Syslog/SIEM settings (host, port, protocol, facility)
- Langfuse LLM observability (host, API keys)
- Syslog connectivity testing
- Runtime log level control
- Input validation and error handling
- Responsive form layout with conditional fields

**UI Design:**
- Follows GlobalModels.tsx styling patterns
- Arco Design components
- Card-based sections for feature grouping
- Enable/disable toggles for each feature
- Form validation with helpful error messages

**Commit:** `5718addc` - feat(logging): add admin UI for logging configuration

---

### ✅ Phase 6d: Langfuse Integration

**Packages Installed:**
- `langfuse`

**Files Created:**
- `src/process/services/LangfuseService.ts` - LLM observability service

**Files Modified:**
- `deploy/docker/.env.example` - Added Langfuse environment variables

**Features:**
- Singleton service pattern
- Trace LLM generations with input/output/model
- Trace multi-turn conversations
- Automatic token usage tracking
- Graceful initialization and shutdown
- Flush pending traces on app termination

**Usage Example:**
```typescript
import { LangfuseService } from '@/process/services/LangfuseService';

// Initialize from env vars (app startup)
await LangfuseService.initialize();

// Trace a generation
LangfuseService.traceGeneration({
  name: 'chat-completion',
  input: { prompt: 'Hello' },
  output: { response: 'Hi there!' },
  model: 'gpt-4',
  userId: 'user123',
  promptTokens: 10,
  completionTokens: 15,
  totalTokens: 25,
});

// Flush traces on shutdown
await LangfuseService.flush();
```

**Environment Variables:**
```bash
LANGFUSE_ENABLED=false
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

---

### ✅ Phase 6e: Log Retention (pino-roll)

**Packages Installed:**
- `pino-roll`

**Files Modified:**
- `src/common/logger.ts` - Added pino-roll transport for log rotation
- `deploy/docker/.env.example` - Added rotation configuration

**Features:**
- Automatic log file rotation by size (configurable MB)
- Daily time-based rotation
- Retention control via file count
- Configurable maximum file size
- Directory creation for log paths

**Environment Variables:**
```bash
LOG_FILE=/var/log/aionui/app.log
LOG_MAX_SIZE_MB=100
LOG_RETENTION_DAYS=30
```

**Rotation Behavior:**
- Rotates when file size exceeds `LOG_MAX_SIZE_MB`
- Rotates daily at midnight
- Keeps up to `LOG_RETENTION_DAYS` files
- Old files automatically deleted when limit reached

**Commit:** `99c615f6` - feat(logging): add Langfuse integration and log rotation

---

## Verification

✅ All TypeScript compilation checks pass:
```bash
npx tsc --noEmit --skipLibCheck
```

✅ All commits follow conventional commits format

✅ No file conflicts with Phase 2 (console.* migration)

---

## Complete Commit History

```
5718addc feat(logging): add admin UI for logging configuration
99c615f6 feat(logging): add Langfuse integration and log rotation
cb4284ea feat(logging): add logging configuration database and admin API
9d77be63 feat(logging): add syslog/SIEM forwarding support
fa6d7d77 feat(logging): add OpenTelemetry distributed tracing integration
94570d62 feat(logging): add request tracing and correlation ID middleware
```

---

## Integration Points

### 1. Application Startup
```typescript
// Import OTEL before any other code (instrumentation requirement)
import './process/telemetry/otel';

// Initialize Langfuse (optional)
import { LangfuseService } from './process/services/LangfuseService';
await LangfuseService.initialize();
```

### 2. Request Handling
Middleware stack automatically:
- Generates/reads correlation IDs
- Logs HTTP requests/responses
- Injects OTEL trace context
- Correlates logs with distributed traces

### 3. Application Code
```typescript
import { createLogger } from '@/common/logger';
const log = createLogger('MyComponent');

log.info({ userId, requestId }, 'Processing request');
// Output: {"level":"info","component":"MyComponent","userId":"abc","requestId":"xyz","traceId":"...","spanId":"...","msg":"Processing request"}
```

### 4. LLM Observability
```typescript
LangfuseService.traceGeneration({
  name: 'chat-completion',
  input: { prompt },
  output: { response },
  model: 'gpt-4',
  userId,
  totalTokens: 150,
});
```

---

## Observability Stack

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
│  └─ Correlation with logs                               │
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

---

## Production Deployment Checklist

- [ ] Configure `JWT_SECRET` for admin authentication
- [ ] Set `LOG_LEVEL=info` (or `warn` for production)
- [ ] Enable `LOG_FILE` with appropriate path permissions
- [ ] Configure log retention (`LOG_RETENTION_DAYS`, `LOG_MAX_SIZE_MB`)
- [ ] If using OTEL: Set `OTEL_ENABLED=true` and configure endpoint
- [ ] If using SIEM: Set `SYSLOG_ENABLED=true` and configure syslog server
- [ ] If using Langfuse: Set credentials and enable in admin UI
- [ ] Verify syslog connectivity with test button in admin UI
- [ ] Review default logging configuration in admin UI
- [ ] Set up log forwarding in Docker log driver (if applicable)
- [ ] Configure OTLP collector for trace ingestion
- [ ] Test correlation between logs and traces using `requestId`

---

## Future Enhancements

- [ ] Log sampling for high-volume environments
- [ ] Metrics export (Prometheus/StatsD)
- [ ] Log compression (gzip) for archived files
- [ ] S3/cloud storage for long-term log retention
- [ ] Real-time log streaming WebSocket endpoint
- [ ] Advanced filtering in admin UI (search logs)
- [ ] Alerting rules configuration
- [ ] Performance profiling integration
- [ ] Custom log dashboards in admin UI

---

## References

- [Pino Documentation](https://getpino.io/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/)
- [Langfuse Documentation](https://langfuse.com/docs)
- [RFC 5424 - The Syslog Protocol](https://datatracker.ietf.org/doc/html/rfc5424)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
