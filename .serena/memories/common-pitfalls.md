# AionUI Common Pitfalls

## Build Issues

### Never require() native modules in renderer

Native modules (better-sqlite3, node-pty, tree-sitter) must be in main process, accessed via IPC. They are webpack externals and cannot be bundled.

### Native modules need both configs

Must be listed in:

1. `forge.config.ts` — `rebuildConfig.onlyModules`
2. `electron-builder.yml` — `asarUnpack` section
3. Webpack config — `externals` array

### asar cannot be disabled

`FuseV1Options.OnlyLoadAppFromAsar: true` in forge.config.ts means `asar: false` breaks the app. Use `asarUnpack` for files that need filesystem access.

### Hybrid build system

Docker/packaging requires **both** steps in sequence:

1. `electron-forge package` (webpack compilation)
2. `npx electron-builder --linux dir` (asar packaging, native module unpacking)

Using only Forge results in missing native modules.

## Circular Dependencies

### initStorage.ts ↔ utils.ts

Use lazy `require()` in utils.ts to break the cycle:

```typescript
export function needsHomePage() {
  const { getHomePage } = require('./initStorage');
  return getHomePage();
}
```

## Strings

### i18n was removed in v1.8.2

The project no longer uses i18n. All user-facing strings are hardcoded English. Do not import or reference `i18next`, `react-i18next`, `t()`, or any locale files.

## TypeScript

### Avoid 'any' type

TypeScript strict mode is enabled. Use proper interfaces and type guards. Exception: test files when testing error cases.

## Error Handling

### Never silent failures

Always log errors at minimum. No empty catch blocks.

## Security

### Never commit secrets

Use environment variables. `.env` files for local dev (gitignored).

Config files with secrets (gitignored):

- `deploy/docker/.env`
- `deploy/docker/global-models.json` (API keys)
- `deploy/docker/group-mappings.json` (EntraID group IDs)

### JSON env vars break docker-compose interpolation

`GLOBAL_MODELS` and `GROUP_MAPPINGS_JSON` contain JSON arrays. Docker Compose's `${VAR:-default}` syntax breaks on JSON. Pass these via `env_file:` only — do NOT add them to the `environment:` block in docker-compose.yml.

### CSRF exclusions must be justified

Only exclude endpoints that are cookie-only or use one-time tokens: `/login`, `/logout`, `/api/auth/refresh`, `/api/auth/qr-login`.

### Avoid TOCTOU file system race conditions (CodeQL js/file-system-race)

Never `stat()` then `readFile()` or `existsSync()` then `readFileSync()`. The file can change between check and use.

**Bad (TOCTOU race):**

```typescript
const stats = await fs.stat(path);
if (stats.size < limit) {
  const content = await fs.readFile(path, 'utf-8'); // File may have changed!
}
```

**Good (read-then-check):**

```typescript
const content = await fs.readFile(path, 'utf-8');
if (Buffer.byteLength(content, 'utf-8') < limit) {
  // Size check on data already in memory — no race
}
```

**Bad (existsSync + readFileSync):**

```typescript
if (existsSync(path)) {
  const data = readFileSync(path, 'utf-8'); // File may have been deleted!
}
```

**Good (try-catch):**

```typescript
try {
  const data = readFileSync(path, 'utf-8');
  // process data
} catch {
  // File doesn't exist or can't be read — handle gracefully
}
```

Fixed in `7a3cfdda` — CodeQL high severity alerts #54 and #55.

## Drift Detect

### Node version mismatch inside project directory

Drift Detect is installed globally under Node 25.x, but AionUI's `mise.toml` activates Node 24.x inside the project directory. Since Drift's `better-sqlite3` native module is compiled for Node 25, **running `drift` directly inside the project directory may fail** with a `NODE_MODULE_VERSION` mismatch.

**Fix:** Use `mise x node@25 -- drift <command>` to run Drift with the correct Node version.

### drift report is interactive, not broken

`drift report` launches interactive TTY selection menus. In non-interactive contexts (CI, pipes), use explicit flags: `drift report --format text --output report.txt`. Use `drift export` as an alternative.

## React

### Don't mutate state directly

Use spread operators or immutable patterns. React detects changes by reference equality.

## Performance

### Don't block the main process

Heavy computation goes in worker processes. Main process must stay responsive for UI events.

## Dependency Upgrade Gotchas

### css-loader v7 requires `auto: true` with `namedExport: false`

When setting `modules: { namedExport: false }` in css-loader v7, you MUST also include `auto: true`. Without it, css-loader treats ALL `.css` files as CSS Modules, hashing every class name and breaking global CSS (Arco Design, UnoCSS). The `auto: true` flag restricts CSS Modules to only `*.module.css` files.

### croner v10 requires `sloppyRanges: true`

