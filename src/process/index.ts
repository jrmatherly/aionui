/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getChannelManager } from '@/channels';
import { app } from 'electron';
import './initBridge';
import initStorage from './initStorage';
import { initLogger as log } from '@/common/logger';

// Force node-gyp-build to skip build/ directory and use prebuilds/ only in production
// This prevents loading wrong architecture binaries from development environment
// Only apply in packaged app to allow development builds to use build/Release/
if (app.isPackaged) {
  process.env.PREBUILDS_ONLY = '1';
}

export const initializeProcess = async () => {
  await initStorage();

  // Initialize Channel subsystem
  try {
    await getChannelManager().initialize();
  } catch (error) {
    log.error({ err: error }, 'Failed to initialize ChannelManager');
    // Don't fail app startup if channel fails to initialize
  }
};
