---
name: release
description: 'Automate version bump, changelog generation, and tag-triggered release for AionUI'
---

# Release

Automate the AionUI release workflow: version bump, changelog generation, commit, tag, and push.

## Prerequisites

- git-cliff v2.12.0 (configured in `cliff.toml`)
- Baseline tag: `v1.8.2`
- Husky commit-msg hook enforces types: feat, fix, docs, style, refactor, test, chore, perf

## Workflow

### 1. Determine next version

If the user provides an explicit version (patch/minor/major keyword, or exact `X.Y.Z`), use that. Otherwise, run:

```bash
git cliff --bumped-version
```

Bump rules: `feat` -> minor, breaking change -> major, everything else -> patch.

### 2. Preview changes

```bash
git cliff --unreleased
```

Present the summary to the user. **Do not proceed without explicit confirmation.**

### 3. Update version in package.json

Edit the `version` field in the project root `package.json` to the new version (without `v` prefix).

### 4. Generate changelog

```bash
git cliff -o CHANGELOG.md
```

This regenerates the full changelog including the new version.

### 5. Commit

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
```

Do not add Claude signatures to the commit message (project convention).

### 6. Tag

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

Tag must match pattern `v[0-9]+.[0-9]+.[0-9]+` to trigger the release workflow.

### 7. Push

**Confirm with the user before pushing.**

```bash
git push && git push --tags
```

This triggers `.github/workflows/release.yml`, which generates release notes via `git cliff --latest --strip header`.
