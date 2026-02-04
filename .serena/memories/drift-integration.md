# Drift Detect Integration

## Overview

AionUI uses **Drift Detect** alongside **Serena** for AI-assisted development.
Drift handles pattern analysis and institutional memory; Serena handles symbolic
code navigation and editing.

## When to Use Each Tool

| Need                                   | Use                                                       |
| -------------------------------------- | --------------------------------------------------------- |
| Find patterns and conventions          | Drift (`drift_context`, `drift_patterns_list`)            |
| Find symbol definitions and references | Serena (`find_symbol`, `find_referencing_symbols`)        |
| Rename/refactor symbols                | Serena (`rename_symbol`, `replace_symbol_body`)           |
| Check code against conventions         | Drift (`drift check`, `drift gate`)                       |
| Trace data flow and security           | Drift (`drift callgraph reach`, `drift boundaries check`) |
| Get institutional knowledge            | Drift (`drift memory why`, `drift memory search`)         |
| Navigate file structure                | Serena (`list_dir`, `get_symbols_overview`)               |
| Explain code comprehensively           | Drift MCP (`drift_explain`)                               |
| Mine architectural decisions           | Drift MCP (`drift_decisions`)                             |
| Get fix suggestions for violations     | Drift MCP (`drift_suggest_changes`)                       |
| Validate code before writing           | Drift MCP (`drift_prevalidate`, `drift_validate_change`)  |
| Real-time pattern detection            | Drift CLI (`drift watch`)                                 |

## Key Drift Commands

```bash
drift status                    # Health score, pattern counts
drift memory why "area"         # Pre-task context retrieval
drift callgraph status --security  # Security-prioritized data access
drift callgraph impact <file>   # Blast radius before refactoring
drift coupling cycles           # Find circular dependencies
drift coupling hotspots         # Find over-coupled modules
drift coupling unused-exports   # Find dead exported code
drift error-handling gaps       # Find missing error handling
drift env secrets               # Sensitive environment variables
drift boundaries check          # Data access boundary violations
drift gate --policy strict      # Quality gates on changed files
drift dna mutations             # Style consistency deviations
drift audit                     # Pattern health audit with duplicates
drift constraints extract       # Discover architectural constraints
drift check                     # Validate all tracked files for violations
drift check --staged            # Validate staged files only (pre-commit)
drift watch                     # Real-time pattern detection on file changes
drift watch --verbose --categories api,auth  # Filtered watch mode
```

### MCP-Only Tools (No CLI Equivalent)

```
drift_explain       — Comprehensive code explanation (patterns + callgraph + security)
drift_decisions     — Mine architectural decisions from git history
drift_suggest_changes — Get before/after fix suggestions for violations
drift_validate_change — Validate file content against patterns (with scoring)
drift_prevalidate   — Quick validation of code snippets before writing
drift_simulate      — Speculative execution (ENTERPRISE ONLY)
```

## Data Boundaries

Auth-related data access is governed by rules in `.drift/boundaries/rules.json`:

- `credentials-access` — `password_hash` restricted to `webserver/auth/**`
- `token-access` — `refresh_tokens`, `token_blacklist` restricted
- `jwks-access` — JWKS private keys restricted
- `user-pii-access` — email, display_name, avatar restricted

## Cortex V2 Memory System

51 institutional memories in Drift's Cortex across 6 manually-addable types:

| Type                | Count | Half-Life | Purpose                                |
| ------------------- | ----- | --------- | -------------------------------------- |
| tribal              | 23    | 365d      | Conventions, gotchas, tool limitations |
| procedural          | 9     | 180d      | How-to guides, workflows               |
| pattern_rationale   | 5     | 180d      | Why patterns exist                     |
| decision_context    | 6     | 180d      | Architectural choices                  |
| code_smell          | 4     | 90d       | Anti-patterns                          |
| constraint_override | 4     | 90d       | Approved exceptions                    |

### Key Features (Validated)

- **`drift memory why <focus> --intent <intent>`** — Intent-aware retrieval with
  relevance scoring. Supported intents: add_feature, fix_bug, refactor,
  security_audit, understand_code, add_test. Returns token-budgeted results.
- **`drift memory learn <correction>`** — Creates tribal memories from corrections
  at 80% confidence (vs 100% for manual `add`)
- **`drift memory feedback <id> confirm`** — Boosts confidence (80% → 90%)
- **`drift memory warnings`** — Shows 6 active warnings (security, React, etc.)
- **Causal graphs** — Memories linked by causal relationships for narrative generation
- **Token efficiency** — 4-level compression, session deduplication
- **Predictive retrieval** — MCP `drift_memory_predict` preloads relevant memories
- **Health:** 95/100, all memories at 100% effective confidence

## Audit & Maintenance

- **Health score:** 85/100 (390 approved, 9 discovered)
- **Audit score:** 92/100 (includes dedup/FP analysis)
- **36 duplicate groups** detected — mostly overlapping detectors, not actionable in v0.9.48
- **Coupling:** 0 cycles, 0 hotspots, ~20 unused exports (mostly from skill scripts)
- **Error handling:** No gaps detected (Express middleware patterns not recognized as boundaries)
- **Constraints:** Extract found 0 (not enough pattern repetition); custom constraints format not working in v0.9.48

## DNA Profile & Playbook

Generate a style playbook with `drift dna playbook` (or `--stdout` for terminal output).
The playbook is gitignored and regenerable on demand.

### Gene Details (Validated)

