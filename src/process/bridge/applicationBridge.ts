/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { getBrandingConfig } from '@/common/branding';
import { ipcBridge } from '../../common';
import { getSystemDir, ProcessEnv } from '../initStorage';
import { getDirectoryService } from '../services/DirectoryService';
import { copyDirectoryRecursively } from '../utils';
import WorkerManage from '../WorkerManage';
import { getZoomFactor, setZoomFactor } from '../utils/zoom';
import { fsLogger as log } from '@/common/logger';

export function initApplicationBridge(): void {
  ipcBridge.application.restart.provider(() => {
    // Clear all worker processes
    WorkerManage.clear();
    // Restart the application using standard Electron relaunch method
    app.relaunch();
    app.exit(0);
    return Promise.resolve();
  });

  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
    try {
      const oldDir = getSystemDir();
      if (oldDir.cacheDir !== cacheDir) {
        await copyDirectoryRecursively(oldDir.cacheDir, cacheDir);
      }
      await ProcessEnv.set('aionui.dir', { cacheDir, workDir });
      return { success: true };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.systemInfo.provider((params?: any) => {
    const systemDir = getSystemDir();

    // If userId is provided (via __webUiUserId from WebSocket adapter), return per-user directories
    const userId = params?.__webUiUserId;
    if (userId) {
      try {
        const dirService = getDirectoryService();
        const userDirs = dirService.getUserDirectories(userId);
        return Promise.resolve({
          cacheDir: userDirs.cache_dir,
          workDir: userDirs.work_dir,
          platform: systemDir.platform,
          arch: systemDir.arch,
          // Include additional user directory info
          skillsDir: userDirs.skills_dir,
          assistantsDir: userDirs.assistants_dir,
          isUserScoped: true,
        });
      } catch (error) {
        log.warn({ userId, err: error }, 'Failed to get user directories, using system defaults');
      }
    }

    // Fall back to system directories
    return Promise.resolve({
      ...systemDir,
      isUserScoped: false,
    });
  });

  ipcBridge.application.openDevTools.provider(() => {
    // This will be handled by the main window when needed
    return Promise.resolve();
  });

  ipcBridge.application.getZoomFactor.provider(() => Promise.resolve(getZoomFactor()));

  ipcBridge.application.setZoomFactor.provider(({ factor }) => {
    return Promise.resolve(setZoomFactor(factor));
  });

  // Branding configuration (env var overrides)
  ipcBridge.branding.getConfig.provider(() => {
    return Promise.resolve(getBrandingConfig());
  });
}
