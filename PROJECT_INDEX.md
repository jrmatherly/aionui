# Project Index: AionUI

> v1.8.1 | Electron + React + TypeScript | Apache-2.0

**Purpose**: Transform CLI AI agents (Claude, Gemini, Codex) into a modern chat interface.

---

## Project Structure

```text
src/
├── index.ts              # Main process entry
├── preload.ts            # IPC bridge (contextBridge)
├── agent/                # AI agent implementations
│   ├── acp/              # Claude Code (AcpAgent)
│   ├── codex/            # OpenAI Codex (CodexAgent)
│   └── gemini/           # Google Gemini (GeminiAgent)
├── channels/             # External messaging (Telegram)
│   ├── core/             # ChannelManager, SessionManager
│   ├── plugins/          # TelegramPlugin
│   └── gateway/          # ActionExecutor, PluginManager
├── common/               # Shared code
│   ├── chatLib.ts        # Message types (IMessage, TMessage)
│   ├── adapters/         # API protocol converters
│   └── ipcBridge.ts      # IPC communication
├── process/              # Main process services
│   ├── database/         # SQLite (schema, migrations)
│   ├── services/cron/    # CronService, CronBusyGuard
│   └── services/mcp*/    # McpService (multi-agent)
├── renderer/             # React UI
│   ├── pages/            # conversation, settings, cron, login
│   ├── components/       # UI components
│   ├── context/          # Auth, Conversation, Theme, Layout
│   ├── hooks/            # useAutoScroll, useTheme, etc.
│   └── messages/         # Message rendering components
├── webserver/            # WebUI (Express + WebSocket)
│   ├── auth/             # JWT authentication
│   ├── routes/           # api, auth, static routes
│   └── websocket/        # WebSocketManager
└── worker/               # Background workers
    ├── acp.ts            # Claude worker
    ├── codex.ts          # Codex worker
    └── gemini.ts         # Gemini worker
```

---

## Entry Points

| Type | Path | Description |
|------|------|-------------|
| **Main** | `src/index.ts` | Electron main process |
| **Renderer** | `src/renderer/main.tsx` | React app entry |
| **Preload** | `src/preload.ts` | IPC bridge |
| **WebUI** | `src/webserver/index.ts` | Web server |
| **Workers** | `src/worker/*.ts` | AI agent workers |

---

## Core Modules

### AI Agents (`src/agent/`)

| Agent | Class | Key Methods |
|-------|-------|-------------|
| **ACP** | `AcpAgent` | `start()`, `sendMessage()`, `handlePermissionRequest()` |
| **Gemini** | `GeminiAgent` | `initialize()`, `send()`, `submitQuery()` |
| **Codex** | `CodexAgent` | Connection, Session, Event handlers |

### Services (`src/process/services/`)

| Service | File | Purpose |
|---------|------|---------|
| **CronService** | `cron/CronService.ts` | Scheduled tasks |
| **McpService** | `mcpServices/McpService.ts` | Multi-agent protocol |
| **Database** | `database/index.ts` | SQLite operations |

### Channels (`src/channels/`)

| Component | Purpose |
|-----------|---------|
| `ChannelManager` | Plugin orchestration |
| `SessionManager` | User session tracking |
| `TelegramPlugin` | Telegram bot integration |
| `ActionExecutor` | Action dispatch |

---

## Key Types (`src/common/chatLib.ts`)

```typescript
interface IMessage {
  id: string; msg_id: string; conversation_id: string;
  type: TMessageType; content: any; status: string;
}

type TMessage = IMessageText | IMessageToolCall | IMessagePlan
             | IMessageToolGroup | IMessageAgentStatus | ...
```

---

## Configuration

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript config, path aliases |
| `forge.config.ts` | Electron Forge build |
| `uno.config.ts` | UnoCSS styling |
| `.eslintrc.json` | Linting rules |

**Path Aliases**: `@/*`, `@process/*`, `@renderer/*`, `@worker/*`

---

## Quick Start

```bash
npm install          # Install deps
npm start            # Development
npm run webui        # WebUI mode
npm test             # Run tests
npm run build        # Build (macOS)
```

---

## Tech Stack

- **Framework**: Electron 37, React 19, TypeScript 5.8
- **UI**: Arco Design, UnoCSS, Monaco Editor
- **Data**: SQLite (better-sqlite3), Zod
- **AI SDKs**: @anthropic-ai/sdk, @google/genai, openai
- **Server**: Express 5, WebSocket (ws)

---

## Stats

- **Files**: 465 TypeScript files
- **Tests**: 4 unit tests (`tests/unit/`)
- **Languages**: en-US, zh-CN, zh-TW, ja-JP, ko-KR

---

*Generated: 2026-02-02*
