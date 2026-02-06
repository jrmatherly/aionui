#!/usr/bin/env python3
"""
Search the user's LanceDB knowledge base.

Usage:
    python search.py <workspace_path> <query> [options]

Options:
    --type <str>       Search type: vector, fts, hybrid (default: hybrid)
    --limit <int>      Maximum results (default: 10)
    --filter <str>     SQL-like filter (e.g., "source_file = 'doc.pdf'")

Output: JSON with search results
"""

import argparse
import json
import os
from pathlib import Path


def search_knowledge(
    workspace_path: str,
    query: str,
    search_type: str = "hybrid",
    limit: int = 10,
    filter_expr: str | None = None,
) -> dict:
    """Search the knowledge base.

    Embedding functions are NOT restored by open_table() — they must be
    re-created explicitly at search time.  For hybrid search we use the
    explicit vector + text pattern so LanceDB gets both a pre-computed
    vector (for ANN) and the raw string (for FTS).

    Environment variables:
        EMBEDDING_API_KEY: API key for embedding provider (required for vector/hybrid)
        EMBEDDING_API_BASE: Base URL for OpenAI-compatible endpoint (optional)
        EMBEDDING_MODEL: Model name (optional, defaults to text-embedding-3-small)
        EMBEDDING_DIMENSIONS: Vector dimensions (optional)
        OPENAI_API_KEY: Fallback if EMBEDDING_API_KEY not set
    """
    try:
        import lancedb
        from lancedb.embeddings import get_registry
        from lancedb.rerankers import RRFReranker
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    workspace = Path(workspace_path)
    lance_dir = workspace / ".lance"

    if not lance_dir.exists():
        return {"status": "error", "error": "Knowledge base not initialized"}

    result = {
        "status": "ok",
        "query": query,
        "type": search_type,
        "results": [],
    }

    # Get embedding configuration from environment BEFORE connecting/opening table.
    # open_table() may try to deserialize the stored embedding function, which
    # reads OPENAI_API_KEY from the environment — so it must be set first.
    api_key = os.environ.get("EMBEDDING_API_KEY") or os.environ.get("OPENAI_API_KEY")
    api_base = os.environ.get("EMBEDDING_API_BASE")  # Custom endpoint URL

    if not api_key and search_type in ("vector", "hybrid"):
        return {"status": "error", "error": "EMBEDDING_API_KEY or OPENAI_API_KEY required for vector search"}

    # Set OPENAI_API_KEY for LanceDB's embedding registry
    # LanceDB rejects direct api_key kwargs for security - it reads from env instead
    if api_key:
        os.environ["OPENAI_API_KEY"] = api_key
    if api_base:
        os.environ["OPENAI_API_BASE"] = api_base

    try:
        db = lancedb.connect(str(lance_dir))

        if "knowledge" not in db.list_tables().tables:
            return {"status": "error", "error": "No knowledge table found"}

        table = db.open_table("knowledge")

        if table.count_rows() == 0:
            return {
                "status": "ok",
                "query": query,
                "type": search_type,
                "results": [],
                "message": "Knowledge base is empty",
            }

        if search_type == "fts":
            # Full-text search only — no embedding needed
            search_result = table.search(query, query_type="fts")
        elif search_type == "vector":
            # Vector search — compute embedding explicitly (open_table doesn't restore embed fn)
            query_vector = _compute_query_vector(query, get_registry, api_base)
            search_result = table.search(query_vector)
        else:
            # Hybrid search — use explicit vector + text pattern from LanceDB docs:
            #   table.search(query_type="hybrid").vector(vec).text(query)
            # This gives LanceDB both the pre-computed vector (ANN) and raw text (FTS).
            query_vector = _compute_query_vector(query, get_registry, api_base)
            reranker = RRFReranker()
            search_result = table.search(query_type="hybrid").vector(query_vector).text(query).rerank(reranker)

        # Apply filter if provided
        if filter_expr:
            search_result = search_result.where(filter_expr)

        # Execute search and get results
        search_result = search_result.limit(limit)

        # Select columns (exclude vector for output)
        df = search_result.select(["id", "text", "source_file", "page", "chunk_index", "created_at"]).to_pandas()

        # Convert to list of dicts
        results_list = df.to_dict(orient="records")

        # Add score if available (handle different score columns from different search types)
        if "_relevance_score" in df.columns:
            # RRF reranker returns relevance score (higher = better)
            for i, row in enumerate(results_list):
                row["score"] = float(df.iloc[i]["_relevance_score"])
        elif "_score" in df.columns:
            # FTS returns BM25 score (higher = better)
            for i, row in enumerate(results_list):
                row["score"] = float(df.iloc[i]["_score"])
        elif "_distance" in df.columns:
            # Vector search returns distance (lower = better)
            # For cosine: distance ranges 0-2, score = 1 - (distance / 2)
            for i, row in enumerate(results_list):
                distance = float(df.iloc[i]["_distance"])
                row["score"] = max(0, 1.0 - (distance / 2.0))

        result["results"] = results_list
        result["count"] = len(results_list)

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result


def _compute_query_vector(query: str, get_registry, api_base: str | None) -> list[float]:
    """Create embedding function and compute query vector.

    open_table() does NOT restore the embedding function from table metadata,
    so we must re-create it explicitly for every search that needs embeddings.
    """
    embedding_model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
    dim_env = os.environ.get("EMBEDDING_DIMENSIONS")

    embed_kwargs = {"name": embedding_model}
    if api_base:
        embed_kwargs["base_url"] = api_base
    if dim_env:
        embed_kwargs["dim"] = int(dim_env)

    embed_func = get_registry().get("openai").create(**embed_kwargs)
    return embed_func.compute_query_embeddings(query)[0]


def main():
    parser = argparse.ArgumentParser(description="Search LanceDB knowledge base")
    parser.add_argument("workspace_path", help="Path to user workspace")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--type", choices=["vector", "fts", "hybrid"], default="hybrid", help="Search type")
    parser.add_argument("--limit", type=int, default=10, help="Maximum results")
    parser.add_argument("--filter", dest="filter_expr", help="SQL-like filter expression")

    args = parser.parse_args()

    result = search_knowledge(
        args.workspace_path,
        args.query,
        search_type=args.type,
        limit=args.limit,
        filter_expr=args.filter_expr,
    )

    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
