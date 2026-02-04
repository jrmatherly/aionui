/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WorkerManage from '@/process/WorkerManage';
import type BaseAgentManager from '@/process/task/BaseAgentManager';
import { composeMessage, transformMessage, type TMessage } from '../../common/chatLib';
import { uuid } from '../../common/utils';
import { channelEventBus, type IAgentMessageEvent } from './ChannelEventBus';

/**
 * Streaming callback for progress updates
 */
export type StreamCallback = (chunk: TMessage, insert: boolean) => void;

/**
 * Message stream state
 */
interface IStreamState {
  msgId: string;
  callback: StreamCallback;
  buffer: string;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

/**
 * ChannelMessageService - Manages message sending for Channel
 *
 * Architecture (decoupled design):
 * 1. Global event listening: Listen to Agent messages via ChannelEventBus
 * 2. sendMessage(): Only sends messages and registers stream callbacks
 * 3. handleAgentMessage(): Handles message events
 *
 * Does not interact directly with Agent Task, fully decoupled via global event bus
 */
export class ChannelMessageService {
  /**
   * Active message stream cache: conversationId -> stream state
   */
  private activeStreams: Map<string, IStreamState> = new Map();

  /**
   * Global event listener cleanup function
   */
  private eventCleanup: (() => void) | null = null;

  /**
   * Whether initialized
   */
  private initialized = false;

  private messageListMap = new Map<string, TMessage[]>();

  /**
   * Initialize service, register global event listener
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    // Listen to global agent message events
    this.eventCleanup = channelEventBus.onAgentMessage((event) => {
      this.handleAgentMessage(event);
    });

    this.initialized = true;
    console.log('[ChannelMessageService] Initialized with global event listener');
  }

  /**
   * Handle agent message event
   */
  private handleAgentMessage(event: IAgentMessageEvent): void {
    const conversationId = event.conversation_id;
    const stream = this.activeStreams.get(conversationId);
    if (!stream) {
      // No active stream, ignore message
      return;
    }

    // Transform message
    const message = transformMessage(event);
    if (!message) {
      // transformMessage returns undefined for message types that don't need processing (like thought, start)
      return;
    }

    console.log('[ChannelMessageService] Incoming message:', message.msg_id, message.type, 'content preview:', message.type === 'text' ? message.content.content?.slice(0, 30) : 'non-text');

    let messageList = this.messageListMap.get(conversationId);
    if (!messageList) {
      messageList = [];
      console.log('[ChannelMessageService] New conversation, empty messageList');
    } else {
      console.log('[ChannelMessageService] Existing conversation, messageList has', messageList.length, 'messages, last msg_id:', messageList[messageList.length - 1]?.msg_id);
    }

    messageList = composeMessage(message, messageList, (type, msg: TMessage) => {
      // insert: true means new message, false means update existing message

      console.log('%c [  ]-130', 'font-size:13px; background:pink; color:#bf2c9f;', type, msg);
      const isInsert = type === 'insert';
      stream.callback(msg, isInsert);
    });
    this.messageListMap.set(conversationId, messageList.slice(-20));
  }

  /**
   * Send a message and get streaming response
   *
   * @param _sessionId - User session ID (kept for API compatibility)
   * @param conversationId - Conversation ID for context
   * @param message - User message text
   * @param onStream - Callback for streaming updates
   * @returns Promise that resolves when streaming is complete
   */
  async sendMessage(_sessionId: string, conversationId: string, message: string, onStream: StreamCallback): Promise<string> {
    // Ensure service is initialized
    this.initialize();

    // Generate message ID
    const msgId = `channel_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Get task
    let task: BaseAgentManager<unknown>;
    try {
      task = await WorkerManage.getTaskByIdRollbackBuild(conversationId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to get conversation task';
      console.error(`[ChannelMessageService] Failed to get task:`, errorMsg);
      onStream(
        {
          type: 'tips',
          id: uuid(),
          conversation_id: conversationId,
          content: {
            type: 'error',
            content: `Error: ${errorMsg}`,
          },
        },
        true
      );
      throw error;
    }

    return new Promise((resolve, reject) => {
      // Register stream state
      this.activeStreams.set(conversationId, {
        msgId,
        callback: onStream,
        buffer: '',
        resolve,
        reject,
      });

      // Send message
      task
        .sendMessage({
          input: message,
          msg_id: msgId,
        })
        .catch((error: Error) => {
          const errorMessage = `Error: ${error.message || 'Failed to send message'}`;
          console.error(`[ChannelMessageService] Send error:`, error);
          onStream({ type: 'tips', id: uuid(), conversation_id: conversationId, content: { type: 'error', content: errorMessage } }, true);
          this.activeStreams.delete(conversationId);
          reject(error);
        });
    });
  }

  /**
   * Clear conversation context for a session
   * Note: Agent cleanup is handled by WorkerManage.
   */
  async clearContext(sessionId: string): Promise<void> {
    console.log(`[ChannelMessageService] clearContext called for session ${sessionId}`);
  }

  /**
   * Clear active stream for a conversation
   */
  clearStreamByConversationId(conversationId: string): void {
    const stream = this.activeStreams.get(conversationId);
    if (stream) {
      this.activeStreams.delete(conversationId);
      console.log(`[ChannelMessageService] Cleared stream for conversation ${conversationId}`);
    }
  }

  /**
   * Stop streaming for a conversation
   */
  async stopStreaming(conversationId: string): Promise<void> {
    try {
      const task = WorkerManage.getTaskById(conversationId);
      if (task) {
        await task.stop();
      }
    } catch (error) {
      console.warn(`[ChannelMessageService] Failed to stop streaming:`, error);
    }
    this.clearStreamByConversationId(conversationId);
  }

  /**
   * Confirm a tool call for a conversation
   *
   * @param conversationId - Conversation ID
   * @param callId - Tool call ID
   * @param value - Confirmation value (e.g., 'proceed_once', 'cancel')
   */
  async confirm(conversationId: string, callId: string, value: string): Promise<void> {
    try {
      const task = WorkerManage.getTaskById(conversationId);
      if (!task) {
        throw new Error(`Task not found for conversation ${conversationId}`);
      }

      // Call agent's confirm method
      task.confirm(conversationId, callId, value);
      console.log(`[ChannelMessageService] Confirmed tool call ${callId} with value ${value}`);
    } catch (error) {
      console.error(`[ChannelMessageService] Failed to confirm tool call:`, error);
      throw error;
    }
  }

  /**
   * Shutdown service
   * Called during application shutdown
   */
  async shutdown(): Promise<void> {
    // Clear all active streams
    for (const [conversationId] of this.activeStreams) {
      this.clearStreamByConversationId(conversationId);
    }
    this.activeStreams.clear();

    // Remove global event listener
    if (this.eventCleanup) {
      this.eventCleanup();
      this.eventCleanup = null;
    }

    this.initialized = false;
    console.log('[ChannelMessageService] Shutdown complete');
  }
}

// Singleton instance
let serviceInstance: ChannelMessageService | null = null;

export function getChannelMessageService(): ChannelMessageService {
  if (!serviceInstance) {
    serviceInstance = new ChannelMessageService();
  }
  return serviceInstance;
}

// Backward compatibility export
export { ChannelMessageService as ChannelGeminiService, getChannelMessageService as getChannelGeminiService };
