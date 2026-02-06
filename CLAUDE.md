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

- **Better SQLite3** - Local database (schema v18)
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
    ├── Dockerfile           # Full multi-stage build (local dev)
    ├── Dockerfile.package   # Packaging-only build (CI, pre-compiled)
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

# Changelog (git-cliff)
mise run changelog             # Generate CHANGELOG.md
mise run changelog:latest      # Show latest release notes
mise run changelog:unreleased  # Preview unreleased changes
mise run changelog:bump        # Show next version number
npm run changelog              # Generate CHANGELOG.md (without mise)
npm run changelog:preview      # Preview unreleased (without mise)
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

## Branding Customization

AionUI supports full white-label branding via the `AIONUI_BRAND_NAME` environment variable.

### Build-Time vs Runtime

| Layer               | Method                 | When Applied |
| ------------------- | ---------------------- | ------------ |
| HTML `<title>`      | BrandingInjectorPlugin | Build time   |
| React components    | DefinePlugin           | Build time   |
| useBranding default | DefinePlugin           | Build time   |
| Server messages     | `getBrandName()`       | Runtime      |
| HTTP headers        | `getBrandName()`       | Runtime      |

### Usage

```bash
# Option 1: mise task with --brand flag
mise run build:branded --brand "Enterprise AI"

# Option 2: Set env var before build
export AIONUI_BRAND_NAME="Enterprise AI"
mise run build

# Option 3: Docker with --brand flag
mise run docker:build --brand "Enterprise AI" --tag myapp:latest
```

### Key Files

- `src/common/branding.ts` - Runtime branding functions (`getBrandName()`)
- `src/renderer/hooks/useBranding.ts` - React hook for UI components
- `config/webpack/webpack.plugins.ts` - Build-time injection (BrandingInjectorPlugin)
- `deploy/docker/Dockerfile` - AIONUI_BRAND_NAME build arg

See `.serena/memories/branding-and-release-configuration.md` for full details.

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
- **Global Models**: Shared model configurations with optional group-based access control (`src/renderer/pages/admin/GlobalModels.tsx`)
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
- **GLOBAL_MODELS**: JSON array to pre-configure shared models (synced to DB on startup)

  ```json
  [
    { "platform": "openai", "name": "Economy", "models": ["gpt-4o-mini"] },
    { "platform": "openai", "name": "Premium", "models": ["gpt-4o"], "allowed_groups": ["AI-Power-Users"] }
  ]
  ```

  - `allowed_groups`: Optional array of group names for access control (matches GROUP_MAPPINGS)
  - No `allowed_groups` = available to everyone; admins bypass all restrictions

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
| `cliff.toml`           | Changelog generation (git-cliff)    |

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

### Pino Logging (Externalized)

Pino and all transport modules (`pino-pretty`, `pino-roll`, `pino-syslog`, `thread-stream`, etc.)
are webpack externals. Pino's `package.json` has a `"browser"` field that points to a console.log
wrapper — webpack would silently break file logging, transports, and worker threads by loading the
browser build. Externalization ensures Node.js `require()` loads the real pino with full transport
support. The renderer process correctly uses pino's browser build via its separate webpack config.

### Webpack Filesystem Cache

Both main and renderer webpack configs use `cache: { type: 'filesystem' }` with cache stored in
`.webpack-cache/` (gitignored). This enables incremental rebuilds — only changed modules recompile.

### CI Build Pipeline

The CI workflow (`build-and-release.yml`) uses a 3-job pipeline:

1. **quality** — TypeScript, ESLint, Prettier checks
2. **compile** — Runs on CI runner (NOT Docker) with cached node_modules + webpack cache
3. **docker** — Uses `Dockerfile.package` (packaging only, no compilation)

This architecture mirrors local dev speed: cached deps + incremental webpack.

## Common Pitfalls

These are critical patterns that cause subtle bugs. Review before making changes in these areas.

### Pino Webpack Externalization

Pino has `"browser": "./browser.js"` in its package.json — a console.log shim with no transport/file/worker support. Webpack can resolve the browser build even with `target: 'electron-main'`. Pino and ALL transport deps (`pino-pretty`, `pino-roll`, `pino-syslog`, `thread-stream`, etc.) **must** remain in webpack `externals` and `electron-builder.yml` files list. Never bundle pino.

### Message.useMessage() Infinite Loop

Arco Design's `Message.useMessage()` creates a new reference each render. Putting it in `useCallback`/`useEffect` dependency arrays causes infinite re-render loops. Use static `Message.error()` / `Message.success()` for callbacks in dependency arrays.

### CSS Theme Selectors

`:root` matches `<html>` in both themes. Using `:root .class` for light-mode CSS breaks dark mode. Always use `[data-theme='light'] .class` for light-mode-specific rules.

