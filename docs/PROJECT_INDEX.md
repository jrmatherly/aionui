# AionUI Project Documentation Index

> **Version**: 1.8.2 | **License**: Apache-2.0 | **Platform**: Cross-platform (macOS, Windows, Linux)

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

skills/                         # Python skills
├── lance/                      # RAG/Knowledge Base scripts
├── crawl4ai/                   # Web scraping skill
└── requirements.txt            # Shared Python dependencies

deploy/                         # Deployment configurations
└── docker/                     # Docker containerization
    ├── Dockerfile              # Multi-stage build
    ├── docker-compose.yml      # Container orchestration
    ├── docker-entrypoint.sh    # Container startup script
    └── nginx.conf              # HTTPS reverse proxy config
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
| UserManagement | `src/renderer/pages/settings/UserManagement.tsx` | Admin: User CRUD and role management |
| GroupMappings | `src/renderer/pages/settings/GroupMappings.tsx` | Admin: OIDC group-to-role mappings |
| ProfilePage | `src/renderer/pages/settings/ProfilePage.tsx` | User profile and password change |
| Cron | `src/renderer/pages/cron/` | Scheduled task management |
| Login | `src/renderer/pages/login/` | Authentication UI (OIDC + local) |
| Admin | `src/renderer/pages/admin/` | User management, logging settings |
| Profile | `src/renderer/pages/profile/` | User profile |
| Guide | `src/renderer/pages/guid/` | Onboarding guide |

Settings sub-pages include: KnowledgeBase, PythonEnvironment, LoggingSettings (admin).

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

**Authentication**: Multi-user support with OIDC SSO and local admin account

```text
src/webserver/auth/
├── middleware/         # RoleMiddleware, DataScopeMiddleware, TokenMiddleware
├── repository/         # User data access (UserRepository)
├── service/            # AuthService (enhanced), OidcService
├── config/             # oidcConfig.ts, groupMappings.ts
└── index.ts            # Auth module exports
```

**Authentication Routes**:

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Local admin login |
| `/api/auth/oidc/login` | GET | Initiate OIDC SSO flow |
| `/api/auth/oidc/callback` | GET | Handle OIDC callback |
| `/api/auth/refresh` | POST | Refresh JWT access token |
| `/api/auth/logout` | POST | Logout (blacklist refresh token) |
| `/api/auth/change-password` | POST | Change user password |

