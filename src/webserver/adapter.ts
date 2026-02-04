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
  //
  // The @office-ai/platform bridge protocol wraps invoke payloads as:
  //   { id: "<correlationId>", data: <actualPayload> }
  // Provider functions receive only the inner `data` field (via `n.data`),
  // so __webUiUserId must be injected into `data.data`, not the outer wrapper.
  wsManager.setupConnectionHandler((name, data, ws) => {
    const emitter = getBridgeEmitter();
    if (emitter) {
      const userId = wsManager.getUserId(ws);
      let enriched = data;

      if (userId && typeof data === 'object' && data !== null) {
        // Bridge protocol detection: invoke payloads have an `id` field.
        // The `data` key may be absent when invoke() is called with no arguments
        // (JSON.stringify omits undefined values), so we check for `id` only.
        if ('id' in data) {
          const innerData = data.data;
          enriched = {
            ...data,
            data: typeof innerData === 'object' && innerData !== null ? { ...innerData, __webUiUserId: userId } : { __webUiUserId: userId },
          };
        } else {
          // Non-bridge-protocol messages (e.g., pong, subscribe): enrich top-level
          enriched = { ...data, __webUiUserId: userId };
        }
      }

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
