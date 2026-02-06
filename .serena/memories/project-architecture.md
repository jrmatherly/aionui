# AionUI Architecture Summary

## Overview

AionUI is a unified AI agent GUI that transforms CLI AI tools into a modern chat interface.

## Tech Stack

- **Electron 37.x** - Desktop framework
- **React 19.x** - UI framework
- **TypeScript 5.8.x** - Language
- **Express 5.x** - WebUI server
- **SQLite (better-sqlite3)** - Local database
- **Arco Design** - UI component library
- **UnoCSS** - Styling

## Multi-Process Architecture

1. **Main Process** (`src/index.ts`)
   - Application lifecycle
   - IPC communication
   - Database operations
   - Service orchestration

2. **Renderer Process** (`src/renderer/`)
   - React UI
   - Pages: conversation, settings, cron, login
   - Context providers: Conversation, Auth, Theme, Layout

3. **Worker Processes** (`src/worker/`)
   - Gemini worker
   - Codex worker
   - ACP (Claude) worker

4. **WebUI Server** (`src/webserver/`)
   - Express + WebSocket
   - JWT authentication
   - Remote access support

## AI Agent Implementations

- `AcpAgent` - Claude Code integration
- `GeminiAgent` - Google Gemini CLI
- `CodexAgent` - OpenAI Codex

## Channel System

External messaging integration (Telegram, etc.)

- `ChannelManager` - Plugin orchestration
- `SessionManager` - User sessions
- `ActionExecutor` - Action dispatch
- `TelegramPlugin` - Telegram bot

## Key Services

- `CronService` - Scheduled tasks
- `McpService` - Model Context Protocol
- `WebSocketManager` - Real-time communication

## Database

SQLite with schema versioning (v18) and migrations in `src/process/database/`

- v16: `global_models`, `user_model_overrides` (admin-managed shared models)
- v17: `logging_config` (logging/OTEL/syslog/Langfuse settings)

## Environment Variable Configuration

Configs that sync from env vars to DB on startup (allows deployment-time config):

| Env Var                                     | Description                        | Sync Location               |
| ------------------------------------------- | ---------------------------------- | --------------------------- |
| `GLOBAL_MODELS`                             | JSON array of shared model configs | `v16_add_global_models.ts`  |
| `LOG_*`, `OTEL_*`, `SYSLOG_*`, `LANGFUSE_*` | Logging/observability settings     | `v17_add_logging_config.ts` |

**Deploy files:**

- `deploy/docker/.env.example` — Full documentation of all env vars
- `deploy/docker/global-models-example.json` — Example model configs
- `deploy/docker/group-mappings-example.json` — Example OIDC group mappings

**Gitignored (contain secrets):**

- `deploy/docker/.env`
- `deploy/docker/global-models.json`
- `deploy/docker/group-mappings.json`

## Logging & Observability

- **Pino** structured logging (`src/common/logger.ts`) — 17 component child loggers
- **OpenTelemetry** distributed tracing (`src/process/telemetry/otel.ts`) — auto-instrumentation
- **Correlation ID** middleware (`src/webserver/middleware/correlationId.ts`) — AsyncLocalStorage
- **Syslog/SIEM** forwarding — RFC 5424, UDP/TCP/TLS
- **Langfuse** LLM observability — optional integration
- **Admin UI** (`src/renderer/pages/admin/LoggingSettings.tsx`) — runtime config via REST API

## Build & CI Architecture

### Webpack

- Main process: `config/webpack/webpack.config.ts` (target: `electron-main` via Forge)
- Renderer: `config/webpack/webpack.renderer.config.ts` (target: `web`)
- Both use **filesystem cache** (`.webpack-cache/`) for incremental rebuilds
- Pino + all transports are **externalized** from main webpack (see `docker-packaging-constraints.md`)

### Docker

- `deploy/docker/Dockerfile` — Full build (npm ci + Forge + builder + runtime)
- `deploy/docker/Dockerfile.package` — Packaging only (for CI pre-compiled artifacts)
- `Dockerfile.package.dockerignore` — Allows `out/` through for pre-built artifacts

### CI Pipeline (`build-and-release.yml`)

3-job pipeline: **quality** → **compile** → **docker**

- **quality** is skipped for PRs (deduped — `pr-checks.yml` runs the same gate)
- **compile** runs on CI runner with cached `node_modules` + webpack + Electron
- **docker** uses `Dockerfile.package` (COPY pre-built app, no compilation)
- Docker images include **provenance attestation** and **SBOM** for supply-chain verification
- Caches: node_modules (lockfile key), .webpack-cache (source hash key), Electron binary (version key)

### Additional CI Workflows

| Workflow                 | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `pr-checks.yml`          | Issue link check, code quality gate, PR summary        |
| `codeql.yml`             | CodeQL security analysis (push/PR + weekly schedule)   |
| `dependency-review.yml`  | Dependency vulnerability + license check on PRs        |
| `release.yml`            | Tag-triggered GitHub Release with git-cliff notes      |
| `claude.yml`             | Claude Code interactive assistant (`@claude` mentions) |
| `claude-code-review.yml` | Automated PR code review via Claude                    |

## Claude Code Skills & Agents

Project-specific Claude Code automation in the repo:

### Skills (`skills/<name>/SKILL.md`)

**Project-Specific Skills:**

| Skill         | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| `/release`    | Automate version bump, changelog generation, tag, and push  |
| `/gen-test`   | Scaffold Jest unit tests following project conventions      |
| `/db-migrate` | Scaffold SQLite migration files following existing patterns |

**Office Document Skills (Anthropic-aligned):**

| Skill  | Purpose                                                    |
| ------ | ---------------------------------------------------------- |
| `docx` | Word document creation, editing, tracked changes, comments |
| `xlsx` | Excel spreadsheet manipulation with formula recalculation  |
| `pdf`  | PDF processing, form filling, merging, splitting           |
| `pptx` | PowerPoint creation and editing with html2pptx workflow    |

**Additional Anthropic Skills (adopted Feb 2026):**

| Skill              | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `frontend-design`  | Distinctive UI design, avoids AI aesthetics |
| `mcp-builder`      | MCP server creation (TypeScript/Python)     |
| `webapp-testing`   | Playwright web app testing toolkit          |
| `brand-guidelines` | Brand colors and typography                 |
| `doc-coauthoring`  | Structured documentation workflow           |
| `internal-comms`   | 3P updates, newsletters, FAQs               |

**Office Infrastructure (`scripts/office/`):**

Both `docx/` and `xlsx/` use shared Anthropic infrastructure:

- `soffice.py` — Sandbox-compatible LibreOffice wrapper
- `pack.py` / `unpack.py` — Office file pack/unpack with validation
- `validate.py` + `validators/` — Schema validation
- `helpers/` — XML manipulation (merge_runs, simplify_redlines)

### Custom Agents (`.claude/agents/<name>.md`)

| Agent               | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `security-reviewer` | 10-point security checklist (JWT, OIDC, RBAC, CSRF, SQLi, XSS, etc.) |
| `code-reviewer`     | 26 rules across 9 categories with CRITICAL/WARNING/SUGGESTION output |

## IPC Communication

Secure contextBridge in `src/preload.ts`:

- `emit()` - Send to main
- `on()` - Listen from main
- WebUI status/auth methods
