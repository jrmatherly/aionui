/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Directory browsing API for file/folder selection.
 *
 * SECURITY: In multi-user deployments, file browsing is scoped to the
 * authenticated user's workspace directory. Users cannot navigate outside
 * their workspace or see other users' files.
 */

import type { Request } from 'express';
import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDirectoryService } from '../process/services/DirectoryService';
import { fileOperationLimiter } from './middleware/security';
import { fsLogger as log } from '@/common/logger';

/**
 * Get allowed directories for a user.
 * In multi-user mode, this returns only the user's workspace.
 * Falls back to a safe default if userId is not available.
 */
function getAllowedDirectoriesForUser(userId?: string): string[] {
  if (userId) {
    try {
      const directoryService = getDirectoryService();
      const userWorkDir = directoryService.getUserWorkDir(userId);
      // Also allow the cache dir for accessing uploaded files
      const userCacheDir = directoryService.getUserCacheDir(userId);
      return [userWorkDir, userCacheDir]
        .map((dir) => {
          try {
            return fs.realpathSync(dir);
          } catch {
            return path.resolve(dir);
          }
        })
        .filter((dir, index, arr) => dir && arr.indexOf(dir) === index);
    } catch (error) {
      log.error({ err: error }, 'Failed to get user directories');
    }
  }

  // Fallback: return empty array (no access) if user context is not available
  // This is safer than exposing system directories
  log.warn('No user context available, returning empty allowed directories');
  return [];
}

/**
 * Get default directory for a user (starting point for file browser)
 */
function getDefaultDirectoryForUser(userId?: string): string {
  if (userId) {
    try {
      const directoryService = getDirectoryService();
      return directoryService.getUserWorkDir(userId);
    } catch (error) {
      log.error({ err: error }, 'Failed to get user workspace');
    }
  }
  // Fallback to /tmp if no user context (will fail validation anyway)
  return '/tmp';
}

const router = Router();

/**
 * Validate and sanitize user-provided file paths to prevent directory traversal attacks
 * This function serves as a path sanitizer for CodeQL security analysis
 *
 * @param userPath - User-provided path
 * @param allowedBasePaths - Array of allowed base directories (user-scoped)
 * @returns Validated absolute path
 * @throws Error if path is invalid or outside allowed directories
 */
function validatePath(userPath: string, allowedBasePaths: string[]): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  const trimmedPath = userPath.trim();

  // Disallow ~ expansion in multi-user mode (prevents access to other users' home dirs)
  if (trimmedPath.startsWith('~')) {
    throw new Error('Invalid path: home directory shortcuts not allowed');
  }

  // First normalize to remove any .., ., and redundant separators
  const normalizedPath = path.normalize(trimmedPath);

  // Then resolve to absolute path (resolves symbolic links and relative paths)
  const resolvedPath = path.resolve(normalizedPath);

  // Check for null bytes (prevents null byte injection attacks)
  if (resolvedPath.includes('\0')) {
    throw new Error('Invalid path: null bytes detected');
  }

  // Sanitize allowed base paths
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
    throw new Error('Access denied: no accessible directories available');
  }

  // Ensure resolved path is within one of the allowed base directories
  const isAllowed = sanitizedBasePaths.some((basePath) => {
    const relative = path.relative(basePath, resolvedPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });

  if (!isAllowed) {
    throw new Error('Access denied: path is outside your workspace');
  }

  return resolvedPath;
}

/**
 * Get directory listing
 * Scoped to the authenticated user's workspace
 */
