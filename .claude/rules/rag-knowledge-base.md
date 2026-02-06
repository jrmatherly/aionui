---
paths:
  - 'src/process/services/KnowledgeBase*'
  - 'src/webserver/routes/knowledgeRoutes.ts'
  - 'src/process/task/*AgentManager*'
  - 'src/process/task/agentUtils.ts'
  - 'src/process/task/RagUtils.ts'
  - 'skills/lance/**'
  - 'src/renderer/pages/settings/KnowledgeBase*'
  - 'src/renderer/components/RAGSourcesDisplay*'
---

# Knowledge Base (RAG)

AionUI provides per-user knowledge bases using **LanceDB**, an embedded vector database for RAG (Retrieval-Augmented Generation).

## Architecture

- **LanceDB** stores vectors and metadata in each user's workspace at `.lance/`
- **OpenAI embeddings** (`text-embedding-3-small`) for semantic search
- **Hybrid search** combines vector similarity with BM25 keyword search
- **Versioning** enables time-travel and rollback

## Storage Structure

```text
/workspace/
├── .lance/                    # LanceDB database root
│   └── knowledge/             # Knowledge table
└── documents/                 # Original uploaded files
```

## Key Components

| File/Service             | Purpose                              |
| ------------------------ | ------------------------------------ |
| `KnowledgeBaseService`   | Backend RAG operations               |
| `knowledgeRoutes.ts`     | REST API at `/api/knowledge/*`       |
| `skills/lance/scripts/*` | Python scripts for LanceDB           |
| `KnowledgeBase.tsx`      | Settings UI at `/settings/knowledge` |
| `RAGSourcesDisplay.tsx`  | Expandable source citations in chat  |

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

## Auto-RAG (Chat Integration)

RAG context is automatically injected into chat messages when:

1. **Pattern matching**: Message contains document-related queries ("summarize", "explain", "according to", "find/search", "key points")
2. **File context**: Large files (>40KB) attached to messages are auto-ingested

**Flow:** User message → `shouldSearchKnowledgeBase()` → `searchForContext()` → `<knowledge_base_context>` injected → Agent responds

## Source Citations

When RAG is used, an expandable accordion appears below the agent response:

- `KBSourceDetail` interface: file, page, chunkIndex, score, textPreview
- Agent managers emit `rag_sources` event → frontend stores in `pendingRagSources` ref → displayed on `finish`
- Uses `__RAG_SOURCES__` prefix in message content, intercepted by `MessagetText.tsx`

## Large File Protection

Files >40KB skipped from inline injection. Read file first, then check `Buffer.byteLength()` (not stat-then-read — TOCTOU safe).

## Initialization

KB initialized on user login via `AuthService.postLoginInit()` → `kbService.initialize(userId)`.
