/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentManager } from '@/agent/codex';
import { GeminiAgent, GeminiApprovalStore } from '@/agent/gemini';
import type { TChatConversation } from '@/common/storage';
import { getDatabase } from '@process/database';
import { cronService } from '@process/services/cron/CronService';
import { ipcBridge } from '../../common';
import { uuid } from '../../common/utils';
import WorkerManage from '../WorkerManage';
import { ProcessChat } from '../initStorage';
import { ConversationService } from '../services/conversationService';
import type AcpAgentManager from '../task/AcpAgentManager';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';
import { copyFilesToDirectory, readDirectoryRecursive } from '../utils';
import { migrateConversationToDatabase } from './migrationUtils';

export function initConversationBridge(): void {
  ipcBridge.conversation.create.provider(async (params: any): Promise<TChatConversation> => {
    // __webUiUserId is injected by the WebSocket adapter for user-scoped operations
    const { __webUiUserId, ...createParams } = params;

    // Use ConversationService to create conversation
    // Pass userId for per-user workspace isolation
    const result = await ConversationService.createConversation({
      ...createParams,
      source: 'aionui', // Mark conversations created by AionUI as aionui
      userId: __webUiUserId, // Per-user workspace isolation
    });

    if (!result.success || !result.conversation) {
      throw new Error(result.error || 'Failed to create conversation');
    }

    // If we have a WebUI userId, update the conversation's user_id in the database
    if (__webUiUserId) {
      try {
        const db = getDatabase();
        db.updateConversationUserId(result.conversation.id, __webUiUserId);
      } catch (err) {
        console.warn('[conversationBridge] Failed to set conversation userId:', err);
      }
    }

    return result.conversation;
  });

  // Manually reload conversation context (Gemini): inject recent history into memory
  ipcBridge.conversation.reloadContext.provider(async ({ conversation_id }) => {
    try {
      const task = (await WorkerManage.getTaskByIdRollbackBuild(conversation_id)) as GeminiAgentManager | AcpAgentManager | CodexAgentManager | undefined;
      if (!task) return { success: false, msg: 'conversation not found' };
      if (task.type !== 'gemini') return { success: false, msg: 'only supported for gemini' };

      await (task as GeminiAgentManager).reloadContext();
      return { success: true };
    } catch (e: unknown) {
      return { success: false, msg: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcBridge.conversation.getAssociateConversation.provider(async ({ conversation_id }) => {
    try {
      const db = getDatabase();

      // Try to get current conversation from database
      let currentConversation: TChatConversation | undefined;
      const currentResult = db.getConversation(conversation_id);

      if (currentResult.success && currentResult.data) {
        currentConversation = currentResult.data;
      } else {
        // Not in database, try file storage
        const history = await ProcessChat.get('chat.history');
        currentConversation = (history || []).find((item) => item.id === conversation_id);

        // Lazy migrate in background
        if (currentConversation) {
          void migrateConversationToDatabase(currentConversation);
        }
      }

      if (!currentConversation || !currentConversation.extra?.workspace) {
        return [];
      }

      // Get all conversations from database (get first page with large limit to get all)
      const allResult = db.getUserConversations(undefined, 0, 10000);
      let allConversations: TChatConversation[] = allResult.data || [];

      // If database is empty or doesn't have enough conversations, merge with file storage
      const history = await ProcessChat.get('chat.history');
      if (allConversations.length < (history?.length || 0)) {
        // Database doesn't have all conversations yet, use file storage
        allConversations = history || [];

        // Lazy migrate all conversations in background
        void Promise.all(allConversations.map((conv) => migrateConversationToDatabase(conv)));
      }

      // Filter by workspace
      return allConversations.filter((item) => item.extra?.workspace === currentConversation.extra.workspace);
    } catch (error) {
      console.error('[conversationBridge] Failed to get associate conversations:', error);
      return [];
    }
  });

  ipcBridge.conversation.createWithConversation.provider(({ conversation, sourceConversationId }) => {
    try {
      conversation.createTime = Date.now();
      conversation.modifyTime = Date.now();
      WorkerManage.buildConversation(conversation);

      // Save to database only
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        console.error('[conversationBridge] Failed to create conversation in database:', result.error);
      }

      // Migrate messages if sourceConversationId is provided
      if (sourceConversationId && result.success) {
        try {
          // Fetch all messages from source conversation
          // Using a large pageSize to get all messages, or loop if needed.
          // For now, 10000 should cover most cases.
          const pageSize = 10000;
          let page = 0;
          let hasMore = true;

          while (hasMore) {
            const messagesResult = db.getConversationMessages(sourceConversationId, page, pageSize);
            const messages = messagesResult.data;

            for (const msg of messages) {
              // Create a copy of the message with new ID and new conversation ID
              const newMessage = {
                ...msg,
                id: uuid(), // Generate new ID
                conversation_id: conversation.id,
                createdAt: msg.createdAt || Date.now(),
              };
              db.insertMessage(newMessage);
            }

            hasMore = messagesResult.hasMore;
            page++;
          }

          // Verify integrity and remove source conversation
          const sourceMessages = db.getConversationMessages(sourceConversationId, 0, 1);
          const newMessages = db.getConversationMessages(conversation.id, 0, 1);

          if (sourceMessages.total === newMessages.total) {
            // Verification passed, delete source conversation
            // ON DELETE CASCADE will handle message deletion
            const deleteResult = db.deleteConversation(sourceConversationId);
            if (deleteResult.success) {
              console.log(`[conversationBridge] Successfully migrated and deleted source conversation ${sourceConversationId}`);
            } else {
              console.error(`[conversationBridge] Failed to delete source conversation ${sourceConversationId}: ${deleteResult.error}`);
            }
          } else {
            console.error('[conversationBridge] Migration integrity check failed: Message counts do not match.', {
              source: sourceMessages.total,
              new: newMessages.total,
            });
            // Do not delete source if verification fails
          }
        } catch (msgError) {
          console.error('[conversationBridge] Failed to copy messages during migration:', msgError);
        }
      }

      return Promise.resolve(conversation);
    } catch (error) {
      console.error('[conversationBridge] Failed to create conversation with conversation:', error);
      return Promise.resolve(conversation);
    }
  });

  ipcBridge.conversation.remove.provider(async ({ id }) => {
    try {
      const db = getDatabase();

      // Get conversation to check source before deletion
      const convResult = db.getConversation(id);
      const conversation = convResult.data;
      const source = conversation?.source;

      // Kill the running task if exists
      WorkerManage.kill(id);

      // Delete associated cron jobs
      try {
        const jobs = await cronService.listJobsByConversation(id);
        for (const job of jobs) {
          await cronService.removeJob(job.id);
          ipcBridge.cron.onJobRemoved.emit({ jobId: job.id });
        }
      } catch (cronError) {
        console.warn('[conversationBridge] Failed to cleanup cron jobs:', cronError);
        // Continue with deletion even if cron cleanup fails
      }

      // If source is not 'aionui' (e.g., telegram), cleanup channel resources
      if (source && source !== 'aionui') {
        try {
          // Dynamic import to avoid circular dependency
          const { getChannelManager } = await import('@/channels/core/ChannelManager');
          const channelManager = getChannelManager();
          if (channelManager.isInitialized()) {
            await channelManager.cleanupConversation(id);
            console.log(`[conversationBridge] Cleaned up channel resources for ${source} conversation ${id}`);
          }
        } catch (cleanupError) {
          console.warn('[conversationBridge] Failed to cleanup channel resources:', cleanupError);
          // Continue with deletion even if cleanup fails
        }
      }

      // Delete conversation from database (will cascade delete messages due to foreign key)
      const result = db.deleteConversation(id);
      if (!result.success) {
        console.error('[conversationBridge] Failed to delete conversation from database:', result.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[conversationBridge] Failed to remove conversation:', error);
      return false;
    }
  });

  ipcBridge.conversation.update.provider(async ({ id, updates, mergeExtra }: { id: string; updates: Partial<TChatConversation>; mergeExtra?: boolean }) => {
    try {
      const db = getDatabase();
      const existing = db.getConversation(id);
      // Only gemini type has model, use 'in' check to safely access
      const prevModel = existing.success && existing.data && 'model' in existing.data ? existing.data.model : undefined;
      const nextModel = 'model' in updates ? updates.model : undefined;
      const modelChanged = !!nextModel && JSON.stringify(prevModel) !== JSON.stringify(nextModel);
      // model change detection for task rebuild

      // If mergeExtra is true, merge the extra field instead of overwriting
      let finalUpdates = updates;
      if (mergeExtra && updates.extra && existing.success && existing.data) {
        finalUpdates = {
          ...updates,
          extra: {
            ...existing.data.extra,
            ...updates.extra,
          },
        } as Partial<TChatConversation>;
      }

      const result = await Promise.resolve(db.updateConversation(id, finalUpdates));

      // If model changed, kill running task to force rebuild with new model on next send
      if (result.success && modelChanged) {
        try {
          WorkerManage.kill(id);
        } catch (killErr) {
          // ignore kill error, will lazily rebuild later
        }
      }

      return result.success;
    } catch (error) {
      console.error('[conversationBridge] Failed to update conversation:', error);
      return false;
    }
  });

  ipcBridge.conversation.reset.provider(({ id }) => {
    if (id) {
      WorkerManage.kill(id);
    } else {
      WorkerManage.clear();
    }
    return Promise.resolve();
  });

  ipcBridge.conversation.get.provider(async ({ id }) => {
    try {
      const db = getDatabase();

      // Try to get conversation from database first
      const result = db.getConversation(id);
      if (result.success && result.data) {
        // Found in database, update status and return
        const conversation = result.data;
        const task = WorkerManage.getTaskById(id);
        conversation.status = task?.status || 'finished';
        return conversation;
      }

      // Not in database, try to load from file storage and migrate
      const history = await ProcessChat.get('chat.history');
      const conversation = (history || []).find((item) => item.id === id);
      if (conversation) {
        // Update status from running task
        const task = WorkerManage.getTaskById(id);
        conversation.status = task?.status || 'finished';

        // Lazy migrate this conversation to database in background
        void migrateConversationToDatabase(conversation);

        return conversation;
      }

      return undefined;
    } catch (error) {
      console.error('[conversationBridge] Failed to get conversation:', error);
      return undefined;
    }
  });

  const buildLastAbortController = (() => {
    let lastGetWorkspaceAbortController = new AbortController();
    return () => {
      lastGetWorkspaceAbortController.abort();
      return (lastGetWorkspaceAbortController = new AbortController());
    };
  })();

  ipcBridge.conversation.getWorkspace.provider(async ({ workspace, search, path }) => {
    const fileService = GeminiAgent.buildFileServer(workspace);
    try {
      return await readDirectoryRecursive(path, {
        root: workspace,
        fileService,
        abortController: buildLastAbortController(),
        maxDepth: 10, // Support deeper directory structures
        search: {
          text: search,
          onProcess(result) {
            void ipcBridge.conversation.responseSearchWorkSpace.invoke(result);
          },
        },
      }).then((res) => (res ? [res] : []));
    } catch (error) {
      // Catch abort errors to avoid unhandled rejection
      if (error instanceof Error && error.message.includes('aborted')) {
        console.log('[Workspace] Read directory aborted:', error.message);
        return [];
      }
      throw error;
    }
  });

  ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id);
    if (!task) return { success: true, msg: 'conversation not found' };
    if (task.type !== 'gemini' && task.type !== 'acp' && task.type !== 'codex') {
      return { success: false, msg: 'not support' };
    }
    await task.stop();
    return { success: true };
  });

  // Generic sendMessage implementation - automatically dispatches based on conversation type
  ipcBridge.conversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
    console.log(`[conversationBridge] sendMessage called: conversation_id=${conversation_id}, msg_id=${other.msg_id}`);

    let task: GeminiAgentManager | AcpAgentManager | CodexAgentManager | undefined;
    try {
      task = (await WorkerManage.getTaskByIdRollbackBuild(conversation_id)) as GeminiAgentManager | AcpAgentManager | CodexAgentManager | undefined;
    } catch (err) {
      console.log(`[conversationBridge] sendMessage: failed to get/build task: ${conversation_id}`, err);
      return { success: false, msg: err instanceof Error ? err.message : 'conversation not found' };
    }

    if (!task) {
      console.log(`[conversationBridge] sendMessage: conversation not found: ${conversation_id}`);
      return { success: false, msg: 'conversation not found' };
    }
    console.log(`[conversationBridge] sendMessage: found task type=${task.type}, status=${task.status}`);

    // Copy files to workspace (unified for all agents)
    const workspaceFiles = await copyFilesToDirectory(task.workspace, files, false);

    try {
      // Call the corresponding sendMessage method based on task type
      if (task.type === 'gemini') {
        await (task as GeminiAgentManager).sendMessage({ ...other, files: workspaceFiles });
        return { success: true };
      } else if (task.type === 'acp') {
        await (task as AcpAgentManager).sendMessage({ content: other.input, files: workspaceFiles, msg_id: other.msg_id });
        return { success: true };
      } else if (task.type === 'codex') {
        await (task as CodexAgentManager).sendMessage({ content: other.input, files: workspaceFiles, msg_id: other.msg_id });
        return { success: true };
      } else {
        return { success: false, msg: `Unsupported task type: ${task.type}` };
      }
    } catch (err: unknown) {
      return { success: false, msg: err instanceof Error ? err.message : String(err) };
    }
  });

  // Generic confirmMessage implementation - automatically dispatches based on conversation type

  ipcBridge.conversation.confirmation.confirm.provider(async ({ conversation_id, msg_id, data, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id);
    if (!task) return { success: false, msg: 'conversation not found' };
    task.confirm(msg_id, callId, data);
    return { success: true };
  });
  ipcBridge.conversation.confirmation.list.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id);
    if (!task) return [];
    return task.getConfirmations();
  });

  // Session-level approval memory for "always allow" decisions
  // Keys are parsed from raw action+commandType here (single source of truth)
  ipcBridge.conversation.approval.check.provider(async ({ conversation_id, action, commandType }) => {
    const task = WorkerManage.getTaskById(conversation_id) as GeminiAgentManager | undefined;
    if (!task || task.type !== 'gemini' || !task.approvalStore) {
      return false;
    }
    const keys = GeminiApprovalStore.createKeysFromConfirmation(action, commandType);
    if (keys.length === 0) return false;
    return task.approvalStore.allApproved(keys);
  });
}
