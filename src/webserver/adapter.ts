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

/** Singleton — available after initWebAdapter(). */
let wsManagerInstance: WebSocketManager | null = null;

/**
 * Get the active WebSocketManager (for user-scoped broadcasts from outside).
 */
export function getWebSocketManager(): WebSocketManager | null {
  return wsManagerInstance;
}

/**
 * Initialize Web Adapter - Bridge communication between WebSocket and platform bridge
 *
 * Note: No longer calling bridge.adapter(), instead registering with main adapter
 * This avoids overwriting the Electron IPC adapter
 */
export function initWebAdapter(wss: WebSocketServer): void {
  const wsManager = new WebSocketManager(wss);
  wsManager.initialize();
  wsManagerInstance = wsManager;

  // Register WebSocket broadcast function to main adapter
  unregisterBroadcaster = registerWebSocketBroadcaster((name, data) => {
    wsManager.broadcast(name, data);
  });

  // Setup WebSocket message handler to forward messages to bridge emitter
  // Also tags each incoming message with the userId of the WebSocket sender
  wsManager.setupConnectionHandler((name, data, ws) => {
    const emitter = getBridgeEmitter();
    if (emitter) {
      // Attach the sender's userId so IPC providers can identify the caller
      const userId = wsManager.getUserId(ws);
      const enriched = typeof data === 'object' && data !== null ? { ...data, __webUiUserId: userId } : data;
      emitter.emit(name, enriched);
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
