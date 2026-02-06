# Changelog & Release Configuration

## Overview

AionUI uses **git-cliff** (v2.x) for automated changelog generation from conventional commits. Installed via mise, configured at project root in `cliff.toml`.

---

## Key Files

| File                            | Purpose                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `cliff.toml`                    | Git-cliff configuration (template, parsers, bump rules) |
| `mise.toml`                     | Tool definition (`git-cliff = "2"`) and changelog tasks |
| `package.json`                  | npm fallback scripts (`changelog`, `changelog:preview`) |
| `.husky/commit-msg`             | Commit format enforcement (8 types including `perf`)    |
| `.github/workflows/release.yml` | Tag-triggered GitHub Release workflow                   |
| `CHANGELOG.md`                  | Generated changelog (committed to repo)                 |

---

## Commit Types & Groups

The commit-msg hook enforces: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`

Git-cliff maps these to ordered groups (via HTML comment ordering):

| Order | Type     | Group Name    |
| ----- | -------- | ------------- |
| 0     | feat     | Features      |
| 1     | fix      | Bug Fixes     |
| 2     | perf     | Performance   |
| 3     | refactor | Refactor      |
| 4     | docs     | Documentation |
| 5     | test     | Testing       |
| 6     | style    | Styling       |
| 7     | chore    | Miscellaneous |

**Skipped commits**: `chore(deps)`, `chore(renovate)`, merge commits.

**Important**: Skip rules for `chore(deps)` and `chore(renovate)` MUST precede the `^chore` catch-all in `cliff.toml` commit_parsers (first-match-wins ordering).

---

## Commands

```bash
# Via mise (recommended)
mise run changelog             # Generate full CHANGELOG.md
mise run changelog:latest      # Latest release notes only
mise run changelog:unreleased  # Preview unreleased changes
mise run changelog:bump        # Show next SemVer version

# Via npm (fallback for contributors without mise)
npm run changelog              # Generate CHANGELOG.md
npm run changelog:preview      # Preview unreleased
```

---

## Release Workflow

The `.github/workflows/release.yml` is triggered by tag pushes matching `v[0-9]+.[0-9]+.[0-9]+`.

Steps:

1. Checkout with full history (`fetch-depth: 0`)
2. Install git-cliff via `jdx/mise-action@v3`
3. Generate release notes: `git cliff --latest --strip header`
4. Create GitHub Release via `softprops/action-gh-release@v2`

### Manual Release Process

```bash
NEW_VERSION=$(git cliff --bumped-version)
git cliff --tag "$NEW_VERSION" -o CHANGELOG.md
npm version "$NEW_VERSION" --no-git-tag-version
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore(release): $NEW_VERSION"
git tag "$NEW_VERSION"
git push origin main --tags
```

---

## Tag Pattern

- Format: `v<major>.<minor>.<patch>` (e.g., `v1.8.2`, `v2.0.0`)
- Baseline tag: `v1.8.2` (created 2026-02-05)
- Tag pattern in cliff.toml: `v[0-9].*`

## Bump Rules

- `feat` commits → bump minor
- `fix`, `perf`, `refactor`, etc. → bump patch
- Breaking changes (`feat!:` or `BREAKING CHANGE:` footer) → bump major

## GitHub Links

- cliff.toml links point to `jrmatherly/aionui` (this fork)
- Postprocessors auto-link `(#123)` references to GitHub issues

---

## Future Enhancements (Phase 3)

- `[remote.github]` section for PR metadata (author, PR number) in changelog
- Full automated release via `workflow_dispatch` (Option C from research)
- Breaking change `!` suffix enforcement in commit-msg hook
- npm devDependency for contributors without mise

## Claude Code `/release` Skill

The `/release` skill (`skills/release/SKILL.md`) automates the full release workflow interactively:

1. Determine next version (`git cliff --bumped-version` or user-specified)
2. Preview unreleased changes and get user confirmation
3. Update `version` in `package.json`
4. Regenerate `CHANGELOG.md` via `git cliff -o CHANGELOG.md`
5. Commit: `chore(release): vX.Y.Z` (no Claude signature)
6. Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
7. Push (with user confirmation): triggers `release.yml`

## Research Document

Full research and recommendations: `.scratchpad/git-cliff-research-and-recommendations.md`
