/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { getBridgeEmitter, registerWebSocketBroadcaster } from '../adapter/main';
import { WebSocketManager } from './websocket/WebSocketManager';

// Store unregister function for cleanup when server stops
let unregisterBroadcaster: (() => void) | null = null;

/**
 * Initialize Web Adapter - Bridge communication between WebSocket and platform bridge
 *
 * Note: No longer calling bridge.adapter(), instead registering with main adapter
 * This avoids overwriting the Electron IPC adapter
 */
export function initWebAdapter(wss: WebSocketServer): void {
  const wsManager = new WebSocketManager(wss);
  wsManager.initialize();

  // Register WebSocket broadcast function to main adapter
  unregisterBroadcaster = registerWebSocketBroadcaster((name, data) => {
    wsManager.broadcast(name, data);
  });

  // Setup WebSocket message handler to forward messages to bridge emitter
  wsManager.setupConnectionHandler((name, data, _ws) => {
    const emitter = getBridgeEmitter();
    if (emitter) {
      emitter.emit(name, data);
    }
  });
}

/**
 * Cleanup Web Adapter (called when server stops)
 */
export function cleanupWebAdapter(): void {
  if (unregisterBroadcaster) {
    unregisterBroadcaster();
    unregisterBroadcaster = null;
  }
}
