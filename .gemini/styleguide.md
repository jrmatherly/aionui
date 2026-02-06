# AionUI Code Review Style Guide

## Overview

This document defines the coding standards and best practices for the AionUI project. The AI code reviewer should use these guidelines when reviewing pull requests.

## Technology Stack

- **Runtime**: Node.js 24+ with npm 11+
- **Framework**: Electron 37 + React 19
- **Language**: TypeScript 5.8 (strict mode)
- **Styling**: UnoCSS (atomic CSS) + Arco Design
- **State Management**: React hooks + Context + SWR
- **Database**: SQLite via better-sqlite3
- **Build**: Electron Forge (dev) + electron-builder (packaging)
- **Language**: English only (i18n removed in v1.8.2)

## Code Quality Standards

### TypeScript

- Use strict TypeScript configuration
- Avoid `any` type - use `unknown` or proper generics
- Prefer `type` over `interface` for object shapes (per project convention)
- Use explicit return types for exported functions
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`

### React

- Use functional components with hooks
- Prefer `useMemo` and `useCallback` for expensive computations
- Avoid inline functions in JSX when possible
- Use proper dependency arrays in hooks
- Follow React naming conventions (PascalCase for components)
- Use Arco Design components for consistent UI

### Error Handling

- Always handle Promise rejections
- Use try-catch for async/await
- Provide meaningful error messages
- Log errors using Pino structured logging (`import { logger } from '@/common/logger'`)

### Security

- Never commit secrets or API keys
- Validate all user inputs
- Sanitize data before rendering (XSS prevention)
- Use secure IPC communication patterns in Electron
- Use the bridge system (`@office-ai/platform`) for IPC, never raw `ipcMain`/`ipcRenderer`

### Performance

- Lazy load components when appropriate
- Avoid unnecessary re-renders
- Use proper memoization
- Consider bundle size when adding dependencies
- Use React Virtuoso for long message lists

## File Organization

```
src/
├── adapter/        # Platform adapters (browser, main)
├── agent/          # AI agent implementations (acp, codex, gemini)
├── channels/       # External messaging channels (telegram, lark)
├── common/         # Shared utilities, types, adapters
├── process/        # Main process code (bridges, services, database)
│   ├── bridge/     # IPC bridge definitions
│   ├── database/   # SQLite schema, migrations
│   └── services/   # Backend services
├── renderer/       # Renderer process code (React)
│   ├── assets/     # Static assets (logos, images)
│   ├── components/ # Reusable UI components
│   ├── context/    # React Context providers
│   ├── hooks/      # Custom React hooks
│   ├── pages/      # Page components
│   └── utils/      # Frontend utilities
├── webserver/      # WebUI server (Express + WebSocket)
│   ├── auth/       # Authentication (OIDC, JWT, RBAC)
│   └── routes/     # HTTP routes
└── worker/         # Background workers for AI agents
```

## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvement
- `test:` - Tests
- `chore:` - Maintenance tasks

**Note**: Project has a git hook that only accepts these commit types.

## Review Priorities

When reviewing code, prioritize in this order:

1. **Security** - Vulnerabilities, secrets exposure, injection attacks
2. **Correctness** - Logic errors, edge cases, data validation
3. **Performance** - Memory leaks, unnecessary computations
4. **Maintainability** - Code readability, proper abstractions
5. **Style** - Naming conventions, formatting (lowest priority)

## Language

- All user-facing strings must be hardcoded English (no i18n)
- Code comments should be in English
- Use clear and descriptive variable/function names
- Avoid abbreviations unless widely understood

## Web Mode vs Electron Mode

- Use `isWebMode()` from `src/renderer/utils/platform.ts` to detect environment
- Web mode: use `window.open()` for external links (not `shell.openExternal`)
- Web mode: use REST API `/api/branding` instead of IPC for pre-auth resources
- Both modes: ensure functionality works in Docker (headless Electron via Xvfb)
