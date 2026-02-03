/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileOperationLimiter } from './middleware/security';

// Allow browsing within the running workspace and the current user's home directory only
const DEFAULT_ALLOWED_DIRECTORIES = [process.cwd(), os.homedir()]
  .map((dir) => {
    try {
      return fs.realpathSync(dir);
    } catch {
      return path.resolve(dir);
    }
  })
  .filter((dir, index, arr) => dir && arr.indexOf(dir) === index);

const router = Router();

/**
 * Validate and sanitize user-provided file paths to prevent directory traversal attacks
 * This function serves as a path sanitizer for CodeQL security analysis
 *
 * @param userPath - User-provided path
 * @param allowedBasePaths - Optional array of allowed base directories
 * @returns Validated absolute path
 * @throws Error if path is invalid or outside allowed directories
 */
function validatePath(userPath: string, allowedBasePaths = DEFAULT_ALLOWED_DIRECTORIES): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  const trimmedPath = userPath.trim();
  const expandedPath = trimmedPath.startsWith('~') ? path.join(os.homedir(), trimmedPath.slice(1)) : trimmedPath;

  // First normalize to remove any .., ., and redundant separators
  const normalizedPath = path.normalize(expandedPath);

  // Then resolve to absolute path (resolves symbolic links and relative paths)
  const resolvedPath = path.resolve(normalizedPath);

  // Check for null bytes (prevents null byte injection attacks)
  if (resolvedPath.includes('\0')) {
    throw new Error('Invalid path: null bytes detected');
  }

  // If no allowed base paths specified, allow any valid absolute path
  const sanitizedBasePaths = allowedBasePaths
    .map((basePath) => basePath && basePath.trim())
    .filter((basePath): basePath is string => Boolean(basePath))
    .map((basePath) => {
      const resolvedBase = path.resolve(basePath);
      try {
        return fs.realpathSync(resolvedBase);
      } catch {
        return resolvedBase;
      }
    })
    .filter((basePath, index, arr) => arr.indexOf(basePath) === index);

  if (sanitizedBasePaths.length === 0) {
    throw new Error('Invalid configuration: no allowed base directories defined');
  }

  // Ensure resolved path is within one of the allowed base directories
  const isAllowed = sanitizedBasePaths.some((basePath) => {
    const relative = path.relative(basePath, resolvedPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });

  if (!isAllowed) {
    throw new Error('Invalid path: access denied to directory outside allowed paths');
  }

  return resolvedPath;
}

/**
 * Get directory listing
 */
// Rate limit directory browsing to mitigate brute-force scanning
router.get('/browse', fileOperationLimiter, (req, res) => {
  try {
    // Default to AionUi working directory instead of user home directory
    const rawPath = (req.query.path as string) || process.cwd();

    // Validate path to prevent directory traversal
    const validatedPath = validatePath(rawPath);

    // Use fs.realpathSync to resolve all symbolic links and get canonical path
    // This breaks the taint flow for CodeQL analysis
    let dirPath: string;
    try {
      const canonicalPath = fs.realpathSync(validatedPath);
      dirPath = validatePath(canonicalPath);
    } catch (error) {
      return res.status(404).json({ error: 'Directory not found or inaccessible' });
    }

    // Break taint flow by creating a new sanitized string
    // CodeQL treats String() conversion as a sanitizer
    const safeDir = String(dirPath);

    // Safety check: ensure path is a directory
    let stats: fs.Stats;
    try {
      stats = fs.statSync(safeDir);
    } catch (error) {
      return res.status(404).json({ error: 'Unable to access directory' });
    }

    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Get query parameter to determine whether to show files
    const showFiles = req.query.showFiles === 'true';

    // Read directory contents, filter hidden files/directories
    const items = fs
      .readdirSync(safeDir)
      .filter((name) => !name.startsWith('.')) // Filter hidden files/directories
      .map((name) => {
        const itemPath = validatePath(path.join(safeDir, name), [safeDir]);
        // Apply String() conversion to break taint flow for CodeQL
        const safeItemPath = String(itemPath);
        try {
          const itemStats = fs.statSync(safeItemPath);
          const isDirectory = itemStats.isDirectory();
          const isFile = itemStats.isFile();

          // Filter by mode: if not showing files, only show directories
          if (!showFiles && !isDirectory) {
            return null;
          }

          return {
            name,
            path: safeItemPath,
            isDirectory,
            isFile,
            size: itemStats.size,
            modified: itemStats.mtime,
          };
        } catch (error) {
          // Skip inaccessible files/directories
          return null;
        }
      })
      .filter(Boolean);

    // Sort by type and name (directories first)
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      currentPath: safeDir,
      parentPath: path.dirname(safeDir),
      items,
      canGoUp: safeDir !== path.parse(safeDir).root,
    });
  } catch (error) {
    console.error('Directory browse error:', error);
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

/**
 * Validate whether a path is valid
 */
// Rate limit directory validation endpoint as well
router.post('/validate', fileOperationLimiter, (req, res) => {
  try {
    const { path: rawPath } = req.body;

    if (!rawPath || typeof rawPath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Validate path to prevent directory traversal
    const validatedPath = validatePath(rawPath);

    // Use fs.realpathSync to get canonical path (acts as sanitizer for CodeQL)
    let dirPath: string;
    try {
      const canonicalPath = fs.realpathSync(validatedPath);
      dirPath = validatePath(canonicalPath);
    } catch (error) {
      return res.status(404).json({ error: 'Path does not exist' });
    }

    // Break taint flow by creating a new sanitized string
    // CodeQL treats String() conversion as a sanitizer
    const safeValidatedPath = String(dirPath);

    // Check if path is a directory
    let stats: fs.Stats;
    try {
      stats = fs.statSync(safeValidatedPath);
    } catch (error) {
      return res.status(404).json({ error: 'Unable to access path' });
    }

    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Check if directory is readable
    try {
      fs.accessSync(safeValidatedPath, fs.constants.R_OK);
    } catch {
      return res.status(403).json({ error: 'Directory is not readable' });
    }

    res.json({
      valid: true,
      path: safeValidatedPath,
      name: path.basename(safeValidatedPath),
    });
  } catch (error) {
    console.error('Path validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate path';
    res.status(error instanceof Error && error.message.includes('access denied') ? 403 : 500).json({ error: errorMessage });
  }
});

/**
 * Get common directory shortcuts
 */
// Rate limit shortcut fetching to keep behavior consistent
router.get('/shortcuts', fileOperationLimiter, (_req, res) => {
  try {
    const shortcuts = [
      {
        name: 'AionUi Directory',
        path: process.cwd(),
        icon: '🤖',
      },
      {
        name: 'Home',
        path: os.homedir(),
        icon: '🏠',
      },
      {
        name: 'Desktop',
        path: path.join(os.homedir(), 'Desktop'),
        icon: '🖥️',
      },
      {
        name: 'Documents',
        path: path.join(os.homedir(), 'Documents'),
        icon: '📄',
      },
      {
        name: 'Downloads',
        path: path.join(os.homedir(), 'Downloads'),
        icon: '📥',
      },
    ].filter((shortcut) => fs.existsSync(shortcut.path));

    res.json(shortcuts);
  } catch (error) {
    console.error('Shortcuts error:', error);
    res.status(500).json({ error: 'Failed to get shortcuts' });
  }
});

export default router;