| Gene                | Pattern               | Confidence | Key Files                                                   |
| ------------------- | --------------------- | ---------- | ----------------------------------------------------------- |
| Responsive Approach | CSS Media Queries     | 100%       | `CssThemeSettings/presets.ts`                               |
| State Styling       | CSS Pseudo Classes    | 100%       | `CssThemeSettings/presets.ts`                               |
| Spacing             | Hardcoded values      | 100%       | (scattered, no design token system)                         |
| API Response        | Success/Data Envelope | 88%        | `DataScopeMiddleware.ts`, `adminRoutes.ts`, `authRoutes.ts` |
| Config              | Settings/Config Class | 79%        | `AcpConnection.ts`, `AcpDetector.ts` (65 files)             |
| Error Response      | Generic Try-Catch     | 72%        | (various)                                                   |
| Logging             | Logger with Levels    | 67%        | (various)                                                   |
| Theming             | CSS Variables         | 60%        | `presets.ts`, `useInputFocusRing.ts`, `colors.ts`           |
| Animation           | CSS Animations        | 50%        | (keyframe-based)                                            |
| Variant Handling    | None                  | 0%         | (no dominant pattern)                                       |

### Key Mutations

- **1 high-impact**: `directoryApi.ts:271` uses `res.json(shortcuts)` (direct-return)
  instead of success/data envelope. Only endpoint that skips the pattern.
- **12 medium config mutations**: Agent backends naturally use `env-variables-direct`
  instead of `settings-class` — expected, not actionable.

### Useful Commands

```bash
drift dna gene api-response-format --examples  # Deep dive on specific gene
drift dna gene config-pattern --examples        # See config pattern with examples
drift dna mutations --impact high               # Focus on actionable mutations
drift dna export --format ai-context --compact  # AI-friendly DNA summary
```

Gene IDs: `variant-handling`, `responsive-approach`, `state-styling`, `theming`,
`spacing-philosophy`, `animation-approach`, `api-response-format`,
`error-response-format`, `logging-format`, `config-pattern`.

## Version Limitations (v0.9.48) — Validated Feb 3, 2026

### Confirmed Non-Functional Features

- **Constants Analysis**: All subcommands (`drift constants`, `list`, `secrets`,
  `dead`, `inconsistent`) return "No constant data discovered yet" even after
  `drift scan`. No `.drift/constants/` directory is ever created. MCP tool
  `drift_constants` also non-functional.
- **Contract Detection**: Config `"contracts": true` is set, `.drift/contracts/`
  subdirectories exist but are all empty. AionUI has 8 renderer files with
  fetch() and 5 webserver route files — real pairs that should match but don't.
- **Wrappers Detection**: `drift wrappers` reports 539 files scanned but 0
  functions found, even with `--min-confidence 0.3 --min-cluster-size 1`.
  Native analyzer doesn't detect React hooks or Express middleware.
- **Custom Constraints**: JSON in `.drift/constraints/custom/` causes TypeError.
  `drift constraints extract` finds 0 (needs more code pattern repetition).

### Other Known Limitations

- Error handling boundaries detection doesn't recognize Express-style error middleware
- Audit duplicate detection reports 36 groups but can't auto-merge in this version
- Node 25 works but isn't officially supported (tested on 18-24)
- `drift decisions mine` command doesn't exist
- `drift scan` discovers 17 files vs `drift env scan` discovering 539 — different
  discovery mechanisms for different purposes

### Working Alternatives for Non-Functional Features

| Missing Feature           | Use Instead                                               |
| ------------------------- | --------------------------------------------------------- |
| `drift constants secrets` | `drift env secrets` (7 secrets tracked)                   |
| `drift constants dead`    | `drift coupling unused-exports` (~20 unused)              |
| Contracts                 | Serena `find_referencing_symbols` + TypeScript interfaces |
| Wrappers                  | `drift callgraph callers <fn>` + Serena references        |

## Reports & Export

- `drift report` — **broken in v0.9.48** (hangs indefinitely, no output)
- `drift export` — **working** in all formats:
  - `--format json` — machine-readable full data
  - `--format ai-context` — AI-optimized (~30K tokens full; use `--compact` for less)
  - `--format summary` — human-readable overview
  - `--format markdown` — documentation-ready
- **Filtering works:** `--categories X`, `--status approved`, `--min-confidence 0.8`
- **Token control:** `--max-tokens 8000` for context window limits

## Skills

Only 8 community/generic skills available in v0.9.48 (pdf, docx, xlsx, pptx, etc.).
The 71 pattern implementation skills from docs (circuit-breaker, jwt-auth, etc.)
are not available. AionUI uses Serena memories + Drift Cortex for equivalent coverage.

## Dashboard

Requires `driftdetect-dashboard` package (not installed). All dashboard features
are accessible via CLI: `drift status`, `drift where`, `drift callgraph`,
`drift boundaries check`, `drift export`.

## Git Hooks

AionUI uses Husky with pre-commit (lint-staged) and commit-msg (conventional commits).
`drift check --staged` can be added to pre-commit hook but isn't currently active
(0 violations found, low urgency).

## MCP Architecture (7-Layer)

Tools organized in layers: Orchestration → Discovery → Surgical → Exploration →
Detail → Analysis → Generation. Start with `drift_context` (Layer 1) for code gen
tasks. Use surgical tools (`drift_signature`, ~200 tokens) over file reads (~2000
tokens) for efficiency.

## Configuration

- **Drift config:** `.drift/config.json` (MCP tool filtering: TypeScript-only)
- **MCP server:** `.mcp.json` (CWD-based project detection)
- **Boundary rules:** `.drift/boundaries/rules.json`
- **Approved patterns:** `.drift/patterns/approved/*.json`
- **Constraints index:** `.drift/constraints/index.json`
