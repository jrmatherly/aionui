/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ElectronBridgeAPI } from '@/types/electron';
import { bridge, logger } from '@office-ai/platform';

interface CustomWindow extends Window {
  electronAPI?: ElectronBridgeAPI;
  __bridgeEmitter?: { emit: (name: string, data: unknown) => void };
  __emitBridgeCallback?: (name: string, data: unknown) => void;
  __websocketReconnect?: () => void;
}

const win = window as CustomWindow;

/**
 * Adapt Electron API to browser, establishing communication bridge between renderer and main,
 * corresponding to the injection in preload.ts
 */
if (win.electronAPI) {
  // Electron environment - use IPC communication
  bridge.adapter({
    emit(name, data) {
      return win.electronAPI.emit(name, data);
    },
    on(emitter) {
      win.electronAPI?.on((event) => {
        try {
          const { value } = event;
          const { name, data } = JSON.parse(value);
          emitter.emit(name, data);
        } catch (e) {
          console.warn('JSON parsing error:', e);
        }
      });
    },
  });
} else {
  // Web environment - use WebSocket communication, auto-reconnect after login to send session cookie
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultHost = `${window.location.hostname}:25808`;
  const socketUrl = `${protocol}//${window.location.host || defaultHost}`;

  type QueuedMessage = { name: string; data: unknown };

  let socket: WebSocket | null = null;
  let emitterRef: { emit: (name: string, data: unknown) => void } | null = null;
  let reconnectTimer: number | null = null;
  let reconnectDelay = 500;
  let shouldReconnect = true; // Flag to control reconnection

  const messageQueue: QueuedMessage[] = [];

  // 1. Send queued messages to ensure no events are lost after reconnection
  const flushQueue = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (messageQueue.length > 0) {
      const queued = messageQueue.shift();
      if (queued) {
        socket.send(JSON.stringify(queued));
      }
    }
  };

  // 2. Simple exponential backoff reconnection, wait for server to accept new connection after login
  const scheduleReconnect = () => {
    if (reconnectTimer !== null || !shouldReconnect) {
      return;
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 8000);
      connect();
    }, reconnectDelay);
  };

  // 3. Establish WebSocket connection (or reuse existing OPEN/CONNECTING state)
  const connect = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      socket = new WebSocket(socketUrl);
    } catch (error) {
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      reconnectDelay = 500;
      flushQueue();
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      if (!emitterRef) {
        return;
      }

      try {
        const payload = JSON.parse(event.data as string) as { name: string; data: unknown };

        // Handle server heartbeat ping - respond with pong immediately to keep connection alive
        if (payload.name === 'ping') {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ name: 'pong', data: { timestamp: Date.now() } }));
          }
          return;
        }

        // Handle auth expiration - stop reconnecting and redirect to login
        if (payload.name === 'auth-expired') {
          console.warn('[WebSocket] Authentication expired, stopping reconnection');
          shouldReconnect = false;

          // Clear any pending reconnection timer
          if (reconnectTimer !== null) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }

          // Close the socket and redirect to login page
          socket?.close();

          // Redirect to login page after a short delay to show any UI feedback
          setTimeout(() => {
            window.location.href = '/login';
          }, 1000);

          return;
        }

        emitterRef.emit(payload.name, payload.data);
      } catch (error) {
        // Ignore malformed payloads
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      socket?.close();
    });
  };

  // 4. Ensure connection is initiated before sending/subscribing
  const ensureSocket = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      connect();
    }
  };

  bridge.adapter({
    emit(name, data) {
      const message: QueuedMessage = { name, data };

      ensureSocket();

      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(message));
          return;
        } catch (error) {
          scheduleReconnect();
        }
      }

      messageQueue.push(message);
    },
    on(emitter) {
      emitterRef = emitter;
      win.__bridgeEmitter = emitter;

      // Expose callback emitter for bridge provider pattern
      // Used by components to send responses back through WebSocket
      win.__emitBridgeCallback = (name: string, data: unknown) => {
        emitter.emit(name, data);
      };

      ensureSocket();
    },
  });

  connect();

  // Expose reconnection control for login flow
  win.__websocketReconnect = () => {
    shouldReconnect = true;
    reconnectDelay = 500;
    connect();
  };
}

logger.provider({
  log(log) {
    console.log('process.log', log.type, ...log.logs);
  },
  path() {
    return Promise.resolve('');
  },
});
