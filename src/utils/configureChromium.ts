/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';

// Configure Chromium command-line flags for WebUI and CLI modes

const isWebUI = process.argv.some((arg) => arg === '--webui');
const isResetPassword = process.argv.includes('--resetpass');

// Only configure flags for WebUI and --resetpass modes
if (isWebUI || isResetPassword) {
  // For Linux without DISPLAY, enable headless mode
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    app.commandLine.appendSwitch('headless');
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
  }

  // For root user, disable sandbox to prevent crash
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    app.commandLine.appendSwitch('no-sandbox');
  }
}
