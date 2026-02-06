# AionUi - Project Guide for Claude

## Project Overview

**AionUi** is a unified AI agent graphical interface that transforms command-line AI agents into a modern, efficient chat interface. It supports multiple CLI AI tools including Gemini CLI, Claude Code, CodeX, Qwen Code, and more.

- **License**: Apache-2.0
- **Platform**: Cross-platform (macOS, Windows, Linux, Docker)
- **Language**: English only (i18n removed in v1.8.2)

## Tech Stack

- **Electron 37.x** + **React 19.x** + **TypeScript 5.9.x** + **Express 5.x**
- **Webpack 6.x** (via Forge) + **Electron Builder 26.x** + **mise-en-place** (Node 24, npm 11)
- **Arco Design 2.x** + **UnoCSS 66.x** + **Monaco Editor 4.x**
- **Pino 10.x** (structured logging) + **OpenTelemetry** (tracing) + **Langfuse** (LLM observability)
- **Better SQLite3** (schema v18) + **Zod** (validation)
- **openid-client 5.7.1** (OIDC SSO) + **LanceDB** (vector DB for RAG)

## Project Structure

```text
src/
├── index.ts                 # Main process entry
├── preload.ts               # Electron preload (IPC bridge)
├── renderer/                # React UI (pages, components, hooks, context)
│   ├── pages/               # conversation, settings, admin, cron, login
│   └── components/          # Reusable UI + shared/ (ProviderLogo, PlatformSelect)
├── process/                 # Main process services, database, bridges, tasks
│   ├── database/            # SQLite operations, schema, migrations
│   ├── services/            # KnowledgeBaseService, MiseEnvironmentService, etc.
│   └── task/                # Agent managers (ACP, Gemini, Codex) + RAG utils
├── webserver/               # Express + WebSocket + auth + middleware + routes
├── worker/                  # Background task workers
├── agent/                   # AI agent implementations (acp, codex, gemini)
├── common/                  # Shared utilities, logger, adapters, constants
└── channels/                # External messaging (Telegram, Lark)

deploy/docker/               # Dockerfile, docker-compose.yml, nginx.conf, .env
skills/                      # User-facing skills shipped with app (docx, xlsx, pdf, lance, etc.)
.claude/skills/              # Developer workflow skills (release, gen-test, db-migrate)
```

## Development Commands

```bash
mise run dev               # Start dev environment
mise run webui             # Start WebUI server
mise run lint:fix          # ESLint auto-fix
mise run format            # Prettier format
mise run typecheck         # TypeScript type checking (no emit)
mise run test              # Run all tests
mise run lint:python       # Lint Python scripts (ruff)
mise run lint:python:fix   # Lint + auto-fix Python (ruff)
mise run docker:build      # Build Docker image
mise run docker:up         # Start container
mise run changelog         # Generate CHANGELOG.md (git-cliff)
mise run release           # Interactive release workflow
```

## Code Conventions

### Naming

- **Components**: PascalCase (`Button.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Constants**: UPPER_SNAKE_CASE
- **Unused params**: prefix with `_`

### TypeScript

- Strict mode enabled
- Path aliases: `@/*`, `@process/*`, `@renderer/*`, `@worker/*`
- Prefer `type` over `interface` (per ESLint config)

### React

- Functional components only
- Hooks: `use*` prefix, event handlers: `on*` prefix
- Props interface: `${ComponentName}Props`

### Styling

- UnoCSS atomic classes preferred
- CSS modules for component-specific: `*.module.css`
- Arco Design semantic colors, CSS variables: `var(--bg-1)`, `var(--text-primary)`

### Comments & Language

- All user-facing strings: hardcoded English (no i18n)
- Code comments: English
- JSDoc for function documentation

## Git Conventions

- **Format**: `<type>(<scope>): <subject>`
- **Types**: feat, fix, refactor, chore, docs, test, style, perf
- **No Claude Signature**: Do not add `🤖 Generated with Claude` to commits
- Git hook enforces commit message format

## Architecture Notes

- **Multi-Process**: Main (app logic, DB, IPC) + Renderer (React) + Workers (AI tasks)
- **IPC**: Secure contextBridge via `@office-ai/platform` bridge system. Never use raw ipcMain/ipcRenderer
- **WebUI**: Express + WebSocket with JWT auth, refresh token rotation, Docker + headless Electron (Xvfb)
- **Cron**: `croner` library + `CronBusyGuard` for preventing concurrent execution

## Supported AI Agents

Claude (MCP), Gemini, Codex, Qwen Code, Iflow, custom agents via MCP protocol

## LLM Gateway Support

LiteLLM, Azure OpenAI / Azure AI Foundry, Portkey, Kong AI Gateway, AgentGateway, Envoy AI Gateway

## Key Configuration Files

| File                   | Purpose                           |
| ---------------------- | --------------------------------- |
| `tsconfig.json`        | TypeScript compiler options       |
| `forge.config.ts`      | Electron Forge build config       |
| `electron-builder.yml` | Electron Builder packaging config |
| `uno.config.ts`        | UnoCSS styling config             |
| `eslint.config.mjs`    | Linting rules (flat config)       |
| `mise.toml`            | Tool versions, tasks, env vars    |
| `cliff.toml`           | Changelog generation (git-cliff)  |

## Testing

- **Framework**: Jest + ts-jest
- **Structure**: `tests/unit/`, `tests/integration/`, `tests/contract/`

## Files Requiring Explicit Permission to Modify

- `package-lock.json`, `.husky/*`, `deploy/docker/Dockerfile*`, `electron-builder.yml`
- `forge.config.ts`, `mise.lock`, `entitlements.plist`

## Files to Never Read or Modify

- `deploy/docker/.env`, `deploy/docker/global-models.json`, `deploy/docker/group-mappings.json`
- Any file matching: `*.pem`, `*.key`, `*credentials*`, `*secrets*`

## Definition of Done

Every implementation task should include:

1. **Code** — Implementation complete, `mise run typecheck` passes
2. **Commit** — Conventional commit with clear scope
3. **Documentation** — Update relevant files:
   - `.serena/memories/*.md` — Feature-specific memory file
   - `.claude/rules/*.md` or `CLAUDE.md` — If it affects how agents work
4. **Verify** — TypeScript compilation clean, lint passes

## Topic-Specific Rules

Detailed guidance for specific subsystems is in `.claude/rules/`:

| Rule File                | Loaded When Working On                                     |
| ------------------------ | ---------------------------------------------------------- |
| `auth.md`                | Authentication, OIDC, RBAC, admin pages                    |
| `rag-knowledge-base.md`  | Knowledge Base, RAG, embeddings, agent managers            |
| `python-skills.md`       | Skills, Python environments, mise                          |
| `database.md`            | SQLite schema, migrations, database operations             |
| `build-and-packaging.md` | Docker, Webpack, CI/CD, Electron packaging, branding       |
| `code-style.md`          | ESLint, Prettier, CSS, UnoCSS config                       |
| `ai-context-tools.md`    | Drift Detect, Serena, MCP config                           |
| `common-pitfalls.md`     | _(always loaded)_ Critical patterns that cause subtle bugs |
