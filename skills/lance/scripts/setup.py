#!/usr/bin/env python3
"""
Initialize or check LanceDB knowledge base for a user workspace.

Usage: python setup.py <workspace_path>

Output: JSON with status information
"""

import json
import sys
from pathlib import Path


def setup_knowledge_base(workspace_path: str) -> dict:
    """Initialize or check the knowledge base."""
    try:
        import lancedb
    except ImportError:
        return {
            "status": "error",
            "error": "lancedb not installed",
            "message": "Run: uv pip install lancedb",
        }

    workspace = Path(workspace_path)
    lance_dir = workspace / ".lance"

    result = {
        "status": "ok",
        "workspace": str(workspace),
        "lance_dir": str(lance_dir),
        "initialized": False,
        "tables": [],
        "version": None,
        "row_count": 0,
    }

    # Check if already initialized
    if lance_dir.exists():
        try:
            db = lancedb.connect(str(lance_dir))
            tables = db.table_names()
            result["initialized"] = True
            result["tables"] = tables

            if "knowledge" in tables:
                table = db.open_table("knowledge")
                result["version"] = table.version
                result["row_count"] = table.count_rows()
                result["schema"] = [str(f) for f in table.schema]
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
    else:
        # Create the directory and initialize empty DB
        lance_dir.mkdir(parents=True, exist_ok=True)
        try:
            db = lancedb.connect(str(lance_dir))
            result["initialized"] = True
            result["message"] = "Knowledge base initialized (empty)"
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "Usage: python setup.py <workspace_path>"}))
        sys.exit(1)

    workspace = sys.argv[1]
    result = setup_knowledge_base(workspace)
    print(json.dumps(result, indent=2))
