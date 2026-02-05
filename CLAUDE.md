# AionUi - Project Guide for Claude

## Project Overview

**AionUi** is a unified AI agent graphical interface that transforms command-line AI agents into a modern, efficient chat interface. It supports multiple CLI AI tools including Gemini CLI, Claude Code, CodeX, Qwen Code, and more.

- **Version**: 1.8.2
- **License**: Apache-2.0
- **Platform**: Cross-platform (macOS, Windows, Linux, Docker)
- **Language**: English only (i18n removed in v1.8.2)

## Tech Stack

### Core

- **Electron 37.x** - Desktop application framework
- **React 19.x** - UI framework
- **TypeScript 5.8.x** - Programming language
- **Express 5.x** - Web server (for WebUI remote access)

### Build Tools

- **Webpack 6.x** - Module bundler (via @electron-forge/plugin-webpack)
- **Electron Forge 7.8.x** - Build tooling (development)
- **Electron Builder 26.x** - Application packaging (production)
- **mise-en-place** - Tool version management (Node.js 24, npm 11)

### UI & Styling

- **Arco Design 2.x** - Enterprise UI component library
- **UnoCSS 66.x** - Atomic CSS engine
- **Monaco Editor 4.x** - Code editor

### AI Integration

- **Anthropic SDK** - Claude API
- **Google GenAI** - Gemini API
- **OpenAI SDK** - OpenAI API
- **MCP SDK** - Model Context Protocol

### Authentication

- **openid-client 5.7.1** - OIDC/OAuth2 client for SSO integration
- **better-auth** - JWT token management

### Logging & Observability

- **Pino 10.x** - Structured JSON logging with child loggers
- **OpenTelemetry** - Distributed tracing (auto-instrumentation)
- **Langfuse** - LLM observability (optional)
- **Syslog** - RFC 5424 SIEM forwarding (optional)

### Data & Storage

- **Better SQLite3** - Local database (schema v17)
- **Zod** - Data validation

## Project Structure

```text
src/
├── index.ts                 # Main process entry
├── preload.ts               # Electron preload (IPC bridge)
├── renderer/                # UI application
│   ├── pages/               # Page components
│   │   ├── conversation/    # Chat interface (main feature)
│   │   ├── settings/        # Settings management
│   │   ├── admin/           # Admin pages (UserManagement, GroupMappings, GlobalModels, LoggingSettings)
│   │   ├── cron/            # Scheduled tasks
│   │   └── login/           # Authentication
│   ├── components/          # Reusable UI components
│   │   └── shared/          # Cross-page shared (ProviderLogo, PlatformSelect)
│   ├── hooks/               # React hooks
│   ├── context/             # Global state (React Context)
│   ├── config/              # Model platforms, capabilities
│   ├── services/            # Client-side services
│   ├── assets/              # Static assets (logos, images)
│   └── utils/               # Utility functions
├── process/                 # Main process services
│   ├── database/            # SQLite operations, schema, migrations
│   ├── bridge/              # IPC communication (24+ bridges)
│   ├── services/            # Backend services
│   │   ├── mcpServices/     # MCP protocol (multi-agent)
│   │   └── cron/            # Task scheduling
│   └── task/                # Agent task managers
├── process/
│   └── telemetry/
│       └── otel.ts          # OpenTelemetry bootstrap (must be first import)
├── webserver/               # Web server for remote access
│   ├── routes/              # HTTP routes (incl. loggingRoutes.ts)
│   ├── middleware/           # correlationId, auth, CSRF
│   ├── websocket/           # Real-time communication
│   └── auth/                # Authentication (OIDC, JWT, RBAC)
├── worker/                  # Background task workers
├── channels/                # Agent communication system (Telegram, Lark)
├── common/                  # Shared utilities & types
│   ├── adapters/            # API protocol converters
│   ├── constants/           # Provider definitions
│   ├── logger.ts            # Pino structured logging (root + child loggers)
│   └── presets/             # Assistant presets
└── agent/                   # AI agent implementations
    ├── acp/                 # Claude Code agent
    ├── codex/               # OpenAI Codex agent
    └── gemini/              # Google Gemini agent

deploy/                      # Deployment configurations
└── docker/                  # Docker containerization
    ├── Dockerfile           # Multi-stage build
    ├── docker-compose.yml   # Container orchestration
    └── docker-entrypoint.sh # Startup script
```

