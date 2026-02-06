#!/usr/bin/env python3
"""
Manage the user's LanceDB knowledge base.

Usage:
    python manage.py <workspace_path> <action> [options]

Actions:
    init                    Initialize empty knowledge base (idempotent)
    delete <source_file>    Delete all chunks from a document
    delete-id <chunk_id>    Delete a specific chunk by ID
    reindex                 Rebuild all indexes (FTS and vector)
    versions                List version history
    restore <version>       Restore to a specific version
    stats                   Show storage statistics
    clear                   Clear all data (with confirmation)

Options:
    --model <str>           Embedding model for init (default: text-embedding-3-small)
    --confirm               Confirm destructive actions (clear)

Output: JSON with operation result
"""

import argparse
import json
import sys
from pathlib import Path


def delete_by_source(workspace_path: str, source_file: str) -> dict:
    """Delete all chunks from a source file."""
    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"
    if not lance_dir.exists():
        return {"status": "error", "error": "Knowledge base not initialized"}

    try:
        db = lancedb.connect(str(lance_dir))
        if "knowledge" not in db.list_tables():
            return {"status": "error", "error": "No knowledge table"}

        table = db.open_table("knowledge")
        before_count = table.count_rows()

        # Delete by source file
        table.delete(f"source_file = '{source_file}'")

        after_count = table.count_rows()
        deleted = before_count - after_count

        return {
            "status": "ok",
            "action": "delete",
            "source_file": source_file,
            "deleted_chunks": deleted,
            "version": table.version,
            "remaining_chunks": after_count,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def delete_by_id(workspace_path: str, chunk_id: str) -> dict:
    """Delete a specific chunk by ID."""
    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"
    if not lance_dir.exists():
        return {"status": "error", "error": "Knowledge base not initialized"}

    try:
        db = lancedb.connect(str(lance_dir))
        if "knowledge" not in db.list_tables():
            return {"status": "error", "error": "No knowledge table"}

        table = db.open_table("knowledge")
        before_count = table.count_rows()

        table.delete(f"id = '{chunk_id}'")

        after_count = table.count_rows()
        deleted = before_count - after_count

        return {
            "status": "ok",
            "action": "delete",
            "chunk_id": chunk_id,
            "deleted": deleted > 0,
            "version": table.version,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def reindex(workspace_path: str) -> dict:
    """Rebuild all indexes."""
    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"
    if not lance_dir.exists():
        return {"status": "error", "error": "Knowledge base not initialized"}

    try:
        db = lancedb.connect(str(lance_dir))
        if "knowledge" not in db.list_tables():
            return {"status": "error", "error": "No knowledge table"}

        table = db.open_table("knowledge")

        # Optimize/compact the table
        table.optimize()

        # Recreate FTS index with optimized settings for English text
        try:
            table.create_fts_index(
                "text",
                language="English",
                stem=True,
                remove_stop_words=True,
                replace=True,
            )
            fts_created = True
        except Exception:
            fts_created = False

        return {
            "status": "ok",
            "action": "reindex",
            "optimized": True,
            "fts_index_created": fts_created,
            "version": table.version,
            "row_count": table.count_rows(),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def list_versions(workspace_path: str) -> dict:
    """List version history."""
    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"
    if not lance_dir.exists():
        return {"status": "error", "error": "Knowledge base not initialized"}

    try:
        db = lancedb.connect(str(lance_dir))
        if "knowledge" not in db.list_tables():
            return {"status": "error", "error": "No knowledge table"}

        table = db.open_table("knowledge")
        versions = table.list_versions()

        version_list = []
        for v in versions:
            # Handle both dict format (new LanceDB) and object format (old LanceDB)
            if isinstance(v, dict):
                version_list.append(
                    {
                        "version": v.get("version"),
                        "timestamp": str(v.get("timestamp")) if v.get("timestamp") else None,
                        "metadata": v.get("metadata"),
                    }
                )
            else:
                version_list.append(
                    {
                        "version": v.version,
                        "timestamp": str(v.timestamp) if hasattr(v, "timestamp") else None,
                        "metadata": v.metadata if hasattr(v, "metadata") else None,
                    }
                )

        return {
            "status": "ok",
            "action": "versions",
            "current_version": table.version,
            "versions": version_list,
            "total_versions": len(version_list),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def restore_version(workspace_path: str, version: int) -> dict:
    """Restore to a specific version."""
    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"
    if not lance_dir.exists():
        return {"status": "error", "error": "Knowledge base not initialized"}

    try:
        db = lancedb.connect(str(lance_dir))
        if "knowledge" not in db.list_tables():
            return {"status": "error", "error": "No knowledge table"}

        table = db.open_table("knowledge")
        before_version = table.version

        # Restore creates a new version from the specified historical version
        table.restore(version)

        return {
            "status": "ok",
            "action": "restore",
            "restored_from": version,
            "previous_version": before_version,
            "new_version": table.version,
            "row_count": table.count_rows(),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def get_stats(workspace_path: str) -> dict:
    """Get storage statistics."""
    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"
    if not lance_dir.exists():
        return {"status": "ok", "initialized": False, "size_bytes": 0}

    try:
        # Calculate directory size
        total_size = 0
        for path in lance_dir.rglob("*"):
            if path.is_file():
                total_size += path.stat().st_size

        db = lancedb.connect(str(lance_dir))
        tables = db.list_tables()

        stats = {
            "status": "ok",
            "action": "stats",
            "initialized": True,
            "path": str(lance_dir),
            "size_bytes": total_size,
            "size_mb": round(total_size / (1024 * 1024), 2),
            "tables": tables,
        }

        if "knowledge" in tables:
            table = db.open_table("knowledge")
            stats["knowledge"] = {
                "version": table.version,
                "row_count": table.count_rows(),
            }

            # Get source file breakdown
            try:
                df = table.search().select(["source_file"]).limit(100000).to_pandas()
                source_counts = df["source_file"].value_counts().to_dict()
                stats["knowledge"]["sources"] = [
                    {"file": file, "chunks": count}
                    for file, count in sorted(source_counts.items(), key=lambda x: -x[1])
                ]
                stats["knowledge"]["unique_sources"] = len(source_counts)
            except Exception:
                pass

        return stats
    except Exception as e:
        return {"status": "error", "error": str(e)}


def init_knowledge_base(
    workspace_path: str, embedding_model: str | None = None, embedding_dimensions: int | None = None
) -> dict:
    """Initialize an empty knowledge base for the user.

    Environment variables:
        EMBEDDING_API_KEY: API key for embedding provider (required)
        EMBEDDING_API_BASE: Base URL for OpenAI-compatible endpoint (optional)
        EMBEDDING_MODEL: Model name (optional, defaults to text-embedding-3-small)
        EMBEDDING_DIMENSIONS: Vector dimensions (optional, auto-detected if not set)
        OPENAI_API_KEY: Fallback if EMBEDDING_API_KEY not set
    """
    import os

    # Get embedding model from env or use default
    if embedding_model is None:
        embedding_model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")

    # Get embedding dimensions from env (optional - auto-detected if not set)
    if embedding_dimensions is None:
        dim_env = os.environ.get("EMBEDDING_DIMENSIONS")
        if dim_env:
            embedding_dimensions = int(dim_env)

    try:
        import lancedb
        from lancedb.embeddings import get_registry
        from lancedb.pydantic import LanceModel, Vector
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"

    # Check if already initialized
    if lance_dir.exists():
        try:
            db = lancedb.connect(str(lance_dir))
            if "knowledge" in db.list_tables():
                return {
                    "status": "ok",
                    "action": "init",
                    "message": "Knowledge base already initialized",
                    "already_exists": True,
                }
        except Exception:
            pass

    try:
        # Create directory
        lance_dir.mkdir(parents=True, exist_ok=True)

        # Get embedding configuration from environment
        # Supports custom OpenAI-compatible endpoints (Azure, LiteLLM, etc.)
        api_key = os.environ.get("EMBEDDING_API_KEY") or os.environ.get("OPENAI_API_KEY")
        api_base = os.environ.get("EMBEDDING_API_BASE")  # Custom endpoint URL

        if not api_key:
            return {"status": "error", "error": "EMBEDDING_API_KEY or OPENAI_API_KEY not set"}

        # Set OPENAI_API_KEY for LanceDB's embedding registry
        # LanceDB rejects direct api_key kwargs for security - it reads from env instead
        os.environ["OPENAI_API_KEY"] = api_key
        if api_base:
            os.environ["OPENAI_API_BASE"] = api_base

        # Create embedding function - it reads API key from OPENAI_API_KEY env var
        embed_kwargs = {"name": embedding_model}
        if api_base:
            embed_kwargs["base_url"] = api_base

        embed_func = get_registry().get("openai").create(**embed_kwargs)

        # Determine vector dimensions: explicit env var > auto-detect from model
        vector_dims = embedding_dimensions if embedding_dimensions else embed_func.ndims()

        # Define schema with embedding
        class DocumentChunk(LanceModel):
            id: str
            text: str = embed_func.SourceField()
            vector: Vector(vector_dims) = embed_func.VectorField()
            source_file: str
            page: int
            chunk_index: int
            created_at: str

        # Connect and create empty table
        db = lancedb.connect(str(lance_dir))
        table = db.create_table("knowledge", schema=DocumentChunk)

        # Create FTS index for hybrid search (critical for text search)
        fts_status = "created"
        try:
            table.create_fts_index(
                "text",
                language="English",
                stem=True,
                remove_stop_words=True,
            )
        except Exception as fts_err:
            fts_status = f"failed: {fts_err}"

        return {
            "status": "ok",
            "action": "init",
            "message": "Knowledge base initialized",
            "path": str(lance_dir),
            "version": table.version,
            "fts_index": fts_status,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def clear_knowledge(workspace_path: str, confirm: bool = False) -> dict:
    """Clear all knowledge base data."""
    if not confirm:
        return {"status": "error", "error": "Must pass --confirm to clear data"}

    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    lance_dir = Path(workspace_path) / ".lance"
    if not lance_dir.exists():
        return {"status": "ok", "message": "Nothing to clear"}

    try:
        db = lancedb.connect(str(lance_dir))

        if "knowledge" in db.list_tables():
            db.drop_table("knowledge")

        return {
            "status": "ok",
            "action": "clear",
            "message": "Knowledge base cleared",
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Manage LanceDB knowledge base")
    parser.add_argument("workspace_path", help="Path to user workspace")
    parser.add_argument(
        "action", choices=["init", "delete", "delete-id", "reindex", "versions", "restore", "stats", "clear"]
    )
    parser.add_argument("target", nargs="?", help="Target for action (source file, chunk ID, or version)")
    parser.add_argument("--confirm", action="store_true", help="Confirm destructive actions")
    parser.add_argument("--model", default="text-embedding-3-small", help="Embedding model for init")

    args = parser.parse_args()

    if args.action == "init":
        result = init_knowledge_base(args.workspace_path, embedding_model=args.model)

    elif args.action == "delete":
        if not args.target:
            print(json.dumps({"status": "error", "error": "Must specify source file"}))
            sys.exit(1)
        result = delete_by_source(args.workspace_path, args.target)

    elif args.action == "delete-id":
        if not args.target:
            print(json.dumps({"status": "error", "error": "Must specify chunk ID"}))
            sys.exit(1)
        result = delete_by_id(args.workspace_path, args.target)

    elif args.action == "reindex":
        result = reindex(args.workspace_path)

    elif args.action == "versions":
        result = list_versions(args.workspace_path)

    elif args.action == "restore":
        if not args.target:
            print(json.dumps({"status": "error", "error": "Must specify version number"}))
            sys.exit(1)
        try:
            version = int(args.target)
        except ValueError:
            print(json.dumps({"status": "error", "error": "Version must be a number"}))
            sys.exit(1)
        result = restore_version(args.workspace_path, version)

    elif args.action == "stats":
        result = get_stats(args.workspace_path)

    elif args.action == "clear":
        result = clear_knowledge(args.workspace_path, confirm=args.confirm)

    else:
        result = {"status": "error", "error": f"Unknown action: {args.action}"}

    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