**Admin Routes** (require admin role):

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/users` | GET | List all users |
| `/api/admin/users` | POST | Create new user |
| `/api/admin/users/:id` | GET | Get user details |
| `/api/admin/users/:id` | PUT | Update user |
| `/api/admin/users/:id` | DELETE | Delete user |
| `/api/admin/users/:id/role` | PUT | Update user role |
| `/api/admin/group-mappings` | GET | Get OIDC group mappings |
| `/api/admin/group-mappings` | PUT | Update group mappings |

**Knowledge Base Routes**:

| Route | Location | Endpoints |
|-------|----------|-----------|
| Knowledge Base | `routes/knowledgeRoutes.ts` | status, documents, search, ingest, delete, reindex |
| Logging Admin | `routes/loggingRoutes.ts` | get/patch config, runtime level, test syslog |
| Python | `routes/pythonRoutes.ts` | status, packages, version, install, reset |

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

The channel system enables external messaging platforms (Telegram, Lark, etc.) to interact with AI agents.

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Plugin    │────►│   Channel   │────►│   Action    │
│ (Telegram,  │     │   Manager   │     │  Executor   │
│  Lark)      │     │             │     │             │
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

#### LarkPlugin

**Location**: `src/channels/plugins/lark/`

Lark (Feishu) messaging integration following the same BasePlugin pattern as TelegramPlugin.

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

**Multi-User Schema Changes**:

- **`users` table**: Enhanced with columns for `role` (admin/user/viewer), `oidc_sub`, `oidc_provider`, `last_login`, `is_active`
- **`refresh_tokens` table**: New table for refresh token rotation and revocation
- **`token_blacklist` table**: New table for invalidated tokens
- **Data scoping**: Conversations and messages now include `user_id` foreign key for ownership filtering

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

### KnowledgeBaseService

**Location**: `src/process/services/KnowledgeBaseService.ts`

LanceDB-based RAG pipeline for document search and retrieval.

- Document ingestion (PDF, text, code) via Python scripts
- Hybrid search (vector + FTS with RRF reranking)
- Embedding via configurable model (OpenAI, Azure, Global Models)
- Key files: `skills/lance/ingest.py`, `skills/lance/search.py`, `skills/lance/manage.py`

### GlobalModelService

**Location**: `src/process/services/GlobalModelService.ts`

Admin-managed shared model configurations.

- Group-based access control
- AES-256-GCM API key encryption
- User hide/unhide/copy overrides

### DirectoryService

**Location**: `src/process/services/DirectoryService.ts`

Per-user workspace directory isolation.

- Resolution chain: user → team → org → global

### MiseEnvironmentService

**Location**: `src/process/services/MiseEnvironmentService.ts`

Per-user Python virtual environment management.

- Template venv copy for fast onboarding (~1s vs ~113s)

### LangfuseService

**Location**: `src/process/services/LangfuseService.ts`

LLM observability and tracing.

- Generation tracking with token usage

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
| `FontSizeControl` | `FontSizeControl.tsx` | Font size adjustment |
| `FilePreview` | `FilePreview.tsx` | File preview modal |
| `Diff2Html` | `Diff2Html.tsx` | Diff visualization |
| `ShimmerText` | `ShimmerText.tsx` | Loading text animation |
| `CollapsibleContent` | `CollapsibleContent.tsx` | Expandable sections |
| `ContextUsageIndicator` | `ContextUsageIndicator.tsx` | Token usage display |
| `ThoughtDisplay` | `ThoughtDisplay.tsx` | AI thinking visualization |
| `DirectorySelectionModal` | `DirectorySelectionModal.tsx` | Folder picker |
| `HorizontalFileList` | `HorizontalFileList.tsx` | File list display |
| `UserMenu` | `UserMenu/` | User menu sidebar (profile, logout) |

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
| `mise.toml` | Tool versions, env vars, tasks, prepare providers (mise-en-place) |
| `mise.lock` | Pinned tool versions with checksums and download URLs |
| `package.json` | Dependencies, npm scripts |
| `tsconfig.json` | TypeScript compiler options |
| `forge.config.ts` | Electron Forge build config |
| `uno.config.ts` | UnoCSS styling config |
| `eslint.config.mjs` | ESLint rules (flat config) |
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

### Environment Variables

**OIDC/SSO Configuration**:

| Variable | Description | Example |
|----------|-------------|---------|
| `OIDC_ENABLED` | Enable OIDC authentication | `true` |
| `OIDC_ISSUER` | OIDC provider issuer URL | `https://login.microsoftonline.com/{tenant}/v2.0` |
| `OIDC_CLIENT_ID` | OIDC application client ID | `abc123...` |
| `OIDC_CLIENT_SECRET` | OIDC client secret | `secret123...` |
| `OIDC_REDIRECT_URI` | OAuth callback URL | `http://localhost:25808/api/auth/oidc/callback` |
| `OIDC_SCOPES` | OAuth scopes (space-separated) | `openid profile email` |
| `OIDC_GROUPS_CLAIM` | JWT claim containing user groups | `groups` |
| `GROUP_MAPPINGS_FILE` | Path to group mappings file | `/path/to/mappings.json` |
| `GROUP_MAPPINGS_JSON` | Inline group mappings JSON | `{"group1":"admin"}` |

**WebUI Configuration**:

| Variable | Description | Default |
|----------|-------------|---------|
| `AIONUI_PORT` | WebUI server port | `25808` |
| `WEBUI_ALLOW_REMOTE` | Allow remote network access | `false` |
| `JWT_SECRET` | JWT signing secret | auto-generated |

**HTTPS Configuration**:

| Variable | Description | Default |
|----------|-------------|---------|
| `AIONUI_HTTPS` | Enable HTTPS mode | `false` |
| `AIONUI_TRUST_PROXY` | Trust reverse proxy headers | `false` |

**Knowledge Base / Embedding**:

| Variable | Description | Default |
|----------|-------------|---------|
| `EMBEDDING_MODEL` | Embedding model name | - |
| `EMBEDDING_API_KEY` | API key for embedding provider | - |
| `EMBEDDING_BASE_URL` | Base URL for embedding API | - |
| `EMBEDDING_DIMENSIONS` | Embedding vector dimensions | - |

