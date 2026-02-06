# AGENTS.md

Project conventions and AI coding guidance are maintained in CLAUDE.md
with topic-specific rules in .claude/rules/.

@CLAUDE.md

## Before Working on Any Subsystem

1. **Read the relevant Serena memory** — `.serena/memories/*.md` has architectural decisions and gotchas
2. **Check Cortex memories** — `mise run drift:memory:why <area>` surfaces tribal knowledge and constraints
3. **Check path-scoped rules** — `.claude/rules/*.md` has subsystem-specific guidance

This prevents re-learning decisions and re-introducing anti-patterns.
