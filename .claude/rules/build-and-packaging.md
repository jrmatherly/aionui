---
paths:
  - 'deploy/**'
  - 'Dockerfile*'
  - 'electron-builder.yml'
  - 'forge.config.ts'
  - 'config/webpack/**'
  - '.github/workflows/**'
  - 'scripts/build*'
  - 'scripts/afterPack*'
---

# Build, Packaging & Deployment

> **Before working here:** Read `.serena/memories/docker-packaging-constraints.md` and run `mise run drift:memory:why docker`

## Native Modules

The following require special handling during build:

- `better-sqlite3` - Database
- `node-pty` - Terminal emulation (uses prebuilt binaries)
- `web-tree-sitter` - Code parsing (WASM, pinned to 0.25.10)

These must appear in all three places:

1. `forge.config.ts` — `rebuildConfig.onlyModules`
2. `electron-builder.yml` — `asarUnpack` section
3. Webpack config — `externals` array

## Pino Logging (Externalized)

Pino and all transport modules (`pino-pretty`, `pino-roll`, `pino-syslog`, `thread-stream`, etc.) are webpack externals. Pino's `"browser"` field points to a console.log wrapper — webpack would silently break file logging, transports, and worker threads. The renderer process correctly uses pino's browser build via its separate config.

## Webpack Filesystem Cache

Both main and renderer configs use `cache: { type: 'filesystem' }` stored in `.webpack-cache/` (gitignored). **Exception:** UnoCSS is incompatible with filesystem cache on the renderer config.

## CI Build Pipeline

The CI workflow (`build-and-release.yml`) uses a 3-job pipeline:

1. **quality** — TypeScript, ESLint, Prettier (skipped for PRs — `pr-checks.yml` runs same gate)
2. **compile** — Runs on CI runner with cached node_modules + webpack cache
3. **docker** — Uses `Dockerfile.package` (packaging only); includes provenance attestation + SBOM

Additional workflows: `pr-checks.yml`, `codeql.yml`, `dependency-review.yml`, `release.yml` (tag-triggered), `claude.yml` + `claude-code-review.yml`.

## Docker Deployment

- `Dockerfile` — Full multi-stage build (local dev, self-contained)
- `Dockerfile.package` — Packaging only (CI, pre-compiled artifacts)
- `docker-compose.yml` — Container orchestration with `https` profile for nginx

### HTTPS (Compose Profile)

```bash
mise run docker:up:https
```

Required env vars: `AIONUI_HTTPS=true`, `AIONUI_TRUST_PROXY=1`. See `deploy/docker/nginx.conf`.

## Branding Customization

AionUI supports white-label branding via `AIONUI_BRAND_NAME`.

| Layer            | Method                 | When Applied |
| ---------------- | ---------------------- | ------------ |
| HTML `<title>`   | BrandingInjectorPlugin | Build time   |
| React components | DefinePlugin           | Build time   |
| Server messages  | `getBrandName()`       | Runtime      |

**Must set before building** to avoid "flash of default brand": `mise run build:branded --brand "Name"`

Key files: `src/common/branding.ts`, `src/renderer/hooks/useBranding.ts`, `config/webpack/webpack.plugins.ts`
