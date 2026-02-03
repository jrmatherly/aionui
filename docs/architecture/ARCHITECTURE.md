# AionUI Architecture Documentation

## Overview

AionUI is a multi-process Electron application that transforms CLI AI agents into a modern chat interface. It supports Claude Code (ACP), Google Gemini, and OpenAI Codex agents.

## System Architecture

```mermaid
graph TB
    subgraph "Desktop Application"
        subgraph "Main Process"
            MP[Main Process<br/>src/index.ts]
            DB[(SQLite Database)]
            Bridge[IPC Bridge]
            Services[Services Layer]
        end

        subgraph "Renderer Process"
            React[React UI<br/>src/renderer/]
            Context[Context Providers]
            Pages[Pages]
            Components[Components]
        end

        subgraph "Worker Processes"
            GeminiW[Gemini Worker]
            CodexW[Codex Worker]
            AcpW[ACP Worker]
        end
    end

    subgraph "External Services"
        WebUI[WebUI Server<br/>Express + WebSocket]
        Telegram[Telegram Bot]
    end

    subgraph "AI Providers"
        Claude[Claude API]
        Gemini[Gemini API]
        OpenAI[OpenAI API]
    end

    MP <--> Bridge
    Bridge <--> React
    MP --> DB
    MP --> Services
    Services --> GeminiW
    Services --> CodexW
    Services --> AcpW

    GeminiW --> Gemini
    CodexW --> OpenAI
    AcpW --> Claude

    MP --> WebUI
    MP --> Telegram

    WebUI -.-> React
```

## Process Model

### Main Process (`src/index.ts`)

The main process handles:

- **Application Lifecycle**: Window creation, app events
- **Database Operations**: SQLite via better-sqlite3
- **IPC Communication**: Bridge between renderer and main
- **Service Orchestration**: Managing agent workers and services

```mermaid
sequenceDiagram
    participant App as Electron App
    participant Main as Main Process
    participant DB as Database
    participant Bridge as IPC Bridge
    participant Workers as Worker Processes

    App->>Main: app.ready
    Main->>DB: Initialize schema
    Main->>Bridge: Setup IPC handlers
    Main->>Workers: Fork workers
    Main->>App: Create window
```

### Renderer Process (`src/renderer/`)

React-based UI with:

- **Pages**: Conversation, Settings, Cron, Login
- **Context Providers**: Auth, Conversation, Theme, Layout
- **Components**: Reusable UI components
- **Hooks**: Custom React hooks for state and effects

### Worker Processes (`src/worker/`)

Isolated processes for AI agents:

| Worker | File | Purpose |
|--------|------|---------|
| Gemini | `gemini.ts` | Google Gemini CLI integration |
| Codex | `codex.ts` | OpenAI Codex integration |
| ACP | `acp.ts` | Claude Code (ACP) integration |

## Component Architecture

### AI Agents

```mermaid
classDiagram
    class BaseAgent {
        +start()
        +stop()
        +sendMessage()
    }

    class AcpAgent {
        +adapter: AcpAdapter
        +connection: AcpConnection
        +approvalStore: ApprovalStore
        +handlePermissionRequest()
        +handleFileOperation()
    }

    class GeminiAgent {
        +apiKeyManager: ApiKeyManager
        +toolConfig: ToolConfig
        +mcpServers: McpServer[]
        +initialize()
        +submitQuery()
    }

    class CodexAgent {
        +connection: CodexConnection
        +sessionManager: CodexSessionManager
        +eventHandler: CodexEventHandler
    }

    BaseAgent <|-- AcpAgent
    BaseAgent <|-- GeminiAgent
    BaseAgent <|-- CodexAgent
```

### Channel System

```mermaid
graph LR
    subgraph "Channel Architecture"
        CM[ChannelManager]
        PM[PluginManager]
        SM[SessionManager]
        AE[ActionExecutor]
    end

    subgraph "Plugins"
        TP[TelegramPlugin]
        FP[Future Plugins...]
    end

    subgraph "Actions"
        CA[ChatActions]
        PA[PlatformActions]
        SA[SystemActions]
    end

    CM --> PM
    CM --> SM
    CM --> AE
    PM --> TP
    PM --> FP
    AE --> CA
    AE --> PA
    AE --> SA
```

### Services Layer

```mermaid
graph TB
    subgraph "Main Process Services"
        Cron[CronService]
        MCP[McpService]
        Conv[ConversationService]
    end

    subgraph "Database"
        Schema[Schema]
        Migrations[Migrations]
        Buffer[StreamingMessageBuffer]
    end

    subgraph "WebUI Server"
        Express[Express App]
        WS[WebSocketManager]
        Auth[Auth Service]
    end

    Cron --> Schema
    MCP --> Schema
    Conv --> Schema
    Express --> Auth
    Express --> WS
```

