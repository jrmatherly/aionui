---
paths:
  - 'skills/**'
  - '.claude/skills/**'
  - 'src/process/services/MiseEnvironment*'
  - 'src/main/services/Mise*'
  - 'src/webserver/routes/pythonRoutes*'
  - 'src/renderer/pages/settings/PythonEnvironment*'
---

# Python Environment & Skills Support

AionUI supports Python-based skills for document processing and automation. Python environments are managed per-user via **mise** (mise-en-place).

## Architecture

- **mise** manages Python versions and virtual environments
- **uv** provides fast package installation (10-100x faster than pip)
- Each user gets an isolated workspace with their own `.venv/`
- Skills can declare Python dependencies in `requirements.txt`

## Key Components

| File/Service              | Purpose                                |
| ------------------------- | -------------------------------------- |
| `MiseEnvironmentService`  | Per-user Python environment management |
| `skills/requirements.txt` | Aggregated skill dependencies          |
| `/mise/template.toml`     | Template for user workspace mise.toml  |
| `DirectoryService`        | Per-user workspace directory isolation |

## Skills with Python Dependencies

| Skill       | Dependencies                        |
| ----------- | ----------------------------------- |
| pdf         | pdf2image, pypdf, reportlab, Pillow |
| docx        | python-docx, defusedxml             |
| pptx        | python-pptx, Pillow                 |
| xlsx        | openpyxl                            |
| mcp-builder | anthropic, mcp                      |

## System Requirements (Docker)

Python skills require system packages: `poppler-utils` (PDF rendering), `libreoffice-*` (Office conversion).

## How It Works

1. When a CLI agent starts, `AcpAgentManager.initAgent()` initializes the user's mise workspace
2. mise creates a venv in the user's workspace if needed
3. Python scripts run via mise shims or `mise exec`
4. User-specific packages are isolated in their `.venv/`

## Skills Infrastructure

### ⚠️ Two Skill Locations — Know the Difference

| Location          | Purpose                                                          | Bundled with app?                  | Shipped to users? |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------- | ----------------- |
| `skills/`         | **User-facing skills** — document processing, RAG, web scraping  | ✅ Yes (electron-builder + Docker) | ✅ Yes            |
| `.claude/skills/` | **Developer workflow skills** — release, test gen, db migrations | ❌ No                              | ❌ No             |

**Rule:** If a skill is for working _on_ the project (dev tooling), it goes in `.claude/skills/`. If it's for end users of the application, it goes in `skills/`.

`skills/` contents are packaged via electron-builder `asarUnpack`, copied to Docker images, and deployed to user config directories at first run via `initBuiltinAssistantRules()`.

### User-Facing Skills (`skills/`)

Follow the Anthropic Skills format with `SKILL.md` frontmatter.

#### Office Infrastructure Pattern (`scripts/office/`)

Both `docx/` and `xlsx/` use shared Anthropic infrastructure:

- **soffice.py** — LibreOffice wrapper with sandbox environment support
- **pack.py** — Pack unpacked directory back to Office format with validation
- **unpack.py** — Unpack Office files to directory with XML pretty-printing
- **validate.py** — Validate Office XML against schemas
- **helpers/** — XML manipulation utilities

#### Skills Directory

```text
skills/                  # User-facing (bundled and deployed)
├── docx/                # Word document manipulation
├── xlsx/                # Excel spreadsheet manipulation
├── pdf/                 # PDF processing
├── pptx/                # PowerPoint presentations
├── lance/               # Knowledge base (LanceDB)
├── crawl4ai/            # Web scraping (Crawl4AI)
├── skill-creator/       # Guide for creating new skills
├── frontend-design/     # Distinctive UI design principles
├── mcp-builder/         # MCP server creation guide
├── webapp-testing/      # Playwright web app testing
├── brand-guidelines/    # Brand colors and typography
├── doc-coauthoring/     # Structured documentation workflow
├── internal-comms/      # 3P updates, newsletters, FAQs
├── mermaid/             # Mermaid diagram rendering
└── x-recruiter/         # Recruitment content posting

.claude/skills/          # Developer workflow (NOT bundled)
├── release/             # Version bump, changelog, release automation
├── gen-test/            # Jest test scaffolding for AionUI modules
└── db-migrate/          # Database migration scaffolding
```
