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

### Embedding Model

Uses OpenAI `text-embedding-3-small` via LanceDB's embedding registry:

```python
embed_func = get_registry().get("openai").create(
    name="text-embedding-3-small"
)
```

Requires `OPENAI_API_KEY` environment variable.

### Chunking Parameters

- **Chunk size**: 500 tokens (default)
- **Overlap**: 100 tokens (default)
- Configurable via API

## Design Decisions

1. **LanceDB over Qdrant for per-user**: Embedded file-based storage inherits workspace isolation
2. **Python over TypeScript**: Richer embedding registry, leverages mise infrastructure
3. **Fire-and-forget ingestion**: Doesn't block message sending
4. **Pattern-based triggers**: Avoids unnecessary KB searches
5. **Graceful fallback**: RAG failure doesn't block messages

## Future Enhancements

- [ ] UI toggle for enabling/disabling auto-RAG per conversation
- [ ] Source citations in AI responses
- [ ] Qdrant integration for shared/team knowledge bases
- [ ] PDF/DOCX text extraction before ingestion
