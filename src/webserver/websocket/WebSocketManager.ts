/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthService } from '@/webserver/auth/service/AuthService';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import type { IncomingMessage } from 'http';
import type { WebSocketServer } from 'ws';
import { WebSocket } from 'ws';
import { SHOW_OPEN_REQUEST_EVENT } from '../../adapter/constant';
import { WEBSOCKET_CONFIG } from '../config/constants';
import { wsLogger as log } from '@/common/logger';

interface ClientInfo {
  token: string;
  lastPing: number;
  userId: string;
  username: string;
}

/**
 * WebSocket Manager - Manages client connections, heartbeat detection, and message handling
 */
export class WebSocketManager {
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(private wss: WebSocketServer) {}

  /**
   * Initialize WebSocket manager
   */
  initialize(): void {
    this.startHeartbeat();
    log.info('Initialized');
  }

  /**
   * Setup connection handler
   */
  setupConnectionHandler(onMessage: (name: string, data: any, ws: WebSocket) => void): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const token = TokenMiddleware.extractWebSocketToken(req);

      if (!this.validateConnection(ws, token)) {
        return;
      }

      this.addClient(ws, token!);
      this.setupMessageHandler(ws, onMessage);
      this.setupCloseHandler(ws);
      this.setupErrorHandler(ws);

      log.info('Client connected');
    });
  }

  /**
   * Validate connection
   */
  private validateConnection(ws: WebSocket, token: string | null): boolean {
    if (!token) {
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'No token provided');
      return false;
    }

    if (!TokenMiddleware.validateWebSocketToken(token)) {
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Invalid or expired token');
      return false;
    }

    return true;
  }

  /**
   * Add client — decode the JWT to attach userId/username metadata.
   */
  private addClient(ws: WebSocket, token: string): void {
    const decoded = AuthService.verifyWebSocketToken(token);
    this.clients.set(ws, {
      token,
      lastPing: Date.now(),
      userId: decoded?.userId ?? 'unknown',
      username: decoded?.username ?? 'unknown',
    });
  }

  /**
   * Setup message handler
   */
  private setupMessageHandler(ws: WebSocket, onMessage: (name: string, data: any, ws: WebSocket) => void): void {
    ws.on('message', (rawData) => {
      try {
        const parsed = JSON.parse(rawData.toString());
        const { name, data } = parsed;

        // Handle pong response - update last ping time
        if (name === 'pong') {
          this.updateLastPing(ws);
          return;
        }

        // Handle file selection request - forward to client
        if (name === 'subscribe-show-open') {
          this.handleFileSelection(ws, data);
          return;
        }

        // Forward other messages to bridge system
        onMessage(name, data, ws);
      } catch (error) {
        ws.send(
          JSON.stringify({
            error: 'Invalid message format',
            expected: '{ "name": "event-name", "data": {...} }',
          })
        );
      }
    });
  }

  /**
   * Handle file selection request
   */
  private handleFileSelection(ws: WebSocket, data: any): void {
    // Extract properties from nested data structure
    const actualData = data.data || data;
    const properties = actualData.properties;

    // Determine if this is file selection mode
    const isFileMode = properties && properties.includes('openFile') && !properties.includes('openDirectory');

    // Send file selection request to client with isFileMode flag
    ws.send(JSON.stringify({ name: SHOW_OPEN_REQUEST_EVENT, data: { ...data, isFileMode } }));
  }

  /**
   * Setup close handler
   */
  private setupCloseHandler(ws: WebSocket): void {
    ws.on('close', () => {
      this.clients.delete(ws);
      log.info('Client disconnected');
    });
  }

  /**
   * Setup error handler
   */
  private setupErrorHandler(ws: WebSocket): void {
    ws.on('error', (error) => {
      log.error({ err: error }, 'Client error');
      this.clients.delete(ws);
    });
  }

  /**
   * Update last ping time
   */
  private updateLastPing(ws: WebSocket): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.lastPing = Date.now();
    }
  }

  /**
   * Start heartbeat detection
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkClients();
    }, WEBSOCKET_CONFIG.HEARTBEAT_INTERVAL);
  }

  /**
   * Check all clients
   */
  private checkClients(): void {
    const now = Date.now();

    for (const [ws, clientInfo] of this.clients) {
      // Check if client timed out
      if (this.isClientTimeout(clientInfo, now)) {
        log.info('Client heartbeat timeout, closing connection');
        ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Heartbeat timeout');
        this.clients.delete(ws);
        continue;
      }

      // Validate if WebSocket token is still valid
      if (!TokenMiddleware.validateWebSocketToken(clientInfo.token)) {
        log.info('Token expired, closing connection');
        ws.send(JSON.stringify({ name: 'auth-expired', data: { message: 'Token expired, please login again' } }));
        ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Token expired');
        this.clients.delete(ws);
        continue;
      }

      // Send heartbeat ping
      this.sendHeartbeat(ws);
    }
  }

  /**
   * Check if client timed out
   */
  private isClientTimeout(clientInfo: ClientInfo, now: number): boolean {
    return now - clientInfo.lastPing > WEBSOCKET_CONFIG.HEARTBEAT_TIMEOUT;
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ name: 'ping', data: { timestamp: Date.now() } }));
    }
  }

  /**
   * Broadcast message to all connected clients (legacy — admin/system events).
   */
  broadcast(name: string, data: any): void {
    const message = JSON.stringify({ name, data });

    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Broadcast message only to connections belonging to a specific user.
   */
  broadcastToUser(userId: string, name: string, data: any): void {
    const message = JSON.stringify({ name, data });

    for (const [ws, info] of this.clients) {
      if (info.userId === userId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          log.error({ err: error, userId }, 'Failed to send to user');
        }
      }
    }
  }

  /**
   * Get the userId associated with a WebSocket connection (if any).
   */
  getUserId(ws: WebSocket): string | undefined {
    return this.clients.get(ws)?.userId;
  }

  /**
   * Get connected client count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all connections
    for (const [ws] of this.clients) {
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.NORMAL_CLOSURE, 'Server shutting down');
    }

    this.clients.clear();
    log.info('Destroyed');
  }
}

export default WebSocketManager;
