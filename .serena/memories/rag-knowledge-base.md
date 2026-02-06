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

### 4. Auto-Ingestion (`conversationBridge.autoIngestFilesToKnowledgeBase`)

Files >40KB automatically ingested when attached to messages:

```typescript
// In conversationBridge.ts
if (__webUiUserId && workspaceFiles && workspaceFiles.length > 0) {
  void autoIngestFilesToKnowledgeBase(__webUiUserId, workspaceFiles);
}
```

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

## Configuration

### Embedding Model (Global Models Integration)

**Added:** 2026-02-06 (commits: `b09dad7a`, `885f2dca`)

The Knowledge Base automatically uses your **Global Models** configuration for embeddings, eliminating the need for separate embedding API keys.

#### Resolution Chain

1. **Check Global Models** for embedding providers:
   - First: models with `embedding` capability
   - Then: models with `embedding` in name (e.g., `text-embedding-3-small`)
2. **Fall back to env vars** if no embedding model found:
   - `OPENAI_API_KEY` + `OPENAI_BASE_URL` (optional)

#### Global Models Setup (Admin → Global Models)

| Field    | Example                                      |
| -------- | -------------------------------------------- |
| Platform | `openai` (or your gateway)                   |
| Name     | `Embeddings`                                 |
| Base URL | Your gateway URL (or leave empty for OpenAI) |
| API Key  | Your API key                                 |
| Models   | `text-embedding-3-small`                     |

#### Implementation Details

```python
# ingest.py - get_embedding_config()
def get_embedding_config() -> tuple[str, str, str]:
    """Returns (api_key, base_url, model) from Global Models or env vars."""

    # 1. Try Global Models
    kb_service = KnowledgeBaseService.getInstance()
    embedding_config = kb_service.getEmbeddingModelFromGlobalModels()

    if embedding_config:
        return (
            embedding_config['api_key'],
            embedding_config['base_url'],
            embedding_config['model']
        )

    # 2. Fallback to env vars
    return (
        os.environ.get('OPENAI_API_KEY'),
        os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
        'text-embedding-3-small'
    )
```

```typescript
// KnowledgeBaseService.ts
getEmbeddingModelFromGlobalModels(): EmbeddingConfig | null {
  const globalModels = GlobalModelService.getInstance().getAllGlobalModels();

  // Priority 1: Models with embedding capability
  const withCapability = globalModels.find(m =>
    m.capabilities?.includes('embedding')
  );
  if (withCapability) return extractConfig(withCapability);

  // Priority 2: Models with "embedding" in name
  const byName = globalModels.find(m =>
    m.models.some(name => name.toLowerCase().includes('embedding'))
  );
  if (byName) return extractConfig(byName);

  return null;
}
```

#### Benefits

- **Single source of truth**: Same API keys for chat and embeddings
- **Gateway support**: Works with Azure OpenAI, Portkey, LiteLLM, etc.
- **No extra config**: Just add embedding model to Global Models

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

## Design Decisions

1. **LanceDB over Qdrant for per-user**: Embedded file-based storage inherits workspace isolation
2. **Python over TypeScript**: Richer embedding registry, leverages mise infrastructure
3. **Fire-and-forget ingestion**: Doesn't block message sending
4. **Pattern-based triggers**: Avoids unnecessary KB searches
5. **Graceful fallback**: RAG failure doesn't block messages
6. **KB init on login**: Ensures KB is ready before any document interaction
7. **Large file threshold**: Prevents context window overflow (40KB limit)

## Future Enhancements

- [ ] UI toggle for enabling/disabling auto-RAG per conversation
- [ ] Source citations in AI responses
- [ ] Qdrant integration for shared/team knowledge bases
- [x] PDF text extraction before ingestion (implemented via pypdf)
- [x] KB initialization on user login (implemented in AuthService)
- [x] Global Models integration for embeddings (`b09dad7a`, `885f2dca`)
