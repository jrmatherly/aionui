# RAG & Knowledge Base System

## Overview

AionUI provides per-user knowledge bases using **LanceDB**, an embedded vector database for RAG (Retrieval-Augmented Generation). This solves context window overflow issues when users interact with large documents.

## Architecture

### Storage Model

```
Per-User Workspace
├── .lance/                        # LanceDB database root
│   └── knowledge/                 # Main knowledge table
│       ├── _latest.manifest       # Current version pointer
│       ├── _versions/             # Version history (time-travel)
│       └── data/                  # Vector data (Lance format)
└── documents/                     # Original uploaded files
```

### Key Components

| Component                | File                                            | Purpose                |
| ------------------------ | ----------------------------------------------- | ---------------------- |
| **KnowledgeBaseService** | `src/process/services/KnowledgeBaseService.ts`  | Backend RAG operations |
| **Knowledge API**        | `src/webserver/routes/knowledgeRoutes.ts`       | REST endpoints         |
| **Knowledge UI**         | `src/renderer/pages/settings/KnowledgeBase.tsx` | Settings page          |
| **LanceDB Scripts**      | `skills/lance/scripts/*.py`                     | Python DB operations   |
| **RAG Utils**            | `src/process/task/RagUtils.ts`                  | Trigger detection      |

## Auto-RAG Pipeline

### Flow

```
User Message → Pattern Detection → KB Search → Context Injection → CLI Agent
                    ↓                   ↓              ↓
            RagUtils.ts     KnowledgeBaseService  prepareMessageWithRAGContext()
```

### 1. Trigger Detection (`RagUtils.shouldSearchKnowledgeBase`)

Patterns that trigger RAG search:

```typescript
const RAG_TRIGGER_PATTERNS = [
  // Summary/explanation requests
  /\b(summariz|explain|describe|overview|outline)\w*/i,
  /\bwhat (does|is|are|was|were|did)\b/i,

  // Document-specific queries
  /\b(from|in|within) (the|this|my|that) (document|file|pdf|contract)/i,
  /\baccording to\b/i,
  /\bbased on (the|this|my)\b/i,

  // Search/lookup
  /\b(find|search|look up|look for|locate)\b/i,

  // Analysis
  /\bkey (points|terms|findings|takeaways|sections|clauses)/i,
  /\b(analyze|analysis|review|extract)\b/i,
];
```

### 2. Context Search (`KnowledgeBaseService.searchForContext`)

- Hybrid search (vector + full-text)
- Returns relevant chunks with source attribution
- Token estimation for context management

### 3. Context Injection (`agentUtils.prepareMessageWithRAGContext`)

```typescript
export async function prepareMessageWithRAGContext(content: string, userId: string, options?: RAGPrepareOptions): Promise<RAGPrepareResult> {
  // 1. Check if KB exists and has documents
  // 2. Check if message triggers RAG
  // 3. Search knowledge base
  // 4. Format and inject context
  return {
    content: `<knowledge_base_context>...</knowledge_base_context>\n\n[User Query]\n${content}`,
    ragUsed: true,
    sources: ['contract.pdf', 'terms.docx'],
    tokenEstimate: 2500,
  };
}
```

### 4. Auto-Ingestion with Progress (`conversationBridge.autoIngestFilesToKnowledgeBase`)

**Updated:** 2026-02-06

Files >40KB are automatically ingested when attached to messages. Large files trigger progress events via `responseStream`:

```typescript
// In conversationBridge.ts sendMessage handler
if (hasLargeFiles) {
  // Emit start → ingesting → complete events via responseStream
  ipcBridge.conversation.responseStream.emit({
    type: 'ingest_progress',
    conversation_id,
    msg_id,
    data: { status: 'start', total: filesToIngest.length },
  });
  await autoIngestFilesToKnowledgeBase(userId, files, progressCallback);
  // Emit complete
} else {
  // Small files: fire-and-forget (non-blocking)
  void autoIngestFilesToKnowledgeBase(userId, files);
}

// For Gemini: exclude large files from agent (prevents context overflow)
const filesToSend = task.type === 'gemini' ? workspaceFiles.filter((f) => !isLargeFile(f)) : workspaceFiles;
```

All 3 SendBox components (Gemini, ACP, Codex) handle `ingest_progress` events with an Arco `<Progress>` bar and disable send during ingestion.

## Agent Integration

