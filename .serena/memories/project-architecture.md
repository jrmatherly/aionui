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

SQLite with schema versioning (v17) and migrations in `src/process/database/`

- v16: `global_models`, `user_model_overrides` (admin-managed shared models)
- v17: `logging_config` (logging/OTEL/syslog/Langfuse settings)

## Logging & Observability

- **Pino** structured logging (`src/common/logger.ts`) — 17 component child loggers
- **OpenTelemetry** distributed tracing (`src/process/telemetry/otel.ts`) — auto-instrumentation
- **Correlation ID** middleware (`src/webserver/middleware/correlationId.ts`) — AsyncLocalStorage
- **Syslog/SIEM** forwarding — RFC 5424, UDP/TCP/TLS
- **Langfuse** LLM observability — optional integration
- **Admin UI** (`src/renderer/pages/admin/LoggingSettings.tsx`) — runtime config via REST API

## IPC Communication

Secure contextBridge in `src/preload.ts`:

- `emit()` - Send to main
- `on()` - Listen from main
- WebUI status/auth methods