## Development Commands

```bash
# Development (with mise - recommended)
mise run dev               # Start dev environment
mise run webui             # Start WebUI server
mise run info              # Print environment info

# Development (with npm)
npm start                  # Start dev environment
npm run webui              # Start WebUI server

# Code Quality
npm run lint               # Run ESLint
npm run lint:fix           # Auto-fix lint issues
npm run format             # Format with Prettier

# Testing
npm test                   # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report

# Building
npm run build              # Full build (macOS arm64 + x64)
npm run dist:mac           # macOS build
npm run dist:win           # Windows build
npm run dist:linux         # Linux build

# Docker
mise run docker:build      # Build Docker image
mise run docker:up         # Start container
mise run docker:down       # Stop container
```

## Code Conventions

### Naming

- **Components**: PascalCase (`Button.tsx`, `Modal.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Constants**: UPPER_SNAKE_CASE
- **Unused params**: prefix with `_`

### TypeScript

- Strict mode enabled
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`, `@worker/*`
- Prefer `type` over `interface` (per ESLint config)

### React

- Functional components only
- Hooks: `use*` prefix
- Event handlers: `on*` prefix
- Props interface: `${ComponentName}Props`

### Styling

- UnoCSS atomic classes preferred
- CSS modules for component-specific styles: `*.module.css`
- Use Arco Design semantic colors
- Use CSS variables for theming: `var(--bg-1)`, `var(--text-primary)`

### Comments & Language

- All user-facing strings: hardcoded English (no i18n)
- Code comments: English
- JSDoc for function documentation

## Git Conventions

### Commit Messages

- **Language**: English
- **Format**: `<type>(<scope>): <subject>`
- **Types**: feat, fix, refactor, chore, docs, test, style, perf

**Note**: Project has a git hook that only accepts these commit types.

Examples:

```text
feat(cron): implement scheduled task system
fix(webui): correct modal z-index issue
chore: remove debug console.log statements
```

### No Claude Signature

Do not add `🤖 Generated with Claude` or similar signatures to commits.

## Authentication & Authorization

### Multi-User Support

- **OIDC/SSO Integration**: EntraID (Azure AD) and other OIDC providers for enterprise single sign-on
- **Local Admin Account**: Fallback authentication with bcrypt password hashing
- **RBAC**: Role-based access control with three tiers (admin, user, viewer)
- **Data Isolation**: Conversation and session data scoped by user
- **Token Management**: JWT access tokens (15min) with refresh token rotation (7d) and blacklist support

### Admin Features

- **User Management**: Admin page for user CRUD and role assignment (`src/renderer/pages/admin/UserManagement.tsx`)
- **Group Mappings**: Map OIDC groups to application roles (`src/renderer/pages/admin/GroupMappings.tsx`)
- **Global Models**: Shared model configurations available to all users (`src/renderer/pages/admin/GlobalModels.tsx`)
- **Logging Settings**: Runtime logging, OTEL, syslog, Langfuse configuration (`src/renderer/pages/admin/LoggingSettings.tsx`)
- **Profile Page**: User profile with password change capability (`src/renderer/pages/settings/ProfilePage.tsx`)

### Middleware Stack

- **RoleMiddleware**: Enforce role-based access to admin routes
- **DataScopeMiddleware**: Filter database queries by user ownership
- **TokenMiddleware**: Validate and refresh JWT tokens

### Services

- **OidcService** (`src/webserver/auth/service/OidcService.ts`): Handle OIDC discovery, authorization, and token exchange
- **AuthService** (enhanced): Refresh token rotation, token blacklist, password management

### Configuration

- **oidcConfig.ts**: OIDC provider settings (issuer, client credentials, scopes)
- **groupMappings.ts**: Map OIDC groups to roles (JSON or file-based)
- Environment variables: `OIDC_ENABLED`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, etc.

---

## Architecture Notes

### Multi-Process Model

- **Main Process**: Application logic, database, IPC handling
- **Renderer Process**: React UI
- **Worker Processes**: Background AI tasks (gemini, codex, acp workers)

### IPC Communication

- Secure contextBridge isolation via `@office-ai/platform` bridge system
- Never use raw `ipcMain`/`ipcRenderer` — always use bridge pattern
- Type-safe message system in `src/renderer/messages/`

### WebUI Server

- Express + WebSocket
- JWT authentication with refresh token rotation
- Supports remote network access
- Works in Docker with headless Electron (Xvfb)

### Cron System

- Based on `croner` library
- `CronService`: Task scheduling engine
- `CronBusyGuard`: Prevents concurrent execution

## Supported AI Agents

- Claude (via MCP)
- Gemini (Google AI)
- Codex (OpenAI)
- Qwen Code
- Iflow
- Custom agents via MCP protocol

## LLM Gateway Support

Supports routing through proxy providers:

- LiteLLM
- Azure OpenAI / Azure AI Foundry
- Portkey
- Kong AI Gateway
- AgentGateway
- Envoy AI Gateway

---

## Key Configuration Files

| File                   | Purpose                             |
| ---------------------- | ----------------------------------- |
| `tsconfig.json`        | TypeScript compiler options         |
| `forge.config.ts`      | Electron Forge build config         |
| `electron-builder.yml` | Electron Builder packaging config   |
| `uno.config.ts`        | UnoCSS styling config               |
| `eslint.config.mjs`    | Linting rules (flat config)         |
| `.prettierrc.json`     | Code formatting                     |
| `jest.config.js`       | Test configuration                  |
| `mise.toml`            | Tool versions, tasks, env vars      |
| `mise.lock`            | Pinned tool versions with checksums |

## Testing

- **Framework**: Jest + ts-jest
- **Structure**: `tests/unit/`, `tests/integration/`, `tests/contract/`
- Run with `npm test` or `mise run test`

## Native Modules

The following require special handling during build:

- `better-sqlite3` - Database
- `node-pty` - Terminal emulation (uses prebuilt binaries)
- `web-tree-sitter` - Code parsing (WASM)

These are configured as externals in Webpack and unpacked from asar.

## AI Context Tools

This project uses **Drift Detect** and **Serena** for enhanced AI-assisted development:

- **Drift Detect** — Pattern analysis, call graph, Cortex institutional memory (`.drift/`, `.driftignore`)
- **Serena** — Symbolic code navigation via language server (`.serena/project.yml`, `.serena/memories/`)
- **MCP config** — `.mcp.json` configures Drift as an MCP server (TypeScript-only tool filtering)
- **Data boundaries** — `.drift/boundaries/rules.json` enforces auth data access rules
- **Env variable tracking** — `drift env secrets` audits sensitive variable access (7 secrets tracked)

### Serena MCP Tool Parameters

Use these exact parameter names when calling Serena tools to avoid validation errors:

| Tool                   | Required Parameter      | Value                                  | Notes                                                                    |
| ---------------------- | ----------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `activate_project`     | `project`               | `"aionui"`                             | Project name from `.serena/project.yml`, NOT a filesystem path           |
| `read_memory`          | `memory_file_name`      | e.g. `"project-architecture"`          | Memory name without `.md` extension                                      |
| `list_memories`        | _(none)_                |                                        | No parameters required; must be called AFTER `activate_project` succeeds |
| `find_symbol`          | `name_path`             | e.g. `"ClassName/method"`              | Supports substring matching                                              |
| `get_symbols_overview` | `relative_path`         | e.g. `"src/process/database/index.ts"` | Path relative to project root                                            |
| `replace_symbol_body`  | `name_path`, `new_body` |                                        | Use for editing entire symbol definitions                                |
| `search_for_pattern`   | `pattern`               | regex string                           | Optional `relative_path` to restrict scope                               |

**Sequencing:** Always call `activate_project` first and wait for success before calling `list_memories` or `read_memory`. Do not batch them in parallel.

Key commands:

```bash
drift status             # Pattern health (85/100, 390+ approved)
drift memory status      # Cortex memory health (51+ memories)
drift memory why "area"  # Get context before working on a feature area
drift env secrets        # Audit sensitive env var access
drift boundaries check   # Verify data access boundaries
drift dna mutations      # Check style consistency
```

See `docs/guides/AI_CONTEXT_GUIDE.md` for full setup and workflow documentation.
