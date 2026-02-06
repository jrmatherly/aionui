/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * Python Environment API Routes
 *
 * Provides REST endpoints for managing per-user Python environments:
 * - GET /api/python/status - Get workspace status (Python version, venv, packages)
 * - GET /api/python/packages - List installed packages
 * - POST /api/python/install - Install a package
 * - POST /api/python/install-requirements - Install from requirements.txt
 * - POST /api/python/reset - Reset Python environment (delete and recreate venv)
 *
 * All endpoints are authenticated and user-scoped via scopeToUser middleware.
 */

import { httpLogger as log } from '@/common/logger';
import { getDirectoryService } from '@process/services/DirectoryService';
import { getMiseEnvironmentService } from '@process/services/MiseEnvironmentService';
import { Router, type Request, type Response } from 'express';

const router = Router();

/**
 * Validate package specifier format
 * Allows: package, package==1.0.0, package>=1.0.0, package[extra], etc.
 */
const PACKAGE_SPEC_REGEX = /^[a-zA-Z0-9_-]+(\[[\w,]+\])?([<>=!~]+[\d.a-zA-Z]+)?$/;

function validatePackageSpec(spec: string): boolean {
  return PACKAGE_SPEC_REGEX.test(spec.trim());
}

/**
 * GET /api/python/status
 * Get Python workspace status for current user
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const miseService = getMiseEnvironmentService();

    // Check if mise is available first
    if (!miseService.isMiseAvailable()) {
      return res.json({
        success: true,
        status: {
          initialized: false,
          miseAvailable: false,
          venvExists: false,
          message: 'mise is not available on this system',
        },
      });
    }

    const status = await miseService.getWorkspaceStatus(userId);

    res.json({ success: true, status });
  } catch (error) {
    log.error({ err: error }, 'Failed to get Python status');
    res.status(500).json({
      success: false,
      error: 'Failed to get Python status',
    });
  }
});

/**
 * GET /api/python/packages
 * List installed packages in user's venv
 */
router.get('/packages', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const dirService = getDirectoryService();
    const miseService = getMiseEnvironmentService();

    if (!miseService.isMiseAvailable()) {
      return res.json({ success: true, packages: [] });
    }

    const userDirs = dirService.getUserDirectories(userId);
    const packages = await miseService.getInstalledPackages(userDirs.work_dir);

    // Parse freeze format: "package==version"
    const parsed = packages.map((line) => {
      const match = line.match(/^([^=<>!~\s]+)([=<>!~]+)?(.+)?$/);
      if (match) {
        return {
          name: match[1],
          version: match[3] || 'unknown',
          specifier: match[2] || '==',
        };
      }
      return { name: line, version: 'unknown', specifier: '' };
    });

    res.json({ success: true, packages: parsed });
  } catch (error) {
    log.error({ err: error }, 'Failed to list packages');
    res.status(500).json({
      success: false,
      error: 'Failed to list packages',
    });
  }
});

/**
 * POST /api/python/install
 * Install a package in user's venv
 *
 * Body: { package: "requests" } or { package: "anthropic>=0.39.0" }
 */
router.post('/install', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { package: packageSpec } = req.body as { package?: string };

    if (!packageSpec || typeof packageSpec !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Package specification required',
      });
    }

    const trimmedSpec = packageSpec.trim();

    // Validate package spec format
    if (!validatePackageSpec(trimmedSpec)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package specification format',
      });
    }

    const dirService = getDirectoryService();
    const miseService = getMiseEnvironmentService();

    if (!miseService.isMiseAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'mise is not available on this system',
      });
    }

    const userDirs = dirService.getUserDirectories(userId);

    log.info({ userId, packageSpec: trimmedSpec }, 'Installing Python package via API');

    const success = await miseService.installPackage(userDirs.work_dir, trimmedSpec);

    if (success) {
      res.json({ success: true, message: `Installed ${trimmedSpec}` });
    } else {
      res.status(500).json({
        success: false,
        error: `Failed to install ${trimmedSpec}`,
      });
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to install package');
    res.status(500).json({
      success: false,
      error: 'Failed to install package',
    });
  }
});

/**
 * POST /api/python/install-requirements
 * Install packages from a requirements.txt file
 *
 * Body: { path: "requirements.txt" } (relative to user workspace)
 */
router.post('/install-requirements', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { path: reqPath } = req.body as { path?: string };

    if (!reqPath || typeof reqPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Requirements file path required',
      });
    }

    // Security: prevent path traversal
    if (reqPath.includes('..') || reqPath.startsWith('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid path: must be relative and cannot traverse directories',
      });
    }

    const dirService = getDirectoryService();
    const miseService = getMiseEnvironmentService();

    if (!miseService.isMiseAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'mise is not available on this system',
      });
    }

    const userDirs = dirService.getUserDirectories(userId);

    log.info({ userId, reqPath }, 'Installing requirements via API');

    const success = await miseService.installRequirements(userDirs.work_dir, reqPath);

    if (success) {
      res.json({ success: true, message: `Installed requirements from ${reqPath}` });
    } else {
      res.status(500).json({
        success: false,
        error: `Failed to install requirements from ${reqPath}`,
      });
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to install requirements');
    res.status(500).json({
      success: false,
      error: 'Failed to install requirements',
    });
  }
});

/**
 * POST /api/python/reset
 * Reset user's Python environment (delete and recreate venv)
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const miseService = getMiseEnvironmentService();

    if (!miseService.isMiseAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'mise is not available on this system',
      });
    }

    log.info({ userId }, 'Resetting Python environment via API');

    await miseService.resetUserEnv(userId);

    res.json({ success: true, message: 'Python environment reset successfully' });
  } catch (error) {
    log.error({ err: error }, 'Failed to reset Python environment');
    res.status(500).json({
      success: false,
      error: 'Failed to reset Python environment',
    });
  }
});

/**
 * GET /api/python/version
 * Get mise and Python version info
 */
router.get('/version', async (req: Request, res: Response) => {
  try {
    const userId = req.scopedUserId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const miseService = getMiseEnvironmentService();
    const dirService = getDirectoryService();

    const miseVersion = miseService.getMiseVersion();

    if (!miseVersion) {
      return res.json({
        success: true,
        version: {
          mise: null,
          python: null,
          uv: null,
        },
      });
    }

    const userDirs = dirService.getUserDirectories(userId);
    const pythonVersion = await miseService.getPythonVersion(userDirs.work_dir);

    res.json({
      success: true,
      version: {
        mise: miseVersion,
        python: pythonVersion,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to get version info');
    res.status(500).json({
      success: false,
      error: 'Failed to get version info',
    });
  }
});

export default router;
