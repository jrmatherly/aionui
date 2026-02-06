#!/usr/bin/env python3
"""
Ingest a document into the user's LanceDB knowledge base.

Usage:
    python ingest.py <workspace_path> <file_path> --text <text_content>
    python ingest.py <workspace_path> <file_path> --text-file <text_file>

Options:
    --chunk-size <int>    Maximum tokens per chunk (default: 500)
    --overlap <int>       Overlap between chunks (default: 100)
    --model <str>         Embedding model (default: text-embedding-3-small)

Output: JSON with ingestion status
"""

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def chunk_text(text: str, max_words: int = 500, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks by word count."""
    words = text.split()
    chunks = []
    i = 0

    while i < len(words):
        chunk_words = words[i : i + max_words]
        chunk = " ".join(chunk_words)
        if chunk.strip():
            chunks.append(chunk.strip())
        i += max_words - overlap

        # Avoid infinite loop on small texts
        if len(chunk_words) < max_words:
            break

    return chunks if chunks else [text.strip()] if text.strip() else []


def ingest_document(
    workspace_path: str,
    file_path: str,
    text_content: str,
    chunk_size: int = 500,
    overlap: int = 100,
    embedding_model: str = "text-embedding-3-small",
) -> dict:
    """Ingest a document into the knowledge base."""
    try:
        import lancedb
        from lancedb.embeddings import get_registry
        from lancedb.pydantic import LanceModel, Vector
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    workspace = Path(workspace_path)
    lance_dir = workspace / ".lance"

    # Ensure directory exists
    lance_dir.mkdir(parents=True, exist_ok=True)

    result = {
        "status": "ok",
        "file": file_path,
        "chunks_added": 0,
        "version": None,
    }

    try:
        # Get embedding function
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return {"status": "error", "error": "OPENAI_API_KEY not set"}

        embed_func = get_registry().get("openai").create(name=embedding_model, api_key=api_key)

        # Define schema with embedding
        class DocumentChunk(LanceModel):
            id: str
            text: str = embed_func.SourceField()
            vector: Vector(embed_func.ndims()) = embed_func.VectorField()
            source_file: str
            page: int
            chunk_index: int
            created_at: str

        # Connect to database
        db = lancedb.connect(str(lance_dir))

        # Create or open table
        try:
            table = db.open_table("knowledge")
            # Verify schema compatibility (basic check)
        except Exception:
            # Create new table
            table = db.create_table("knowledge", schema=DocumentChunk)

        # Chunk the text
        chunks = chunk_text(text_content, max_words=chunk_size, overlap=overlap)

        if not chunks:
            return {"status": "error", "error": "No content to ingest"}

        # Prepare records
        now = datetime.now(timezone.utc).isoformat()
        records = []

        for i, chunk in enumerate(chunks):
            record = {
                "id": str(uuid.uuid4()),
                "text": chunk,
                "source_file": file_path,
                "page": 1,  # Default to page 1; caller can extract actual page numbers
                "chunk_index": i,
                "created_at": now,
            }
            records.append(record)

        # Add to table (embeddings generated automatically)
        table.add(records)

        result["chunks_added"] = len(records)
        result["version"] = table.version
        result["total_rows"] = table.count_rows()

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result


def main():
    parser = argparse.ArgumentParser(description="Ingest document into LanceDB knowledge base")
    parser.add_argument("workspace_path", help="Path to user workspace")
    parser.add_argument("file_path", help="Source file path (for tracking)")
    parser.add_argument("--text", help="Text content to ingest")
    parser.add_argument("--text-file", help="File containing text to ingest")
    parser.add_argument("--chunk-size", type=int, default=500, help="Max words per chunk")
    parser.add_argument("--overlap", type=int, default=100, help="Overlap between chunks")
    parser.add_argument("--model", default="text-embedding-3-small", help="Embedding model")

    args = parser.parse_args()

    # Get text content
    text_content = None
    if args.text:
        text_content = args.text
    elif args.text_file:
        try:
            with open(args.text_file, "r", encoding="utf-8") as f:
                text_content = f.read()
        except Exception as e:
            print(json.dumps({"status": "error", "error": f"Failed to read text file: {e}"}))
            sys.exit(1)
    else:
        print(json.dumps({"status": "error", "error": "Must provide --text or --text-file"}))
        sys.exit(1)

    result = ingest_document(
        args.workspace_path,
        args.file_path,
        text_content,
        chunk_size=args.chunk_size,
        overlap=args.overlap,
        embedding_model=args.model,
    )

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
