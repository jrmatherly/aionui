# LanceDB Implementation Review

**Date:** 2026-02-06
**Status:** ✅ All Fixes Implemented & Validated (15/15 checks pass)

## Current Implementation Gaps

### 🔴 Critical Issues

1. **Missing FTS Index Creation**
   - **Problem:** We never call `table.create_fts_index("text")` after table creation
   - **Impact:** Hybrid search FTS component silently fails, only vector search works
   - **Fix:** Call `create_fts_index("text", language="English", stem=True)` after table creation in both `ingest.py` and `manage.py`

2. **Wrong Distance Metric**
   - **Problem:** Using default L2 distance, but OpenAI embeddings are normalized
   - **Impact:** Suboptimal similarity scoring for normalized embeddings
   - **Fix:** Use `metric="cosine"` when creating vector index

3. **Score Calculation Bug**
   - **Problem:** `score = 1.0 - distance` is wrong for cosine (ranges 0-2, not 0-1)
   - **Impact:** Misleading similarity scores in search results
   - **Fix:** For cosine: `score = 1.0 - (distance / 2.0)` or use raw distance

### 🟡 Important Improvements

4. **No Reranking in Hybrid Search**
   - **Problem:** Not using reranker for hybrid search results
   - **Impact:** Suboptimal result ordering when combining vector + FTS
   - **Fix:** Add `RRFReranker()` to hybrid search: `.rerank(RRFReranker())`

5. **No Vector Index for Scale**
   - **Problem:** No IVF/HNSW index built for vector column
   - **Impact:** Full brute-force scan on every query (fine for <10K rows)
   - **Fix:** Build IVF_PQ index when table exceeds threshold (e.g., 5000 rows)

6. **FTS Index Parameters Not Optimized**
   - **Problem:** Using defaults instead of optimized settings
   - **Fix:** Use `language="English", stem=True, remove_stop_words=True` for better text matching

### 🟢 Nice-to-Have Enhancements

7. **Fuzzy Search Support**
   - Allow typo tolerance with `fuzziness` parameter in FTS queries
   - Useful for user-generated queries with misspellings

8. **Explicit Hybrid Search Columns**
   - Add `fts_columns="text"` and `vector_column_name="vector"` for explicit column targeting

9. **Pre-filtering Support**
   - Add `.prefilter(True)` for faster filtered searches on large datasets

## Documentation Insights

### Embedding Registry Best Practices

```python
# Current (works but not optimal):
embed_func = get_registry().get("openai").create(name=model)

# Better - explicit config:
embed_func = get_registry().get("openai").create(
    name=model,
    base_url=api_base  # if using custom endpoint
)
```

### Proper Hybrid Search (from docs)

```python
# Simple hybrid:
results = table.search(query, query_type="hybrid")

# With reranking (better):
from lancedb.rerankers import RRFReranker
reranker = RRFReranker()
results = (
    table.search(query, query_type="hybrid", fts_columns="text")
    .rerank(reranker)
    .limit(10)
    .to_pandas()
)
```

### FTS Index Creation

```python
# Basic:
table.create_fts_index("text")

# Optimized for English:
table.create_fts_index(
    "text",
    language="English",
    stem=True,
    remove_stop_words=True,
    replace=True  # Replace if exists
)
```

### Vector Index for Scale

```python
# For datasets > 5000 rows, build IVF index:
table.create_index(
    "vector",
    index_type="IVF_PQ",
    metric="cosine",  # For normalized embeddings
    num_partitions=256,  # sqrt(num_rows) as starting point
    num_sub_vectors=96,  # dimension / 16 as starting point
)
```

### Version History API Changes

```python
# Old API (our code assumed):
for v in table.list_versions():
    print(v.version)  # Object attribute

# New API (dicts):
for v in table.list_versions():
    print(v["version"])  # Dict key
```

## Recommended Fix Priority

1. **Immediate** - Fix FTS index creation (hybrid search broken without it)
2. **Immediate** - Fix version history dict handling
3. **High** - Add cosine metric for OpenAI embeddings
4. **High** - Add reranking to hybrid search
5. **Medium** - Add vector index creation for large tables
6. **Low** - Add fuzzy search support

## Source Detail Enhancement (2026-02-06)

`KnowledgeBaseService.searchForContext()` now returns enriched source metadata for UI display:

```typescript
interface KBSourceDetail {
  file: string; // Source filename
  page?: number; // Page number (PDFs)
  chunkIndex: number; // Chunk position in document
  score: number; // Relevance score (RRF or distance-based)
  textPreview: string; // First 150 chars of chunk text
}
```

This is emitted via `rag_sources` event from all agent managers and displayed as an expandable accordion in the frontend (`RAGSourcesDisplay.tsx`). Commit: `fc090051`.

## Test Plan

1. Clear KB and reinitialize with fixes
2. Ingest test document
3. Verify FTS index created: `table.list_indices()`
4. Test hybrid search returns results
5. Verify version history works
6. Test search scoring makes sense (higher = more relevant)
7. Verify RAG source citations appear in chat after agent response
