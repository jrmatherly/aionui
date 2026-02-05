#!/usr/bin/env python3
"""
i18n Removal Script for AionUI

STATUS: COMPLETE - i18n removal was finished in v1.8.2 (commit 4e7aa0a0)
This script is kept for historical reference only.

Original Purpose:
Replaces t('key') calls with hardcoded English strings from en-US.json

Usage (historical):
  python3 scripts/remove-i18n.py [--dry-run] [--file path/to/file.tsx]

Requirements (no longer needed):
- Backup of en-US.json at /tmp/en-US-backup.json
- Run with --dry-run first to preview changes
- After running, validate with: npx tsc --noEmit
- Review git diff for unintended changes

Results achieved:
- 132 files changed, 2,458 insertions, 9,532 deletions
- ~1,000+ t() calls replaced with hardcoded English strings
- i18next, react-i18next dependencies removed
- All locale files except en-US deleted (then en-US also removed)
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, Tuple

# Configuration
LOCALE_FILE = "/tmp/en-US-backup.json"
SRC_DIR = "src"
DRY_RUN = "--dry-run" in sys.argv
SINGLE_FILE = None
for i, arg in enumerate(sys.argv):
    if arg == "--file" and i + 1 < len(sys.argv):
        SINGLE_FILE = sys.argv[i + 1]

# Statistics
stats = {
    "files_processed": 0,
    "files_modified": 0,
    "imports_removed": 0,
    "hooks_removed": 0,
    "t_calls_replaced": 0,
    "errors": [],
    "warnings": [],
}


def load_translations() -> Dict[str, str]:
    """Load en-US.json and flatten to key -> value lookup."""
    with open(LOCALE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    flat = {}

    def flatten(obj, prefix=""):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                flatten(v, key)
            else:
                flat[key] = v

    flatten(data)
    return flat


def get_translation(key: str, translations: Dict[str, str], default: str = None) -> str:
    """Get English translation for a key."""
    if key in translations:
        val = translations[key]
        # Escape single quotes for JSX
        if isinstance(val, str):
            return val.replace("'", "\\'").replace("\n", "\\n")
        return str(val)
    if default:
        return default.replace("'", "\\'").replace("\n", "\\n")
    stats["warnings"].append(f"Missing translation key: {key}")
    # Return a TypeScript error marker that will fail compilation
    return f"TODO_MISSING_TRANSLATION_{key.replace('.', '_').upper()}"


def remove_i18n_imports(content: str) -> Tuple[str, int]:
    """Remove i18n-related imports."""
    count = 0

    # Remove react-i18next imports
    patterns = [
        r"import\s*\{\s*useTranslation\s*\}\s*from\s*['\"]react-i18next['\"];\s*\n?",
        r"import\s*\{\s*useTranslation,?\s*[^}]*\}\s*from\s*['\"]react-i18next['\"];\s*\n?",
        r"import\s*\{\s*TFunction\s*\}\s*from\s*['\"]react-i18next['\"];\s*\n?",
        r"import\s*i18n\s*from\s*['\"]@/renderer/i18n['\"];\s*\n?",
        r"import\s*['\"]@/renderer/i18n['\"];\s*\n?",
        r"import\s*i18n\s*from\s*['\"]@/process/i18n['\"];\s*\n?",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, content)
        if matches:
            count += len(matches)
            content = re.sub(pattern, "", content)

    return content, count


def remove_use_translation_hook(content: str) -> Tuple[str, int]:
    """Remove useTranslation hook declarations."""
    count = 0

    patterns = [
        # const { t } = useTranslation();
        r"^\s*const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\);\s*\n?",
        # const { t, i18n } = useTranslation();
        r"^\s*const\s*\{\s*t,\s*i18n\s*\}\s*=\s*useTranslation\(\);\s*\n?",
        r"^\s*const\s*\{\s*i18n,\s*t\s*\}\s*=\s*useTranslation\(\);\s*\n?",
        # const { t: translate } = useTranslation();
        r"^\s*const\s*\{\s*t:\s*\w+\s*\}\s*=\s*useTranslation\(\);\s*\n?",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, content, re.MULTILINE)
        if matches:
            count += len(matches)
            content = re.sub(pattern, "", content, flags=re.MULTILINE)

    return content, count


def is_valid_i18n_key(key: str) -> bool:
    """Check if a key looks like a valid i18n translation key."""
    # Invalid patterns (import paths, single chars, etc.)
    if key.startswith("@/") or key.startswith("./") or key.startswith("../"):
        return False
    if key.startswith("/") or key.startswith("\\"):
        return False
    if len(key) <= 2:  # Single char or very short
        return False
    if key in [" ", "\n", "\t", ".", ",", ":", ";", "#"]:
        return False
    if "####" in key:  # Markdown headers
        return False
    # Valid keys have dots (e.g., 'common.save') or are valid identifiers
    if "." in key or re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", key):
        return True
    # Keys from our locale file
    return True


def replace_t_calls(content: str, translations: Dict[str, str]) -> Tuple[str, int]:
    """Replace t('key') and t('key', {defaultValue: 'x'}) with English strings."""
    count = 0

    # Only match t() preceded by word boundary or specific chars (not part of identifier)
    # This avoids matching things like `import('@/common')` or `split('\n')`
    # Also match i18n.t() pattern used in main process

    # Pattern for i18n.t('key') - main process usage
    pattern_i18n_simple = r"i18n\.t\(\s*['\"]([^'\"]+)['\"]\s*\)"

    def replace_i18n_simple(match):
        nonlocal count
        key = match.group(1)
        if not is_valid_i18n_key(key):
            return match.group(0)
        count += 1
        val = get_translation(key, translations)
        return f"'{val}'"

    content = re.sub(pattern_i18n_simple, replace_i18n_simple, content)

    # Pattern for t('key', { defaultValue: 'fallback' }) - object syntax
    pattern_with_default_obj = r"(?:^|[\s\(\[\{,:])t\(\s*['\"]([^'\"]+)['\"]\s*,\s*\{\s*defaultValue:\s*['\"]([^'\"]+)['\"]\s*(?:,\s*[^}]*)?\}\s*\)"

    def replace_with_default_obj(match):
        nonlocal count
        full = match.group(0)
        key = match.group(1)
        default = match.group(2)
        if not is_valid_i18n_key(key):
            return full
        count += 1
        val = get_translation(key, translations, default)
        prefix = full[0] if full[0] in " \t\n\r([{,:" else ""
        return f"{prefix}'{val}'"

    content = re.sub(
        pattern_with_default_obj, replace_with_default_obj, content, flags=re.MULTILINE
    )

    # Pattern for t('key', 'fallback') - string default syntax (common in this codebase)
    pattern_with_default_str = (
        r"(?:^|[\s\(\[\{,:])t\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)"
    )

    def replace_with_default_str(match):
        nonlocal count
        full = match.group(0)
        key = match.group(1)
        default = match.group(2)
        if not is_valid_i18n_key(key):
            return full
        count += 1
        val = get_translation(key, translations, default)
        prefix = full[0] if full[0] in " \t\n\r([{,:" else ""
        return f"{prefix}'{val}'"

    content = re.sub(
        pattern_with_default_str, replace_with_default_str, content, flags=re.MULTILINE
    )

    # Pattern for simple t('key') - use same approach
    pattern_simple = r"(?:^|[\s\(\[\{,:])t\(\s*['\"]([^'\"]+)['\"]\s*\)"

    def replace_simple(match):
        nonlocal count
        full = match.group(0)
        key = match.group(1)
        if not is_valid_i18n_key(key):
            return full  # Leave unchanged
        count += 1
        val = get_translation(key, translations)
        # Preserve the prefix character
        prefix = full[0] if full[0] in " \t\n\r([{,:" else ""
        return f"{prefix}'{val}'"

    content = re.sub(pattern_simple, replace_simple, content, flags=re.MULTILINE)

    # Pattern for t('key', { key: value }) with interpolation - convert to template literal
    pattern_interpolation = (
        r"(?:^|[\s\(\[\{,:])t\(\s*['\"]([^'\"]+)['\"]\s*,\s*\{([^}]+)\}\s*\)"
    )

    def replace_interpolation(match):
        nonlocal count
        full = match.group(0)
        key = match.group(1)
        params_str = match.group(2)

        if not is_valid_i18n_key(key):
            return full

        # Get the template string
        template = translations.get(key)
        if not template:
            stats["warnings"].append(f"Missing interpolation key: {key}")
            return full

        # Parse the params: { name: theme.name, count: 5 } -> {'name': 'theme.name', 'count': '5'}
        params = {}
        # Simple regex to extract key: value pairs
        param_pattern = r"(\w+)\s*:\s*([^,}]+)"
        for pm in re.finditer(param_pattern, params_str):
            pkey = pm.group(1).strip()
            pval = pm.group(2).strip()
            params[pkey] = pval

        # Replace {{key}} with ${value} in template
        result = template
        for pkey, pval in params.items():
            result = result.replace(f"{{{{{pkey}}}}}", f"${{{pval}}}")

        # Escape backticks and backslashes for template literal
        result = result.replace("\\", "\\\\").replace("`", "\\`")

        count += 1
        prefix = full[0] if full[0] in " \t\n\r([{,:" else ""
        return f"{prefix}`{result}`"

    content = re.sub(
        pattern_interpolation, replace_interpolation, content, flags=re.MULTILINE
    )

    return content, count


def process_file(filepath: str, translations: Dict[str, str]) -> bool:
    """Process a single file. Returns True if modified."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            original = f.read()
    except Exception as e:
        stats["errors"].append(f"Error reading {filepath}: {e}")
        return False

    content = original

    # Skip if no i18n usage
    if (
        "useTranslation" not in content
        and "t('" not in content
        and 't("' not in content
    ):
        return False

    stats["files_processed"] += 1

    # Remove imports
    content, import_count = remove_i18n_imports(content)
    stats["imports_removed"] += import_count

    # Remove hooks
    content, hook_count = remove_use_translation_hook(content)
    stats["hooks_removed"] += hook_count

    # Replace t() calls
    content, t_count = replace_t_calls(content, translations)
    stats["t_calls_replaced"] += t_count

    # Check if modified
    if content != original:
        stats["files_modified"] += 1

        if DRY_RUN:
            print(f"[DRY-RUN] Would modify: {filepath}")
            print(f"  - Imports removed: {import_count}")
            print(f"  - Hooks removed: {hook_count}")
            print(f"  - t() calls replaced: {t_count}")
        else:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(
                f"[MODIFIED] {filepath} (imports: {import_count}, hooks: {hook_count}, t(): {t_count})"
            )

        return True

    return False


