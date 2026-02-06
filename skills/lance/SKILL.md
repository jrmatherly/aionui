# LanceDB Knowledge Base Skill

Per-user embedded vector database for document storage, semantic search, and RAG (Retrieval-Augmented Generation).

## Overview

This skill provides Python scripts for managing per-user knowledge bases using LanceDB, an embedded vector database that stores data directly in the user's workspace directory.

## Features

- **Document Ingestion**: Add PDFs, text files, and other documents to the knowledge base
- **Semantic Search**: Find relevant documents using vector similarity
- **Full-Text Search**: Keyword-based search with BM25
- **Hybrid Search**: Combine vector + keyword search with reranking
- **Versioning**: Automatic version tracking, rollback, time-travel queries
- **Data Isolation**: Each user has their own database in their workspace

## Storage Location

```
/workspace/
├── .lance/                    # LanceDB database root
│   └── knowledge/             # Main knowledge table
│       ├── _latest.manifest   # Current version pointer
│       ├── _versions/         # Version history
│       └── data/              # Vector data (Lance format)
└── documents/                 # Original uploaded files
```

## Scripts

### setup.py

Initialize or check the knowledge base for a user workspace.

```bash
python scripts/setup.py <workspace_path>
```

### ingest.py

Ingest a document into the knowledge base.

```bash
python scripts/ingest.py <workspace_path> <file_path> [--text <extracted_text>]
```

### search.py

Search the knowledge base.

```bash
python scripts/search.py <workspace_path> <query> [--type vector|fts|hybrid] [--limit 10]
```

### view.py

View documents in the knowledge base.

```bash
python scripts/view.py <workspace_path> [--limit 100] [--format json|table]
```

### manage.py

Manage the knowledge base (delete, reindex, versions).

```bash
python scripts/manage.py <workspace_path> <action> [options]

Actions:
  delete <source_file>    Delete all chunks from a document
  reindex                 Rebuild all indexes
  versions                List version history
  restore <version>       Restore to a specific version
  stats                   Show storage statistics
```

## Embedding Configuration

By default, uses OpenAI's `text-embedding-3-small` model. The API key is read from:

1. `OPENAI_API_KEY` environment variable
2. User's configured API key (via AionUI settings)

For local embeddings without API calls, uncomment `sentence-transformers` in `requirements.txt`.

## Schema

Each document chunk is stored with:

| Field         | Type        | Description                    |
| ------------- | ----------- | ------------------------------ |
| `id`          | string      | Unique chunk identifier        |
| `text`        | string      | Chunk text content             |
| `vector`      | float[1536] | Embedding vector               |
| `source_file` | string      | Original file path             |
| `page`        | int         | Page number (if applicable)    |
| `chunk_index` | int         | Chunk index within document    |
| `created_at`  | string      | ISO timestamp                  |
| `metadata`    | dict        | Additional metadata (optional) |

## API Integration

These scripts are called by `/api/knowledge/*` endpoints in AionUI:

- `GET /api/knowledge/status` → `view.py --format json`
- `GET /api/knowledge/documents` → `view.py --limit N`
- `GET /api/knowledge/search?q=...` → `search.py`
- `POST /api/knowledge/ingest` → `ingest.py`
- `DELETE /api/knowledge/document/:id` → `manage.py delete`

## Requirements

- Python 3.9+
- lancedb >= 0.27.0
- OpenAI API key (for embeddings) OR sentence-transformers (for local)

## References

- [LanceDB Documentation](https://docs.lancedb.com/)
- [Embedding Registry](https://docs.lancedb.com/embedding/index)
- [Versioning Guide](https://docs.lancedb.com/tables/versioning)