croner v10 removed legacy cron expression support. Add `sloppyRanges: true` to all `new Cron()` calls for backward compatibility with existing cron expressions in the database.

### `mise run docker:build` must pass INSTALL\_\* args

The mise `docker:build` task reads `INSTALL_*` flags from `deploy/docker/.env` and passes them as `--build-arg`. Without this, all CLI install flags default to `false` in the Dockerfile and Node.js is stripped from the runtime container. This causes `spawn npx ENOENT` for any MCP stdio server using `npx`.

### Dockerfile must symlink both `npm` AND `npx`

When CLI tools are enabled, the Dockerfile symlinks `npm-cli.js` and `npx-cli.js` to `/usr/local/bin/`. Missing either breaks commands that depend on them (e.g., MCP servers using `npx -y package@latest`).

### `@vercel/webpack-asset-relocator-loader` must stay at 1.7.3

Upgrading breaks the Docker build pipeline. Renovate config disables updates for this package. See commit `9c21d784`.

### officeparser was unused

Listed as dependency but never imported. Removed Feb 2026. Renovate config disables updates for it.

## CSS / Theming

### `:root` matches ALL themes — use `[data-theme='light']`

Never use `:root .class` for light-mode-specific CSS. Since `data-theme` is set on `<html>`, and `:root` matches `<html>`, `:root .class` selectors apply in BOTH dark and light mode. Always use `[data-theme='light'] .class` for light-mode rules. This caused a 52-selector dark mode regression in Feb 2026.

### Inline SVG in CSS `url()` breaks webpack

Webpack's unplugin loader parses data URIs as modules. Use CSS-only techniques (gradients, `repeating-conic-gradient()`) or external files instead of inline SVG in `background-image`.

## Express

### Static routes must come before parameterized routes

Routes like `/global/hidden` must be defined BEFORE `/global/:id`, otherwise `:id` captures "hidden" as a parameter. Route ordering: `/api/models/global` → `/global/hidden` → `/global/:id` → `/global/:id/hide`.

## Arco Design

### `Message.useMessage()` creates new reference each render

Don't put `message` from `Message.useMessage()` in useCallback/useEffect dependencies — causes infinite re-render loops. Use static `Message.error()` / `Message.success()` for callbacks in dependency arrays.

## Data Mapping

### Snake_case vs camelCase across layers

`IGlobalModel` (DB entity) uses `base_url`, `api_key`; `IProvider` (frontend) uses `baseUrl`, `apiKey`. Always check interface definitions when mapping between layers.

## Database

### Use CURRENT_DB_VERSION for migrations

When adding a migration, bump `CURRENT_DB_VERSION` in `src/process/database/schema.ts`. Forgetting this means the migration never runs.

### DATABASE_URL format varies by driver

SQLAlchemy async: `postgresql+asyncpg://`, node-postgres: `postgresql://`. Don't mix.

## Webpack / Electron Packaging

### Pino must be externalized from webpack

Pino has `"browser": "./browser.js"` in package.json — a console.log shim with NO transport/file/worker support. Webpack can resolve the browser build even with `target: 'electron-main'`, silently breaking all logging. Fix: add pino + all transport deps to `externals` in `config/webpack/webpack.config.ts` AND to `files` in `electron-builder.yml`. See `docker-packaging-constraints.md`.

### Packages with browser field need verification

Any npm package with a `"browser"` field may have its Node.js code replaced by a browser shim in webpack. Check with `node -e "console.log(require('<pkg>/package.json').browser)"`. Known safe: `ws` (throws error), `mammoth`/`turndown` (object maps), `@opentelemetry/*` (object maps). Known dangerous: `pino` (string redirect).

### UnoCSS is incompatible with webpack filesystem cache

Do NOT enable `cache: { type: 'filesystem' }` on the renderer webpack config. UnoCSS generates utility classes by scanning source at build time. Webpack's cache skips re-scanning cached modules, producing incomplete CSS. See unocss/unocss#419. The main process config CAN use filesystem cache (no UnoCSS).

### Transport modules need require.resolve()

Pino transports run in worker threads via `thread-stream`. Workers use `require(target)` which can't resolve short module names from inside asar/webpack contexts. Always use `require.resolve('pino-roll')` etc. to convert to absolute paths.

## Branding

### Build-time vs runtime branding

Client-side branding (HTML title, React defaults) must be set at **build time** via `AIONUI_BRAND_NAME` env var. Setting it only at runtime causes a "flash of default brand" before React hydrates.

**Build-time** (webpack DefinePlugin + BrandingInjectorPlugin):

- HTML `<title>` tag
- `useBranding()` hook default value
- React component initial renders

**Runtime** (`getBrandName()` reads env):

- Telegram/Lark bot messages
- HTTP User-Agent headers
- Server startup banner

