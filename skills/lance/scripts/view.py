#!/usr/bin/env python3
"""
View documents in the user's LanceDB knowledge base.

Usage:
    python view.py <workspace_path> [options]

Options:
    --limit <int>      Maximum documents (default: 100)
    --offset <int>     Skip first N documents (default: 0)
    --source <str>     Filter by source file
    --format <str>     Output format: json, table, summary (default: json)

Output: JSON with document list and metadata
"""

import argparse
import json
from pathlib import Path


def view_knowledge(
    workspace_path: str,
    limit: int = 100,
    offset: int = 0,
    source_filter: str | None = None,
    output_format: str = "json",
) -> dict:
    """View documents in the knowledge base."""
    try:
        import lancedb
    except ImportError:
        return {"status": "error", "error": "lancedb not installed"}

    workspace = Path(workspace_path)
    lance_dir = workspace / ".lance"

    if not lance_dir.exists():
        return {
            "status": "ok",
            "initialized": False,
            "message": "Knowledge base not initialized",
            "documents": [],
            "total_chunks": 0,
        }

    result = {
        "status": "ok",
        "initialized": True,
        "documents": [],
        "total_chunks": 0,
        "version": None,
    }

    try:
        db = lancedb.connect(str(lance_dir))

        if "knowledge" not in db.list_tables().tables:
            result["message"] = "No knowledge table found"
            return result

        table = db.open_table("knowledge")
        result["version"] = table.version
        result["total_chunks"] = table.count_rows()
        result["schema"] = [str(f) for f in table.schema]

        if result["total_chunks"] == 0:
            result["message"] = "Knowledge base is empty"
            return result

        # Build query
        query = table.search()

        # Apply source filter if provided
        if source_filter:
            query = query.where(f"source_file = '{source_filter}'")

        # Select columns (exclude vector for display)
        columns = ["id", "text", "source_file", "page", "chunk_index", "created_at"]
        query = query.select(columns)

        # Apply pagination
        # Note: LanceDB doesn't have native offset, so we fetch more and slice
        df = query.limit(limit + offset).to_pandas()

        if offset > 0:
            df = df.iloc[offset:]

        # Convert to list
        documents = df.to_dict(orient="records")

        # Truncate text for summary view
        if output_format == "summary":
            for doc in documents:
                if len(doc.get("text", "")) > 200:
                    doc["text"] = doc["text"][:200] + "..."

        # Group by source file for aggregated view
        if output_format in ("json", "summary"):
            # Add aggregated stats
            all_df = table.search().select(["source_file"]).limit(10000).to_pandas()
            source_counts = all_df["source_file"].value_counts().to_dict()
            result["sources"] = [
                {"file": file, "chunks": count} for file, count in sorted(source_counts.items(), key=lambda x: -x[1])
            ]
            result["unique_sources"] = len(source_counts)

        result["documents"] = documents
        result["returned_count"] = len(documents)

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result


def format_table(result: dict) -> str:
    """Format result as ASCII table."""
    if result.get("status") == "error":
        return f"Error: {result.get('error')}"

    if not result.get("documents"):
        return "No documents found."

    lines = []
    lines.append(f"Knowledge Base: {result.get('total_chunks', 0)} chunks, {result.get('unique_sources', 0)} sources")
    lines.append("-" * 80)
    lines.append(f"{'Source File':<30} {'Page':<6} {'Chunk':<6} {'Text Preview':<36}")
    lines.append("-" * 80)

    for doc in result["documents"][:50]:  # Limit table output
        source = doc.get("source_file", "")[:28]
        page = str(doc.get("page", ""))
        chunk = str(doc.get("chunk_index", ""))
        text = doc.get("text", "")[:34].replace("\n", " ")
        lines.append(f"{source:<30} {page:<6} {chunk:<6} {text:<36}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="View LanceDB knowledge base")
    parser.add_argument("workspace_path", help="Path to user workspace")
    parser.add_argument("--limit", type=int, default=100, help="Maximum documents")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N documents")
    parser.add_argument("--source", help="Filter by source file")
    parser.add_argument("--format", choices=["json", "table", "summary"], default="json", help="Output format")

    args = parser.parse_args()

    result = view_knowledge(
        args.workspace_path,
        limit=args.limit,
        offset=args.offset,
        source_filter=args.source,
        output_format=args.format,
    )

    if args.format == "table":
        print(format_table(result))
    else:
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
