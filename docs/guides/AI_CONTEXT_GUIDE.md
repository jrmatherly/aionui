# AI Context Enhancement Guide

This guide documents how AionUI uses **Drift Detect** and **Serena** to provide AI assistants with deep codebase understanding.

## Overview

| Tool | Purpose | How It Works |
|------|---------|--------------|
| **Drift Detect** | Pattern analysis, institutional memory | Scans codebase for patterns, stores knowledge in Cortex memory |
| **Serena** | Symbolic code navigation, editing | Language server–powered symbol search, reference finding, refactoring |

Together they give AI assistants both the **why** (Drift Cortex) and the **where** (Serena symbols).

## Prerequisites

### Drift Detect

```bash
npm install -g driftdetect driftdetect-mcp
drift --version
```

### Serena

Serena is available as a [Claude Code plugin](https://github.com/oraios/serena) or standalone MCP server:

```bash
# Via Claude Code (recommended)
# Enable plugin: serena@claude-plugins-official

# Or standalone via pip/uv
pip install serena
```

## Project Configuration

### Drift

- **Config:** `.drift/config.json` (tracked — project settings and feature flags)
- **Approved patterns:** `.drift/patterns/approved/*.json` (tracked — team-shared golden standard)
- **Local state:** `.drift/manifest.json`, `.drift/source-of-truth.json` (gitignored — contain absolute paths, rebuilt by `drift init`)
- **Transient data:** `.drift/lake/`, `.drift/cache/`, `.drift/memory/`, etc. (gitignored — rebuilt locally)
- **Exclusions:** `.driftignore` (tracked — additional exclusions beyond `.gitignore`)
- **MCP:** `.mcp.json` (tracked — project-level MCP server config)

### Serena

- **Config:** `.serena/project.yml` (tracked)
- **Memories:** `.serena/memories/*.md` (tracked)
- **Global config:** `~/.serena/serena_config.yml`

## Quick Start for New Developers

### 1. Install Tools

```bash
npm install -g driftdetect driftdetect-mcp
```

### 2. Initialize Drift Locally

The repo already includes `.drift/config.json` and approved patterns. You need to
initialize the local directory structure and rebuild transient analysis data:

```bash
cd /path/to/aionui

# Recreate local directory structure (does NOT overwrite config or approved patterns)
drift init -y

# IMPORTANT: Restore the tracked config (drift init resets some settings)
git checkout .drift/config.json
```

**Why the restore?** `drift init -y` overwrites `config.json` with defaults, which resets:

| Setting | Default (after init) | Project Value | Why It Matters |
|---------|---------------------|---------------|----------------|
| `project.id` | New random UUID | `55d47f17-...` | Canonical project identifier |
| `initializedAt` | Current timestamp | `2026-02-03T21:06:03.603Z` | Original init date |
| `learning.autoApproveThreshold` | `0.95` | `0.85` | More permissive — approves patterns at 85%+ confidence |

All other settings (ignore patterns, CI config, performance, features) are also
restored to the team-defined values. Always restore after init to keep consistent settings.

If you don't have git available (or prefer manual), ensure these values in `.drift/config.json`:

```json
{
  "learning": {
    "autoApproveThreshold": 0.85
  }
}
```

### 3. Scan and Build Analysis Data

```bash
# Scan codebase for patterns (populates indexes, detects patterns)
drift scan

# Build deep analysis features
drift callgraph build
drift test-topology build
drift coupling build
drift error-handling build

# Scan environment variable access
drift env scan
```

### 4. Initialize Cortex Memory

```bash
drift memory init
```

If you get a `NODE_MODULE_VERSION` error:

```bash
# Rebuild better-sqlite3 in Drift's install directory
cd $(npm root -g)/driftdetect && npm rebuild better-sqlite3
# Return to project and retry
cd /path/to/aionui && drift memory init
```

See [Cortex Memory](#cortex-memory-system) below for adding institutional knowledge.

### 5. Verify

```bash
drift status         # Should show 379+ approved patterns and health score ≥84
drift memory status  # Should show 30+ memories, health 100/100
drift env secrets    # Should show 7 secret variables
drift boundaries check  # Should show 0 violations
```

### Summary: Complete Setup Sequence

```bash
# 1. Install
npm install -g driftdetect driftdetect-mcp

# 2. Initialize + restore config
cd /path/to/aionui
drift init -y
git checkout .drift/config.json

# 3. Scan + build
drift scan
drift callgraph build
drift test-topology build
drift coupling build
drift error-handling build
drift env scan

# 4. Memory
drift memory init

# 5. Verify
drift status
drift memory status
drift boundaries check
```

## MCP Integration

The project includes `.mcp.json` which configures Drift as an MCP server. AI tools that support MCP (Claude Code, Cursor, VS Code, Kiro) will automatically pick this up.

Serena is configured separately — either as a Claude Code plugin or in your global MCP config.

### Testing MCP Connection

In your AI tool, try these prompts:

- "What patterns does Drift see in this codebase?"
- "Use Serena to find the AuthService class"
- "Use Drift to explain why we use better-sqlite3"

## Development Workflows

### Adding a New Feature

1. **Get pre-task context:**

   ```bash
   drift memory why "feature area" --intent add_feature
   ```

2. **Find similar existing code:**
   Use `drift similar` (via MCP) with intent and description to find template code.
   AI agents: call `drift_context` with `intent: "add_feature"` and `focus: "area"`.

3. **Find relevant code with Serena:**
   Ask to find symbols, references, and file structure related to the feature.

4. **Generate code with combined context:**
   The AI uses Drift patterns for conventions and Serena for exact code locations.

5. **Validate before committing:**

   ```bash
   drift check                             # Pattern compliance
   drift gate --policy strict <files...>   # Quality gates on changed files
   drift boundaries check                  # Data access boundaries
   ```

### Fixing a Bug

1. **Check warnings:** `drift memory why "area" --intent fix_bug`
2. **Trace code:** Use Serena to follow the call chain.
3. **Analyze impact:** `drift callgraph reach src/path/to/file.ts` for affected functions.
4. **Check security impact:** `drift callgraph status --security` if touching auth code.
5. **Learn from the fix:** Add a Drift memory so the knowledge persists.

```bash
drift memory add tribal "Description of gotcha and fix" --topic "Area"
```

### Refactoring

1. **Understand structure:** Serena `get_symbols_overview` and `find_referencing_symbols`.
2. **Check patterns:** Drift patterns show established conventions.
3. **Analyze impact:** `drift callgraph impact <file>` for blast radius.
4. **Check coupling:** `drift coupling analyze <file>` for dependencies/dependents.
5. **Find dead code:** `drift coupling unused-exports` for removable exports.
6. **Execute:** Serena's `replace_symbol_body`, `rename_symbol` for safe changes.
7. **Verify:** `drift check` + `drift gate --policy strict` + Serena reference verification.

### Security Review

1. **Overview:** `drift callgraph status --security` — shows critical data access points.
2. **Trace sensitive data:** `drift callgraph reach <file>` with `--sensitive-only`.
3. **Inverse trace:** `drift callgraph inverse users.password_hash` — who can access credentials?
4. **Boundary check:** `drift boundaries check` — verify rules aren't violated.
5. **Env audit:** `drift env secrets` — review sensitive variable access.

### Code Review Preparation

```bash
drift check                                 # Pattern compliance
drift gate --policy strict <changed files>  # Quality gates
drift boundaries check                      # Data access boundaries
drift memory search "relevant area"         # Any known gotchas?
```

### MCP Navigation Guide (for AI Agents)

When using Drift via MCP tools, follow this decision tree:

| Task | Start With | Then |
|------|-----------|------|
| Code generation | `drift_context` | `drift_code_examples` → `drift_validate_change` |
| Quick lookup | `drift_signature`, `drift_callers`, `drift_type` | — |
| Understanding code | `drift_explain` | `drift_callers` → `drift_impact_analysis` |
| Security review | `drift_security_summary` | `drift_reachability` → `drift_env` |
| Refactoring | `drift_impact_analysis` | `drift_coupling` → `drift_test_topology` |
| Find similar code | `drift_similar` | `drift_code_examples` |
| Test work | `drift_test_topology` | `drift_test_template` |

Always start with `drift_context` for code generation tasks — it synthesizes
patterns, examples, and conventions in one call.

## Cortex Memory System

Drift's Cortex stores institutional knowledge that AI assistants retrieve contextually.

### Memory Types

| Type | Half-Life | Use For |
|------|-----------|---------|
| `tribal` | 365 days | Team conventions, gotchas, "everyone knows this" |
| `procedural` | 180 days | How-to guides, step-by-step processes |
| `pattern_rationale` | 180 days | Why a pattern exists |
| `decision_context` | 180 days | Why an architectural choice was made |
| `code_smell` | 90 days | Anti-patterns to avoid |
| `constraint_override` | 90 days | Approved exceptions to rules |

### Adding Knowledge

```bash
# Convention everyone should know
drift memory add tribal "Always use i18n keys via t() for user-facing strings" --topic "i18n"

# Why something is the way it is
drift memory add pattern_rationale "We use Express for WebUI because..." --topic "WebUI"

# Step-by-step process
drift memory add procedural "Adding new IPC handler: 1) Add in bridge/ 2) Register..." --topic "IPC"

# Thing to avoid
drift memory add code_smell "Never require() native modules in renderer" --topic "Build"

# Approved exception
drift memory add constraint_override "Test files can use 'any' type" --topic "Testing"

# Why a decision was made
drift memory add decision_context "Chose Arco Design for enterprise aesthetic" --topic "UI"
```

### Querying Knowledge

```bash
drift memory search "authentication"
drift memory list --type tribal
drift memory status
drift memory health
```

## Serena Memories

Serena stores detailed documentation in `.serena/memories/`:

| Memory | Contents |
|--------|----------|
| `project-architecture.md` | Multi-process architecture and services |
| `branding-and-release-configuration.md` | Branding customization |
| `i18n-configuration.md` | i18n setup and workflow |
| `docker-packaging-constraints.md` | Build system and native modules |
| `auth-system.md` | Multi-user authentication and RBAC |
| `code-patterns.md` | IPC, worker, component, database patterns |
| `common-pitfalls.md` | Known anti-patterns and gotchas |
| `drift-integration.md` | Drift Detect integration, MCP tools, boundary rules |

To add a new memory, create a markdown file in `.serena/memories/` and commit it.

### Pre-Task Context Retrieval

Before working on a feature area, use `drift memory why` to surface relevant knowledge:

```bash
# Get context for a feature area
drift memory why "authentication" --intent add_feature

# Security audit context
drift memory why "token handling" --intent security_audit

# Bug fix context
drift memory why "OIDC login" --intent fix_bug
```

This retrieves relevant tribal knowledge, pattern rationale, and decision context
specific to the area you're about to work on — surfacing gotchas before you hit them.

## Environment Variable Analysis

Drift tracks all environment variable access across the codebase, classifying them
by sensitivity (secret, credential, config).

### Current State

- **52 variables** discovered across 539 files
- **7 secrets** tracked: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
  `ANTHROPIC_API_KEY`, `OIDC_CLIENT_SECRET`, `JWT_SECRET`, `CSRF_SECRET`

### Commands

```bash
drift env scan           # Rescan after adding new env vars
drift env secrets        # List all sensitive variables
drift env required       # Variables without defaults (will crash if missing)
drift env var JWT_SECRET # Details for a specific variable
drift env file src/webserver/auth/config/oidcConfig.ts  # What env vars a file accesses
```

### When to Use

- **Adding new env vars** — Run `drift env scan` afterward to keep the index current
- **Security review** — `drift env secrets` shows all sensitive access points
- **Maintaining `.env.example`** — `drift env required` identifies what must be set

## Constants Analysis

Drift includes a constants analysis feature for detecting hardcoded secrets, magic
numbers, dead constants, and inconsistent values across the codebase.

### Current Status (v0.9.48)

**Not functional.** All subcommands return "No constant data discovered yet" even
after running `drift scan`. The `.drift/constants/` directory is never created.
This has been confirmed across all subcommands:

```bash
drift constants              # Overview — not populating
drift constants list         # List all — not populating
drift constants secrets      # Hardcoded secrets — not populating
drift constants dead         # Unused constants — not populating
drift constants inconsistent # Value mismatches — not populating
```

### Working Alternatives

| Constants Feature | Working Alternative |
|------------------|-------------------|
| Hardcoded secrets | `drift env secrets` — tracks 7 sensitive env vars |
| Unused constants | `drift coupling unused-exports` — finds ~20 unused exports |
| Inconsistent values | Manual review; ESLint no-magic-numbers rule |

### Commands (For Future Use)

When constants analysis becomes functional in a newer Drift version:

```bash
drift constants              # Overview with categorized counts
drift constants secrets      # Find hardcoded API keys, passwords
drift constants dead         # Find unused exported constants
drift constants inconsistent # Find same-name constants with different values
drift constants list --category api  # Filter by category
drift constants get <name>   # Detailed info with usages
```

The MCP tool `drift_constants` provides the same functionality for AI agents.

## Data Boundaries

Data boundary rules enforce which code paths can access sensitive database fields.
Rules are defined in `.drift/boundaries/rules.json`.

### Configured Rules

| Rule | Severity | What It Protects |
|------|----------|------------------|
| `credentials-access` | error | `users.password_hash` — only from `webserver/auth/**` and `process/database/**` |
| `token-access` | error | `refresh_tokens`, `token_blacklist` tables — only from auth services |
| `jwks-access` | error | `jwks` table (private keys) — only from auth services |
| `user-pii-access` | warning | `users.email`, `display_name`, `avatar_url`, `oidc_subject` — auth, routes, renderer |

### Commands

```bash
drift boundaries check    # Verify no violations (run in CI)
drift boundaries          # Overview of data access patterns
drift boundaries sensitive # All sensitive field access points
```

### Adding Rules

Edit `.drift/boundaries/rules.json` to add new boundaries when new tables or
sensitive fields are introduced. Follow the existing pattern:

```json
{
  "id": "new-rule-id",
  "description": "Human-readable description",
  "fields": ["table.field"],
  "allowedPaths": ["**/allowed/path/**"],
  "excludePaths": ["**/*.test.ts", "**/tests/**"],
  "severity": "error",
  "enabled": true
}
```

## API Contracts

Drift can detect API contracts — the implicit agreement between frontend code that
calls an API and backend code that serves it. It matches fetch/axios calls to Express
routes and verifies response shape compatibility.

### Current Status (v0.9.48)

**Not functional.** Config has `"contracts": true` and `.drift/contracts/` directory
structure exists (`discovered/`, `verified/`, `mismatch/` subdirectories) but all
are empty despite AionUI having matching frontend↔backend pairs:

**Frontend (renderer) — 8 files with fetch() calls:**
- `AuthContext.tsx`, `UserManagement.tsx`, `GroupMappings.tsx`, `ProfilePage.tsx`,
  `login/index.tsx`, `DirectorySelectionModal.tsx`, `PreviewPanel.tsx`,
  `MessageToolGroup.tsx`

**Backend (webserver) — 5 route files:**
- `apiRoutes.ts`, `authRoutes.ts`, `adminRoutes.ts`, `staticRoutes.ts`, `setup.ts`

The native analyzer doesn't recognize standard Express route registration or
`fetch()` patterns in AionUI's codebase.

### What It Would Detect (When Working)

Contracts would catch mismatches like:
- Frontend expects `{ user: { name } }` but backend returns `{ data: user }`
- Renamed endpoints that frontend hasn't been updated to match
- Response shape changes that break frontend parsing

### Configuration (Ready for When Contracts Work)

Custom patterns can be added to `.drift/config.json` for non-standard API clients:

```json
{
  "contracts": {
    "frontendPatterns": [
      {
        "name": "customClient",
        "pattern": "myApi\\.(get|post|put|delete)\\(['\"]([^'\"]+)['\"]",
        "methodGroup": 1,
        "pathGroup": 2
      }
    ],
    "ignorePaths": ["/api/health", "/api/metrics"],
    "responseEnvelope": {
      "dataKey": "data",
      "errorKey": "error"
    }
  }
}
```

### Workaround

Until contract detection works:
- Use TypeScript interfaces shared between renderer and webserver
- Serena `find_referencing_symbols` to trace from route handler to consumer
- Manual code review of API response shapes

## DNA Mutations

Drift DNA tracks styling and structural consistency across 10 "genes" — 6 frontend
and 4 backend. Mutations are deviations from the dominant patterns in the codebase.

### Current State

- **Health Score:** 73/100
- **Genetic Diversity:** 0.38
- **39 mutations** (1 high, 31 medium, 7 low)
- **Framework detected:** css-modules
- **Files analyzed:** 315

### DNA Gene Profile

| Gene | Detected Pattern | Confidence | Exemplar Files |
|------|-----------------|------------|----------------|
| Responsive Approach | CSS Media Queries | 100% | `CssThemeSettings/presets.ts` |
| State Styling | CSS Pseudo Classes | 100% | `CssThemeSettings/presets.ts` |
| Spacing Philosophy | Hardcoded values | 100% | (scattered — no token/scale system) |
| API Response Format | Success/Data Envelope | 88% | `DataScopeMiddleware.ts`, `RoleMiddleware.ts`, `adminRoutes.ts`, `authRoutes.ts` |
| Configuration Pattern | Settings/Config Class | 79% | `AcpConnection.ts`, `AcpDetector.ts` (65 files) |
| Error Response Format | Generic Try-Catch | 72% | (various) |
| Logging Format | Logger with Levels | 67% | (various) |
| Theming | CSS Variables | 60% | `presets.ts`, `useInputFocusRing.ts`, `colors.ts` |
| Animation Approach | CSS Animations | 50% | (keyframes-based) |
| Variant Handling | Not established | 0% | (no dominant pattern) |

### Key Mutations

**High impact (actionable):**
- `src/webserver/directoryApi.ts:271` — `res.json(shortcuts)` uses `direct-return`
  instead of `{ success: true, data: shortcuts }` envelope pattern. This is the only
  endpoint that skips the envelope.

**Medium impact (contextual — mostly not actionable):**
- 12 config-pattern mutations in agent backends (`src/agent/`) — these naturally use
  `env-variables-direct` and `config-file-yaml-json` instead of `settings-class`
  because each agent (Claude, Gemini, Codex) has its own config format. These are
  inherent to the multi-agent architecture, not code quality issues.
- 6 API response mutations in `directoryApi.ts` — error responses use
  `error-message-envelope` vs the dominant `success-data-envelope` format.

### Commands

```bash
drift dna status                    # Overall DNA profile with all 10 genes
drift dna mutations                 # List all style inconsistencies
drift dna mutations --gene <gene>   # Filter mutations by gene
drift dna mutations --impact high   # Filter by impact level
drift dna mutations --suggest       # Include resolution suggestions
drift dna gene <gene-id> --examples # Detailed gene analysis with code examples
drift dna playbook                  # Generate STYLING-PLAYBOOK.md (gitignored)
drift dna playbook --stdout         # Output playbook to stdout
drift dna export --format ai-context --compact  # AI-optimized DNA summary
```

### Gene IDs for `drift dna gene`

Use these exact IDs: `variant-handling`, `responsive-approach`, `state-styling`,
`theming`, `spacing-philosophy`, `animation-approach`, `api-response-format`,
`error-response-format`, `logging-format`, `config-pattern`.

### Interpretation Guide

Mutations don't necessarily need fixing. Consider context:

- **Core app code** (webserver, renderer) — mutations indicate real inconsistency, fix them
- **Agent backends** (`src/agent/`) — config pattern mutations are expected (each agent
  wraps a different CLI tool with its own conventions)
- **Skill scripts** — Python/shell scripts naturally don't follow TypeScript patterns
- **Generated files** — Ignore mutations in auto-generated code

## Coupling Analysis

Drift analyzes module dependencies for circular dependencies, highly coupled modules,
and dead code.

### Current State

- **0 dependency cycles** — no circular imports
- **0 coupling hotspots** — no over-coupled modules
- **~20 unused exports** — mostly from skill scripts (Python), not actionable

### Commands

```bash
drift coupling build           # Build coupling graph
drift coupling cycles          # Find circular dependencies
drift coupling hotspots        # Over-coupled modules
drift coupling unused-exports  # Dead exported code
drift coupling analyze <file>  # Module's afferent/efferent coupling
drift coupling refactor-impact <file>  # Blast radius for refactoring
```

### When to Use

- **Before refactoring** — Run `drift coupling refactor-impact <file>` to see what breaks
- **After adding imports** — Check `drift coupling cycles` to catch new circular deps
- **Code cleanup** — `drift coupling unused-exports` finds dead code to remove

## Wrappers Detection

Drift can detect framework wrapper patterns — custom abstractions built on top of
framework primitives (React hooks, Express middleware, database clients). Wrappers
are clustered by similarity and categorized.

### Current Status (v0.9.48)

**Not functional** for AionUI. `drift wrappers` reports:
- 539 files scanned, 0 functions found, 0 wrappers detected, 0 clusters

This was tested with lowered thresholds (`--min-confidence 0.3 --min-cluster-size 1`)
and still returned 0 results. The native analyzer doesn't currently detect
React/Express patterns in AionUI's codebase structure.

### What It Would Detect (When Working)

| Category | AionUI Examples |
|----------|----------------|
| `state-management` | Custom React hooks in `src/renderer/hooks/` |
| `middleware` | Auth middleware in `src/webserver/auth/middleware/` |
| `data-access` | SQLite database helpers in `src/process/database/` |
| `authentication` | Auth context and session hooks |

### Commands (For Future Use)

```bash
drift wrappers                          # Scan for framework wrappers
drift wrappers --category middleware    # Filter by category
drift wrappers --min-confidence 0.5    # Minimum cluster confidence
drift wrappers --verbose               # Detailed output with usage counts
drift wrappers --json                  # Machine-readable output
```

### Workaround

Until wrapper detection works, use these alternatives:
- `drift callgraph callers <function>` — trace usage chains manually
- Serena `find_referencing_symbols` — find all callers of a hook/middleware
- `drift export --format ai-context --categories structural` — structural patterns
  capture some wrapper-like conventions

## Audit System

Drift's audit system provides a higher-level view of pattern health including
duplicate detection and false positive identification.

### Current State

- **Audit score:** 92/100
- **36 duplicate groups** detected (overlapping detectors, not actionable in v0.9.48)
- **9 likely false positives** identified
- **61 auto-approve eligible** (all already approved)

### Commands

```bash
drift audit                # Full audit with duplicates and FP detection
drift audit --review       # Detailed review report
drift approve --auto       # Auto-approve high-confidence patterns
```

## When to Use Which Tool

| Task | Drift | Serena |
|------|-------|--------|
| "Why does this pattern exist?" | ✅ `drift memory search` | |
| "Where is this function called?" | | ✅ `find_referencing_symbols` |
| "Show me similar code" | ✅ `drift similar` | |
| "Rename this function everywhere" | | ✅ `rename_symbol` |
| "What are our team conventions?" | ✅ `drift memory list` | |
| "What's in this file?" | | ✅ `get_symbols_overview` |
| "Check code against patterns" | ✅ `drift check` | |
| "Modify a function body" | | ✅ `replace_symbol_body` |
| "What env vars does this use?" | ✅ `drift env file` | |
| "Who accesses sensitive data?" | ✅ `drift boundaries sensitive` | |
| "Get context before a task" | ✅ `drift memory why` | |
| "Find style inconsistencies" | ✅ `drift dna mutations` | |
| "Show me how we build APIs" | ✅ `drift dna gene api-response-format --examples` | |
| "Get code snippets for a pattern" | ✅ `drift_code_examples` (MCP) | |
| "Find where a pattern is used" | ✅ `drift where <pattern>` | |
| "Trace a hook's usage chain" | ✅ `drift callgraph callers` | ✅ `find_referencing_symbols` |
| "Get AI-optimized codebase context" | ✅ `drift dna export --format ai-context` | |

## Maintenance

### After Significant Code Changes

```bash
drift scan --incremental   # Update pattern index (fast, changed files only)
drift scan                 # Full rescan (after major refactoring)
drift check                # Verify no violations
drift env scan             # Update env var index if new vars added
drift boundaries check     # Verify data access boundaries
```

### Weekly Review

```bash
drift memory health                        # Check memory system
drift patterns list --status discovered    # Review new patterns
drift memory validate --scope stale        # Find stale memories
drift env scan                             # Refresh env var index
drift boundaries check                     # Verify data boundaries
drift dna mutations                        # Check for new style drift
drift dna mutations --impact high          # Focus on actionable high-impact mutations
drift audit                                # Pattern health, duplicates, FPs
drift coupling cycles                      # Check for circular dependencies
drift error-handling gaps                  # Find missing error handling
drift dna playbook --force                 # Regenerate style playbook if needed
```

### Learning from Experience

When you fix a bug or discover a gotcha:

```bash
drift memory add tribal "What I learned" --topic "Area"
```

When an architectural decision is made, update both:

1. Drift: `drift memory add decision_context "..." --topic "..."`
2. Serena: Edit or create `.serena/memories/relevant-topic.md`

## Test Topology

Drift includes a **test topology** feature that maps tests to source code, enabling
intelligent test selection ("which tests should I run when I change this file?").

### Current Status

AionUI has 3 unit test files using Jest 30:

| Test File | Coverage Area |
|-----------|--------------|
| `tests/unit/test_version_info.ts` | `VersionInfo` model — semver comparison, serialization |
| `tests/unit/test_claude_yolo_mode.ts` | ACP YOLO mode — session permission bypass |
| `tests/unit/test_custom_acp_agent.ts` | Custom ACP agent — config, spawn, validation |

Jest configuration is in `jest.config.js` with `ts-jest` transform, path aliases matching
webpack config, and `tests/jest.setup.ts` for Electron API mocks.

**Known issue:** `drift test-topology build` currently reports 0 test files despite the
`tests/**/*.ts` pattern in `.drift/config.json`. The test files use a `test_*.ts` naming
convention (Python-style) rather than the more common `*.test.ts` / `*.spec.ts` (JS convention).
Drift may require filename convention matching in addition to glob patterns. This is being
tracked for resolution in a future Drift version or config adjustment.

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
npm run test:contract    # Contract tests only
npm run test:integration # Integration tests only
```

### Future: CI Integration with Test Topology

Once the detection issue is resolved, test topology enables:

1. **Smart test selection in PRs** — Only run tests affected by changed files
2. **Uncovered code detection** — `drift test-topology uncovered --min-risk high`
3. **Mock analysis** — Identify over-mocked tests that don't actually validate behavior

Example CI workflow (for future use):

```bash
# Get changed files from PR
FILES=$(git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx)$' | tr '\n' ' ')

# Get minimum test set
TESTS=$(drift test-topology affected $FILES --format json | jq -r '.result.tests[].file' | sort -u)

# Run only affected tests
npx jest $TESTS
```

### Expanding Test Coverage

When adding new tests, follow the existing convention:

- Place in `tests/unit/` for unit tests
- Name as `test_<subject>.ts` (current convention) or `<subject>.test.ts`
- Import from `@jest/globals` for type-safe assertions
- Mock Electron APIs via the shared `jest.setup.ts`

As the test suite grows, periodically rebuild topology:

```bash
drift test-topology build
drift test-topology status
```

## CI Integration

Drift can be added to GitHub Actions PR checks for automated pattern drift detection.
A complete example workflow is available in `.scratchpad/ci-examples/drift-pattern-check.yml`.

### Integration Options

**Option A: Standalone workflow** — Copy `.scratchpad/ci-examples/drift-pattern-check.yml`
to `.github/workflows/` as a separate workflow file.

**Option B: Add to existing PR checks** — Add a `drift-check` job to the existing
`.github/workflows/pr-checks.yml` alongside `code-quality` and other jobs.

### Job Template (for `pr-checks.yml`)

```yaml
drift-check:
  name: Pattern Drift
  runs-on: ubuntu-latest
  timeout-minutes: 5
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: "22"

    - name: Cache Drift data
      uses: actions/cache@v4
      with:
        path: .drift
        key: drift-${{ runner.os }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
        restore-keys: drift-${{ runner.os }}-

    - name: Install Drift
      run: npm install -g driftdetect

    - name: Scan and Gate
      run: |
        drift init --yes
        git checkout .drift/config.json
        drift scan --incremental
        drift gate --ci --format github --fail-on error
        drift boundaries check
```

### Important: Config Restore After Init

The `drift init --yes` step is required in CI to rebuild local analysis structures.
However, it resets `.drift/config.json` to defaults, overwriting our custom settings
(autoApproveThreshold: 0.85, project ID, feature flags, boundaries config, MCP
settings). The `git checkout .drift/config.json` step restores the tracked config.

### Output Formats

| Format | Flag | Use Case |
|--------|------|----------|
| GitHub Annotations | `--format github` | Inline PR annotations on changed lines |
| SARIF | `--format sarif` | Upload to GitHub Code Scanning via `codeql-action/upload-sarif` |
| JSON | `--format json` | Raw data for custom processing or dashboards |
| GitLab Code Quality | `--format gitlab` | GitLab merge request code quality reports |

### Scan Strategy

| Trigger | Scan Type | Rationale |
|---------|-----------|-----------|
| Pull request | `drift scan --incremental` | Fast — only changed files since last scan |
| Push to main | `drift scan --force` | Full rescan to update baseline patterns |

### Performance

- **Cache `.drift/`** across CI runs for 10-50x speedup on incremental scans
- **Cache key** uses source file hashes to invalidate when code changes
- **Timeout**: 5 minutes is sufficient for AionUI's 539 scanned files
- **`fetch-depth: 0`** gives Drift full git history for better change detection

### What CI Checks Catch

- Pattern violations (code that doesn't follow established conventions)
- Quality gate failures (configurable via `--fail-on error` or `--fail-on warning`)
- Data boundary violations (`drift boundaries check` — e.g., accessing `password_hash`
  outside auth modules)

### What CI Won't Catch (v0.9.48)

- Constants issues (feature not populating data)
- Contract mismatches (Express/fetch not recognized)
- Wrapper inconsistencies (native analyzer gaps)
- Custom constraint violations (JSON format TypeError)

## Code Examples

Drift provides real code snippets from the codebase that demonstrate how patterns
are implemented. This is particularly useful before writing new code — it shows
how the team actually implements patterns rather than relying on generic examples.

### MCP Tool: `drift_code_examples`

AI agents use this to get pattern-specific code snippets:

```typescript
drift_code_examples({
  categories: ["api", "auth"],     // Filter by pattern categories
  pattern: "api-rest-controller",  // Or a specific pattern ID
  maxExamples: 3,                  // Examples per pattern (2-3 is usually enough)
  contextLines: 10                 // Lines of surrounding context
})
```

**Best practice for AI agents:**
1. Start with `drift_context` to get relevant pattern IDs for your task
2. Then use `drift_code_examples` with those pattern IDs for detailed snippets
3. Use category filtering — don't request all categories (wastes tokens)

### CLI Equivalents

```bash
# Find locations of a specific pattern
drift where "Try/Catch" --category errors --limit 5

# Export all patterns with snippets (large output — use filters)
drift export --format ai-context --categories api,auth --snippets

# Export compact version for AI context
drift dna export --format ai-context --compact
```

### Validated CLI Behavior

- `drift where <pattern>` requires exact or partial name match — it searches by
  pattern name, not free-text description
- `drift export --format ai-context --snippets` generates ~30K tokens for the full
  codebase — always filter by `--categories` to stay within token budgets
- `drift export --format ai-context --categories api` with a single category filter
  may return 0 patterns if the category has no snippet-eligible matches; use broader
  categories or omit the flag

## Features Not Available or Not Applicable (v0.9.48)

These Drift features have been tested and validated against the AionUI codebase.
Each was confirmed non-functional or not applicable as described below.

| Feature | Status | Validation Details |
|---------|--------|-------------------|
| **Constants Analysis** | Not populating | All subcommands (`drift constants`, `list`, `secrets`, `dead`, `inconsistent`) return "No constant data discovered yet" even after `drift scan`. No `.drift/constants/` directory is created. The MCP tool `drift_constants` is also non-functional. Note: `drift env secrets` provides partial overlap (detects sensitive env var access). |
| **Contract Detection** | 0 contracts found | Config has `"contracts": true` and `.drift/contracts/` subdirectories exist (`discovered/`, `verified/`, `mismatch/`) but are all empty. AionUI has real fetch() → Express route pairs (8 renderer files with fetch, 5 webserver route files) that should match but don't. The native analyzer doesn't recognize these patterns. |
| **Wrappers Detection** | 0 wrappers found | `drift wrappers` reports "539 files scanned, 0 functions found" even with `--min-confidence 0.3 --min-cluster-size 1`. The native analyzer doesn't detect React hooks or Express middleware as framework wrappers despite AionUI using custom hooks and middleware extensively. |
| **Custom Constraints** | TypeError on load | Custom JSON files in `.drift/constraints/custom/` cause `TypeError: data.constraints is not iterable`. Only built-in constraints work. `drift constraints extract` also finds 0 constraints (needs more code pattern repetition). |
| **Package Context** | N/A (by design) | AionUI is a single-package project. `drift context --list` correctly detects 1 package (root). This feature is designed for monorepos with multiple packages. |

### What Still Works for These Areas

Despite the above limitations, partial coverage exists through other working features:

| Missing Feature | Working Alternative |
|----------------|-------------------|
| Constants secrets detection | `drift env secrets` (7 secrets tracked across 52 env vars) |
| Constants dead/unused | `drift coupling unused-exports` (~20 unused exports found) |
| Contract mismatches | Manual review; Serena `find_referencing_symbols` for tracing |
| Wrapper detection | `drift callgraph callers <function>` traces usage chains |
| Custom constraints | Data boundary rules (`.drift/boundaries/rules.json`) |

These should be re-evaluated when upgrading to a newer Drift version. Check release
notes for improvements to the native TypeScript/Express analyzer.

For detailed context, commands, and workarounds, see the dedicated sections:
[Constants Analysis](#constants-analysis), [API Contracts](#api-contracts),
[Wrappers Detection](#wrappers-detection).

## Troubleshooting

### Drift scan finds 0 patterns

Run `drift scan` (not just `drift status`). The initial `drift setup` does detection; `drift scan` does full analysis.

### Cortex memory NODE_MODULE_VERSION error

```bash
cd $(npm root -g)/driftdetect && npm rebuild better-sqlite3
```

### AI isn't using Drift tools

1. Check `.mcp.json` exists in project root
2. Run `drift status` to confirm data exists
3. Try explicit prompt: "Use Drift's drift_status tool"

### AI isn't using Serena tools

1. Check Serena plugin is enabled in Claude Code settings
2. Verify project is in `~/.serena/serena_config.yml` projects list
3. Try explicit prompt: "Use Serena's find_symbol tool"

### Health score is low

Review and approve discovered patterns:

```bash
drift approve --auto                   # High-confidence patterns
drift patterns list --status discovered  # Review the rest
```