**Branding**:

| Variable | Description | Default |
|----------|-------------|---------|
| `AIONUI_BRAND_NAME` | Custom brand name | `AionUI` |

**Logging / Observability**:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Application log level | `info` |
| `OTEL_ENABLED` | Enable OpenTelemetry export | `false` |
| `SYSLOG_ENABLED` | Enable syslog transport | `false` |
| `LANGFUSE_ENABLED` | Enable Langfuse tracing | `false` |

---

## Development Guide

### Quick Start

```bash
# With mise (recommended — auto-installs correct Node.js)
mise install          # Install tools (Node.js 24)
mise run dev          # Install deps + start dev server

# Without mise
npm install
npm start
```

### mise Tasks (Preferred)

```bash
mise run dev          # Start Electron dev server
mise run lint         # Run ESLint
mise run test         # Run tests
mise run ci           # Full CI checks (lint + format + test)
mise run build        # Build for current platform
mise run info         # Print environment details
mise run drift:check  # Run Drift pattern validation
mise run docker:build # Build Docker image (versions from mise.lock)
mise run docker:up    # Start Docker container
mise task ls          # List all available tasks
```

### npm Scripts (Still Supported)

```bash
npm start             # Start WebUI mode
npm run webui

# Run tests
npm test
```

### Code Quality

```bash
# Lint (via mise or npm)
mise run lint         # or: npm run lint
mise run lint:fix     # or: npm run lint:fix

# Format
mise run format       # or: npm run format

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

## Language Support

**Language**: English only (en-US)

> **Note**: i18n/internationalization support was removed in v1.8.2. The application uses hardcoded English strings throughout.

---

## Security Considerations

### Authentication & Authorization

**Multi-User Authentication**:

- **OIDC/SSO**: Production-grade integration with EntraID (Azure AD) and other OIDC providers
- **Local Admin**: Fallback bcrypt-hashed password authentication for local deployments
- **JWT Tokens**: Access tokens with configurable expiry and refresh token rotation
- **Token Blacklist**: Revoked tokens stored in database to prevent reuse

**Role-Based Access Control (RBAC)**:

- **Three Roles**: `admin` (full access), `user` (standard access), `viewer` (read-only)
- **RoleMiddleware**: Enforces role requirements on admin routes
- **DataScopeMiddleware**: Filters database queries to user-owned resources only

**Data Isolation**:

- **User Ownership**: Conversations, messages, and sessions scoped by `user_id`
- **Query Filtering**: Automatic filtering in DataScopeMiddleware prevents cross-user data leaks
- **Session Management**: User sessions isolated with per-user refresh tokens

**Security Best Practices**:

- **Password Hashing**: bcrypt with salt rounds for local accounts
- **HTTPS Required**: Production deployments should use HTTPS for WebUI
- **CSRF Protection**: Token-based authentication prevents CSRF attacks
- **Input Validation**: Zod schemas validate all API inputs
- **SQL Injection Prevention**: Parameterized queries via better-sqlite3
- **Rate Limiting**: Per-endpoint rate limiting via express-rate-limit (auth: 5/min, API: 100/min, file ops: 30/min)

**Group Mapping**:

- **OIDC Groups**: Map enterprise groups to application roles
- **Configuration**: File-based (`GROUP_MAPPINGS_FILE`) or inline JSON (`GROUP_MAPPINGS_JSON`)
- **Default Role**: Fallback to `viewer` if no group mapping matches

---

## AI Context Tools

AionUI uses **Drift Detect** and **Serena** for AI-assisted development:

- **Drift Detect**: Pattern analysis, call graph, institutional memory (Cortex)
- **Serena**: Language server–powered symbol navigation and code editing
- **MCP**: `.mcp.json` configures Drift as an MCP server for AI tool integration

See [AI Context Guide](guides/AI_CONTEXT_GUIDE.md) for setup and usage.

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project guide for AI assistants
- [AI Context Guide](guides/AI_CONTEXT_GUIDE.md) - Drift + Serena setup and workflows
- [Database README](../src/process/database/README.md) - Database documentation
- [WEBUI_GUIDE.md](./guides/WEBUI_GUIDE.md) - WebUI setup guide

---

_Generated: February 2026 | AionUI v1.8.2_
