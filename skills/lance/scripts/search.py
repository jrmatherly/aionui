#!/usr/bin/env python3
"""
Search the user's LanceDB knowledge base.

Usage:
    python search.py <workspace_path> <query> [options]

Options:
    --type <str>       Search type: vector, fts, hybrid (default: hybrid)
    --limit <int>      Maximum results (default: 10)
    --filter <str>     SQL-like filter (e.g., "source_file = 'doc.pdf'")
    --model <str>      Embedding model (default: text-embedding-3-small)

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
    embedding_model: str | None = None,
) -> dict:
    """Search the knowledge base.

    Environment variables:
        EMBEDDING_API_KEY: API key for embedding provider (required for vector/hybrid)
        EMBEDDING_API_BASE: Base URL for OpenAI-compatible endpoint (optional)
        EMBEDDING_MODEL: Model name (optional, defaults to text-embedding-3-small)
        OPENAI_API_KEY: Fallback if EMBEDDING_API_KEY not set
    """
    # Get embedding model from env or use default
    if embedding_model is None:
        embedding_model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
    try:
        import lancedb
        from lancedb.embeddings import get_registry
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

    try:
        db = lancedb.connect(str(lance_dir))

        if "knowledge" not in db.table_names():
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

        # Get embedding configuration from environment
        # Supports custom OpenAI-compatible endpoints (Azure, LiteLLM, etc.)
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

        if search_type == "fts":
            # Full-text search only
            search_result = table.search(query, query_type="fts")
        elif search_type == "vector":
            # Vector search only - create embedding function
            embed_kwargs = {"name": embedding_model}
            if api_base:
                embed_kwargs["base_url"] = api_base
            embed_func = get_registry().get("openai").create(**embed_kwargs)
            query_vector = embed_func.compute_query_embeddings(query)[0]
            search_result = table.search(query_vector)
        else:
            # Hybrid search (default) - create embedding function
            embed_kwargs = {"name": embedding_model}
            if api_base:
                embed_kwargs["base_url"] = api_base
            embed_func = get_registry().get("openai").create(**embed_kwargs)
            query_vector = embed_func.compute_query_embeddings(query)[0]
            search_result = table.search(query_vector, query_type="hybrid")

        # Apply filter if provided
        if filter_expr:
            search_result = search_result.where(filter_expr)

        # Execute search and get results
        search_result = search_result.limit(limit)

        # Select columns (exclude vector for output)
        df = search_result.select(["id", "text", "source_file", "page", "chunk_index", "created_at"]).to_pandas()

        # Convert to list of dicts
        results_list = df.to_dict(orient="records")

        # Add score if available
        if "_distance" in df.columns:
            for i, row in enumerate(results_list):
                row["score"] = 1.0 - float(df.iloc[i]["_distance"])  # Convert distance to similarity

        result["results"] = results_list
        result["count"] = len(results_list)

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result


def main():
    parser = argparse.ArgumentParser(description="Search LanceDB knowledge base")
    parser.add_argument("workspace_path", help="Path to user workspace")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--type", choices=["vector", "fts", "hybrid"], default="hybrid", help="Search type")
    parser.add_argument("--limit", type=int, default=10, help="Maximum results")
    parser.add_argument("--filter", dest="filter_expr", help="SQL-like filter expression")
    parser.add_argument("--model", default="text-embedding-3-small", help="Embedding model")

    args = parser.parse_args()

    result = search_knowledge(
        args.workspace_path,
        args.query,
        search_type=args.type,
        limit=args.limit,
        filter_expr=args.filter_expr,
        embedding_model=args.model,
    )

    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
