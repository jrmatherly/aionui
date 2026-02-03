/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/ipcBridge';
import { EventEmitter } from 'events';

/**
 * Channel global event types
 */
export const ChannelEvents = {
  /** Agent message event */
  AGENT_MESSAGE: 'channel.agent.message',
} as const;

/**
 * Agent message event data
 */
export interface IAgentMessageEvent extends IResponseMessage {
  conversation_id: string;
}

/**
 * ChannelEventBus - Global event bus
 *
 * Used for global distribution of Agent messages, decoupling ChannelMessageService from Agent Task
 *
 * Usage:
 * ```typescript
 * // Emit event (in GeminiAgentManager, etc.)
 * channelEventBus.emitAgentMessage(conversationId, data);
 *
 * // Listen to event (in ChannelMessageService)
 * channelEventBus.onAgentMessage((event) => {
 *   // Handle message
 * });
 * ```
 */
class ChannelEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase listener limit to avoid warnings
    this.setMaxListeners(100);
  }

  /**
   * Emit agent message event
   */
  emitAgentMessage(conversationId: string, data: IResponseMessage): void {
    const event: IAgentMessageEvent = {
      ...data,
      conversation_id: conversationId,
    };
    this.emit(ChannelEvents.AGENT_MESSAGE, event);
  }

  /**
   * Listen to agent message event
   */
  onAgentMessage(handler: (event: IAgentMessageEvent) => void): () => void {
    this.on(ChannelEvents.AGENT_MESSAGE, handler);
    return () => {
      this.off(ChannelEvents.AGENT_MESSAGE, handler);
    };
  }

  /**
   * Remove agent message listener
   */
  offAgentMessage(handler: (event: IAgentMessageEvent) => void): void {
    this.off(ChannelEvents.AGENT_MESSAGE, handler);
  }
}

// Singleton
export const channelEventBus = new ChannelEventBus();
