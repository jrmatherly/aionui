# Docker & Packaging Constraints

## Hybrid Build System

AionUI uses a two-tool build pipeline:

1. **Electron Forge** — Webpack compilation + native module rebuild against Electron's Node ABI
2. **electron-builder** — Final packaging (asar archive, native module unpacking, afterPack hooks)

The canonical build script is `scripts/build-with-builder.js`. The Dockerfile replicates this flow.

## Asar Packaging

- `FuseV1Options.OnlyLoadAppFromAsar: true` in `forge.config.ts` — the app **must** load from an asar file; `asar: false` will break the app
- Native `.node` binaries cannot load from inside an asar archive — they must be in `app.asar.unpacked/`
- Multiple runtime files resolve paths via `app.getAppPath().replace('app.asar', 'app.asar.unpacked')`:
  - `src/worker/fork/ForkTask.ts` — worker process CWD
  - `src/process/bridge/fsBridge.ts` — builtin rules, skills, assistant resources
  - `src/process/initStorage.ts` — builtin assistant rule/skill initialization

## Adding New Files That Need Runtime Filesystem Access

Any new resource files (config templates, default mappings, etc.) that are read via `fs.readFile()` or `fs.readdir()` at runtime must be:

1. **Included in `electron-builder.yml` `files` list** — so they get into the asar
2. **Added to `electron-builder.yml` `asarUnpack`** — so they are extracted alongside the asar for filesystem access
3. **Not excluded by `.dockerignore`** — so Docker build context includes them

Currently unpacked resources: `rules/**/*`, `skills/**/*`, `assistant/**/*`, and several `node_modules/` with native binaries.

## Native Module Handling

- `electron-builder.yml` has `npmRebuild: false` — electron-builder does not rebuild native modules
- Forge's `rebuildConfig` handles native module rebuilding during `electron-forge package`
- `scripts/afterPack.js` handles cross-architecture rebuilds (only triggers when build arch ≠ target arch)
- **Do NOT set `CI=true`** during Docker builds — it causes `rebuildConfig.onlyModules: []` which skips all native module rebuilds

### Native modules in use

| Module           | Type           | Notes                                                |
| ---------------- | -------------- | ---------------------------------------------------- |
| `better-sqlite3` | Native (.node) | Database engine, must be in asarUnpack               |
| `node-pty`       | Native (.node) | Terminal emulation for agent processes               |
| `bcrypt-ts`      | Pure JS        | Password hashing — migrated from bcryptjs (Feb 2026) |

Note: `electron-builder.yml` includes `bcrypt/**/*` in `files` and `asarUnpack`. The project uses `bcrypt-ts` (pure JS). These entries are dead weight but harmless.

## Circular Dependency Warning

`src/process/initStorage.ts` ↔ `src/process/utils.ts` had a circular import that crashes production webpack bundles (`getHomePage is not a function`). Fixed with a lazy `require()` in `utils.ts`. When adding new modules that import from `initStorage` or `utils`, verify no new cycles are introduced.

## Docker-Specific Notes

- Xvfb is included but not strictly required — `src/process/configureChromium.ts` auto-detects missing `DISPLAY` and switches Electron to headless mode
- dbus and GPU errors in container logs are expected and harmless for WebUI mode
- The `rules/` directory does not exist in the repo; the "Could not find builtin rules directory" warning is expected

## mise Integration for Docker Builds

- **Dockerfile uses `ARG NODE_VERSION` / `ARG NPM_VERSION`** defaulting to `mise.lock` values (24.13.0 / 11.9.0)
- **`mise run docker:build`** auto-reads versions from `mise.lock` and passes them as build args — ensures Docker uses exact same tool versions as local dev
- **`docker-compose.yml`** accepts `NODE_VERSION` / `NPM_VERSION` env vars, defaulting to current mise.lock values
- **npm is upgraded** in the builder stage (`npm install -g npm@${NPM_VERSION}`) because Node 24 bundles npm 11.6.x but the project standardizes on 11.9+
- **`.dockerignore`** explicitly excludes `mise.local.toml`, `mise.*.local.toml`, `mise.local.lock` but includes `mise.toml` and `mise.lock`
- When updating tool versions: update `mise.toml`, run `mise install`, then `mise lock` to refresh `mise.lock`, then `mise run docker:build` to rebuild with new versions

## CLI Tools Runtime (npx / npm / node)

When `INSTALL_*` build args are `true`, the Dockerfile copies Node.js from the cli-installer stage and creates symlinks:

- `/usr/local/bin/node` — Node.js binary
- `/usr/local/bin/npm` → `../lib/node_modules/npm/bin/npm-cli.js`
- `/usr/local/bin/npx` → `../lib/node_modules/npm/bin/npx-cli.js`

**All three symlinks are required.** Without `npx`, MCP stdio servers configured with `command: "npx"` fail with `spawn npx ENOENT`.

