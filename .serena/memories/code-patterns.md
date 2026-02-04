# AionUI Code Patterns

## IPC Communication Pattern

**Pattern:** Type-safe message system via contextBridge

**Location:** `src/preload.ts`, `src/process/bridge/*`

```typescript
// Main process (src/process/bridge/*)
ipcMain.handle('channel-name', async (event, ...args) => {
  return result;
});

// Preload (src/preload.ts)
contextBridge.exposeInMainWorld('api', {
  methodName: (...args) => ipcRenderer.invoke('channel-name', ...args),
});

// Renderer (src/renderer/*)
const result = await window.api.methodName(...args);
```

**Why:** Secure isolation between main and renderer processes.

## Worker Process Pattern

**Pattern:** Dedicated worker processes for AI agents using node-pty

**Location:** `src/worker/gemini.ts`, `src/worker/codex.ts`, `src/worker/acp.ts`

- Workers spawn CLI tools in isolated processes via node-pty
- Structured message passing for results
- Prevents UI blocking from long-running AI operations

## Component Pattern

**Pattern:** Functional React components with Arco Design

**Rules:**

1. Functional components only (no class components)
2. Use Arco Design primitives (Button, Modal, Form, Input, etc.)
3. Hooks for state (useState, useEffect, useContext)
4. Custom hooks prefixed with `use*`
5. Event handlers prefixed with `on*`
6. Props interface named `${ComponentName}Props`

## Database Access Pattern

**Pattern:** better-sqlite3 synchronous API with schema versioning

**Location:** `src/process/database/`

```typescript
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);
```

Migrations in `src/process/database/migrations.ts`, version tracked by `CURRENT_DB_VERSION`.

## Service Pattern

**Pattern:** Singleton services in main process

```typescript
class MyService {
  private static instance: MyService;
  static getInstance(): MyService {
    if (!MyService.instance) MyService.instance = new MyService();
    return MyService.instance;
  }
}
```

Examples: CronService, McpService, WebSocketManager

## Provider List Curation Pattern

**Pattern:** Two separate provider lists, same curation approach

**Location:** `src/common/constants/providers.ts` (API Keys UI), `src/renderer/config/modelPlatforms.ts` (Add Model dialog)

- Active providers listed alphabetically
- Hidden providers commented out with notes for easy re-enablement
- `Custom` always last in MODEL_PLATFORMS (requires user-provided base URL)
- `COMMON_PROVIDERS` array controls "Common" section in API Keys UI
- Changes to one list don't automatically affect the other — curate independently

**Current active MODEL_PLATFORMS:** Anthropic, Gemini, Gemini (Vertex AI), OpenAI, OpenRouter, xAI, Custom

**Current active PROVIDER_INFO:** Common = Anthropic, Azure, Gemini, OpenAI; Other = Cohere, Groq, OpenRouter, Perplexity

## WebUI Auth Pattern

**Pattern:** JWT + refresh token with cookie transport

- Access token in `aionui-session` cookie (15min)
- Refresh token in `aionui-refresh` cookie (7d, path-scoped to `/api/auth/refresh`)
- CSRF token via `tiny-csrf` on state-changing requests
- Frontend uses `withCsrfToken()` helper for POST/PUT/DELETE/PATCH
