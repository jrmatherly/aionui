# AionUI Constitution

## Core Principles

### I. Multi-Agent AI Integration

AionUI serves as a unified desktop interface for multiple AI terminal agents (Gemini CLI, Claude Code, OpenAI Codex, etc.). Each AI agent integration must be:

- Protocol-agnostic with standardized adapters
- Independently manageable and configurable
- Cross-platform compatible (macOS, Windows, Linux, Docker)
- Real-time streaming capable for live interaction

### II. Modular Architecture First

Every major feature is implemented as an independent, testable module:

- Bridge pattern for IPC communication via `@office-ai/platform` (dialog, fs, conversation, auth, etc.)
- Agent managers as separate, swappable components
- UI components with clear separation of concerns
- Shared utilities and common interfaces

### III. User Experience Excellence

User interaction must be intuitive and efficient:

- Chat-based interface with file drag-and-drop support
- Multi-conversation management with context isolation
- Workspace integration for seamless file operations
- Responsive UI with proper loading states and error handling

### IV. Security and Privacy First

All user data and AI interactions must be secure:

- SQLite database for conversation history and settings
- Secure API key management with AES-256-GCM encryption
- Per-user data isolation in multi-user deployments
- OIDC/SSO support for enterprise authentication
- Proper credential isolation between different AI providers

### V. Developer Experience and Maintainability

Code must be maintainable and extensible:

- TypeScript for type safety across the entire stack
- ESLint and Prettier for consistent code quality
- Conventional commit message format (feat/fix/docs/style/refactor/perf/test/chore)
- Clear documentation for architectural decisions
- mise-en-place for tool version management

## Technology Standards

### Electron Framework

- Use Electron Forge for development and Electron Builder for packaging
- Maintain main process and renderer process separation
- Leverage IPC bridges (`@office-ai/platform`) for secure communication
- Support hot reload in development for rapid iteration
- Support headless mode via Xvfb for Docker deployments

### React and TypeScript

- React 19 with functional components and hooks
- Strict TypeScript 5.8 configuration with comprehensive type checking
- UnoCSS for atomic CSS styling
- Arco Design components for consistent UI patterns

### State Management

- React Context + SWR for data fetching and caching
- SQLite (better-sqlite3) for persistent application data
- File-system based storage for workspace operations
- Event-driven communication between components

### Database

- SQLite via better-sqlite3 with migration system
- Schema versioning (current: v18)
- Tables: conversations, messages, users, refresh_tokens, token_blacklist, user_api_keys, organizations, teams, global_models, user_model_overrides, logging_config, etc.

## Development Workflow

### Code Quality Gates

- Pre-commit hooks with lint-staged for automatic formatting
- ESLint warnings must be addressed before merge
- No console.log statements in production code
- All public interfaces must have TypeScript documentation

### Version Management

- Semantic versioning (MAJOR.MINOR.PATCH) strictly enforced
- Automated version updates via release scripts
- CI/CD pipeline handles building and code signing
- Git tag creation automated on version changes

### Branching Strategy

- Feature branches for new functionality development
- Main branch for production-ready code
- No direct commits to main branch
- Pull request reviews required for all changes

### Tool Management

- mise-en-place manages Node.js 24 and npm 11+ versions
- `mise.toml` defines tool versions, env vars, and tasks
- `mise.lock` pins exact versions with checksums
- Docker builds read versions from mise.lock

## Governance

### Architecture Decisions

- Constitutional principles supersede implementation preferences
- Breaking changes require architectural review and migration plan
- New AI agent integrations must follow established adapter patterns
- Performance regressions require justification and timeline for resolution

### Compliance Requirements

- All features must work across supported platforms (macOS, Windows, Linux, Docker)
- User data privacy and security standards are non-negotiable
- Accessibility considerations for all UI components
- Regular dependency updates for security patches
- English-only UI (i18n removed in v1.8.2)

**Version**: 2.0.0 | **Ratified**: 2025-01-22 | **Last Amended**: 2026-02-05