RAG is integrated into all agent managers:

| Agent Manager        | Integration Point                            |
| -------------------- | -------------------------------------------- |
| `AcpAgentManager`    | After `prepareFirstMessageWithSkillsIndex()` |
| `GeminiAgentManager` | Before `super.sendMessage()`                 |
| `CodexAgentManager`  | Both first and subsequent messages           |

## API Endpoints

| Endpoint                       | Method | Description                   |
| ------------------------------ | ------ | ----------------------------- |
| `/api/knowledge/status`        | GET    | KB stats (docs, chunks, size) |
| `/api/knowledge/documents`     | GET    | List indexed documents        |
| `/api/knowledge/search`        | GET    | Vector/FTS/hybrid search      |
| `/api/knowledge/ingest`        | POST   | Ingest with chunking + embed  |
| `/api/knowledge/document/:src` | DELETE | Delete by source file         |
| `/api/knowledge/reindex`       | POST   | Rebuild indexes               |
| `/api/knowledge/versions`      | GET    | Version history               |
| `/api/knowledge/restore`       | POST   | Restore to version            |
| `/api/knowledge/clear`         | POST   | Clear all data                |

## Python Scripts (`skills/lance/scripts/`)

| Script      | Purpose                                          |
| ----------- | ------------------------------------------------ |
| `setup.py`  | Initialize/check user's LanceDB                  |
| `ingest.py` | Ingest with chunking + auto-embeddings           |
| `search.py` | Vector, FTS, and hybrid search                   |
| `view.py`   | View/list indexed documents                      |
| `manage.py` | Delete, reindex, versions, restore, stats, clear |

## Search & Indexing (Updated 2026-02-06)

Based on LanceDB documentation review (`.local_docs/lancedb/`), the following optimizations were implemented:

### Full-Text Search (FTS) Index

FTS index is **required** for hybrid search to work. Created automatically on table initialization:

```python
# ingest.py / manage.py
table.create_fts_index(
    "text",
    language="English",    # Enable English stemming
    stem=True,             # "running" matches "run"
    remove_stop_words=True # Ignore "the", "a", etc.
)
```

### Hybrid Search with RRF Reranking

Uses Reciprocal Rank Fusion (RRF) for optimal vector + FTS result combination:

```python
# search.py - hybrid search
from lancedb.rerankers import RRFReranker

reranker = RRFReranker()
results = (
    table.search(query_vector, query_type="hybrid", fts_columns="text")
    .rerank(reranker)
    .limit(limit)
    .to_pandas()
)
```

### Score Handling

Different search types return different score columns:

| Search Type | Column             | Interpretation        |
| ----------- | ------------------ | --------------------- |
| Hybrid+RRF  | `_relevance_score` | Higher = better       |
| FTS         | `_score`           | BM25, higher = better |
| Vector      | `_distance`        | Lower = better        |

Score normalization for vector search (cosine distance):

```python
# Cosine distance ranges 0-2 (0 = identical, 2 = opposite)
score = max(0, 1.0 - (distance / 2.0))
```

### LanceDB API Compatibility (v0.27+)

Handles breaking changes in newer LanceDB:

```python
# list_tables() returns ListTablesResponse, NOT a list
# Must access .tables attribute:
if "knowledge" not in db.list_tables().tables:

# list_versions() returns dicts in new API
for v in table.list_versions():
    if isinstance(v, dict):
        version = v.get("version")
    else:
        version = v.version  # Old object format
```

**Critical:** `db.list_tables()` returns a `ListTablesResponse` object. Using `"name" in db.list_tables()` without `.tables` always returns `False`, causing tables to be re-created and "table already exists" errors on subsequent logins.

### Environment Variables

| Variable               | Default                     | Description                      |
| ---------------------- | --------------------------- | -------------------------------- |
| `EMBEDDING_API_KEY`    | (required)                  | API key for embeddings           |
| `EMBEDDING_API_BASE`   | `https://api.openai.com/v1` | Custom endpoint (Azure, LiteLLM) |
| `EMBEDDING_MODEL`      | `text-embedding-3-small`    | Model name                       |
| `EMBEDDING_DIMENSIONS` | (auto-detect)               | Vector dimensions (1536 or 3072) |

## Configuration

### Embedding Configuration (Env Vars Only)

**Updated:** 2026-02-06

