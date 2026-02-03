/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform detection utilities
 */

/**
 * Check if running in Electron desktop environment
 */
export const isElectronDesktop = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
};

/**
 * Check if running on macOS
 */
export const isMacOS = (): boolean => {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
};

/**
 * Check if running on Windows
 */
export const isWindows = (): boolean => {
  return typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent);
};

/**
 * Check if running on Linux
 */
export const isLinux = (): boolean => {
  return typeof navigator !== 'undefined' && /linux/i.test(navigator.userAgent);
};
