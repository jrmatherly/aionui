/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow } from 'electron';

const UI_SCALE_DEFAULT = 1;
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.3;

let currentZoomFactor = UI_SCALE_DEFAULT;

// Clamp zoom factor into safe range
const clampZoomFactor = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return UI_SCALE_DEFAULT;
  }
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value));
};

// Expose current zoom for renderer state syncing
export const getZoomFactor = (): number => currentZoomFactor;

// Apply stored zoom to a newly created window
export const applyZoomToWindow = (win: BrowserWindow): void => {
  win.webContents.setZoomFactor(currentZoomFactor);
};

// Sync zoom factor across all BrowserWindows
const updateAllWindowsZoom = (factor: number): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.setZoomFactor(factor);
  }
};

// Persist new zoom factor and broadcast to windows
export const setZoomFactor = (factor: number): number => {
  const clamped = clampZoomFactor(factor);
  currentZoomFactor = clamped;
  updateAllWindowsZoom(clamped);
  return clamped;
};

// Adjust zoom by delta relative to current factor
export const adjustZoomFactor = (delta: number): number => {
  return setZoomFactor(currentZoomFactor + delta);
};
