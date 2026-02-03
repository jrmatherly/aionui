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
```

## Data Boundaries

Auth-related data access is governed by rules in `.drift/boundaries/rules.json`:

- `credentials-access` — `password_hash` restricted to `webserver/auth/**`
- `token-access` — `refresh_tokens`, `token_blacklist` restricted
- `jwks-access` — JWKS private keys restricted
- `user-pii-access` — email, display_name, avatar restricted

## Cortex Memory

30+ institutional memories in Drift's Cortex cover:

- Tribal knowledge (conventions, gotchas)
- Pattern rationale (why patterns exist)
- Decision context (architectural choices)
- Code smells (anti-patterns to avoid)
- Constraint overrides (approved exceptions)

## Audit & Maintenance

- **Health score:** 85/100 (390 approved, 9 discovered)
- **Audit score:** 92/100 (includes dedup/FP analysis)
- **36 duplicate groups** detected — mostly overlapping detectors, not actionable in v0.9.48
- **Coupling:** 0 cycles, 0 hotspots, ~20 unused exports (mostly from skill scripts)
- **Error handling:** No gaps detected (Express middleware patterns not recognized as boundaries)
- **Constraints:** Extract found 0 (not enough pattern repetition); custom constraints format not working in v0.9.48

## Version Limitations (v0.9.48)

- Custom constraint JSON files cause `TypeError: data.constraints is not iterable`
- Constraints extract needs substantial code pattern repetition to discover anything
- Error handling boundaries detection doesn't recognize Express-style error middleware
- Audit duplicate detection reports but can't auto-merge
- Node 25 works but isn't officially supported

## Configuration

- **Drift config:** `.drift/config.json` (MCP tool filtering: TypeScript-only)
- **MCP server:** `.mcp.json` (CWD-based project detection)
- **Boundary rules:** `.drift/boundaries/rules.json`
- **Approved patterns:** `.drift/patterns/approved/*.json`
- **Constraints index:** `.drift/constraints/index.json`