### Express Route Ordering

Static routes like `/global/hidden` must be defined **before** parameterized routes like `/global/:id`, otherwise `:id` captures the literal string "hidden".

### Build-Time vs Runtime Branding

Setting `AIONUI_BRAND_NAME` only at runtime causes a "flash of default brand" in the UI. Set it before building: `mise run build:branded --brand "Name"`.

### Native Module Build Config

Native modules (better-sqlite3, node-pty, web-tree-sitter) must appear in all three places:

1. `forge.config.ts` — `rebuildConfig.onlyModules`
2. `electron-builder.yml` — `asarUnpack` section
3. Webpack config — `externals` array

Missing any one = broken builds.

## Skills Infrastructure

The `skills/` directory contains Claude Code automation skills bundled with the application. These follow the Anthropic Skills format with project-specific extensions.

### Directory Structure

```text
skills/
├── docx/                    # Word document manipulation
│   ├── SKILL.md             # Skill definition and workflows
│   ├── docx-js.md           # docx-js reference for creating documents
│   ├── ooxml.md             # OOXML reference for editing documents
│   ├── ooxml/schemas/       # XML schema definitions
│   └── scripts/
│       ├── office/          # Anthropic office infrastructure
│       │   ├── soffice.py   # Sandbox-compatible LibreOffice wrapper
│       │   ├── pack.py      # Pack directory to DOCX/PPTX/XLSX
│       │   ├── unpack.py    # Unpack DOCX/PPTX/XLSX to directory
│       │   ├── validate.py  # Validate Office XML
│       │   ├── validators/  # Schema validators
│       │   └── helpers/     # XML manipulation helpers
│       ├── accept_changes.py # Accept tracked changes utility
│       ├── comment.py       # Add comments to documents
│       ├── document.py      # High-level Document library (project-specific)
│       ├── utilities.py     # Project utilities
│       └── templates/       # XML templates for comments
├── xlsx/                    # Excel spreadsheet manipulation
│   ├── SKILL.md
│   └── scripts/
│       ├── recalc.py        # Formula recalculation via LibreOffice
│       └── office/          # Shared office infrastructure
├── pdf/                     # PDF processing
│   ├── SKILL.md
│   ├── forms.md             # PDF form filling guide
│   └── reference.md         # Advanced PDF features
├── pptx/                    # PowerPoint presentation manipulation
│   ├── SKILL.md
│   ├── html2pptx.md         # HTML to PPTX workflow
│   ├── ooxml.md             # OOXML editing reference
│   └── scripts/
├── skill-creator/           # Guide for creating new skills
├── db-migrate/              # Database migration scaffolding
├── gen-test/                # Test scaffolding
├── release/                 # Version bump and release automation
├── mermaid/                 # Mermaid diagram generation
├── frontend-design/         # Distinctive UI design principles
├── mcp-builder/             # MCP server creation guide
├── webapp-testing/          # Playwright web app testing
├── brand-guidelines/        # Brand colors and typography
├── doc-coauthoring/         # Structured documentation workflow
├── internal-comms/          # 3P updates, newsletters, FAQs
└── x-recruiter/             # X/Twitter job posting automation
```

### Office Infrastructure Pattern

The `scripts/office/` directory is shared infrastructure from Anthropic Skills, providing:

- **soffice.py** — LibreOffice wrapper with sandbox environment support (auto-configures for restricted Unix socket environments)
- **pack.py** — Pack unpacked directory back to Office format with validation and auto-repair
- **unpack.py** — Unpack Office files to directory with XML pretty-printing
- **validate.py** — Validate Office XML against schemas
- **validators/** — Schema validators for DOCX, PPTX, redlining
- **helpers/** — XML manipulation utilities (merge_runs, simplify_redlines)

Both `docx/` and `xlsx/` use this shared infrastructure pattern.

## Files Requiring Explicit Permission to Modify

Before editing these files, always ask the user first:

- `package-lock.json` — dependency lock (regenerate with `npm ci`)
- `.husky/*` — git hooks (commit-msg, pre-commit)
- `deploy/docker/Dockerfile` — production container build
- `deploy/docker/Dockerfile.package` — CI packaging build
- `electron-builder.yml` — application packaging config
- `forge.config.ts` — Electron Forge build config (complex, many edge cases)
- `mise.lock` — tool version pins with checksums
- `entitlements.plist` — macOS code signing

## Files to Never Read or Modify

- `deploy/docker/.env` — contains secrets
- `deploy/docker/global-models.json` — contains API keys
- `deploy/docker/group-mappings.json` — contains EntraID group IDs
- Any file matching: `*.pem`, `*.key`, `*credentials*`, `*secrets*`

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