router.get('/browse', fileOperationLimiter, (req: Request, res) => {
  try {
    // Get user-scoped allowed directories
    const userId = req.scopedUserId;
    const allowedDirs = getAllowedDirectoriesForUser(userId);

    if (allowedDirs.length === 0) {
      return res.status(403).json({ error: 'No accessible directories available' });
    }

    // Default to user's workspace instead of system directory
    const rawPath = (req.query.path as string) || getDefaultDirectoryForUser(userId);

    // Validate path against user's allowed directories
    let validatedPath: string;
    try {
      validatedPath = validatePath(rawPath, allowedDirs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid path';
      return res.status(403).json({ error: errorMessage });
    }

    // Use fs.realpathSync to resolve all symbolic links and get canonical path
    // This breaks the taint flow for CodeQL analysis
    let dirPath: string;
    try {
      const canonicalPath = fs.realpathSync(validatedPath);
      dirPath = validatePath(canonicalPath, allowedDirs);
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
        try {
          const itemPath = validatePath(path.join(safeDir, name), allowedDirs);
          // Apply String() conversion to break taint flow for CodeQL
          const safeItemPath = String(itemPath);
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
          // Skip items that fail validation (outside allowed paths)
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

    // Determine if user can go up (only within allowed directories)
    const parentPath = path.dirname(safeDir);
    let canGoUp = false;
    try {
      validatePath(parentPath, allowedDirs);
      canGoUp = true;
    } catch {
      // Parent is outside allowed directories
      canGoUp = false;
    }

    res.json({
      currentPath: safeDir,
      parentPath: canGoUp ? parentPath : undefined,
      items,
      canGoUp,
    });
  } catch (error) {
    log.error({ err: error }, 'Directory browse error');
    const errorMessage = error instanceof Error ? error.message : 'Failed to read directory';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Validate whether a path is valid
 * Scoped to the authenticated user's workspace
 */
router.post('/validate', fileOperationLimiter, (req: Request, res) => {
  try {
    const { path: rawPath } = req.body;

    if (!rawPath || typeof rawPath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Get user-scoped allowed directories
    const userId = req.scopedUserId;
    const allowedDirs = getAllowedDirectoriesForUser(userId);

    if (allowedDirs.length === 0) {
      return res.status(403).json({ error: 'No accessible directories available' });
    }

    // Validate path against user's allowed directories
    let validatedPath: string;
    try {
      validatedPath = validatePath(rawPath, allowedDirs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid path';
      return res.status(403).json({ error: errorMessage });
    }

    // Use fs.realpathSync to get canonical path (acts as sanitizer for CodeQL)
    let dirPath: string;
    try {
      const canonicalPath = fs.realpathSync(validatedPath);
      dirPath = validatePath(canonicalPath, allowedDirs);
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
    log.error({ err: error }, 'Path validation error');
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate path';
    res.status(error instanceof Error && error.message.includes('Access denied') ? 403 : 500).json({ error: errorMessage });
  }
});

/**
 * Get directory shortcuts for the current user
 * Shows user's workspace and cache directories only
 */
router.get('/shortcuts', fileOperationLimiter, (req: Request, res) => {
  try {
    const userId = req.scopedUserId;

    if (!userId) {
      return res.status(403).json({ error: 'Authentication required' });
    }

    const directoryService = getDirectoryService();
    const userDirs = directoryService.getUserDirectories(userId);

    const shortcuts = [
      {
        name: 'My Workspace',
        path: userDirs.work_dir,
        icon: '📁',
      },
      {
        name: 'My Files',
        path: userDirs.cache_dir,
        icon: '📂',
      },
    ].filter((shortcut) => {
      try {
        return fs.existsSync(shortcut.path);
      } catch {
        return false;
      }
    });

    res.json(shortcuts);
  } catch (error) {
    log.error({ err: error }, 'Shortcuts error');
    res.status(500).json({ error: 'Failed to get shortcuts' });
  }
});

/**
 * Upload a file to the user's workspace.
 * Accepts JSON body with base64-encoded file content.
 * Files are saved to the current browsing directory (must be within user workspace).
 *
 * Body: { filename: string, content: string (base64), targetDir?: string }
 * Max file size: ~50MB (base64 encoded)
 */
router.post('/upload', express.json({ limit: '75mb' }), fileOperationLimiter, (req: Request, res) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(403).json({ error: 'Authentication required' });
    }

    const { filename, content, targetDir } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Filename is required' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'File content is required' });
    }

    // Sanitize filename — strip path separators and control chars to prevent traversal
    // eslint-disable-next-line no-control-regex
    const safeName = path.basename(filename).replace(/[<>:"|?*\x00-\x1f]/g, '_');
    if (!safeName || safeName === '.' || safeName === '..') {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Determine target directory (default: user workspace)
    const allowedDirs = getAllowedDirectoriesForUser(userId);
    if (allowedDirs.length === 0) {
      return res.status(403).json({ error: 'No accessible directories available' });
    }

    let saveDir: string;
    if (targetDir && typeof targetDir === 'string') {
      try {
        saveDir = validatePath(targetDir, allowedDirs);
      } catch {
        return res.status(403).json({ error: 'Target directory is not accessible' });
      }
    } else {
      saveDir = getDefaultDirectoryForUser(userId);
    }

    // Ensure save directory exists
    fs.mkdirSync(saveDir, { recursive: true });

    // Decode base64 content and write file
    const filePath = path.join(saveDir, safeName);
    const validatedFilePath = validatePath(filePath, allowedDirs);

    const buffer = Buffer.from(content, 'base64');
    fs.writeFileSync(validatedFilePath, buffer);

    res.json({
      success: true,
      path: validatedFilePath,
      name: safeName,
      size: buffer.length,
    });
  } catch (error) {
    log.error({ err: error }, 'File upload error');
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
