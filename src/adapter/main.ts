/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

import { bridge } from '@office-ai/platform';
import { ADAPTER_BRIDGE_EVENT_KEY } from './constant';

/**
 * Bridge event data structure for IPC communication
 */
interface BridgeEventData {
  name: string;
  data: unknown;
}

const adapterWindowList: Array<BrowserWindow> = [];

/**
 * WebSocket broadcast function type
 */
type WebSocketBroadcastFn = (name: string, data: unknown) => void;

/**
 * Registered WebSocket broadcast functions
 */
const webSocketBroadcasters: WebSocketBroadcastFn[] = [];

/**
 * Register WebSocket broadcast function (for WebUI server)
 * @param broadcastFn - Broadcast function
 * @returns Unregister function
 */
export function registerWebSocketBroadcaster(broadcastFn: WebSocketBroadcastFn): () => void {
  webSocketBroadcasters.push(broadcastFn);
  return () => {
    const index = webSocketBroadcasters.indexOf(broadcastFn);
    if (index > -1) {
      webSocketBroadcasters.splice(index, 1);
    }
  };
}

/**
 * Register WebSocket message handler (for WebUI server)
 * Since bridge emitter is captured at adapter init time, we need to expose it
 */
let bridgeEmitter: { emit: (name: string, data: unknown) => unknown } | null = null;

/**
 * Get bridge emitter (for WebSocket handler)
 */
export function getBridgeEmitter(): typeof bridgeEmitter {
  return bridgeEmitter;
}

/**
 * @description Establish communication bridge with each browserWindow
 */
bridge.adapter({
  emit(name, data) {
    // 1. Send to all Electron BrowserWindows
    for (let i = 0, len = adapterWindowList.length; i < len; i++) {
      const win = adapterWindowList[i];
      win.webContents.send(ADAPTER_BRIDGE_EVENT_KEY, JSON.stringify({ name, data }));
    }
    // 2. Also broadcast to all WebSocket clients
    for (const broadcast of webSocketBroadcasters) {
      try {
        broadcast(name, data);
      } catch (error) {
        console.error('[MainAdapter] WebSocket broadcast error:', error);
      }
    }
  },
  on(emitter) {
    // Save emitter reference for WebSocket handling
    bridgeEmitter = emitter;

    ipcMain.handle(ADAPTER_BRIDGE_EVENT_KEY, (_event, info) => {
      const { name, data } = JSON.parse(info) as BridgeEventData;
      return Promise.resolve(emitter.emit(name, data));
    });
  },
});

export const initMainAdapterWithWindow = (win: BrowserWindow) => {
  adapterWindowList.push(win);
  const off = () => {
    const index = adapterWindowList.indexOf(win);
    if (index > -1) adapterWindowList.splice(index, 1);
  };
  win.on('closed', off);
  return off;
};
