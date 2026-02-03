/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { uuid } from '@/common/utils';
import { randomBytes } from 'crypto';

export type CodexSessionStatus = 'initializing' | 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'disconnected';

export interface CodexSessionConfig {
  conversation_id: string;
  cliPath?: string;
  workingDir: string;
  timeout?: number;
}

/**
 * CodexSessionManager - Based on ACP's session management capabilities
 * Provides unified connection state management, session lifecycle and state notifications
 */
// Global state management, ensuring all Codex sessions share state
const globalStatusMessageId: string = 'codex_status_global';

export class CodexSessionManager {
  private status: CodexSessionStatus = 'initializing';
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  private hasActiveSession: boolean = false;
  private timeout: number;

  constructor(
    private config: CodexSessionConfig,
    private messageEmitter: ICodexMessageEmitter
  ) {
    this.timeout = config.timeout || 30000; // 30-second default timeout
  }

  /**
   * Start session - Based on ACP's start() method
   */
  async startSession(): Promise<void> {
    try {
      await this.performConnectionSequence();
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  /**
   * Perform connection sequence - Based on ACP's connection flow
   */
  private async performConnectionSequence(): Promise<void> {
    // 1. Connection phase
    this.setStatus('connecting');
    await this.establishConnection();

    // 2. Authentication phase
    this.setStatus('connected');
    await this.performAuthentication();

    // 3. Session creation phase
    this.setStatus('authenticated');
    await this.createSession();

    // 4. Session activation
    this.setStatus('session_active');
  }

  /**
   * Establish connection
   */
  private establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.timeout / 1000} seconds`));
      }, this.timeout);

      // Simulate connection process
      setTimeout(() => {
        clearTimeout(timeoutId);
        this.isConnected = true;
        resolve();
      }, 1000);
    });
  }

  /**
   * Perform authentication - Based on ACP's authentication logic
   */
  private performAuthentication(): Promise<void> {
    // Specific authentication logic can be added here
    // Currently Codex handles authentication through CLI itself
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 500);
    });
  }

  /**
   * Create session
   */
  private createSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Session creation timeout'));
      }, this.timeout);

      setTimeout(() => {
        clearTimeout(timeoutId);
        this.sessionId = this.generateSessionId();
        this.hasActiveSession = true;
        resolve();
      }, 500);
    });
  }

  /**
   * Stop session
   */
  stopSession(): Promise<void> {
    this.isConnected = false;
    this.hasActiveSession = false;
    this.sessionId = null;
    this.setStatus('disconnected');
    return Promise.resolve();
  }

  /**
   * Check session health status
   */
  checkSessionHealth(): boolean {
    const isHealthy = this.isConnected && this.hasActiveSession && this.status === 'session_active';
    // Session health check
    return isHealthy;
  }

  /**
   * Reconnect session
   */
  async reconnectSession(): Promise<void> {
    await this.stopSession();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    await this.startSession();
  }

  /**
   * Set status and send notification - Based on ACP's emitStatusMessage
   */
  private setStatus(status: CodexSessionStatus): void {
    this.status = status;
    // Just update local state, global ID already ensures uniqueness

    this.messageEmitter.emitAndPersistMessage({
      type: 'agent_status',
      conversation_id: this.config.conversation_id,
      msg_id: globalStatusMessageId, // Use global status message ID
      data: {
        backend: 'codex',
        status,
        sessionId: this.sessionId,
        isConnected: this.isConnected,
        hasActiveSession: this.hasActiveSession,
      },
    });
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `codex-session-${Date.now()}-${this.generateSecureRandomString(9)}`;
  }

  /**
   * Generate cryptographically secure random string
   */
  private generateSecureRandomString(length: number): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      // Browser environment
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      return Array.from(array, (byte) => byte.toString(36).padStart(2, '0'))
        .join('')
        .substring(0, length);
    } else if (typeof require !== 'undefined') {
      // Node.js environment
      try {
        return randomBytes(Math.ceil(length / 2))
          .toString('hex')
          .substring(0, length);
      } catch (e) {
        // Fallback solution
        return Math.random()
          .toString(36)
          .substring(2, 2 + length);
      }
    } else {
      // Fallback solution
      return Math.random()
        .toString(36)
        .substring(2, 2 + length);
    }
  }

  /**
   * Send session event
   */
  emitSessionEvent(eventType: string, data: unknown): void {
    this.messageEmitter.emitAndPersistMessage({
      type: 'agent_status',
      conversation_id: this.config.conversation_id,
      msg_id: uuid(),
      data: {
        backend: 'codex',
        status: eventType, // Session event type as status
        eventType,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        payload: data,
      },
    });
  }

  /**
   * Get session info
   */
  getSessionInfo(): {
    status: CodexSessionStatus;
    sessionId: string | null;
    isConnected: boolean;
    hasActiveSession: boolean;
    config: CodexSessionConfig;
  } {
    return {
      status: this.status,
      sessionId: this.sessionId,
      isConnected: this.isConnected,
      hasActiveSession: this.hasActiveSession,
      config: this.config,
    };
  }

  /**
   * Wait for session to be ready - Similar to ACP's bootstrap Promise
   */
  waitForReady(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.status === 'session_active') {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (this.status === 'session_active') {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve();
        } else if (this.status === 'error') {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          reject(new Error('Session failed to become ready'));
        }
      }, 100);

      const timeoutId = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Session ready timeout after ${timeout / 1000} seconds`));
      }, timeout);
    });
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopSession().catch(() => {
      // Error during cleanup, ignore
    });
  }

  // Getters
  get currentStatus(): CodexSessionStatus {
    return this.status;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get activeSession(): boolean {
    return this.hasActiveSession;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }
}
