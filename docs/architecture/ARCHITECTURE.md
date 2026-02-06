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
        Lark[Lark Bot]
        OIDC[OIDC Provider<br/>SSO Integration]
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
    MP --> Lark

    WebUI --> OIDC
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
        LP[LarkPlugin]
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
    PM --> LP
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
        AuthSvc[AuthService]
        OidcSvc[OidcService]
        Middleware[Middleware Layer]
    end

    subgraph "Middleware"
        Token[TokenMiddleware]
        Role[RoleMiddleware]
        DataScope[DataScopeMiddleware]
    end

    Cron --> Schema
    MCP --> Schema
    Conv --> Schema
    Express --> Middleware
    Express --> WS
    Middleware --> Token
    Middleware --> Role
    Middleware --> DataScope
    Token --> AuthSvc
    AuthSvc --> OidcSvc
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

#### OIDC Authentication (Primary)

```mermaid
sequenceDiagram
    participant User
    participant WebUI
    participant OIDC as OIDC Provider
    participant Auth as AuthService
    participant DB

    User->>WebUI: Click "Login"
    WebUI->>WebUI: Generate state + CSRF token
    WebUI->>User: Redirect to OIDC
    User->>OIDC: Authenticate
    OIDC->>WebUI: Callback with code
    WebUI->>Auth: Validate state/CSRF
    Auth->>OIDC: Exchange code for tokens
    OIDC-->>Auth: ID token + access token
    Auth->>Auth: Verify ID token
    Auth->>DB: findByOidcSubject
    alt User exists
        DB-->>Auth: User record
        Auth->>DB: updateOidcUserInfo
    else New user (JIT provisioning)
        Auth->>Auth: Map groups to role
        Auth->>DB: createOidcUser
        DB-->>Auth: New user record
    end
    Auth->>Auth: Generate access token (15min JWT)
    Auth->>Auth: Generate refresh token (7d)
    Auth->>DB: Store refresh token
    Auth-->>WebUI: Tokens
    WebUI-->>User: Set secure cookies
```

#### Token Refresh Flow

```mermaid
sequenceDiagram
    participant Client
    participant WebUI
    participant Auth as AuthService
    participant DB

    Client->>WebUI: Request with expired access token
    WebUI->>Client: 401 Unauthorized
    Client->>WebUI: POST /api/auth/refresh (refresh token)
    WebUI->>Auth: Validate refresh token
    Auth->>DB: Check token_blacklist
    DB-->>Auth: Not blacklisted
    Auth->>DB: Verify refresh token exists
    DB-->>Auth: Valid token
    Auth->>Auth: Decode & validate
    Auth->>DB: Add old refresh to blacklist
    Auth->>Auth: Generate new access token (15min)
    Auth->>Auth: Generate new refresh token (7d)
    Auth->>DB: Store new refresh token
    Auth->>DB: Delete old refresh token
    Auth-->>WebUI: New tokens
    WebUI-->>Client: Set new cookies
```

#### Local Authentication (Fallback)

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
    Auth->>Auth: Verify password (bcrypt, 13 rounds)
    Auth->>Auth: Generate access token (15min JWT)
    Auth->>Auth: Generate refresh token (7d)
    Auth->>DB: Store refresh token
    Auth-->>WebUI: Tokens
    WebUI-->>Client: Set secure cookies
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

-- Users (WebUI) - Schema v10
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user',           -- 'admin' or 'user'
    auth_method TEXT DEFAULT 'local',    -- 'local' or 'oidc'
    oidc_subject TEXT UNIQUE,            -- OIDC sub claim (for SSO users)
    display_name TEXT,                   -- User's display name
    groups TEXT,                         -- JSON array of group memberships
    created_at INTEGER,
    last_login INTEGER
);

-- Refresh Tokens - Schema v11
CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Token Blacklist - Schema v11
CREATE TABLE token_blacklist (
    jti TEXT PRIMARY KEY,                -- JWT ID
    exp INTEGER NOT NULL,                -- Expiration timestamp
    blacklisted_at INTEGER NOT NULL
);

