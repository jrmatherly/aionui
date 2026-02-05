/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { getDatabase } from './index';
import { dbLogger as log } from '@/common/logger';

/**
 * Streaming Message Buffer Manager
 *
 * Purpose: Optimize database write performance for streaming messages
 *
 * Core strategy:
 * - Delayed updates: Instead of writing to database for every chunk, batch updates periodically
 * - Batch writes: Write once every 300ms or after accumulating 20 chunks
 *
 * Performance improvement:
 * - Original: 1000 UPDATEs (one per chunk)
 * - Optimized: ~10 UPDATEs (periodic batch)
 * - Improvement: 100x
 */

interface StreamBuffer {
  messageId: string;
  conversationId: string;
  currentContent: string;
  chunkCount: number;
  lastDbUpdate: number;
  updateTimer?: NodeJS.Timeout;
  mode: 'accumulate' | 'replace'; // Each buffer has independent mode to avoid concurrency conflicts
}

interface StreamingConfig {
  updateInterval?: number; // Update interval (milliseconds)
  chunkBatchSize?: number; // How many chunks before updating
}

export class StreamingMessageBuffer {
  private buffers = new Map<string, StreamBuffer>();

  // Default configuration
  private readonly UPDATE_INTERVAL = 300; // Update every 300ms
  private readonly CHUNK_BATCH_SIZE = 20; // Or after accumulating 20 chunks

  constructor(private config?: StreamingConfig) {
    if (config?.updateInterval) {
      (this as any).UPDATE_INTERVAL = config.updateInterval;
    }
    if (config?.chunkBatchSize) {
      (this as any).CHUNK_BATCH_SIZE = config.chunkBatchSize;
    }
  }

  /**
   * Append streaming chunk
   *
   * @param id
   * @param messageId - Unique merged message ID
   * @param conversationId - Conversation ID
   * @param chunk - Text fragment
   *
   * Performance optimization: Batch write instead of writing to database for every chunk
   * @param mode
   */
  append(id: string, messageId: string, conversationId: string, chunk: string, mode: 'accumulate' | 'replace'): void {
    let buffer = this.buffers.get(messageId);

    if (!buffer) {
      // First chunk, initialize buffer (store mode in buffer instead of instance)
      buffer = {
        messageId,
        conversationId,
        currentContent: chunk,
        chunkCount: 1,
        lastDbUpdate: Date.now(),
        mode, // Each buffer uses independent mode to avoid concurrent message mode conflicts
      };
      this.buffers.set(messageId, buffer);
    } else {
      // Accumulate or replace content based on buffer's mode (use buffer.mode instead of this.mode)
      if (buffer.mode === 'accumulate') {
        buffer.currentContent += chunk;
      } else {
        buffer.currentContent = chunk; // Replace mode: directly overwrite
      }
      buffer.chunkCount++;
    }

    // Clear old timer
    if (buffer.updateTimer) {
      clearTimeout(buffer.updateTimer);
      buffer.updateTimer = undefined;
    }

    // Determine if database update is needed (based on count and time only)
    const shouldUpdate =
      buffer.chunkCount % this.CHUNK_BATCH_SIZE === 0 || // Accumulated enough chunks
      Date.now() - buffer.lastDbUpdate > this.UPDATE_INTERVAL; // Exceeded time interval

    if (shouldUpdate) {
      // Update immediately
      this.flushBuffer(id, messageId, false);
    } else {
      // Set delayed update (prevent message stream interruption)
      buffer.updateTimer = setTimeout(() => {
        this.flushBuffer(id, messageId, false);
      }, this.UPDATE_INTERVAL);
    }
  }

  /**
   * Flush buffer to database
   *
   * @param id
   * @param messageId - Unique merged message ID
   * @param clearBuffer - Whether to clear buffer (default false)
   */
  private flushBuffer(id: string, messageId: string, clearBuffer = false): void {
    const buffer = this.buffers.get(messageId);
    if (!buffer) return;

    const db = getDatabase();

    try {
      const message: TMessage = {
        id: id,
        msg_id: messageId,
        conversation_id: buffer.conversationId,
        type: 'text',
        content: { content: buffer.currentContent },
        status: 'pending',
        position: 'left',
        createdAt: Date.now(),
      };

      // Check if message exists in database
      const existing = db.getMessageByMsgId(buffer.conversationId, messageId, 'text');

      if (existing.success && existing.data) {
        // Message exists - update it
        db.updateMessage(existing.data.id, message);
      } else {
        // Message doesn't exist - insert it
        db.insertMessage(message);
      }

      // Update last write time
      buffer.lastDbUpdate = Date.now();

      // Clear buffer if needed
      if (clearBuffer) {
        this.buffers.delete(messageId);
      }
    } catch (error) {
      log.error({ messageId, err: error }, 'Failed to flush buffer');
    }
  }
}

// Singleton instance
export const streamingBuffer = new StreamingMessageBuffer();
