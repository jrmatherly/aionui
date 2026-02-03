/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import fs from 'fs';

// Store all file watchers
const watchers = new Map<string, fs.FSWatcher>();

// Initialize file watch bridge to manage start/stop of watchers
export function initFileWatchBridge(): void {
  // Start watching file
  ipcBridge.fileWatch.startWatch.provider(({ filePath }) => {
    try {
      // Stop existing watcher if any
      if (watchers.has(filePath)) {
        watchers.get(filePath)?.close();
        watchers.delete(filePath);
      }

      // Create file watcher
      const watcher = fs.watch(filePath, (eventType) => {
        // Notify renderer process on file change
        ipcBridge.fileWatch.fileChanged.emit({ filePath, eventType });
      });

      watchers.set(filePath, watcher);

      return Promise.resolve({ success: true });
    } catch (error) {
      console.error('[FileWatch] Failed to start watching:', error);
      return Promise.resolve({ success: false, msg: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Stop watching file
  ipcBridge.fileWatch.stopWatch.provider(({ filePath }) => {
    try {
      if (watchers.has(filePath)) {
        watchers.get(filePath)?.close();
        watchers.delete(filePath);
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: false, msg: 'No watcher found for this file' });
    } catch (error) {
      console.error('[FileWatch] Failed to stop watching:', error);
      return Promise.resolve({ success: false, msg: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Stop all watchers
  ipcBridge.fileWatch.stopAllWatches.provider(() => {
    try {
      watchers.forEach((watcher) => {
        watcher.close();
      });
      watchers.clear();
      return Promise.resolve({ success: true });
    } catch (error) {
      console.error('[FileWatch] Failed to stop all watches:', error);
      return Promise.resolve({ success: false, msg: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
