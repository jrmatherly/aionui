---
paths:
  - '.drift/**'
  - '.serena/**'
  - '.mcp.json'
  - 'docs/guides/AI_CONTEXT_GUIDE.md'
---

# AI Context Tools

This project uses **Drift Detect** and **Serena** for enhanced AI-assisted development:

- **Drift Detect** — Pattern analysis, call graph, Cortex institutional memory (`.drift/`, `.driftignore`)
- **Serena** — Symbolic code navigation via language server (`.serena/project.yml`, `.serena/memories/`)
- **MCP config** — `.mcp.json` configures Drift as an MCP server (TypeScript-only tool filtering)
- **Data boundaries** — `.drift/boundaries/rules.json` enforces auth data access rules
- **Env variable tracking** — `drift env secrets` audits sensitive variable access (7 secrets tracked)

## Serena MCP Tool Parameters

Use these exact parameter names when calling Serena tools to avoid validation errors:

| Tool                   | Required Parameter      | Value                                  | Notes                                                                    |
| ---------------------- | ----------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `activate_project`     | `project`               | `"aionui"`                             | Project name from `.serena/project.yml`, NOT a filesystem path           |
| `read_memory`          | `memory_file_name`      | e.g. `"project-architecture"`          | Memory name without `.md` extension                                      |
| `list_memories`        | _(none)_                |                                        | No parameters required; must be called AFTER `activate_project` succeeds |
| `find_symbol`          | `name_path`             | e.g. `"ClassName/method"`              | Supports substring matching                                              |
| `get_symbols_overview` | `relative_path`         | e.g. `"src/process/database/index.ts"` | Path relative to project root                                            |
| `replace_symbol_body`  | `name_path`, `new_body` |                                        | Use for editing entire symbol definitions                                |
| `search_for_pattern`   | `pattern`               | regex string                           | Optional `relative_path` to restrict scope                               |

**Sequencing:** Always call `activate_project` first and wait for success before calling `list_memories` or `read_memory`. Do not batch them in parallel.

## Key Commands

```bash
drift status             # Pattern health
drift memory status      # Cortex memory health
drift memory why "area"  # Get context before working on a feature area
drift env secrets        # Audit sensitive env var access
drift boundaries check   # Verify data access boundaries
drift dna mutations      # Check style consistency
```

See `docs/guides/AI_CONTEXT_GUIDE.md` for full setup and workflow documentation.
