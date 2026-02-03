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

## i18n

### Never hardcode user-facing strings

ALL text must use `t('key.path')`. Supported: en-US, zh-CN, zh-TW, ja-JP, ko-KR.

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

## React

### Don't mutate state directly

Use spread operators or immutable patterns. React detects changes by reference equality.

## Performance

### Don't block the main process

Heavy computation goes in worker processes. Main process must stay responsive for UI events.

## Database

### Use CURRENT_DB_VERSION for migrations

When adding a migration, bump `CURRENT_DB_VERSION` in `src/process/database/schema.ts`. Forgetting this means the migration never runs.

### DATABASE_URL format varies by driver

SQLAlchemy async: `postgresql+asyncpg://`, node-postgres: `postgresql://`. Don't mix.