-- Global Models - Schema v16
-- Admin-managed shared model configurations
CREATE TABLE global_models (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,              -- e.g., 'openai', 'anthropic'
    name TEXT NOT NULL,                  -- Display name
    base_url TEXT NOT NULL DEFAULT '',   -- API endpoint
    encrypted_api_key TEXT,              -- AES-256-GCM encrypted
    models TEXT NOT NULL DEFAULT '[]',   -- JSON array of model names
    capabilities TEXT,                   -- JSON array (e.g., ["vision"])
    context_limit INTEGER,               -- Token limit
    custom_headers TEXT,                 -- JSON object for gateway headers
    enabled INTEGER NOT NULL DEFAULT 1,  -- 1=active, 0=disabled
    priority INTEGER NOT NULL DEFAULT 0, -- Display order (higher=first)
    created_by TEXT NOT NULL,            -- Admin user ID
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- User Model Overrides - Schema v16
-- Tracks per-user overrides for global models
CREATE TABLE user_model_overrides (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    global_model_id TEXT NOT NULL,
    override_type TEXT NOT NULL,         -- 'hidden' or 'modified'
    local_provider_id TEXT,              -- If modified, user's local copy ID
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (global_model_id) REFERENCES global_models(id) ON DELETE CASCADE,
    UNIQUE(user_id, global_model_id)
);

-- Logging Config - Schema v17
-- Runtime-configurable logging settings
CREATE TABLE logging_config (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    pino_level TEXT NOT NULL DEFAULT 'info',
    pino_file_enabled INTEGER NOT NULL DEFAULT 0,
    pino_file_path TEXT,
    pino_file_frequency TEXT DEFAULT 'daily',
    otel_enabled INTEGER NOT NULL DEFAULT 0,
    otel_endpoint TEXT,
    otel_service_name TEXT DEFAULT 'aionui',
    syslog_enabled INTEGER NOT NULL DEFAULT 0,
    syslog_host TEXT,
    syslog_port INTEGER DEFAULT 514,
    syslog_protocol TEXT DEFAULT 'udp',
    syslog_facility INTEGER DEFAULT 1,
    langfuse_enabled INTEGER NOT NULL DEFAULT 0,
    langfuse_public_key TEXT,
    langfuse_secret_key TEXT,
    langfuse_base_url TEXT,
    updated_at INTEGER NOT NULL
);

-- Global Model Groups - Schema v18
-- Group-based access control for global models
CREATE TABLE global_model_groups (
    id TEXT PRIMARY KEY,
    global_model_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (global_model_id) REFERENCES global_models(id) ON DELETE CASCADE,
    UNIQUE(global_model_id, group_name)
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

### Authentication & Authorization

#### Multi-Method Authentication

- **OIDC (Primary)**: Authorization code flow with PKCE support
  - State parameter validation for CSRF protection
  - Nonce validation in ID tokens
  - JIT (Just-In-Time) user provisioning
  - Group-based role mapping (configurable via `groupMappings.ts`)
- **Local (Fallback)**: Username/password with bcrypt (13 rounds)
- **Auth Methods**: `auth_method` column tracks authentication source

#### Token System

- **Access Tokens**: Short-lived JWT (15 minutes)
  - Contains: `userId`, `username`, `role`
  - Signed with HS256
  - Validated on every protected request
- **Refresh Tokens**: Long-lived database tokens (7 days)
  - Stored as bcrypt hash in `refresh_tokens` table
  - Single-use with automatic rotation
  - Revoked on logout or security events
- **Token Blacklist**: Persistent SQLite table
  - Tracks revoked JWT IDs (`jti` claim)
  - Checked on every token validation
  - Automatic cleanup of expired entries

#### OIDC Security

- **Provider Validation**: Issuer verification against discovery document
- **Token Verification**: ID token signature and claims validation
- **State/CSRF Protection**: Cryptographically random state parameter
- **Secure Redirect**: Callback URL validation
- **Subject Mapping**: OIDC `sub` claim → `users.oidc_subject`

#### Role-Based Access Control (RBAC)

- **Roles**: `admin`, `user`, `viewer`
- **Middleware**: `RoleMiddleware` with route-level enforcement
  - `requireAdmin`: Admin-only endpoints
  - `requireRole(role)`: Specific role requirements
  - `requireUser`: Any authenticated user
- **Data Isolation**: `DataScopeMiddleware` filters queries by `userId`
  - Conversations tagged with `__webUiUserId`
  - Users can only access their own data

### WebUI Security

- **CSRF Protection**: `tiny-csrf` middleware
  - Excluded routes: `/login`, `/api/auth/refresh`
  - Token validation on state-changing requests
- **Secure Cookies**:
  - `HttpOnly`: Prevents XSS access
  - `SameSite=Strict`: CSRF protection
  - `Secure`: HTTPS-only in remote mode
- **Security Headers**:
  - `Strict-Transport-Security`: HSTS enforcement
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy`: Restricts browser features
  - `Content-Security-Policy`: XSS mitigation
- **Input Validation**: Request body validation middleware
- **Rate Limiting**: User-based rate limiting (keyed by `userId` when authenticated)
  - Brute-force protection on login endpoints
  - Per-endpoint configurable limits

### WebSocket Security

- **User Tracking**: Each connection tagged with `userId`
- **User-Scoped Broadcasting**: `broadcastToUser(userId, event)`
- **Authentication Required**: Token validation on connection upgrade
- **Connection Isolation**: Users receive only their events

### Password Security

- **Hashing**: bcrypt with 13 rounds (cost factor)
- **No Plaintext Storage**: Passwords never logged or stored unencrypted
- **Hash Verification**: Timing-attack resistant comparison

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
| `AIONUI_PORT` | WebUI server port | 25808 |
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
