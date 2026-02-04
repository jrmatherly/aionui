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

- **Dockerfile uses `ARG NODE_VERSION` / `ARG NPM_VERSION`** defaulting to `mise.lock` values (22.22.0 / 11.8.0)
- **`mise run docker:build`** auto-reads versions from `mise.lock` and passes them as build args — ensures Docker uses exact same tool versions as local dev
- **`docker-compose.yml`** accepts `NODE_VERSION` / `NPM_VERSION` env vars, defaulting to current mise.lock values
- **npm is upgraded** in the builder stage (`npm install -g npm@${NPM_VERSION}`) because Node 22 bundles npm 10.x but the project requires 11+
- **`.dockerignore`** explicitly excludes `mise.local.toml`, `mise.*.local.toml`, `mise.local.lock` but includes `mise.toml` and `mise.lock`
- When updating tool versions: update `mise.toml`, run `mise install`, then `mise lock` to refresh `mise.lock`, then `mise run docker:build` to rebuild with new versions

## docker-compose vs docker build Image Naming

- **docker-compose auto-names images** as `<project>-<service>` (e.g., `docker-aionui`) when using `build:` without `image:`
- **`docker build -t aionui:latest`** creates a DIFFERENT image that compose won't use
- **Always add `image: aionui:latest`** alongside `build:` in docker-compose.yml so both commands use the same tag
- **Symptom of mismatch**: Compose runs old code even after fresh `docker build` — check `docker images` for two different image names
