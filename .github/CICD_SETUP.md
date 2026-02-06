# CI/CD Setup Guide

## Overview

AionUI uses a Docker-focused CI/CD pipeline via GitHub Actions. The primary deployment target is Docker containers (web mode via headless Electron + Xvfb), with native desktop builds available but disabled by default.

## Workflows (7 Active + 1 Archived)

### 1. `build-and-release.yml` — Docker Build & Release

- **Trigger**: Push to `main` (excluding docs/config), PR to `main`, or manual dispatch
- **Features**:
  - Code quality gate (TypeScript, ESLint, Prettier via mise)
  - Docker build for `linux/amd64`
  - Automatic push to GHCR on main branch pushes
  - Version tagging from `package.json`
- **Process**:
  1. Code quality checks (TypeScript, ESLint, Prettier)
  2. Extract tool versions from `mise.lock`
  3. Build Docker image with all CLI tools baked in
  4. Push to `ghcr.io/jrmatherly/aionui` (on main pushes only)

### 2. `pr-checks.yml` — Pull Request Validation

- **Trigger**: PRs opened/edited/synchronized against `main`
- **Features**:
  - Issue link enforcement (PRs must reference an issue)
  - Code quality checks (same as build workflow)
  - Automated PR summary with file stats

### 3. `codeql.yml` — Security Analysis

- **Trigger**: Push/PR to `main`, weekly schedule (Monday 8 AM ET)
- **Features**:
  - JavaScript/TypeScript analysis with `security-extended` queries
  - Free for public repositories

### 4. `release.yml` — Tag-Triggered Release

- **Trigger**: Push tag matching `v[0-9]+.[0-9]+.[0-9]+`
- **Features**:
  - Generates release notes via `git-cliff` (latest tag only)
  - Creates a GitHub Release with auto-generated notes
  - Permissions: `contents: write`
- **Process**:
  1. Checkout with full history (`fetch-depth: 0`)
  2. Install tools via mise
  3. Generate release notes with `git cliff --latest`
  4. Create GitHub Release via `softprops/action-gh-release@v2`

### 5. `claude-code-review.yml` — Claude Code PR Review

- **Trigger**: PRs opened/synchronized/ready_for_review/reopened
- **Features**:
  - Automated code review via Claude Code (`anthropics/claude-code-action@v1`)
  - Concurrency: one review per PR number (cancels in-progress reviews on new pushes)
  - Permissions: `contents: read`, `pull-requests: read`, `issues: read`, `id-token: write`

### 6. `claude.yml` — Claude Code Assistant

- **Trigger**: Issue comments containing `@claude`, PR review comments containing `@claude`, issues opened/assigned with `@claude`, PR reviews mentioning `@claude`
- **Features**:
  - Claude Code acts as an AI assistant on issues and PRs
  - Concurrency: per issue/PR number (does **not** cancel in-progress — allows queued work)
  - Permissions: `contents: read`, `pull-requests: read`, `issues: read`, `id-token: write`, `actions: read`

### 7. `dependency-review.yml` — Dependency Review

- **Trigger**: PRs to `main`
- **Features**:
  - Reviews dependency changes for vulnerabilities via `actions/dependency-review-action@v4`
  - Fails on `high` severity vulnerabilities
  - Denies `GPL-3.0` and `AGPL-3.0` licensed dependencies
  - Posts summary comment on PR
  - Permissions: `contents: read`, `pull-requests: write`
  - Timeout: 5 minutes

### Archived

#### `build-and-release.yml.disabled` — Native Desktop Build

The original multi-platform native Electron build workflow. Disabled in favor of Docker-only builds. Preserved for reference if native desktop distribution is needed in the future.

## Required GitHub Configuration

### Repository Secrets

Configure in **Settings → Secrets and variables → Actions**:

| Secret         | Required      | Description                   |
| -------------- | ------------- | ----------------------------- |
| `GITHUB_TOKEN` | Auto-provided | Used for GHCR push (built-in) |

> **Note**: The `GITHUB_TOKEN` is automatically provided by GitHub Actions with the permissions defined in the workflow. No manual PAT setup is needed for Docker builds.

### Optional: Native Desktop Signing (if re-enabling native builds)

These are only needed if the `.disabled` workflow is re-enabled:

| Secret              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `GH_TOKEN`          | PAT with `contents: write` for release creation |
| `APPLE_ID`          | Apple Developer account email                   |
| `APPLE_ID_PASSWORD` | App-specific password                           |
| `TEAM_ID`           | Apple Developer Team ID                         |
| `IDENTITY`          | Code signing certificate name                   |

## Tool Versions

Tool versions are managed via **mise-en-place** (`mise.toml` + `mise.lock`):

- **Node.js**: Locked in `mise.lock` (currently 24.x)
- **npm**: Locked in `mise.lock` (currently 11.x)

The CI workflow extracts these versions from `mise.lock` to ensure Docker builds use identical versions to development.

## Docker Build Details

### Image Registry

```
ghcr.io/jrmatherly/aionui
```

### Tags

| Tag      | Description                                                         |
| -------- | ------------------------------------------------------------------- |
| `latest` | Latest main branch build                                            |
| `2.0.0`  | Version from package.json (next release, 401+ commits since v1.8.2) |
| `<sha>`  | Git commit SHA                                                      |

### Build Arguments

| Arg            | Source      | Description                    |
| -------------- | ----------- | ------------------------------ |
| `NODE_VERSION` | `mise.lock` | Node.js version for base image |
| `NPM_VERSION`  | `mise.lock` | npm version installed in image |

### CLI Tools

All 8 CLI tools are baked into every image:

- Claude, Qwen, Codex, iFlow, Auggie, Copilot, QoderCLI, OpenCode

Use `DISABLE_CLI_*` environment variables at runtime to control availability (no rebuild needed).

## Version Management

Update the version in `package.json`, commit, and push to `main`. The workflow automatically:

1. Reads the version from `package.json`
2. Tags the Docker image with that version
3. Pushes to GHCR

### Semantic Versioning

- `patch`: Bug fixes (1.8.2 → 1.8.3)
- `minor`: New features (1.8.2 → 1.9.0)
- `major`: Breaking changes (1.8.2 → 2.0.0)

## Troubleshooting

### Common Issues

1. **Docker build timeout**
   - Default timeout: 30 minutes
   - Native module compilation (better-sqlite3, node-pty) can take ~10 min
   - Check if `npm ci` is hitting network issues

2. **GHCR push fails (403)**
   - Verify the `packages: write` permission is set in workflow
   - Check repository visibility (GHCR requires package to match repo visibility)

3. **mise-action cache miss**
   - Cache is keyed on `mise.lock` — version changes invalidate cache
   - First run after version bump will be slower

4. **TypeScript check fails in CI but not locally**
   - Run `npx tsc --noEmit` locally to reproduce
   - Check for platform-specific type differences

### Debugging

1. Check GitHub Actions logs (each step is expandable)
2. Use `workflow_dispatch` to trigger manual builds with `push_image: false` for dry runs
3. Compare `mise.lock` versions between local and CI

## Security

- **Dependency scanning**: Renovate for automated dependency updates (weekends)
- **Code scanning**: CodeQL weekly + on every push/PR
- **Vulnerability alerts**: Renovate creates immediate PRs for security advisories
- **Pinned packages**: `@vercel/webpack-asset-relocator-loader` at 1.7.3, `openid-client` at 5.x