The Knowledge Base uses **`EMBEDDING_*` environment variables** exclusively for embedding configuration. Global Models auto-detection was removed to prevent model/dimension mismatches.

#### Configuration

Set these env vars in your `.env` or Docker compose:

| Variable               | Required | Default                        | Description                      |
| ---------------------- | -------- | ------------------------------ | -------------------------------- |
| `EMBEDDING_API_KEY`    | Yes\*    | Falls back to `OPENAI_API_KEY` | API key for embedding provider   |
| `EMBEDDING_API_BASE`   | No       | (OpenAI default)               | Custom endpoint (Azure, LiteLLM) |
| `EMBEDDING_MODEL`      | No       | `text-embedding-3-small`       | Model name                       |
| `EMBEDDING_DIMENSIONS` | No       | (auto-detect from model)       | Vector dimensions (e.g., 3072)   |

#### Critical: `dim` Parameter

**Fixed:** 2026-02-06. The `EMBEDDING_DIMENSIONS` env var is now passed as the `dim` kwarg to LanceDB's OpenAI embedding `create()` call. Without this, the schema expects N dimensions but the API call returns the model's default (e.g., 1536 vs 3072), causing `"expected 3072 but got array of size 1536"` errors.

All 3 Python scripts (`ingest.py`, `search.py`, `manage.py`) pass `dim` when `EMBEDDING_DIMENSIONS` is set.

### Chunking Parameters

- **Chunk size**: 500 tokens (default)
- **Overlap**: 100 tokens (default)
- Configurable via API

## Knowledge Base Initialization

The knowledge base is initialized automatically when a user logs in:

```typescript
// AuthService.postLoginInit()
const result = await kbService.initialize(userId);
```

This ensures the KB is ready for document ingestion immediately, rather than waiting for the first ingest operation.

## Large File Handling

### Context Window Protection

Large files (>40KB) are **automatically skipped** from inline content injection to prevent context window overflow:

```typescript
// src/agent/acp/index.ts - processAtFileReferences()
const LARGE_FILE_THRESHOLD = 40_000; // ~10K tokens
if (stats.size > LARGE_FILE_THRESHOLD) {
  log.info({ atPath, sizeBytes: stats.size }, 'Skipping large file (use Knowledge Base for RAG)');
  continue;
}
```

Large files should be:

1. Auto-ingested to Knowledge Base (via `autoIngestFilesToKnowledgeBase`)
2. Queried via RAG instead of inline content

### Binary File Extraction

PDFs and other binary files are handled specially:

```typescript
// KnowledgeBaseService.ingestFile()
// Uses --file flag to pass path to Python for text extraction
const args = [workspaceDir, sourceFile, '--file', filePath];
```

```python
# ingest.py - extract_text_from_file()
def extract_text_from_file(file_path: str) -> tuple[str, list[dict]]:
    if ext == ".pdf":
        import pypdf
        reader = pypdf.PdfReader(file_path)
        # Extracts text from all pages
```

## RAG Source Citations (Updated 2026-02-06)

When the AI uses Knowledge Base context, an expandable accordion appears below the response showing which sources were used.

### Data Flow

```
KnowledgeBaseService.searchForContext()
  → returns { content, sources, sourceDetails[], tokenEstimate }
  → Agent Manager emits 'rag_sources' event via responseStream
  → SendBox stores in pendingRagSources ref
  → On 'finish' event: emits as __RAG_SOURCES__-prefixed content message
  → MessageText intercepts prefix → renders RAGSourcesDisplay component
```

### Key Components

| Component           | File                                            | Purpose                                      |
| ------------------- | ----------------------------------------------- | -------------------------------------------- |
| `KBSourceDetail`    | `src/process/services/KnowledgeBaseService.ts`  | Interface: file, page, chunk, score, preview |
| `RAGSourcesDisplay` | `src/renderer/components/RAGSourcesDisplay.tsx` | Expandable accordion UI component            |
| `MessagetText`      | `src/renderer/messages/MessagetText.tsx`        | Intercepts `__RAG_SOURCES__` prefix          |

### `KBSourceDetail` Interface

```typescript
interface KBSourceDetail {
  file: string; // Source filename
  page?: number; // Page number (PDFs)
  chunkIndex: number; // Chunk position in document
  score: number; // Relevance score (RRF or distance-based)
  textPreview: string; // First 150 chars of chunk text
}
```

### Display

