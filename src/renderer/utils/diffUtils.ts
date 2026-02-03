/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parse file path from diff content
 *
 * Supports multiple diff formats:
 * - Index: path/to/file.tsx
 * - --- a/path/to/file.tsx
 * - +++ b/path/to/file.tsx
 *
 * @param diffContent - The diff content
 * @returns The relative file path, or null if unable to parse
 */
export function parseFilePathFromDiff(diffContent: string): string | null {
  const lines = diffContent.split('\n');

  // Try Index: format (SVN style)
  for (const line of lines) {
    if (line.startsWith('Index: ')) {
      return line.substring(7).trim();
    }
  }

  // Try git diff format (+++ b/ preferred as it points to the new file)
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      return line.substring(6).trim();
    }
  }

  // Fall back to --- a/ format
  for (const line of lines) {
    if (line.startsWith('--- a/')) {
      return line.substring(6).trim();
    }
  }

  return null;
}

/**
 * Extract actual file content from diff (remove metadata)
 *
 * @param diffContent - The diff content
 * @returns The extracted clean file content
 */
export function extractContentFromDiff(diffContent: string): string {
  const lines = diffContent.split('\n');
  const contentLines: string[] = [];
  let inDiffBlock = false;

  for (const line of lines) {
    // Skip diff metadata lines
    if (line.startsWith('Index:') || line.match(/^={3,}/) || line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      inDiffBlock = true;
      continue;
    }

    if (inDiffBlock) {
      // Extract added lines (remove leading +)
      if (line.startsWith('+')) {
        contentLines.push(line.substring(1));
      }
      // Skip deleted lines and context markers
      else if (line.startsWith('-') || line.startsWith('\\')) {
        continue;
      }
      // Keep empty lines too
      else {
        contentLines.push(line);
      }
    }
  }

  return contentLines.join('\n').trim();
}