**Fix:** Always set `AIONUI_BRAND_NAME` before building:

```bash
mise run build:branded --brand "Enterprise AI"
# or
export AIONUI_BRAND_NAME="Enterprise AI" && npm run build
```

See `.serena/memories/branding-and-release-configuration.md` for full details.

## RAG / Knowledge Base

### RAG requires userId through the IPC chain

For RAG to work, `userId` must be passed through the entire message chain:

1. WebSocket adapter injects `__webUiUserId` into IPC params
2. `conversationBridge.ts` extracts and passes to `WorkerManage.getTaskByIdRollbackBuild()`
3. Agent managers receive `userId` in their options
4. `prepareMessageWithRAGContext()` uses userId to access per-user KB

**Fix:** Added `__webUiUserId` to `ISendMessageParams` interface in `ipcBridge.ts`.

### RAG failure should not block messages

The Auto-RAG pattern uses try-catch with graceful fallback:

```typescript
try {
  const ragResult = await prepareMessageWithRAGContext(...);
  if (ragResult.ragUsed) contentToSend = ragResult.content;
} catch {
  // Continue without RAG - don't block the message
}
```

### Auto-ingestion is fire-and-forget

Large file ingestion doesn't block message sending:

```typescript
void autoIngestFilesToKnowledgeBase(userId, files).catch((err) => {
  log.warn({ err }, 'Auto-ingest failed (non-fatal)');
});
```

### LanceDB requires OPENAI_API_KEY

The embedding registry uses OpenAI's `text-embedding-3-small`. Without `OPENAI_API_KEY`, ingestion fails silently. Document in `.env.example`.

### text-embedding-3-large has lower similarity scores

From MEMORY.md: Don't use `score_threshold=0.5` — typical relevant scores are 0.2-0.4. Use `score_threshold=0.2` for this model.

### Knowledge Base must be initialized on login

The KB should be created when the user logs in, not when they first ingest a document:

```typescript
// AuthService.postLoginInit()
const kbService = getKnowledgeBaseService();
await kbService.initialize(userId); // Idempotent, creates empty KB if needed
```

This ensures the KB is ready before any document interactions.

### Large files overflow context window

Files >40KB injected inline will overflow the context window. The ACP agent now skips large files:

```typescript
const LARGE_FILE_THRESHOLD = 40_000; // ~10K tokens
if (stats.size > LARGE_FILE_THRESHOLD) {
  log.info({ atPath }, 'Skipping large file (use Knowledge Base for RAG)');
  continue; // Skip inline injection
}
```

Large files should be auto-ingested to KB and queried via RAG instead.

### Binary files cannot be read as UTF-8

PDFs, DOCX, and other binary formats cannot be read with `fs.readFile(path, 'utf-8')`. Use:

1. **For ingestion**: `kbService.ingestFile()` with `--file` flag to Python
2. **Python extraction**: `extract_text_from_file()` in `ingest.py` uses pypdf

### Hybrid search requires FTS index (Added 2026-02-06)

Without `create_fts_index("text")`, hybrid search silently uses only vector search. FTS index must be created **after** table creation:

```python
table = db.create_table("knowledge", schema=DocumentChunk)
table.create_fts_index("text", language="English", stem=True, remove_stop_words=True)
```

### LanceDB API changes (v0.27+)

Three breaking changes in newer LanceDB:

1. **`table_names()` → `list_tables()`**: Deprecated method removed
2. **`list_tables()` returns `ListTablesResponse`**: NOT a list! Must access `.tables` attribute:

   ```python
   # Wrong - returns ListTablesResponse object
   if "knowledge" in db.list_tables():

   # Correct - access .tables attribute
   if "knowledge" in db.list_tables().tables:
   ```

3. **`list_versions()` returns dicts**: Was objects with `.version` attribute, now `v["version"]`

Handle version format compatibility:

```python
for v in table.list_versions():
    version = v.get("version") if isinstance(v, dict) else v.version
```

### LanceDB embedding registry rejects api_key kwargs

For security, LanceDB doesn't allow `get_registry().get("openai").create(api_key=key)`. Must set via environment:

```python
os.environ["OPENAI_API_KEY"] = api_key  # Required
os.environ["OPENAI_API_BASE"] = api_base  # Optional
embed_func = get_registry().get("openai").create(name=model)
```

### Vector dimension mismatch breaks ingestion

Once a table is created with a specific dimension (e.g., 1536), you cannot ingest vectors of different dimensions (e.g., 3072). Must clear KB and reinitialize with correct `EMBEDDING_DIMENSIONS`.

### pandas required for LanceDB DataFrame operations

LanceDB's `to_pandas()` requires pandas. Add to `skills/requirements.txt`:

```
pandas>=2.0.0
```
