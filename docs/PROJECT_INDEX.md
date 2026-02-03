# AionUI Project Documentation Index

> **Version**: 1.8.1 | **License**: Apache-2.0 | **Platform**: Cross-platform (macOS, Windows, Linux)

Transform command-line AI agents into a modern, efficient chat interface.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Directory Structure](#directory-structure)
- [Core Modules](#core-modules)
  - [Main Process](#main-process)
  - [Renderer Process](#renderer-process)
  - [Worker Processes](#worker-processes)
  - [WebUI Server](#webui-server)
- [AI Agent Implementations](#ai-agent-implementations)
- [Communication System](#communication-system)
- [Database Layer](#database-layer)
- [Key Services](#key-services)
- [Component Library](#component-library)
- [Configuration Files](#configuration-files)
- [Development Guide](#development-guide)

---

## Architecture Overview

AionUI follows a **multi-process Electron architecture**:

```text
┌─────────────────────────────────────────────────────────────────┐
│                         AionUI Desktop                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Main      │  │  Renderer   │  │     Worker Processes    │  │
│  │  Process    │◄─►│  Process    │  │  ┌───────┐ ┌─────────┐ │  │
│  │             │  │  (React UI) │  │  │Gemini │ │ Codex   │ │  │
│  │  - IPC      │  │             │  │  │Worker │ │ Worker  │ │  │
│  │  - Database │  │  - Pages    │  │  └───────┘ └─────────┘ │  │
│  │  - Bridge   │  │  - Context  │  │  ┌───────┐             │  │
│  │  - Services │  │  - Hooks    │  │  │ ACP   │             │  │
│  └─────────────┘  └─────────────┘  │  │Worker │             │  │
│         │                          │  └───────┘             │  │
│         ▼                          └─────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   WebUI Server (Optional)               │    │
│  │  Express + WebSocket | JWT Auth | Remote Access         │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Channel System                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │    │
│  │  │ Telegram │  │  Future  │  │  Action Executor     │   │    │
│  │  │ Plugin   │  │ Plugins  │  │  + Session Manager   │   │    │
│  │  └──────────┘  └──────────┘  └──────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Process Communication

| Source | Target | Method |
|--------|--------|--------|
| Renderer ↔ Main | IPC via contextBridge | `src/preload.ts`, `src/common/ipcBridge.ts` |
| Main ↔ Workers | Fork/Message | `src/process/WorkerManage.ts` |
| WebUI ↔ Main | HTTP/WebSocket | `src/webserver/` |
| Channels ↔ Main | Event Bus | `src/channels/agent/ChannelEventBus.ts` |

---

## Directory Structure

```text
src/
├── index.ts                    # Main process entry point
├── preload.ts                  # Electron preload (IPC bridge)
├── types.d.ts                  # Global type declarations
│
├── adapter/                    # Platform adapters
│   ├── browser.ts              # Browser environment adapter
│   ├── constant.ts             # Adapter constants
│   └── main.ts                 # Main adapter
│
├── agent/                      # AI Agent implementations
│   ├── acp/                    # Claude Code (ACP) agent
│   ├── codex/                  # OpenAI Codex agent
│   └── gemini/                 # Google Gemini agent
│
├── channels/                   # External messaging channels
│   ├── actions/                # Action definitions
│   ├── agent/                  # Channel-agent bridge
│   ├── core/                   # Core managers
│   ├── gateway/                # Action gateway
│   ├── pairing/                # Device pairing
│   ├── plugins/                # Channel plugins (Telegram, etc.)
│   └── utils/                  # Channel utilities
│
├── common/                     # Shared code (all processes)
│   ├── adapters/               # API protocol converters
│   ├── codex/                  # Codex shared types/utils
│   ├── document/               # Document conversion
│   ├── navigation/             # URL navigation
│   ├── presets/                # Assistant presets
│   ├── types/                  # Shared types
│   ├── update/                 # App update logic
│   └── utils/                  # Utility functions
│
├── process/                    # Main process services
│   ├── bridge/                 # IPC bridges
│   ├── database/               # SQLite database
│   ├── i18n/                   # Server-side i18n
│   ├── services/               # Backend services
│   │   ├── cron/               # Scheduled tasks
│   │   └── mcpServices/        # MCP protocol
│   ├── task/                   # Task management
│   └── utils/                  # Process utilities
│
├── renderer/                   # React UI application
│   ├── assets/                 # Static assets
│   ├── bootstrap/              # App initialization
│   ├── components/             # Reusable UI components
│   ├── config/                 # Frontend config
│   ├── context/                # React Context providers
│   ├── hooks/                  # Custom React hooks
│   ├── i18n/                   # Internationalization
│   ├── messages/               # Message components
│   ├── pages/                  # Page components
│   ├── services/               # Client services
│   ├── styles/                 # Global styles
│   ├── theme/                  # Theme configuration
│   ├── types/                  # Frontend types
│   └── utils/                  # Frontend utilities
│
├── webserver/                  # WebUI server
│   ├── auth/                   # Authentication
│   ├── config/                 # Server config
│   ├── middleware/             # Express middleware
│   ├── routes/                 # HTTP routes
│   ├── types/                  # Server types
│   └── websocket/              # WebSocket handling
│
├── worker/                     # Background workers
│   ├── fork/                   # Forked processes
│   ├── acp.ts                  # ACP worker
│   ├── codex.ts                # Codex worker
│   └── gemini.ts               # Gemini worker
│
├── shims/                      # Module shims
└── utils/                      # Global utilities
```

---

## Core Modules

### Main Process

**Entry Point**: `src/index.ts`

| Component | Location | Purpose |
|-----------|----------|---------|
| `createWindow` | `src/index.ts` | Creates main Electron window |
| `handleAppReady` | `src/index.ts` | App initialization sequence |
| `WorkerManage` | `src/process/WorkerManage.ts` | Worker process management |
| `initBridge` | `src/process/initBridge.ts` | IPC bridge initialization |
| `initAgent` | `src/process/initAgent.ts` | Agent initialization |

**IPC Bridge Methods** (exposed via `src/preload.ts`):

```typescript
// Available in renderer via window.electron
emit(name: string, data: any)      // Send to main
on(name: string, callback: fn)     // Listen from main
getPathForFile(file: File)         // Get file path
webuiGetStatus()                   // WebUI status
webuiChangePassword(pwd: string)   // Change password
webuiGenerateQRToken()             // Generate QR token
webuiResetPassword()               // Reset password
```

### Renderer Process

**Entry Point**: `src/renderer/main.tsx`

#### Pages

| Page | Location | Description |
|------|----------|-------------|
| Conversation | `src/renderer/pages/conversation/` | Main chat interface |
| Settings | `src/renderer/pages/settings/` | Application settings |
| Cron | `src/renderer/pages/cron/` | Scheduled task management |
| Login | `src/renderer/pages/login/` | Authentication UI |
| Guide | `src/renderer/pages/guid/` | Onboarding guide |

#### Context Providers

| Context | Location | Purpose |
|---------|----------|---------|
| `ConversationContext` | `context/ConversationContext.tsx` | Current conversation state |
| `AuthContext` | `context/AuthContext.tsx` | Authentication state |
| `ThemeContext` | `context/ThemeContext.tsx` | Theme management |
| `LayoutContext` | `context/LayoutContext.tsx` | Layout preferences |

#### Key Hooks

| Hook | Location | Purpose |
|------|----------|---------|
| `useAutoScroll` | `hooks/useAutoScroll.ts` | Auto-scroll in chat |
| `useAutoTitle` | `hooks/useAutoTitle.ts` | Auto-generate titles |
| `useWorkspaceSelector` | `hooks/useWorkspaceSelector.ts` | Workspace selection |
| `useSendBoxFiles` | `hooks/useSendBoxFiles.ts` | File attachment handling |
| `useTheme` | `hooks/useTheme.ts` | Theme management |
| `usePwaMode` | `hooks/usePwaMode.ts` | PWA mode detection |
| `useMultiAgentDetection` | `hooks/useMultiAgentDetection.tsx` | Multi-agent support |

### Worker Processes

Workers run AI agents in isolated processes to prevent blocking the main process.

| Worker | Location | Agent |
|--------|----------|-------|
| Gemini | `src/worker/gemini.ts` | Google Gemini CLI |
| Codex | `src/worker/codex.ts` | OpenAI Codex |
| ACP | `src/worker/acp.ts` | Claude Code (ACP) |

**Worker Communication**: `src/process/WorkerManage.ts`

### WebUI Server

**Location**: `src/webserver/`

Provides remote access to AionUI via web browser.

| Component | Location | Purpose |
|-----------|----------|---------|
| `startWebServer` | `index.ts` | Server initialization |
| `WebSocketManager` | `websocket/WebSocketManager.ts` | Real-time communication |
| `authRoutes` | `routes/authRoutes.ts` | Authentication endpoints |
| `apiRoutes` | `routes/apiRoutes.ts` | API endpoints |
| `staticRoutes` | `routes/staticRoutes.ts` | Static file serving |

**Authentication**: JWT-based with bcrypt password hashing

```text
src/webserver/auth/
├── middleware/         # Auth middleware
├── repository/         # User data access
├── service/            # Auth business logic
└── index.ts            # Auth module exports
```

---

## AI Agent Implementations

### AcpAgent (Claude Code)

**Location**: `src/agent/acp/`

```typescript
class AcpAgent {
  // Core properties
  adapter: AcpAdapter
  connection: AcpConnection
  approvalStore: ApprovalStore

  // Key methods
  start(): Promise<void>
  stop(): void
  sendMessage(message: string): Promise<void>
  handlePermissionRequest(request: PermissionRequest): void
  handleFileOperation(op: FileOperation): void

  // Authentication
  ensureClaudeAuth(): Promise<void>
  ensureQwenAuth(): Promise<void>
  ensureBackendAuth(): Promise<void>
}
```

**Components**:

- `AcpAdapter.ts` - Protocol adapter
- `AcpConnection.ts` - Connection management
- `AcpDetector.ts` - CLI detection
- `ApprovalStore.ts` - Permission caching

### GeminiAgent

**Location**: `src/agent/gemini/`

```typescript
class GeminiAgent {
  // Configuration
  model: string
  workspace: string
  apiKeyManager: ApiKeyManager

  // Tools integration
  toolConfig: ToolConfig
  mcpServers: McpServer[]
  enabledSkills: string[]

  // Key methods
  initialize(): Promise<void>
  send(message: string): Promise<void>
  submitQuery(query: Query): Promise<Response>
  stop(): void
}
```

**Submodules**:

- `cli/tools/` - Built-in tools (web-search, web-fetch, img-gen)
- `cli/ide/` - IDE context integration
- `cli/settings.ts` - Agent settings
- `cli/streamResilience.ts` - Stream error handling

### CodexAgent

**Location**: `src/agent/codex/`

```typescript
// Core components
├── connection/CodexConnection.ts    # Connection management
├── core/CodexAgent.ts               # Main agent class
├── core/ApprovalStore.ts            # Permission caching
├── core/ErrorService.ts             # Error handling
├── handlers/                        # Event handlers
│   ├── CodexEventHandler.ts
│   ├── CodexFileOperationHandler.ts
│   ├── CodexSessionManager.ts
│   └── CodexToolHandlers.ts
└── messaging/                       # Message processing
    ├── CodexMessageEmitter.ts
    └── CodexMessageProcessor.ts
```

---

## Communication System

### Channel Architecture

**Location**: `src/channels/`

The channel system enables external messaging platforms (Telegram, etc.) to interact with AI agents.

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Plugin    │────►│   Channel   │────►│   Action    │
│  (Telegram) │     │   Manager   │     │  Executor   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Platform   │     │   Session   │     │    Chat     │
│   Adapter   │     │   Manager   │     │   Actions   │
└─────────────┘     └─────────────┘     └─────────────┘
```

#### Core Classes

| Class | Location | Purpose |
|-------|----------|---------|
| `ChannelManager` | `core/ChannelManager.ts` | Plugin orchestration |
| `SessionManager` | `core/SessionManager.ts` | User session management |
| `ActionExecutor` | `gateway/ActionExecutor.ts` | Action dispatch |
| `PluginManager` | `gateway/PluginManager.ts` | Plugin lifecycle |
| `PairingService` | `pairing/PairingService.ts` | Device pairing |

#### TelegramPlugin

**Location**: `src/channels/plugins/telegram/`

```typescript
class TelegramPlugin extends BasePlugin {
  bot: Grammy.Bot

  // Event handlers
  handleStartCommand()
  handleTextMessage()
  handleMediaMessage()
  handleCallbackQuery()

  // Messaging
  sendMessage(chatId, text)
  editMessage(chatId, msgId, text)
}
```

### Message Types

**Location**: `src/common/chatLib.ts`

```typescript
// Base message interface
interface IMessage {
  id: string
  msg_id: string
  conversation_id: string
  type: TMessageType
  content: any
  status: string
  position: number
  createdAt?: number
}

// Message type variants
type TMessage =
  | IMessageText
  | IMessageToolCall
  | IMessageToolGroup
  | IMessagePlan
  | IMessageTips
  | IMessageAgentStatus
  | IMessageCodexToolCall
  | IMessageCodexPermission
  | IMessageAcpToolCall
  | IMessageAcpPermission
```

---

## Database Layer

**Location**: `src/process/database/`

SQLite database using `better-sqlite3`.

| File | Purpose |
|------|---------|
| `schema.ts` | Table definitions, version management |
| `migrations.ts` | Schema migrations |
| `index.ts` | Database operations |
| `types.ts` | Type definitions |
| `export.ts` | Data export utilities |
| `StreamingMessageBuffer.ts` | Message buffering for streaming |

**Key Functions**:

```typescript
// Schema management
initSchema(db: Database): void
getDatabaseVersion(db: Database): number
setDatabaseVersion(db: Database, version: number): void
```

---

## Key Services

### CronService

**Location**: `src/process/services/cron/CronService.ts`

Scheduled task execution using `croner` library.

```typescript
class CronService {
  // Job management
  addJob(params: CreateCronJobParams): CronJob
  removeJob(jobId: string): void
  updateJob(jobId: string, updates: Partial<CronJob>): void
  getJob(jobId: string): CronJob | null
  listJobs(): CronJob[]

  // Execution
  executeJob(jobId: string): Promise<void>
  startTimer(jobId: string): void
  stopTimer(jobId: string): void
}

interface CreateCronJobParams {
  name: string
  schedule: string           // Cron expression
  conversationId: string
  conversationTitle: string
  message: string
  agentType: string
  createdBy: string
}
```

**Related Components**:

- `CronStore.ts` - Persistent job storage
- `CronBusyGuard.ts` - Prevents concurrent execution

### McpService

**Location**: `src/process/services/mcpServices/McpService.ts`

Model Context Protocol (MCP) integration for multi-agent support.

```typescript
class McpService {
  agents: Map<string, McpAgent>

  // Agent management
  getAgent(agentId: string): McpAgent
  syncMcpToAgents(config: McpConfig): void
  removeMcpFromAgents(mcpId: string): void

  // Testing
  testMcpConnection(config: McpConfig): Promise<boolean>
  isCliAvailable(cliPath: string): boolean
}
```

### WebSocketManager

**Location**: `src/webserver/websocket/WebSocketManager.ts`

Real-time communication for WebUI.

```typescript
class WebSocketManager {
  clients: Map<WebSocket, ClientInfo>

  // Connection handling
  initialize(server: Server): void
  addClient(ws: WebSocket, token: string): void
  validateConnection(ws: WebSocket): boolean

  // Messaging
  broadcast(message: any): void
  sendHeartbeat(): void

  // Lifecycle
  startHeartbeat(): void
  destroy(): void
}
```

---

## Component Library

### UI Components

**Location**: `src/renderer/components/`

| Component | File | Description |
|-----------|------|-------------|
| `Markdown` | `Markdown.tsx` | Markdown rendering with syntax highlighting |
| `ThemeSwitcher` | `ThemeSwitcher.tsx` | Light/dark mode toggle |
| `LanguageSwitcher` | `LanguageSwitcher.tsx` | i18n language selection |
| `FontSizeControl` | `FontSizeControl.tsx` | Font size adjustment |
| `FilePreview` | `FilePreview.tsx` | File preview modal |
| `Diff2Html` | `Diff2Html.tsx` | Diff visualization |
| `ShimmerText` | `ShimmerText.tsx` | Loading text animation |
| `CollapsibleContent` | `CollapsibleContent.tsx` | Expandable sections |
| `ContextUsageIndicator` | `ContextUsageIndicator.tsx` | Token usage display |
| `ThoughtDisplay` | `ThoughtDisplay.tsx` | AI thinking visualization |
| `DirectorySelectionModal` | `DirectorySelectionModal.tsx` | Folder picker |
| `HorizontalFileList` | `HorizontalFileList.tsx` | File list display |

### Component Directories

| Directory | Purpose |
|-----------|---------|
| `base/` | Base UI primitives |
| `SettingsModal/` | Settings dialog |
| `Titlebar/` | Custom window titlebar |
| `WindowControls/` | Window control buttons |
| `UpdateModal/` | Update notification |
| `EmojiPicker/` | Emoji selection |
| `CssThemeSettings/` | Theme customization |

### Message Components

**Location**: `src/renderer/messages/`

| Component | Description |
|-----------|-------------|
| `MessageList.tsx` | Message list container |
| `MessagetText.tsx` | Text message display |
| `MessageToolCall.tsx` | Tool call display |
| `MessageToolGroup.tsx` | Grouped tool calls |
| `MessageToolGroupSummary.tsx` | Tool group summary |
| `MessagePlan.tsx` | Plan display |
| `MessageTips.tsx` | Tips/hints display |
| `MessageAgentStatus.tsx` | Agent status indicator |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript compiler options |
| `forge.config.ts` | Electron Forge build config |
| `uno.config.ts` | UnoCSS styling config |
| `.eslintrc.json` | ESLint rules |
| `.prettierrc.json` | Prettier formatting |
| `jest.config.js` | Jest test configuration |

### Path Aliases

Configured in `tsconfig.json`:

```json
{
  "paths": {
    "@/*": ["src/*"],
    "@process/*": ["src/process/*"],
    "@renderer/*": ["src/renderer/*"],
    "@worker/*": ["src/worker/*"]
  }
}
```

---

## Development Guide

### Quick Start

```bash
# Install dependencies
npm install

# Start development
npm start

# Start WebUI mode
npm run webui

# Run tests
npm test
```

### Code Quality

```bash
# Lint
npm run lint
npm run lint:fix

# Format
npm run format

# Type check
npx tsc --noEmit
```

### Building

```bash
# Full build (macOS arm64 + x64)
npm run build

# Platform-specific
npm run dist:mac
npm run dist:win
npm run dist:linux
```

### Testing

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Specific test suites
npm run test:contract
npm run test:integration
```

### Adding a New AI Agent

1. Create agent directory: `src/agent/<agent-name>/`
2. Implement agent class with standard interface
3. Create worker: `src/worker/<agent-name>.ts`
4. Add to `WorkerManage.ts`
5. Create renderer components in `src/renderer/pages/conversation/<agent-name>/`
6. Add message types to `src/common/chatLib.ts`

### Adding a New Channel Plugin

1. Create plugin directory: `src/channels/plugins/<plugin-name>/`
2. Extend `BasePlugin` class
3. Implement required methods: `onInitialize`, `onStart`, `onStop`
4. Register in `PluginManager`
5. Add UI components in `src/renderer/pages/settings/`

---

## Internationalization

**Supported Languages**: en-US, zh-CN, zh-TW, ja-JP, ko-KR

**Location**: `src/renderer/i18n/locales/`

**Usage**:

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<span>{t('common.send')}</span>
```

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project guide for AI assistants
- [Database README](../src/process/database/README.md) - Database documentation
- [WEBUI_GUIDE.md](../WEBUI_GUIDE.md) - WebUI setup guide

---

*Generated: February 2026 | AionUI v1.8.1*
