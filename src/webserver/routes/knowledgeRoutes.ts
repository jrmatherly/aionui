/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * Knowledge Base API Routes
 *
 * Provides REST endpoints for managing per-user LanceDB knowledge bases:
 * - GET /api/knowledge/status - Get knowledge base status (docs, chunks, storage)
 * - GET /api/knowledge/documents - List indexed documents
 * - GET /api/knowledge/search - Search knowledge base (vector/fts/hybrid)
 * - POST /api/knowledge/ingest - Ingest a document
 * - DELETE /api/knowledge/document/:source - Delete document by source file
 * - POST /api/knowledge/reindex - Rebuild indexes
 * - GET /api/knowledge/versions - List version history
 * - POST /api/knowledge/restore - Restore to a specific version
 *
 * All endpoints are authenticated and user-scoped via scopeToUser middleware.
 * Knowledge base is stored in user workspace at .lance/knowledge/
 */

import { httpLogger as log } from '@/common/logger';
import { getDirectoryService } from '@process/services/DirectoryService';
import { getMiseEnvironmentService } from '@process/services/MiseEnvironmentService';
import { getSkillsDir } from '@process/initStorage';
import { Router, type Request, type Response } from 'express';
import path from 'path';

const router = Router();

/**
 * Run a lance Python script and parse JSON output
 */
async function runLanceScript(scriptName: string, args: string[], workspaceDir: string, env?: Record<string, string>): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const miseService = getMiseEnvironmentService();

  if (!miseService.isMiseAvailable()) {
    return { success: false, error: 'Python environment not available' };
  }

  const skillsDir = getSkillsDir();
  const scriptPath = path.join(skillsDir, 'lance', 'scripts', scriptName);

  try {
    const output = await miseService.miseExecSync('python', [scriptPath, ...args], workspaceDir, env);

    // Parse JSON output
    const result = JSON.parse(output);

    if (result.status === 'error') {
      return { success: false, error: result.error || 'Unknown error' };
    }

    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ err: error, scriptName, args }, 'Failed to run lance script');
    return { success: false, error: message };
  }
}

/**
 * GET /api/knowledge/status
 * Get knowledge base status for current user
 */
router.get('/status', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    // Get OpenAI API key from environment (would come from user settings in production)
    const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' };

    const result = await runLanceScript('manage.py', [userDirs.work_dir, 'stats'], userDirs.work_dir, env);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, status: result.data });
  } catch (error) {
    log.error({ err: error }, 'Failed to get knowledge status');
    res.status(500).json({ success: false, error: 'Failed to get knowledge status' });
  }
});

/**
 * GET /api/knowledge/documents
 * List indexed documents
 *
 * Query params:
 * - limit: number (default: 100)
 * - offset: number (default: 0)
 * - source: string (filter by source file)
 */
router.get('/documents', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const source = req.query.source as string | undefined;

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    const args = [userDirs.work_dir, '--limit', String(limit), '--offset', String(offset), '--format', 'json'];
    if (source) {
      args.push('--source', source);
    }

    const result = await runLanceScript('view.py', args, userDirs.work_dir);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to list documents');
    res.status(500).json({ success: false, error: 'Failed to list documents' });
  }
});

/**
 * GET /api/knowledge/search
 * Search the knowledge base
 *
 * Query params:
 * - q: string (required) - search query
 * - type: 'vector' | 'fts' | 'hybrid' (default: hybrid)
 * - limit: number (default: 10)
 * - filter: string (SQL-like filter expression)
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const query = req.query.q as string;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Search query required' });
    }

    const searchType = (req.query.type as string) || 'hybrid';
    if (!['vector', 'fts', 'hybrid'].includes(searchType)) {
      return res.status(400).json({ success: false, error: 'Invalid search type' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
    const filter = req.query.filter as string | undefined;

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    const args = [userDirs.work_dir, query, '--type', searchType, '--limit', String(limit)];
    if (filter) {
      args.push('--filter', filter);
    }

    const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' };

    const result = await runLanceScript('search.py', args, userDirs.work_dir, env);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to search knowledge base');
    res.status(500).json({ success: false, error: 'Failed to search knowledge base' });
  }
});

/**
 * POST /api/knowledge/ingest
 * Ingest a document into the knowledge base
 *
 * Body:
 * - source: string (required) - source file path for tracking
 * - text: string (required) - text content to ingest
 * - chunkSize: number (optional) - max words per chunk (default: 500)
 * - overlap: number (optional) - overlap between chunks (default: 100)
 */