**`mise run docker:build` reads `INSTALL_*` flags from `deploy/docker/.env`** and passes them as `--build-arg` flags. This matches `docker compose build` behavior. Without this, all `INSTALL_*` ARGs default to `false` in the Dockerfile, and Node.js is stripped from the runtime image.

## Pino Logging Externalization

Pino and all transport modules are **webpack externals** — they must NOT be webpack-bundled:

### Why

Pino's `package.json` has `"browser": "./browser.js"` which is a console.log wrapper with NO transport support. Even with `target: 'electron-main'`, webpack can resolve this browser field, silently replacing real pino with a shim that ignores all transports.

Additionally, pino transports run in worker threads via `thread-stream`. Workers do `require(target)` which can't resolve modules from inside a webpack bundle or asar archive.

### Externalized packages

All of these are in `config/webpack/webpack.config.ts` `externals` AND `electron-builder.yml` `files`:

| Core                                                                                                                                                                                                          | Transports                          | Transport deps                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pino, pino-std-serializers, thread-stream, real-require, sonic-boom, on-exit-leak-free, @pinojs/redact, safe-stable-stringify, atomic-sleep, process-warning, quick-format-unescaped, pino-abstract-transport | pino-pretty, pino-roll, pino-syslog | colorette, dateformat, fast-copy, fast-safe-stringify, help-me, joycon, minimist, pump, secure-json-parse, strip-json-comments, fast-json-parse, luxon, nopt, split2, through2, date-fns, readable-stream, end-of-stream, once, abbrev, wrappy, inherits, string_decoder, safe-buffer, util-deprecate |

### Transport resolution

`src/common/logger.ts` uses `require.resolve()` to convert transport names to absolute paths before passing to pino. This ensures worker threads can always load transports regardless of working directory or module resolution context.

### Renderer is separate

The renderer webpack config does NOT externalize pino — it correctly uses pino's browser build (`pino/browser.js`) for console-based logging in the browser context. The renderer logger is at `src/renderer/utils/logger.ts`.

## CI Build Pipeline (Dockerfile.package)

Two Dockerfiles exist:

| File                 | Purpose                                         | When to use                                |
| -------------------- | ----------------------------------------------- | ------------------------------------------ |
| `Dockerfile`         | Full build (npm ci + Forge + builder + runtime) | Local dev, self-contained builds           |
| `Dockerfile.package` | Packaging only (COPY pre-built + runtime)       | CI (pre-compiled by GitHub Actions runner) |

`Dockerfile.package` expects `out/linux-unpacked/` in the build context (pre-built by `electron-forge package` + `electron-builder --linux dir` in the CI compile step).

`Dockerfile.package.dockerignore` allows `out/` through (unlike root `.dockerignore` which excludes it).

### Supply Chain Attestation

The CI Docker build produces **provenance attestation** and **SBOM** (Software Bill of Materials) for every pushed image. This requires `attestations: write` and `id-token: write` permissions in `build-and-release.yml`. Verify attestations with:

```bash
docker buildx imagetools inspect --format "{{json .Provenance}}" ghcr.io/jrmatherly/aionui:latest
```

## Webpack Filesystem Cache

Both main and renderer webpack configs use `cache: { type: 'filesystem' }`:

- Cache stored in `.webpack-cache/` (gitignored)
- Separate directories: `.webpack-cache/main/` and `.webpack-cache/renderer/`
- `buildDependencies` tracks config files for automatic invalidation
- In Docker: mounted as BuildKit cache (`--mount=type=cache,target=/app/.webpack-cache`)
- In CI: persisted via `actions/cache` keyed on source hash

## docker-compose vs docker build Image Naming

- **docker-compose auto-names images** as `<project>-<service>` (e.g., `docker-aionui`) when using `build:` without `image:`
- **`docker build -t aionui:latest`** creates a DIFFERENT image that compose won't use
- **Always add `image: aionui:latest`** alongside `build:` in docker-compose.yml so both commands use the same tag
- **Symptom of mismatch**: Compose runs old code even after fresh `docker build` — check `docker images` for two different image names

## Deployment Configuration Files

| File                                        | Purpose                            | Git           |
| ------------------------------------------- | ---------------------------------- | ------------- |
| `deploy/docker/.env.example`                | Full env var documentation         | ✅ Committed  |
| `deploy/docker/.env`                        | Actual deployment config (secrets) | ❌ Gitignored |
| `deploy/docker/global-models-example.json`  | Example shared model configs       | ✅ Committed  |
| `deploy/docker/global-models.json`          | Actual model configs (API keys)    | ❌ Gitignored |
| `deploy/docker/group-mappings-example.json` | Example OIDC group mappings        | ✅ Committed  |
| `deploy/docker/group-mappings.json`         | Actual group mappings              | ❌ Gitignored |

**JSON env vars** (`GLOBAL_MODELS`, `GROUP_MAPPINGS_JSON`) are passed through via `env_file:` only — NOT in docker-compose `environment:` block. JSON breaks Compose's `${VAR:-default}` interpolation.
