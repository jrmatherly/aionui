/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { ipcBridge } from '../../common';
import { getSystemDir, ProcessEnv } from '../initStorage';
import { copyDirectoryRecursively } from '../utils';
import WorkerManage from '../WorkerManage';
import { getZoomFactor, setZoomFactor } from '../utils/zoom';

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

  ipcBridge.application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });

  ipcBridge.application.openDevTools.provider(() => {
    // This will be handled by the main window when needed
    return Promise.resolve();
  });

  ipcBridge.application.getZoomFactor.provider(() => Promise.resolve(getZoomFactor()));

  ipcBridge.application.setZoomFactor.provider(({ factor }) => {
    return Promise.resolve(setZoomFactor(factor));
  });
}
