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

2. **Understand existing code (MCP):**
   Use `drift_explain` to get a comprehensive explanation of code you'll modify:
   ```typescript
   drift_explain({ target: "src/path/to/file.ts", depth: "detailed", focus: "architecture" })
   ```
   This synthesizes pattern analysis, call graph, security implications, and
   dependencies into a coherent narrative. See [Explain Tool](#explain-tool-mcp) below.

3. **Find similar existing code:**
   Use `drift similar` (via MCP) with intent and description to find template code.
   AI agents: call `drift_context` with `intent: "add_feature"` and `focus: "area"`.

4. **Find relevant code with Serena:**
   Ask to find symbols, references, and file structure related to the feature.

5. **Generate code with combined context:**
   The AI uses Drift patterns for conventions and Serena for exact code locations.

6. **Pre-validate generated code (MCP):**
   Before writing, use `drift_prevalidate` for quick feedback:
   ```typescript
   drift_prevalidate({ code: generatedCode, targetFile: "src/path/to/file.ts", kind: "function" })
   ```
   Or use `drift_validate_change` for full file validation:
   ```typescript
   drift_validate_change({ file: "src/path/to/file.ts", content: fullFileContent })
   ```

7. **Validate before committing:**

   ```bash
   drift check                             # Pattern compliance (all tracked files)
   drift check --staged                    # Only check staged files
   drift gate --policy strict <files...>   # Quality gates on changed files
   drift boundaries check                  # Data access boundaries
   ```

8. **If violations found, get suggestions (MCP):**
   ```typescript
   drift_suggest_changes({ target: "src/path/to/file.ts", issue: "outlier", patternId: "pattern-id" })
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
| Code generation | `drift_context` | `drift_code_examples` → `drift_prevalidate` → `drift_validate_change` |
| Quick lookup | `drift_signature`, `drift_callers`, `drift_type` | — |
| Understanding code | `drift_explain` | `drift_callers` → `drift_impact_analysis` |
| Security review | `drift_security_summary` | `drift_reachability` → `drift_env` |
| Refactoring | `drift_impact_analysis` | `drift_coupling` → `drift_test_topology` |
| Find similar code | `drift_similar` | `drift_code_examples` |
| Test work | `drift_test_topology` | `drift_test_template` |
| Fix violations | `drift_suggest_changes` | `drift_validate_change` → `drift_code_examples` |
| Mine decisions | `drift_decisions` (mine) | `drift_decisions` (list/get/search) |

**AI agent code generation flow:**
1. `drift_context` → get patterns, conventions, examples for the task
2. Write code
3. `drift_prevalidate` → quick check before committing to file (lightweight)
4. `drift_validate_change` → full validation with compliance scoring
5. If violations: `drift_suggest_changes` → get before/after fix suggestions
6. Re-validate after applying fixes

Always start with `drift_context` for code generation tasks — it synthesizes
patterns, examples, and conventions in one call.

## Cortex Memory System

Drift's Cortex V2 is an intelligent memory system — a living knowledge base that
learns from the codebase and corrections. It replaces static documentation with
dynamic, intent-aware, confidence-decaying memories.

### Memory Types

Cortex supports 9 memory types, though only 6 can be manually added via CLI:

| Type | Icon | Half-Life | Use For | Can Add? |
|------|------|-----------|---------|----------|
| `core` | 🏠 | ∞ (never) | Project identity, tech stack | Auto-only |
| `tribal` | ⚠️ | 365 days | Team conventions, gotchas | ✅ |
| `procedural` | 📋 | 180 days | How-to guides, step-by-step processes | ✅ |
| `semantic` | 💡 | 90 days | Consolidated knowledge | Auto (from consolidation) |
| `episodic` | 💭 | 7 days | Interaction records | Auto (from learning) |
| `pattern_rationale` | 🎯 | 180 days | Why a pattern exists | ✅ |
| `decision_context` | 📝 | 180 days | Why an architectural choice was made | ✅ |
| `code_smell` | 🚫 | 90 days | Anti-patterns to avoid | ✅ |
| `constraint_override` | ✅ | 90 days | Approved exceptions to rules | ✅ |

### Confidence Decay

Memory confidence decays exponentially based on age:
```
effective_confidence = base_confidence × 2^(-age_days / half_life)
```
Usage boosts confidence — frequently accessed memories decay slower. Confirmation
via `drift memory feedback <id> confirm` also boosts confidence.

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
drift memory search "authentication"           # Semantic search across all memories
drift memory list --type tribal                 # List by type
drift memory why "OIDC login" --intent fix_bug  # Intent-aware context retrieval
drift memory warnings                           # Show active warnings (tribal + code smells)
drift memory show <id>                          # Full memory details with decay info
drift memory status                             # Overview counts by type
drift memory health                             # Comprehensive health report with recommendations
```

### Intent-Aware Retrieval (`drift memory why`)

The `why` command retrieves memories based on intent, using semantic search with
relevance scoring:

```bash
drift memory why "OIDC" --intent add_feature   # Returns auth-related memories
drift memory why "database" --intent fix_bug    # Returns data access memories
```

**Validated behavior:** Returns memories ranked by relevance percentage. Results
include token usage tracking (e.g., "Tokens: 215/2000"). Empty results mean no
memories exceeded the relevance threshold — try broader or different search terms.

**Supported intents:** `add_feature`, `fix_bug`, `refactor`, `security_audit`,
`understand_code`, `add_test`

### Learning from Corrections

Cortex can learn from corrections, creating new memories automatically:

```bash
# Learn from a correction (creates tribal memory at 80% confidence)
drift memory learn "Always wrap database operations in try-catch with proper error context"

# Provide feedback on existing memories
drift memory feedback <id> confirm    # Boosts confidence (80% → 90%)
drift memory feedback <id> reject --details "Outdated"
drift memory feedback <id> modify     # Update content
```

### Maintenance

```bash
drift memory validate --scope stale   # Find stale or conflicting memories
drift memory consolidate              # Merge episodic → semantic knowledge
drift memory export backup.json       # Export all memories for backup
drift memory import backup.json       # Import from backup
drift memory delete <id>              # Soft delete a memory
```

### Current State

- **51 memories** (23 tribal, 9 procedural, 5 pattern_rationale, 6 decision_context,
  4 code_smell, 4 constraint_override)
- **Health score:** 95/100
- **6 active warnings** (security, React, error handling, TypeScript conventions)
- **Decay:** All memories at 100% effective confidence (created recently)

### Causal Graphs

Cortex V2 connects memories with causal relationships (`derived_from`, `supersedes`,
`supports`, `contradicts`, `related_to`). These enable narrative generation —
`drift memory why` traces causal chains to explain *why* things exist.

**Causal relationship types:**
- `caused` / `triggered_by` — Direct causation
- `enabled` / `prevented` — Made possible or blocked
- `supersedes` — Replaces an older memory
- `supports` / `contradicts` — Reinforces or conflicts
- `derived_from` — Based on another memory

### Token Efficiency

Cortex uses hierarchical compression (4 levels) and session deduplication:

| Level | Detail | Tokens |
|-------|--------|--------|
| 0 | IDs only | ~10 |
| 1 | One-line summaries | ~50 |
| 2 | With examples | ~200 |
| 3 | Full detail | ~500+ |

Session deduplication prevents sending the same memory twice within a session.
The system auto-selects compression level based on available token budget.

### Predictive Retrieval

Cortex can predict what memories you'll need based on:
- **File context** — current file, imports, directory
- **Behavioral patterns** — recent intents and topics
- **Git signals** — current branch, staged files

This is primarily used by MCP tools (`drift_memory_predict`) to preload relevant
memories into cache for faster retrieval.

### MCP Memory Tools

| MCP Tool | Purpose |
|----------|---------|
| `drift_why` | Causal narrative explaining WHY something exists |
| `drift_memory_status` | Health overview with recommendations |
| `drift_memory_for_context` | Get memories for context with compression |
| `drift_memory_search` | Semantic search with session deduplication |
| `drift_memory_add` | Add memory with automatic causal inference |
| `drift_memory_learn` | Learn from corrections (full pipeline) |
| `drift_memory_feedback` | Confirm, reject, or modify memories |
| `drift_memory_predict` | Get predicted memories for current context |
| `drift_memory_conflicts` | Detect conflicting memories |
| `drift_memory_graph` | Visualize memory relationships |
| `drift_memory_validate` | Validate memories and get healing suggestions |

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

## Explain Tool (MCP)

The `drift_explain` MCP tool provides comprehensive explanations of code in the
context of your codebase. It combines pattern analysis, call graph, security
implications, and dependencies into a coherent narrative.

### Availability

- **MCP tool:** `drift_explain` ✅
- **CLI command:** ❌ Not available (MCP-only)
- **CLI alternatives:** Use `drift files <path>`, `drift callgraph function <name>`,
  `drift boundaries file <path>` separately

### Usage

```typescript
drift_explain({
  target: "src/webserver/auth/middleware/AuthMiddleware.ts",
  depth: "detailed",      // summary | detailed | comprehensive
  focus: "security"       // security | performance | architecture | testing
})
```

### Depth Levels

| Depth | What It Returns | Token Cost |
|-------|----------------|------------|
| `summary` | Quick overview, purpose, module role | ~500 |
| `detailed` | + patterns, dependencies, data access | ~1500 |
| `comprehensive` | + full security analysis, testing, semantic analysis | ~3000 |

### Focus Options

| Focus | Emphasizes |
|-------|------------|
| `security` | Data access paths, sensitive fields, reachable credentials |
| `performance` | Caching, N+1 queries, optimization opportunities |
| `architecture` | Patterns, coupling, module boundaries |
| `testing` | Coverage, test quality, gaps |

### When to Use

- **Before modifying code** — understand what you're about to change
- **Onboarding** — understand unfamiliar code sections
- **Code review** — understand PR changes in context
- **Security audit** — deep dive into auth or data-handling code

### CLI Alternatives (Partial Coverage)

```bash
drift boundaries file src/webserver/routes/authRoutes.ts  # Data access analysis
drift callgraph callers <function>                         # Who calls this?
drift callgraph reach src/path/to/file.ts                  # Reachability analysis
drift where <pattern> --category <cat>                     # Pattern locations
```

Note: These CLI commands each provide one dimension of what `drift_explain`
synthesizes into a single comprehensive response.

## Decision Mining (MCP)

Drift can mine architectural decisions from your git history and generate
Architecture Decision Records (ADRs) automatically by analyzing commit messages,
file changes, and dependency patterns.

### Availability

- **MCP tool:** `drift_decisions` ✅
- **CLI command:** ❌ Not available (`drift decisions` planned for future release)

### Usage

```typescript
// Mine decisions from git history
drift_decisions({ action: "mine" })

// Mine with date range
drift_decisions({ action: "mine", since: "2026-01-01", until: "2026-02-03" })

// List all mined decisions
drift_decisions({ action: "list" })

// Get decision details
drift_decisions({ action: "get", id: "ADR-001" })

// Search decisions
drift_decisions({ action: "search", query: "authentication OIDC" })

// Find decisions affecting a file
drift_decisions({ action: "for-file", file: "src/webserver/auth/config/oidcConfig.ts" })

// View timeline
drift_decisions({ action: "timeline" })
```

### Decision Categories

| Category | Icon | Example in AionUI |
|----------|------|-------------------|
| `technology-adoption` | 📦 | Adopted better-sqlite3 for auth DB |
| `pattern-introduction` | 🎨 | Introduced RBAC middleware pattern |
| `architecture-change` | 🏗️ | Multi-user auth system (5 phases) |
| `security-enhancement` | 🔒 | OIDC SSO with EntraID |
| `api-change` | 🔌 | WebUI API endpoints with CSRF |

### Decision Lifecycle

```
Draft → Confirmed → (Superseded)
  │
  └──→ Rejected
```

Mined decisions start as `draft` and should be reviewed and confirmed.

### When to Use

- **After major milestones** — mine decisions from recent commits
- **Generating ADRs** — auto-generate architecture decision records
- **Understanding history** — "why did we choose this approach?"
- **Onboarding** — help new team members understand architectural choices

### Exporting ADRs

When using the CLI (future), decisions can be exported as markdown:
```bash
drift decisions export   # Creates docs/adr/*.md files
```

## Speculative Execution (Enterprise Only)

Drift's Speculative Execution simulates multiple implementation approaches before
you write code, scoring them by friction, impact, pattern alignment, and security.

### Availability

- **CLI command:** `drift simulate` — **requires enterprise tier** (not available
  in community edition)
- **MCP tool:** `drift_simulate` — same enterprise requirement

### What It Would Do

```bash
drift simulate "add rate limiting to WebUI API endpoints" \
  --constraint "must work with existing auth middleware" \
  --target src/webserver/
```

Returns ranked approaches with:
- **Friction score** (0-100) — how much existing code needs to change
- **Impact score** (0-100) — blast radius
- **Pattern alignment** — how well it fits conventions
- **Security notes** — potential implications

### Current Status

Confirmed as enterprise-gated in v0.9.48:
```
⚠️ Enterprise Feature Required
✗ gate:impact-simulation requires enterprise tier
Current tier: community
```

### Workarounds

Without speculative execution, use these alternatives:
- `drift memory why "area" --intent add_feature` — get institutional knowledge
- `drift_context` (MCP) — get relevant patterns and examples
- `drift callgraph impact <file>` — manual impact analysis
- `drift dna gene <gene> --examples` — see how the team implements patterns
- `drift coupling refactor-impact <file>` — blast radius for changes

## Suggest Changes (MCP)

Get AI-guided suggestions for fixing pattern violations, security issues, or code
quality problems. Returns specific before/after code changes with rationale.

### Availability

- **MCP tool:** `drift_suggest_changes` ✅
- **CLI command:** ❌ (`drift check --suggest` not available in v0.9.48)
- **CLI alternative:** `drift check` detects violations; use MCP for suggestions

### Usage

```typescript
// Fix pattern outlier
drift_suggest_changes({
  target: "src/webserver/directoryApi.ts",
  issue: "outlier",
  patternId: "api-response-format"
})

// Security suggestions
drift_suggest_changes({
  target: "src/webserver/routes/authRoutes.ts",
  issue: "security"
})

// Error handling improvements
drift_suggest_changes({
  target: "src/webserver/routes/apiRoutes.ts",
  issue: "error-handling"
})

// Coupling/dependency issues
drift_suggest_changes({
  target: "src/process/database/index.ts",
  issue: "coupling"
})
```

### Issue Types

| Issue | Description | When to Use |
|-------|-------------|-------------|
| `outlier` | Pattern violation (code doesn't match established pattern) | After `drift check` finds violations |
| `security` | Security vulnerability or concern | During security review |
| `coupling` | High coupling or dependency issues | Before refactoring |
| `error-handling` | Missing or improper error handling | Improving resilience |
| `test-coverage` | Missing test coverage | Expanding test suite |
| `pattern-violation` | General pattern non-compliance | Code review |

### Workflow: Fix a Violation

```typescript
// 1. Identify the violation
// (e.g., directoryApi.ts uses direct-return instead of envelope)

// 2. Get suggestions
const suggestions = await drift_suggest_changes({
  target: "src/webserver/directoryApi.ts",
  issue: "outlier"
});

// 3. Apply the suggestion
// (manually or via AI using the before/after in the response)

// 4. Validate the fix
const validation = await drift_validate_change({
  file: "src/webserver/directoryApi.ts",
  content: updatedCode
});
```

## Validate Change (MCP + CLI)

Validate proposed code changes against codebase patterns before committing. Catches
pattern violations, constraint breaches, and inconsistencies early.

### Availability

- **MCP tools:** `drift_validate_change`, `drift_prevalidate` ✅
- **CLI command:** `drift check` ✅ (validates all tracked files or staged files)

### CLI Usage

```bash
drift check                    # Check all tracked files for violations
drift check --staged           # Check only staged files (pre-commit)
drift check --verbose          # Detailed output
drift check --ci --format github --fail-on error  # CI mode with annotations
```

### MCP: Full Validation

```typescript
// Validate complete file content
drift_validate_change({
  file: "src/webserver/routes/authRoutes.ts",
  content: fileContent,
  strictMode: false    // true = warnings also fail
})

// Validate a diff
drift_validate_change({
  file: "src/webserver/routes/authRoutes.ts",
  diff: unifiedDiffContent,
  strictMode: true     // strict for main branch
})
```

### MCP: Quick Pre-Validation

```typescript
// Lightweight check before writing to file
drift_prevalidate({
  code: generatedCode,
  targetFile: "src/webserver/routes/newRoute.ts",
  kind: "function"    // function | class | component | test | full-file
})
```

### Compliance Scoring

| Score | Status | Action |
|-------|--------|--------|
| 90-100 | `pass` | Good to merge |
| 70-89 | `warn` | Review warnings |
| 50-69 | `warn` | Address issues before merge |
| <50 | `fail` | Significant rework needed |

### Validation Modes

| Mode | Use Case | Behavior |
|------|----------|----------|
| Standard (`strictMode: false`) | Feature branches | Errors block, warnings advisory |
| Strict (`strictMode: true`) | Main/release branches | Errors AND warnings block |

### What Gets Validated

- **Pattern compliance** — does the code follow established patterns?
- **Semantic validation** — data access patterns, raw SQL detection, async handling
- **Security checks** — sensitive field access, potential injection points
- **Import analysis** — external dependencies and their usage

### Validated CLI Behavior (v0.9.48)

- `drift check` scans all 17 pattern-tracked files (not arbitrary files)
- `drift check --staged` only checks git staged files
- `drift check` does NOT accept file path arguments
- `drift check --suggest` is NOT available (use MCP `drift_suggest_changes`)
- Current state: 0 violations across all tracked files

## Watch Mode

Real-time pattern detection as you edit files, with automatic persistence to the
pattern store.

### Availability

- **CLI command:** `drift watch` ✅ (working)

### Usage

```bash
# Start watching (patterns persist to .drift/)
drift watch

# Verbose output — see each file's patterns as they're detected
drift watch --verbose

# Filter by categories (reduce CPU, focus on what matters)
drift watch --categories api,auth,errors,security

# Custom debounce (default 300ms — increase for slower saves)
drift watch --debounce 500

# Report-only mode (don't persist patterns)
drift watch --no-persist

# Auto-update AI context file on changes
drift watch --context .drift/CONTEXT.md
```

### Validated Behavior (v0.9.48)

- Loads **170 detectors** on startup
- Monitors the full project directory (respects `.driftignore` and `.gitignore`)
- Debounce prevents excessive scanning during rapid edits
- Uses file locking (`.drift/index/.lock`) for safe concurrent access
- `--context <file>` flag is accepted but the file is only created/updated when
  a file change triggers a rescan (not on startup)
- Works alongside MCP server without conflicts

### Recommended Configurations

| Scenario | Command |
|----------|---------|
| Active development | `drift watch --verbose --debounce 300` |
| Background monitoring | `drift watch --debounce 1000` |
| Auth-focused work | `drift watch --categories auth,security` |
| Quick feedback only | `drift watch --no-persist --verbose` |
| AI context updates | `drift watch --context .drift/CONTEXT.md` |

### When to Use

- **During active development** — get instant feedback on pattern compliance
- **Code reviews** — run in background while reviewing changes
- **Learning the codebase** — see patterns detected as you browse files
- **Pair programming** — shared visibility into pattern compliance

### Integration with Other Tools

Watch mode and MCP server can run simultaneously — MCP reads patterns that watch
persists. Watch mode also works alongside `drift check` and `drift gate` without
conflicts thanks to file locking.

## Reports & Export

Drift provides report generation and data export for documentation, CI, and AI context.

### Reports (`drift report`)

`drift report` works but **requires explicit flags** in non-interactive mode.
Without `--format` and `--output`, it shows interactive selection menus (format
picker, category picker) that require a TTY. In scripts or non-TTY contexts,
always pass flags:

```bash
# Working — explicit flags
drift report --format text --output report.txt
drift report --format json --output report.json
drift report --format github    # GitHub Actions annotations to stdout

# Broken in non-TTY — launches interactive menus
drift report                    # Hangs waiting for menu input
```

Reports are saved to `.drift/reports/` when using `--output`.

### Export (`drift export`) — Working ✅

Export is the primary way to get pattern data out of Drift:

```bash
# AI-optimized context (~30K tokens for full codebase)
drift export --format ai-context --snippets

# Compact AI context (minimal tokens)
drift export --format ai-context --compact

# Human-readable summary
drift export --format summary

# Documentation-ready markdown
drift export --format markdown

# Machine-readable JSON
drift export --format json

# Save to file
drift export --format markdown --output docs/PATTERNS.md
```

### Filtering

Export supports powerful filtering that is confirmed working:

```bash
# By status
drift export --status approved

# By category
drift export --categories security,auth

# By confidence threshold
drift export --min-confidence 0.8

# Combined (confirmed: returns 16 security patterns ≥80%)
drift export --format json --categories security --status approved --min-confidence 0.8
```

### Token-Aware AI Context

For AI context windows, use `--max-tokens` to stay within limits:

```bash
drift export --format ai-context --max-tokens 8000    # Fits in 8K context
drift export --format ai-context --max-tokens 50000   # For large context windows
```

### When to Use

- **AI assistant context** — `drift export --format ai-context --compact`
- **Documentation** — `drift export --format markdown --output docs/PATTERNS.md`
- **CI reports** — `drift export --format json` (since `drift report` is broken)
- **Compliance** — `drift export --status approved --format json`

## Skills

Drift includes a skills system — reusable implementation guides that AI agents
can use as context when implementing common software patterns.

### Current Status (v0.9.48)

Only **8 community/generic skills** are available, not the 71 pattern implementation
skills listed in Drift's documentation.

**Available skills:**
```bash
drift skills list
# pdf, docx, xlsx, pptx, skill-creator, moltbook, x-recruiter, xiaohongshu-recruiter
```

The 71 pattern implementation skills from the docs (circuit-breaker, jwt-auth,
rate-limiting, retry-fallback, etc.) are **not available** in v0.9.48 and cannot
be installed:

```bash
drift skills install jwt-auth     # ✖ Skill not found: jwt-auth
drift skills search "auth"        # No skills found matching "auth"
```

### Skill Commands (For Future Use)

```bash
drift skills list                    # List available skills
drift skills list --category auth    # Filter by category
drift skills search "circuit"        # Search skills
drift skills info <name>             # View skill details
drift skills install <name>          # Install to project (.github/skills/)
drift skills install --all           # Install all available skills
drift skills uninstall <name>        # Remove a skill
```

### Custom Skills

You can create your own skills that AI agents will pick up:

```bash
mkdir -p .github/skills/our-api-pattern
# Create .github/skills/our-api-pattern/SKILL.md
```

AionUI already has comprehensive context via Serena memories and Drift Cortex,
which serve a similar purpose to skills for project-specific patterns.

## Git Hooks Integration

AionUI already uses **Husky** for git hooks with lint-staged. Drift can be
integrated into the existing hook pipeline.

### Current Hook Setup

| Hook | Current Behavior |
|------|-----------------|
| `pre-commit` | `npx lint-staged` → ESLint fix + Prettier |
| `commit-msg` | Conventional commit format validation |

### Adding Drift to Hooks

To add pattern checking to the pre-commit hook, modify `.husky/pre-commit`:

```bash
# Current
npx lint-staged

# Enhanced with Drift
npx lint-staged
drift check --staged --fail-on error
```

Or integrate via lint-staged in `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "eslint --fix",
      "prettier --write",
      "drift check --staged --fail-on error"
    ]
  }
}
```

### Hook Performance

- `drift check --staged` only analyzes staged files (fast)
- Skip in CI: add `if [ -n "$CI" ]; then exit 0; fi` at top of hook
- Bypass when needed: `git commit --no-verify`

### Not Implemented Yet

Adding Drift to hooks is optional. The current lint-staged + ESLint + Prettier
pipeline is already effective. Drift hook integration is documented here for when
you decide to enable it. Since `drift check` currently shows 0 violations across
all tracked files, there's no immediate urgency.

## Dashboard

Drift includes a web dashboard for visualizing patterns, call graphs, and codebase
health.

### Current Status (v0.9.48)

**Not available.** Requires `driftdetect-dashboard` npm package:

```bash
drift dashboard
# ✖ Dashboard package not found.
# Make sure driftdetect-dashboard is installed.
```

### To Install (Optional)

```bash
npm install -g driftdetect-dashboard
drift dashboard                    # Opens http://localhost:3847
drift dashboard --port 3000        # Custom port
drift dashboard --no-browser       # Don't auto-open browser
```

### What It Provides

- Pattern overview with confidence scores and approval status
- Interactive call graph visualization
- Health score dashboard with trends
- Pattern detail view with code examples and outliers
- REST API access (e.g., `curl http://localhost:3847/api/patterns`)

### Dashboard vs CLI

For now, all dashboard functionality is available via CLI commands:

| Dashboard Feature | CLI Equivalent |
|------------------|---------------|
| Pattern overview | `drift status` |
| Pattern details | `drift where <pattern>` |
| Health score | `drift status` (shows health score) |
| Call graph | `drift callgraph callers <fn>` |
| Security view | `drift boundaries check` |
| Export data | `drift export --format json` |

## MCP Architecture

Drift's MCP server uses a 7-layer architecture designed for efficient AI interaction.
Understanding this helps AI agents use the right tools at the right time.

### The 7 Layers

| Layer | Purpose | Example Tools | Token Budget |
|-------|---------|---------------|-------------|
| **1. Orchestration** | Understand intent, return curated context | `drift_context` | 2000-4000 |
| **2. Discovery** | Instant status, no heavy computation | `drift_status` | 200-500 |
| **3. Surgical** | Ultra-focused lookups | `drift_signature`, `drift_callers`, `drift_type` | 200-500 |
| **4. Exploration** | Paginated listing with filters | `drift_patterns_list`, `drift_file_patterns` | 500-2000 |
| **5. Detail** | Complete info on specific items | `drift_pattern_get`, `drift_explain` | 1500-3000 |
| **6. Analysis** | Complex computation | `drift_coupling`, `drift_impact_analysis` | 1000-3000 |
| **7. Generation** | Code generation + validation | `drift_validate_change`, `drift_suggest_changes` | 500-2000 |

### Key Design Principles

1. **Start at Layer 1** — `drift_context` does the synthesis, not the AI
2. **Use surgical tools** for code generation — `drift_signature` returns 200 tokens
   vs reading a 500-line file at 2000+ tokens
3. **Every response includes hints** — `nextActions` and `relatedTools` guide the AI
4. **Token budgets enforced** — responses auto-truncate to fit budgets
5. **Consistent response structure** — summary, data, pagination, hints, metadata

### Practical Usage Order

```
drift_context (orchestration) → understand the task
  ↓
drift_signature / drift_callers (surgical) → precise lookups
  ↓
drift_code_examples (exploration) → see how patterns are implemented
  ↓
drift_prevalidate (generation) → quick-check generated code
  ↓
drift_validate_change (generation) → full validation with scoring
```

### MCP Server Configuration

AionUI's MCP config (`.mcp.json`):
```json
{
  "mcpServers": {
    "drift": {
      "command": "driftdetect-mcp",
      "args": []
    }
  }
}
```

The MCP server auto-detects the project root from CWD. Language filtering is
configured in `.drift/config.json` → `mcp.tools.languages: ["typescript"]`.

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
| "Explain this file comprehensively" | ✅ `drift_explain` (MCP) | |
| "Mine architectural decisions" | ✅ `drift_decisions` (MCP) | |
| "Fix this pattern violation" | ✅ `drift_suggest_changes` (MCP) | |
| "Validate code before committing" | ✅ `drift check` / `drift_validate_change` (MCP) | |
| "Quick-check generated code" | ✅ `drift_prevalidate` (MCP) | |
| "Real-time pattern feedback" | ✅ `drift watch` | |
| "Export patterns for docs" | ✅ `drift export --format markdown` | |
| "Get filtered pattern data" | ✅ `drift export --categories X --min-confidence Y` | |
| "Get function signature fast" | ✅ `drift_signature` (MCP, ~200 tokens) | ✅ `find_symbol` |

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
drift memory health                        # Check memory system (health score, recommendations)
drift memory warnings                      # Active warnings from tribal + code smells
drift memory validate --scope stale        # Find stale memories
drift memory consolidate                   # Merge episodic → semantic knowledge
drift patterns list --status discovered    # Review new patterns
drift env scan                             # Refresh env var index
drift boundaries check                     # Verify data boundaries
drift dna mutations                        # Check for new style drift
drift dna mutations --impact high          # Focus on actionable high-impact mutations
drift audit                                # Pattern health, duplicates, FPs
drift coupling cycles                      # Check for circular dependencies
drift error-handling gaps                  # Find missing error handling
drift dna playbook --force                 # Regenerate style playbook if needed
drift memory export backup-$(date +%Y%m%d).json  # Backup memories
```

### Learning from Experience

When you fix a bug or discover a gotcha:

```bash
# Add knowledge directly
drift memory add tribal "What I learned" --topic "Area"

# Or learn from a correction (creates at 80% confidence, lower than manual 100%)
drift memory learn "Description of the correction and correct approach"

# Confirm important memories to boost their confidence
drift memory feedback <id> confirm
```

When an architectural decision is made, update both:

1. Drift: `drift memory add decision_context "..." --topic "..."`
2. Serena: Edit or create `.serena/memories/relevant-topic.md`

When AI makes a mistake and you correct it, use the learning system:

```bash
drift memory learn "Correct approach: always use X instead of Y because Z"
# Creates tribal memory + code smell automatically
```

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
| **Speculative Execution** | Enterprise only | `drift simulate` exists as CLI but requires enterprise tier. Returns `"gate:impact-simulation requires enterprise tier"`. MCP tool `drift_simulate` has the same restriction. |
| **Explain Tool (CLI)** | MCP-only | No `drift explain` CLI command. Use MCP tool `drift_explain` or CLI alternatives (`drift files`, `drift callgraph function`, `drift boundaries file`). |
| **Decision Mining (CLI)** | MCP-only | No `drift decisions` CLI command (planned for future). Use MCP tool `drift_decisions`. |
| **Suggest Changes (CLI)** | MCP-only | `drift check --suggest` not available. Use MCP tool `drift_suggest_changes`. `drift check` works for violation detection. |
| **Skills (71 guides)** | Only 8 available | Docs list 71 implementation skills across 12 categories (resilience, auth, caching, etc.) but `drift skills list` shows only 8 community/generic skills (pdf, docx, xlsx, pptx, etc.). The 71 pattern implementation skills (circuit-breaker, jwt-auth, rate-limiting, etc.) are not available in v0.9.48. |
| **Dashboard** | Package not installed | `drift dashboard` requires `driftdetect-dashboard` npm package which is not installed. Returns "Dashboard package not found." Dashboard provides web visualization of patterns, call graphs, and health. |
| **Reports** | Requires explicit flags | `drift report` without flags launches interactive selection menus that hang in non-TTY mode. Always pass `--format` and `--output` flags explicitly (e.g., `drift report --format text --output report.txt`). Works correctly with flags. |
| **Monorepo Support** | N/A (by design) | AionUI is a single-package project (`drift context --list` shows 1 root package). Monorepo features (package-scoped analysis, cross-package impact, per-package patterns) are for multi-package workspaces. |

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
