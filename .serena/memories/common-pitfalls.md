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

### CSRF exclusions must be justified

Only exclude endpoints that are cookie-only or use one-time tokens: `/login`, `/logout`, `/api/auth/refresh`, `/api/auth/qr-login`.

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
