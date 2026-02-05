/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('WorkspaceHistory');

const WORKSPACE_UPDATE_TIME_KEY = 'aionui_workspace_update_time';

/**
 * Get the last update time of a workspace
 */
export const getWorkspaceUpdateTime = (workspace: string): number => {
  try {
    const stored = localStorage.getItem(WORKSPACE_UPDATE_TIME_KEY);
    if (stored) {
      const times = JSON.parse(stored) as Record<string, number>;
      return times[workspace] || 0;
    }
  } catch {
    // Ignore parsing errors and fall back to default
  }
  return 0;
};

/**
 * Update the last update time of a workspace
 * Call this function when creating a new session
 */
export const updateWorkspaceTime = (workspace: string): void => {
  try {
    const stored = localStorage.getItem(WORKSPACE_UPDATE_TIME_KEY);
    const times = stored ? JSON.parse(stored) : {};
    times[workspace] = Date.now();
    localStorage.setItem(WORKSPACE_UPDATE_TIME_KEY, JSON.stringify(times));
  } catch (error) {
    log.error({ err: error }, 'Failed to update workspace time');
  }
};
