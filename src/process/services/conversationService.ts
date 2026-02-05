/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/ipcBridge';
import { conversationLogger as log } from '@/common/logger';
import type { ConversationSource, TChatConversation, TProviderWithModel } from '@/common/storage';
import { getDatabase } from '@process/database';
import path from 'path';
import WorkerManage from '../WorkerManage';
import { createAcpAgent, createCodexAgent, createGeminiAgent } from '../initAgent';
import type AcpAgentManager from '../task/AcpAgentManager';

/**
 * Parameters for creating a Gemini conversation
 */
export interface ICreateGeminiConversationParams {
  model: TProviderWithModel;
  workspace?: string;
  defaultFiles?: string[];
  webSearchEngine?: 'google' | 'default';
  customWorkspace?: boolean;
  contextFileName?: string;
  presetRules?: string;
  enabledSkills?: string[];
  presetAssistantId?: string;
  /** Conversation source */
  source?: ConversationSource;
  /** Custom conversation ID */
  id?: string;
  /** Custom conversation name */
  name?: string;
  /** User ID for per-user workspace isolation */
  userId?: string;
}

/**
 * Common parameters for creating conversation (extends IPC params)
 */
export interface ICreateConversationOptions extends ICreateConversationParams {
  /** Conversation source */
  source?: ConversationSource;
  /** User ID for per-user workspace isolation */
  userId?: string;
}

/**
 * Result of creating a conversation
 */
export interface ICreateConversationResult {
  success: boolean;
  conversation?: TChatConversation;
  error?: string;
}

/**
 * Common conversation creation service
 *
 * Provides unified conversation creation logic for AionUI, Telegram and other IMs
 */
export class ConversationService {
  /**
   * Create a Gemini conversation
   */
  static async createGeminiConversation(params: ICreateGeminiConversationParams): Promise<ICreateConversationResult> {
    try {
      // Resolve context file path if needed
      let contextFileName = params.contextFileName;
      if (contextFileName && !path.isAbsolute(contextFileName)) {
        contextFileName = path.resolve(process.cwd(), contextFileName);
      }

      // Create conversation object (with per-user workspace if userId provided)
      const conversation = await createGeminiAgent(params.model, params.workspace, params.defaultFiles, params.webSearchEngine, params.customWorkspace, contextFileName, params.presetRules, params.enabledSkills, params.presetAssistantId, params.userId);

      // Apply custom ID and name if provided
      if (params.id) {
        conversation.id = params.id;
      }
      if (params.name) {
        conversation.name = params.name;
      }

      // Set source
      if (params.source) {
        conversation.source = params.source;
      }

      // Register with WorkerManage
      WorkerManage.buildConversation(conversation);

      // Save to database
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        log.error({ err: result.error, conversationId: conversation.id }, 'Failed to create conversation in database');
        return { success: false, error: result.error };
      }

      log.info({ conversationId: conversation.id, source: params.source || 'aionui' }, 'Created conversation');
      return { success: true, conversation };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ err: error }, 'Failed to create Gemini conversation');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create conversation (common method, supports all types)
   */
  static async createConversation(params: ICreateConversationOptions): Promise<ICreateConversationResult> {
    const { type, extra, name, model, id, source, userId } = params;

    try {
      let conversation: TChatConversation;

      if (type === 'gemini') {
        const extraWithPresets = extra as typeof extra & {
          presetRules?: string;
          enabledSkills?: string[];
          presetAssistantId?: string;
        };

        let contextFileName = extra.contextFileName;
        if (contextFileName && !path.isAbsolute(contextFileName)) {
          contextFileName = path.resolve(process.cwd(), contextFileName);
        }

        const presetRules = extraWithPresets.presetRules || extraWithPresets.presetContext || extraWithPresets.context;
        const enabledSkills = extraWithPresets.enabledSkills;
        const presetAssistantId = extraWithPresets.presetAssistantId;

        // Pass userId for per-user workspace isolation
        conversation = await createGeminiAgent(model, extra.workspace, extra.defaultFiles, extra.webSearchEngine, extra.customWorkspace, contextFileName, presetRules, enabledSkills, presetAssistantId, userId);
      } else if (type === 'acp') {
        // Pass userId for per-user workspace isolation
        conversation = await createAcpAgent(params, userId);
      } else if (type === 'codex') {
        // Pass userId for per-user workspace isolation
        conversation = await createCodexAgent(params, userId);
      } else {
        return { success: false, error: 'Invalid conversation type' };
      }

      // Apply custom ID, name and source
      if (name) {
        conversation.name = name;
      }
      if (id) {
        conversation.id = id;
      }
      if (source) {
        conversation.source = source;
      }

      // Register with WorkerManage
      const task = WorkerManage.buildConversation(conversation);
      if (task.type === 'acp') {
        void (task as AcpAgentManager).initAgent();
      }

      // Save to database
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        log.error({ err: result.error, conversationId: conversation.id }, 'Failed to create conversation in database');
        return { success: false, error: result.error };
      }

      log.info({ conversationId: conversation.id, type, source: source || 'aionui' }, 'Created conversation');
      return { success: true, conversation };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      log.error(
        {
          err: error,
          type: params.type,
          hasModel: !!params.model,
          hasWorkspace: !!params.extra?.workspace,
          errorMessage,
          stack: errorStack,
        },
        'Failed to create conversation'
      );
      return { success: false, error: `Failed to create ${params.type} conversation: ${errorMessage}` };
    }
  }

  /**
   * Get or create a Telegram conversation
   *
   * Prefers reusing the latest conversation with source='telegram', creates new if none exists
   */
  static async getOrCreateTelegramConversation(params: ICreateGeminiConversationParams): Promise<ICreateConversationResult> {
    const db = getDatabase();

    // Try to find existing telegram conversation
    const latestTelegramConv = db.getLatestConversationBySource('telegram');
    if (latestTelegramConv.success && latestTelegramConv.data) {
      log.info({ conversationId: latestTelegramConv.data.id }, 'Reusing existing telegram conversation');
      return { success: true, conversation: latestTelegramConv.data };
    }

    // Create new telegram conversation
    return this.createGeminiConversation({
      ...params,
      source: 'telegram',
      name: params.name || 'Telegram Assistant',
    });
  }
}

// Export convenience functions
export const createGeminiConversation = ConversationService.createGeminiConversation.bind(ConversationService);
export const createConversation = ConversationService.createConversation.bind(ConversationService);
export const getOrCreateTelegramConversation = ConversationService.getOrCreateTelegramConversation.bind(ConversationService);
