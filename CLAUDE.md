# AionUi - Project Guide for Claude

## Project Overview

**AionUi** is a unified AI agent graphical interface that transforms command-line AI agents into a modern, efficient chat interface. It supports multiple CLI AI tools including Gemini CLI, Claude Code, CodeX, Qwen Code, and more.

- **Version**: 1.8.1
- **License**: Apache-2.0
- **Platform**: Cross-platform (macOS, Windows, Linux)

## Tech Stack

### Core

- **Electron 37.x** - Desktop application framework
- **React 19.x** - UI framework
- **TypeScript 5.8.x** - Programming language
- **Express 5.x** - Web server (for WebUI remote access)

### Build Tools

- **Webpack 6.x** - Module bundler (via @electron-forge/plugin-webpack)
- **Electron Forge 7.8.x** - Build tooling
- **Electron Builder 26.x** - Application packaging

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

### Data & Storage

- **Better SQLite3** - Local database
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
│   │   ├── cron/            # Scheduled tasks
│   │   └── login/           # Authentication
│   ├── components/          # Reusable UI components
│   ├── hooks/               # React hooks
│   ├── context/             # Global state (React Context)
│   ├── services/            # Client-side services
│   ├── i18n/                # Internationalization
│   └── utils/               # Utility functions
├── process/                 # Main process services
│   ├── database/            # SQLite operations
│   ├── bridge/              # IPC communication
│   └── services/            # Backend services
│       ├── mcpServices/     # MCP protocol (multi-agent)
│       └── cron/            # Task scheduling
├── webserver/               # Web server for remote access
│   ├── routes/              # HTTP routes
│   ├── websocket/           # Real-time communication
│   └── auth/                # Authentication
├── worker/                  # Background task workers
├── channels/                # Agent communication system
├── common/                  # Shared utilities & types
└── agent/                   # AI agent implementations

deploy/                      # Deployment configurations
└── docker/                  # Docker containerization
    ├── Dockerfile           # Multi-stage build
    ├── docker-compose.yml   # Container orchestration
    └── docker-entrypoint.sh # Startup script
```

## Development Commands

```bash
# Development
npm start              # Start dev environment
npm run webui          # Start WebUI server

# Code Quality
npm run lint           # Run ESLint
npm run lint:fix       # Auto-fix lint issues
npm run format         # Format with Prettier

# Testing
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report

# Building
npm run build          # Full build (macOS arm64 + x64)
npm run dist:mac       # macOS build
npm run dist:win       # Windows build
npm run dist:linux     # Linux build
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

### Comments

- English for code comments
- JSDoc for function documentation

## Git Conventions

### Commit Messages

- **Language**: English
- **Format**: `<type>(<scope>): <subject>`
- **Types**: feat, fix, refactor, chore, docs, test, style, perf

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
- **Token Management**: JWT access tokens with refresh token rotation and blacklist support

### Admin Features

- **User Management**: Admin page for user CRUD and role assignment (`src/renderer/pages/settings/UserManagement.tsx`)
- **Group Mappings**: Map OIDC groups to application roles (`src/renderer/pages/settings/GroupMappings.tsx`)
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

- Secure contextBridge isolation
- Type-safe message system in `src/renderer/messages/`

### WebUI Server

- Express + WebSocket
- JWT authentication
- Supports remote network access

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

## Internationalization

Supported languages: English (en-US), Chinese Simplified (zh-CN), Chinese Traditional (zh-TW), Japanese (ja-JP), Korean (ko-KR)

Translation files: `src/renderer/i18n/locales/*.json`

---

## Skills Index

Detailed rules and guidelines are organized into Skills for better modularity:

| Skill    | Purpose                                                              | Triggers                                               |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| **i18n** | Key naming, sync checking, hardcoded detection, translation workflow | Adding user-facing text, creating components with text |

> Skills are located in `.claude/skills/` and loaded automatically when relevant.

## Key Configuration Files

| File               | Purpose                     |
| ------------------ | --------------------------- |
| `tsconfig.json`    | TypeScript compiler options |
| `forge.config.ts`  | Electron Forge build config |
| `uno.config.ts`    | UnoCSS styling config       |
| `.eslintrc.json`   | Linting rules               |
| `.prettierrc.json` | Code formatting             |
| `jest.config.js`   | Test configuration          |

## Testing

- **Framework**: Jest + ts-jest
- **Structure**: `tests/unit/`, `tests/integration/`, `tests/contract/`
- Run with `npm test`

## Native Modules

The following require special handling during build:

- `better-sqlite3` - Database
- `node-pty` - Terminal emulation
- `tree-sitter` - Code parsing

These are configured as externals in Webpack.

## AI Context Tools

This project uses **Drift Detect** and **Serena** for enhanced AI-assisted development:

- **Drift Detect** — Pattern analysis, call graph, Cortex institutional memory (`.drift/`, `.driftignore`)
- **Serena** — Symbolic code navigation via language server (`.serena/project.yml`, `.serena/memories/`)
- **MCP config** — `.mcp.json` configures Drift as an MCP server for AI tools

Run `drift status` and `drift memory status` to check health. See `docs/guides/AI_CONTEXT_GUIDE.md` for full setup and workflow documentation.
