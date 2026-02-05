/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { getDatabase } from '@process/database';
import { ProcessChatMessage } from '../initStorage';
import { dbLogger as log } from '@/common/logger';

/**
 * Migrate a conversation from file storage to database
 * This is a lazy migration - only migrate when needed
 */
export async function migrateConversationToDatabase(conversation: TChatConversation): Promise<void> {
  try {
    const db = getDatabase();

    // Check if already in database
    const existing = db.getConversation(conversation.id);
    if (existing.success && existing.data) {
      // Already migrated, just update modifyTime
      db.updateConversation(conversation.id, { modifyTime: Date.now() });
      return;
    }

    // Create conversation in database
    const result = db.createConversation(conversation);
    if (!result.success) {
      log.error({ conversationId: conversation.id, error: result.error }, 'Failed to migrate conversation');
      return;
    }

    // Migrate messages if they exist in file storage
    try {
      const messages = await ProcessChatMessage.get(conversation.id);
      if (messages && messages.length > 0) {
        // Batch insert messages
        for (const message of messages) {
          const insertResult = db.insertMessage(message);
          if (!insertResult.success) {
            log.error({ messageId: message.id, error: insertResult.error }, 'Failed to migrate message');
          }
        }
      }
    } catch (error) {
      log.warn({ conversationId: conversation.id, err: error }, 'No messages to migrate');
    }
  } catch (error) {
    log.error({ conversationId: conversation.id, err: error }, 'Failed to migrate conversation');
  }
}
