# Common Pitfalls

These are critical patterns that cause subtle bugs. Review before making changes in these areas.

## Pino Webpack Externalization

Pino has `"browser": "./browser.js"` in its package.json — a console.log shim with no transport/file/worker support. Webpack can resolve the browser build even with `target: 'electron-main'`. Pino and ALL transport deps (`pino-pretty`, `pino-roll`, `pino-syslog`, `thread-stream`, etc.) **must** remain in webpack `externals` and `electron-builder.yml` files list. Never bundle pino.

## Message.useMessage() Infinite Loop

Arco Design's `Message.useMessage()` creates a new reference each render. Putting it in `useCallback`/`useEffect` dependency arrays causes infinite re-render loops. Use static `Message.error()` / `Message.success()` for callbacks in dependency arrays.

## CSS Theme Selectors

`:root` matches `<html>` in both themes. Using `:root .class` for light-mode CSS breaks dark mode. Always use `[data-theme='light'] .class` for light-mode-specific rules.

## Express Route Ordering

Static routes like `/global/hidden` must be defined **before** parameterized routes like `/global/:id`, otherwise `:id` captures the literal string "hidden".

## Native Module Build Config

Native modules (better-sqlite3, node-pty, web-tree-sitter) must appear in all three places:

1. `forge.config.ts` — `rebuildConfig.onlyModules`
2. `electron-builder.yml` — `asarUnpack` section
3. Webpack config — `externals` array

## TOCTOU File System Races

Never `stat()` then `readFile()` or `existsSync()` then `readFileSync()`. Read first, check buffer size after. Use try/catch instead of existence checks. (CodeQL `js/file-system-race`)

## CSRF Token Handling

`tiny-csrf` only validates tokens from `req.body._csrf`, NOT from headers. DELETE requests need a JSON body with `_csrf` field.

## JSON Env Vars in Docker Compose

`GLOBAL_MODELS` and `GROUP_MAPPINGS_JSON` contain JSON arrays. Docker Compose's `${VAR:-default}` syntax breaks on JSON. Pass these via `env_file:` only.

## LanceDB API (v0.27+)

- `list_tables()` returns `ListTablesResponse` — must access `.tables` attribute
- `list_versions()` returns dicts now — use `v.get("version")` not `v.version`
- Embedding registry rejects `api_key` kwargs — set via `os.environ["OPENAI_API_KEY"]`

## css-loader v7

When setting `modules: { namedExport: false }`, you MUST also include `auto: true`. Without it, ALL `.css` files are treated as CSS Modules, breaking global CSS.