router.post('/ingest', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { source, text, chunkSize, overlap } = req.body as {
      source?: string;
      text?: string;
      chunkSize?: number;
      overlap?: number;
    };

    if (!source || typeof source !== 'string') {
      return res.status(400).json({ success: false, error: 'Source file path required' });
    }

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text content required' });
    }

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    const args = [userDirs.work_dir, source, '--text', text];

    if (chunkSize && typeof chunkSize === 'number') {
      args.push('--chunk-size', String(Math.max(100, Math.min(2000, chunkSize))));
    }

    if (overlap && typeof overlap === 'number') {
      args.push('--overlap', String(Math.max(0, Math.min(500, overlap))));
    }

    const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' };

    log.info({ userId, source, textLength: text.length }, 'Ingesting document into knowledge base');

    const result = await runLanceScript('ingest.py', args, userDirs.work_dir, env);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to ingest document');
    res.status(500).json({ success: false, error: 'Failed to ingest document' });
  }
});

/**
 * DELETE /api/knowledge/document/:source
 * Delete all chunks from a source document
 *
 * Params:
 * - source: URL-encoded source file path
 */
router.delete('/document/:source', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const source = decodeURIComponent(req.params.source);
    if (!source) {
      return res.status(400).json({ success: false, error: 'Source file path required' });
    }

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    log.info({ userId, source }, 'Deleting document from knowledge base');

    const result = await runLanceScript('manage.py', [userDirs.work_dir, 'delete', source], userDirs.work_dir);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to delete document');
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

/**
 * POST /api/knowledge/reindex
 * Rebuild all indexes
 */
router.post('/reindex', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    log.info({ userId }, 'Reindexing knowledge base');

    const result = await runLanceScript('manage.py', [userDirs.work_dir, 'reindex'], userDirs.work_dir);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to reindex knowledge base');
    res.status(500).json({ success: false, error: 'Failed to reindex knowledge base' });
  }
});

/**
 * GET /api/knowledge/versions
 * List version history
 */
router.get('/versions', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    const result = await runLanceScript('manage.py', [userDirs.work_dir, 'versions'], userDirs.work_dir);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to get version history');
    res.status(500).json({ success: false, error: 'Failed to get version history' });
  }
});

/**
 * POST /api/knowledge/restore
 * Restore to a specific version
 *
 * Body:
 * - version: number (required) - version number to restore
 */
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { version } = req.body as { version?: number };

    if (typeof version !== 'number' || version < 1) {
      return res.status(400).json({ success: false, error: 'Valid version number required' });
    }

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    log.info({ userId, version }, 'Restoring knowledge base to version');

    const result = await runLanceScript('manage.py', [userDirs.work_dir, 'restore', String(version)], userDirs.work_dir);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to restore version');
    res.status(500).json({ success: false, error: 'Failed to restore version' });
  }
});

/**
 * POST /api/knowledge/clear
 * Clear all knowledge base data (requires confirmation)
 *
 * Body:
 * - confirm: boolean (required) - must be true
 */
router.post('/clear', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { confirm } = req.body as { confirm?: boolean };

    if (confirm !== true) {
      return res.status(400).json({ success: false, error: 'Must confirm with { confirm: true }' });
    }

    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);

    log.warn({ userId }, 'Clearing knowledge base');

    const result = await runLanceScript('manage.py', [userDirs.work_dir, 'clear', '--confirm'], userDirs.work_dir);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...(result.data as object) });
  } catch (error) {
    log.error({ err: error }, 'Failed to clear knowledge base');
    res.status(500).json({ success: false, error: 'Failed to clear knowledge base' });
  }
});

export default router;
