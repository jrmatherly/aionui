/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main database exports
 * Use this file to import database functionality throughout the app
 */

export { AionUIDatabase, closeDatabase, getDatabase } from './index';
export { getMigrationHistory, isMigrationApplied, rollbackMigrations, runMigrations, type IMigration } from './migrations';

export type {
  IConfigRow,
  IConfigStorageRefer,
  // Database row types (for advanced usage)
  IConversationRow,
  IMessageRow,
  IPaginatedResult,
  IQueryResult,
  // Database-specific types
  IUser,
  // Business types (re-exported for convenience)
  TChatConversation,
  TMessage,
} from './types';

// Re-export conversion functions
export { conversationToRow, messageToRow, rowToConversation, rowToMessage } from './types';