## Data Flow

### Message Flow

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant IPC
    participant Main
    participant Worker
    participant AI

    User->>Renderer: Send message
    Renderer->>IPC: conversation.sendMessage
    IPC->>Main: Handle message
    Main->>Worker: Forward to agent
    Worker->>AI: API call
    AI-->>Worker: Stream response
    Worker-->>Main: Stream events
    Main-->>IPC: Emit events
    IPC-->>Renderer: Update UI
    Renderer-->>User: Display response
```

### Authentication Flow (WebUI)

```mermaid
sequenceDiagram
    participant Client
    participant WebUI
    participant Auth
    participant DB

    Client->>WebUI: POST /login
    WebUI->>Auth: Validate credentials
    Auth->>DB: Find user
    DB-->>Auth: User record
    Auth->>Auth: Verify password (bcrypt)
    Auth->>Auth: Generate JWT
    Auth-->>WebUI: Token
    WebUI-->>Client: Set cookie + token
```

## Database Schema

### Core Tables

```sql
-- Conversations
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    type TEXT,
    workspace TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

-- Messages
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    msg_id TEXT,
    type TEXT,
    content TEXT,
    status TEXT,
    position INTEGER,
    created_at INTEGER
);

-- Cron Jobs
CREATE TABLE cron_jobs (
    id TEXT PRIMARY KEY,
    name TEXT,
    schedule TEXT,
    conversation_id TEXT,
    message TEXT,
    agent_type TEXT,
    enabled INTEGER,
    last_run INTEGER,
    next_run INTEGER
);

-- Users (WebUI)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    created_at INTEGER,
    last_login INTEGER
);
```

## IPC Communication

### Bridge Structure

```typescript
// src/common/ipcBridge.ts
const ipcBridge = {
  conversation: {
    create: { provider, invoker },
    sendMessage: { provider, invoker },
    stop: { provider, invoker },
    // ...
  },
  mcpService: {
    testMcpConnection: { provider, invoker },
    syncMcpToAgents: { provider, invoker },
    // ...
  },
  application: {
    openDevTools: { provider, invoker },
    // ...
  }
};
```

### Preload Script

```typescript
// src/preload.ts - Exposed to renderer
contextBridge.exposeInMainWorld('electron', {
  emit: (name, data) => ipcRenderer.send('channel', { name, data }),
  on: (name, callback) => { /* listener setup */ },
  getPathForFile: (file) => webUtils.getPathForFile(file),
  webuiGetStatus: () => ipcRenderer.invoke('webui:getStatus'),
  webuiChangePassword: (pwd) => ipcRenderer.invoke('webui:changePassword', pwd),
  webuiGenerateQRToken: () => ipcRenderer.invoke('webui:generateQRToken'),
  webuiResetPassword: () => ipcRenderer.invoke('webui:resetPassword'),
});
```

## Security Considerations

### Authentication

- **JWT Tokens**: Used for session management
- **bcrypt**: Password hashing
- **Token Blacklist**: Invalidated tokens stored
- **Rate Limiting**: Per-endpoint limits

### WebUI Security

- **CSRF Protection**: Token-based
- **Secure Cookies**: HttpOnly, SameSite, Secure (in remote mode)
- **Input Validation**: Request body validation middleware
- **Rate Limiting**: Brute-force protection on login

### Agent Permissions

- **ApprovalStore**: Session-level permission caching
- **Permission Requests**: User confirmation for sensitive operations
- **File Operations**: Controlled access to workspace

## Deployment Modes

### Desktop Mode (Default)

- Full Electron application
- Local database
- Direct IPC communication

### WebUI Mode

```bash
npm run webui        # Local access only
npm run webui:remote # Network access enabled
```

- Express server on configurable port
- WebSocket for real-time updates
- JWT authentication required

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBUI_PORT` | WebUI server port | 3000 |
| `WEBUI_REMOTE` | Enable remote access | false |
| `NODE_ENV` | Environment | development |

### Build Configuration

- **Electron Forge**: Development and packaging
- **Electron Builder**: Production builds
- **Webpack**: Module bundling
- **UnoCSS**: Styling

## Performance Considerations

- **Worker Processes**: AI agents run in isolated processes
- **Streaming**: Responses streamed to avoid memory buildup
- **Message Buffer**: Batched database writes for streaming
- **Virtualized Lists**: React Virtuoso for message lists