def main():
    print("=" * 60)
    print("AionUI i18n Removal Script")
    print("=" * 60)

    if DRY_RUN:
        print("MODE: DRY-RUN (no files will be modified)")
    else:
        print("MODE: LIVE (files will be modified)")
    print()

    # Load translations
    print(f"Loading translations from {LOCALE_FILE}...")
    translations = load_translations()
    print(f"Loaded {len(translations)} translation keys")
    print()

    # Find files to process
    if SINGLE_FILE:
        files = [SINGLE_FILE] if os.path.exists(SINGLE_FILE) else []
    else:
        files = []
        for ext in ["*.tsx", "*.ts"]:
            files.extend(Path(SRC_DIR).rglob(ext))
        files = [str(f) for f in files]

    print(f"Scanning {len(files)} files...")
    print()

    # Process files
    for filepath in sorted(files):
        process_file(filepath, translations)

    # Print summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Files scanned:      {len(files)}")
    print(f"Files with i18n:    {stats['files_processed']}")
    print(f"Files modified:     {stats['files_modified']}")
    print(f"Imports removed:    {stats['imports_removed']}")
    print(f"Hooks removed:      {stats['hooks_removed']}")
    print(f"t() calls replaced: {stats['t_calls_replaced']}")

    if stats["warnings"]:
        print()
        print("WARNINGS:")
        for w in stats["warnings"][:20]:  # Limit output
            print(f"  - {w}")
        if len(stats["warnings"]) > 20:
            print(f"  ... and {len(stats['warnings']) - 20} more")

    if stats["errors"]:
        print()
        print("ERRORS:")
        for e in stats["errors"]:
            print(f"  - {e}")

    print()
    if DRY_RUN:
        print("Run without --dry-run to apply changes")
    else:
        print("Next steps:")
        print("  1. npx tsc --noEmit  # Validate TypeScript")
        print("  2. git diff          # Review changes")


if __name__ == "__main__":
    os.chdir("/Users/jason/dev/ai-mission-control/aionui")
    main()
