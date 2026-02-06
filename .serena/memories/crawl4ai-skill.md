# Crawl4AI Web Scraping Skill

## Overview

Advanced web scraping skill providing JavaScript execution, dynamic content handling, and structured data extraction using the Crawl4AI library.

**Status:** Production ready (v0.8.0)  
**Added:** 2026-02-06

## Architecture

```
skills/crawl4ai/
├── SKILL.md                      # Main skill definition (updated to v0.8.0)
├── references/
│   └── complete-sdk-reference.md # Full SDK docs (5,196 lines)
└── scripts/
    ├── basic_crawler.py          # Simple markdown extraction
    ├── batch_crawler.py          # Multi-URL concurrent processing
    ├── extraction_pipeline.py    # Schema-based, CSS, and LLM extraction
    ├── validate_env.py           # Environment validation
    └── requirements.txt          # Python dependencies
```

## Dependencies

**Python:**

- `crawl4ai>=0.8.0` - Core library (v0.8.0 includes security fixes)
- `playwright>=1.40.0` - Browser automation (transitive)

**System:**

- Chromium browser (~350MB, installed via `playwright install chromium`)
- All Playwright system deps already present in Docker for Electron

**Docker Impact:** ~400-500MB incremental (Chromium only, system deps shared)

## Key Capabilities

1. **Markdown Generation**
   - Clean HTML-to-markdown conversion
   - Content filtering (Pruning, BM25)
   - CSS selector focusing

2. **Structured Extraction (3 approaches)**
   - Schema-based (most efficient, LLM-free after one-time generation)
   - Manual CSS/JSON selectors
   - LLM-based extraction

3. **Advanced Features**
   - JavaScript execution for dynamic content
   - Session management and authentication
   - Anti-detection (proxy, user agent rotation)
   - Batch processing with `arun_many()`
   - Screenshot capture

## Integration Points

| Component     | Location                                       | Purpose                  |
| ------------- | ---------------------------------------------- | ------------------------ |
| Skill Manager | `AcpSkillManager.discoverSkills(['crawl4ai'])` | Discovery                |
| UI            | `AssistantManagement.tsx`                      | Per-assistant enablement |
| Python Env    | User's `.venv/` via mise                       | Isolated execution       |
| Docker        | `deploy/docker/Dockerfile`                     | Chromium pre-installed   |

## Usage Pattern

Users enable crawl4ai per-assistant via the assistant settings UI. The skill is discovered automatically once placed in `skills/crawl4ai/`.

**AI workflow:**

1. AI sees skill in `[Available Skills]` index
2. AI requests: `[LOAD_SKILL: crawl4ai]`
3. Full SKILL.md body loaded on-demand
4. AI executes Python scripts via Bash tool

## Docker Considerations

- Headless mode required in containers
- Chromium pre-installed during Docker build
- DISPLAY not required (uses headless)
- v0.8.0 security: `file://` URLs blocked, hooks disabled by default

## Validation Script

```bash
# Check environment setup
python skills/crawl4ai/scripts/validate_env.py
```

Checks:

- Python imports (crawl4ai, playwright)
- Playwright browser installation
- System dependencies (DISPLAY for non-headless)

## Related Files

- `skills/requirements.txt` - Aggregated Python deps
- `deploy/docker/Dockerfile` - Chromium installation
- `.scratchpad/crawl4ai-web-scraping-integration-research.md` - Research doc

## Version History

- **v0.8.0** (2026-02-06): Initial integration with crash recovery, prefetch mode, Docker security fixes
- Research validated: All claims verified against codebase, effort reduced from 6-10 days to 3-4 days
