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

- `project.id` — Regenerated UUID (the tracked one is the project's canonical ID)
- `initializedAt` — New timestamp
- `learning.autoApproveThreshold` — Reset to `0.95` (project uses `0.85`)

Always restore after init to keep team-consistent settings.

### 3. Rebuild Analysis Data

```bash
# Rebuild transient analysis data (pattern indexes, call graph, etc.)
drift scan

# Build additional analysis features
drift callgraph build
drift test-topology build
drift coupling build
```

If you get a `NODE_MODULE_VERSION` error on memory init:

```bash
# Find Drift's installation path and rebuild better-sqlite3
cd $(npm root -g)/driftdetect && npm rebuild better-sqlite3
# Retry
cd /path/to/aionui && drift memory init
```

### 4. Initialize Cortex Memory (Optional)

```bash
drift memory init
```

See [Cortex Memory](#cortex-memory-system) below for adding institutional knowledge.

### 5. Verify

```bash
drift status         # Should show 128+ approved patterns
drift memory status  # Should show memory health (if initialized)
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

1. **Get context from Drift:**
   Ask your AI assistant to check Drift for patterns related to your feature area.

2. **Find relevant code with Serena:**
   Ask to find symbols, references, and file structure related to the feature.

3. **Generate code with combined context:**
   The AI uses Drift patterns for conventions and Serena for exact code locations.

4. **Validate before committing:**
   Run `drift check` to verify pattern compliance.

### Fixing a Bug

1. **Check warnings:** Ask Drift about known gotchas in the affected area.
2. **Trace code:** Use Serena to follow the call chain.
3. **Analyze impact:** Use Drift's call graph for affected functions.
4. **Learn from the fix:** Add a Drift memory so the knowledge persists.

```bash
drift memory add tribal "Description of gotcha and fix" --topic "Area"
```

### Refactoring

1. **Understand structure:** Serena `get_symbols_overview` and `find_referencing_symbols`.
2. **Check patterns:** Drift patterns show established conventions.
3. **Execute:** Serena's `replace_symbol_body`, `rename_symbol` for safe changes.
4. **Verify:** `drift check` + Serena reference verification.

### Code Review Preparation

```bash
drift check              # Pattern compliance
drift memory search "relevant area"  # Any known gotchas?
```

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

To add a new memory, create a markdown file in `.serena/memories/` and commit it.

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

## Maintenance

### After Significant Code Changes

```bash
drift scan --incremental   # Update pattern index (fast, changed files only)
drift scan                 # Full rescan (after major refactoring)
drift check                # Verify no violations
```

### Weekly Review

```bash
drift memory health                        # Check memory system
drift patterns list --status discovered    # Review new patterns
drift memory validate --scope stale        # Find stale memories
```

### Learning from Experience

When you fix a bug or discover a gotcha:

```bash
drift memory add tribal "What I learned" --topic "Area"
```

When an architectural decision is made, update both:

1. Drift: `drift memory add decision_context "..." --topic "..."`
2. Serena: Edit or create `.serena/memories/relevant-topic.md`

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
