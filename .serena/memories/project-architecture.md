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
SQLite with schema versioning and migrations in `src/process/database/`

## IPC Communication
Secure contextBridge in `src/preload.ts`:
- `emit()` - Send to main
- `on()` - Listen from main
- WebUI status/auth methods
