# Enterprise Logging & Observability Research

**Created:** 2026-02-05  
**Author:** Bot42  
**Status:** Research Complete — Pending Implementation

## Summary

Comprehensive research for enterprise-grade logging and observability system.

**Full document:** `.scratchpad/enterprise-logging-system.md` (665 lines, gitignored)

## Key Recommendations

### Stack

| Component         | Recommendation                                    |
| ----------------- | ------------------------------------------------- |
| Logger            | **Pino** — fastest Node.js logger, JSON output    |
| Tracing           | **OpenTelemetry** — CNCF standard, vendor-neutral |
| LLM Observability | **Langfuse** — open-source, self-hostable         |
| SIEM Integration  | **pino-syslog** — RFC 5424, UDP/TCP/TLS           |

### Current State

- ~985 unstructured `console.log` calls
- No dedicated logging library
- Tag-based categorization exists (`[Database]`, `[Auth]`)
- @office-ai/aioncli-core has OTEL support (underutilized)

### Admin Configuration Features

1. Log level (DEBUG/INFO/WARN/ERROR)
2. Retention period (configurable days)
3. Syslog destinations (multiple targets, protocol selection)
4. OTEL endpoint configuration
5. Langfuse integration settings

### Implementation Phases

| Phase     | Scope                      | Hours     |
| --------- | -------------------------- | --------- |
| 1         | Core Pino logging          | 6-8       |
| 2         | OpenTelemetry tracing      | 4-6       |
| 3         | Langfuse LLM observability | 3-4       |
| 4         | Syslog forwarding          | 3-4       |
| 5         | Admin UI                   | 4-6       |
| 6         | Retention & archival       | 2-3       |
| **Total** |                            | **22-31** |

### Database Schema (v17)

```sql
CREATE TABLE logging_config (
  id TEXT PRIMARY KEY,
  log_level TEXT NOT NULL DEFAULT 'info',
  retention_days INTEGER NOT NULL DEFAULT 30,
  max_size_mb INTEGER NOT NULL DEFAULT 500,
  destinations TEXT NOT NULL DEFAULT '[]',
  otel_enabled INTEGER NOT NULL DEFAULT 0,
  langfuse_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE syslog_destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 514,
  protocol TEXT NOT NULL DEFAULT 'udp',
  enabled INTEGER NOT NULL DEFAULT 1
);
```

### New Dependencies

```bash
npm install pino pino-pretty pino-roll pino-syslog
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
npm install langfuse
```

## Next Steps

1. Approve architecture
2. Phase 1 implementation (Core Pino logging)
3. Migrate console.\* calls with codemod
4. Iterative deployment of remaining phases