**Collapsed:** `📚 Sources — 1 document, 14 chunks (3,777 tokens)`

**Expanded:** Per-document breakdown with page numbers, scores, and text previews grouped by file.

### Message Order in Chat

1. User message + file attachment
2. Ingestion progress bar (📄 → ✂️ → 🧠 → 💾) — if large file upload
3. Agent response (streaming)
4. 📚 Sources accordion (collapsed by default)
5. 📚 Knowledge Base Updated notification (first upload only)

## Stage-Based Ingestion Progress (Updated 2026-02-06)

`ingest.py` emits JSON progress to stderr at each stage:

| Stage      | Percent | Emoji | Description         |
| ---------- | ------- | ----- | ------------------- |
| extracting | 2-8%    | 📄    | Text extraction     |
| setup      | 5%      | ⚙️    | DB/table setup      |
| chunking   | 10-15%  | ✂️    | Text chunking       |
| embedding  | 15-90%  | 🧠    | Per-batch (size 20) |
| indexing   | 92-96%  | 💾    | FTS index creation  |
| complete   | 100%    | ✅    | Done                |

### Manual Batch Embedding

`ingest.py` uses manual batch embedding (`EMBED_BATCH_SIZE=20`) with `embed_func.generate_embeddings()` per batch, pre-computed vectors passed to `table.add()`. This bypasses LanceDB auto-embed to enable per-batch progress reporting.

### Progress Transport

- `ingest.py` writes JSON lines to **stderr** (progress) and result to **stdout**
- `KnowledgeBaseService.runLanceScriptWithProgress()` uses `child_process.spawn` to stream stderr line-by-line
- `conversationBridge.ts` emits `ingest_progress` events with `status: 'stage'` to frontend
- All three SendBox components render stage-aware progress labels with emoji

### KB Notification Timing

`sendMessage()` resolves before the CLI response stream completes (it writes to stdin and returns). The backend persists the KB notification message to DB immediately but emits a `kb_ready` event. The frontend stores it in `pendingKbNotification` ref and displays it on the `finish` event (stream end). Same pattern used for `pendingRagSources`.

## Design Decisions

1. **LanceDB over Qdrant for per-user**: Embedded file-based storage inherits workspace isolation
2. **Python over TypeScript**: Richer embedding registry, leverages mise infrastructure
3. **Smart blocking**: Large files block send (await for RAG availability); small files fire-and-forget
4. **Pattern-based triggers**: Avoids unnecessary KB searches
5. **Graceful fallback**: RAG failure doesn't block messages
6. **KB init on login**: Ensures KB is ready before any document interaction
7. **Large file threshold**: Prevents context window overflow (40KB limit)
8. **FTS + Vector hybrid**: Combines keyword precision with semantic understanding
9. **RRF reranking**: Better result fusion than simple score averaging
10. **English stemming**: Improves text matching for English documents
11. **Manual batch embedding**: Enables per-batch progress reporting (bypasses auto-embed)
12. **Progress via stderr, result via stdout**: Clean separation for streaming progress from Python scripts
13. **`__RAG_SOURCES__` prefix pattern**: Reuses existing message system for source citations — no new IPC channel needed
14. **Pending refs + finish event**: Queues KB notification and RAG sources, displays after agent response stream completes
15. **Read-then-check-size (not stat-then-read)**: Eliminates TOCTOU race in large file detection (CodeQL fix)

## Future Enhancements

- [ ] UI toggle for enabling/disabling auto-RAG per conversation
- [ ] Qdrant integration for shared/team knowledge bases
- [x] PDF text extraction before ingestion (implemented via pypdf)
- [x] KB initialization on user login (implemented in AuthService)
- [x] Global Models integration for embeddings (`b09dad7a`, `885f2dca`) — later removed to prevent model/dim mismatches
- [x] Embedding `dim` parameter fix for LanceDB OpenAI registry
- [x] Ingest progress bar in all SendBox components
- [x] Large file exclusion from Gemini context (use RAG instead)
- [x] Source citations in AI responses (`fc090051`) — expandable accordion with per-chunk details
- [x] Stage-based ingestion progress (`1fd64191`) — 6 stages with emoji labels
- [x] KB notification after agent response (`05da580b`) — pendingKbNotification ref + finish event
- [x] TOCTOU race fix for large file detection (`7a3cfdda`) — read-then-check instead of stat-then-read
