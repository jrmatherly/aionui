/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentManager } from '@/agent/codex';
import { GeminiAgent, GeminiApprovalStore } from '@/agent/gemini';
import { conversationLogger as log } from '@/common/logger';
import type { TChatConversation } from '@/common/storage';
import { getDatabase } from '@process/database';
import { cronService } from '@process/services/cron/CronService';
import fs from 'fs';
import path from 'path';
import { transformMessage } from '@/common/chatLib';
import { ipcBridge } from '../../common';
import { uuid } from '../../common/utils';
import { addMessage } from '../message';
import WorkerManage from '../WorkerManage';
import { ProcessChat } from '../initStorage';
import { ConversationService } from '../services/conversationService';
import type AcpAgentManager from '../task/AcpAgentManager';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';
import { getFilesForAutoIngest, isLargeFile } from '../task/RagUtils';
import { copyFilesToDirectory, readDirectoryRecursive } from '../utils';
import { migrateConversationToDatabase } from './migrationUtils';

/**
 * File extensions that require binary handling (can't be read as UTF-8)
 */
const BINARY_FILE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);

/**
 * Check if a file is binary (needs special handling for text extraction)
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_FILE_EXTENSIONS.has(ext);
}

/**
 * Auto-ingest large files to knowledge base
 * This enables RAG for subsequent queries about the files
 *
 * @param userId - User ID for per-user knowledge base
 * @param files - Array of file paths in workspace
 * @param onProgress - Optional callback for progress events
 * @returns Counts of successful and failed ingestions
 */
async function autoIngestFilesToKnowledgeBase(userId: string, files: string[], onProgress?: (event: { current: number; total: number; fileName: string; status: 'ingesting' | 'success' | 'error' }) => void): Promise<{ success: number; failed: number }> {
  // Filter to files that should be ingested (large, supported types)
  const filesToIngest = getFilesForAutoIngest(files);

  if (filesToIngest.length === 0) {
    return { success: 0, failed: 0 };
  }

  log.info({ userId, fileCount: filesToIngest.length }, 'Auto-ingesting files to knowledge base');

  let successCount = 0;
  let failedCount = 0;

  try {
    const { getKnowledgeBaseService } = await import('@process/services/KnowledgeBaseService');
    const kbService = getKnowledgeBaseService();

    for (let i = 0; i < filesToIngest.length; i++) {
      const filePath = filesToIngest[i];
      const fileName = path.basename(filePath);

      try {
        onProgress?.({ current: i + 1, total: filesToIngest.length, fileName, status: 'ingesting' });

        let result;

        if (isBinaryFile(filePath)) {
          // Binary files (PDF, etc.): use ingestFile which passes path to Python for extraction
          result = await kbService.ingestFile(userId, filePath);
        } else {
          // Text files: read as UTF-8 and pass content directly
          const content = await fs.promises.readFile(filePath, 'utf-8');
          result = await kbService.ingest(userId, fileName, content);
        }

        if (result.success) {
          successCount++;
          log.info({ userId, file: fileName, chunks: result.chunksAdded }, 'File auto-ingested to knowledge base');
          onProgress?.({ current: i + 1, total: filesToIngest.length, fileName, status: 'success' });
        } else {
          failedCount++;
          log.warn({ userId, file: fileName, error: result.error }, 'Failed to auto-ingest file');
          onProgress?.({ current: i + 1, total: filesToIngest.length, fileName, status: 'error' });
        }
      } catch (err) {
        failedCount++;
        // Individual file failure shouldn't stop others
        log.warn({ userId, file: filePath, err }, 'Failed to read/ingest file');
        onProgress?.({ current: i + 1, total: filesToIngest.length, fileName, status: 'error' });
      }
    }
  } catch (err) {
    log.warn({ userId, err }, 'Failed to initialize knowledge base service');
  }

  return { success: successCount, failed: failedCount };
}

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
        log.warn({ err, conversationId: result.conversation.id, userId: __webUiUserId }, 'Failed to set conversation userId');
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
      log.error({ err: error, conversationId: conversation_id }, 'Failed to get associate conversations');
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
        log.error({ err: result.error, conversationId: conversation.id }, 'Failed to create conversation in database');
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
              log.info({ sourceConversationId, newConversationId: conversation.id }, 'Successfully migrated and deleted source conversation');
            } else {
              log.error({ err: deleteResult.error, sourceConversationId }, 'Failed to delete source conversation');
            }
          } else {
            log.error(
              {
                sourceTotal: sourceMessages.total,
                newTotal: newMessages.total,
              },
              'Migration integrity check failed: Message counts do not match'
            );
            // Do not delete source if verification fails
          }
        } catch (msgError) {
          log.error({ err: msgError, sourceConversationId, newConversationId: conversation.id }, 'Failed to copy messages during migration');
        }
      }

      return Promise.resolve(conversation);
    } catch (error) {
      log.error({ err: error, conversationId: conversation.id }, 'Failed to create conversation with conversation');
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
        log.warn({ err: cronError, conversationId: id }, 'Failed to cleanup cron jobs');
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
            log.info({ source, conversationId: id }, 'Cleaned up channel resources');
          }
        } catch (cleanupError) {
          log.warn({ err: cleanupError, source, conversationId: id }, 'Failed to cleanup channel resources');
          // Continue with deletion even if cleanup fails
        }
      }

      // Delete conversation from database (will cascade delete messages due to foreign key)
      const result = db.deleteConversation(id);
      if (!result.success) {
        log.error({ err: result.error, conversationId: id }, 'Failed to delete conversation from database');
        return false;
      }

      return true;
    } catch (error) {
      log.error({ err: error, conversationId: id }, 'Failed to remove conversation');
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
      log.error({ err: error, conversationId: id }, 'Failed to update conversation');
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
      log.error({ err: error, conversationId: id }, 'Failed to get conversation');
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
        log.debug({ message: error.message }, 'Read directory aborted');
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
  ipcBridge.conversation.sendMessage.provider(async ({ conversation_id, files, __webUiUserId, ...other }) => {
    log.debug({ conversationId: conversation_id, msgId: other.msg_id, userId: __webUiUserId }, 'sendMessage called');

    let task: GeminiAgentManager | AcpAgentManager | CodexAgentManager | undefined;
    try {
      // Pass userId for per-user features (RAG, API keys)
      task = (await WorkerManage.getTaskByIdRollbackBuild(conversation_id, { userId: __webUiUserId as string | undefined })) as GeminiAgentManager | AcpAgentManager | CodexAgentManager | undefined;
    } catch (err) {
      log.debug({ err, conversationId: conversation_id }, 'sendMessage: failed to get/build task');
      return { success: false, msg: err instanceof Error ? err.message : 'conversation not found' };
    }

    if (!task) {
      log.debug({ conversationId: conversation_id }, 'sendMessage: conversation not found');
      return { success: false, msg: 'conversation not found' };
    }
    log.debug({ conversationId: conversation_id, taskType: task.type, status: task.status }, 'sendMessage: found task');

    // Copy files to workspace (unified for all agents)
    const workspaceFiles = await copyFilesToDirectory(task.workspace, files, false);

    // Auto-ingest files to knowledge base with progress reporting
    // For large files: AWAIT ingestion so RAG context is available for the immediate query
    const hasLargeFiles = workspaceFiles?.some((f) => isLargeFile(f));
    let ingestedFileNames: string[] = [];

    if (__webUiUserId && workspaceFiles && workspaceFiles.length > 0) {
      try {
        if (hasLargeFiles) {
          // Emit start event
          ipcBridge.conversation.responseStream.emit({
            type: 'ingest_progress',
            conversation_id,
            msg_id: other.msg_id || '',
            data: { status: 'start', total: getFilesForAutoIngest(workspaceFiles).length },
          });

          const { success: successCount, failed: failedCount } = await autoIngestFilesToKnowledgeBase(__webUiUserId as string, workspaceFiles, (event) => {
            ipcBridge.conversation.responseStream.emit({
              type: 'ingest_progress',
              conversation_id,
              msg_id: other.msg_id || '',
              data: { status: event.status, current: event.current, total: event.total, fileName: event.fileName },
            });
          });

          // Emit complete event
          ipcBridge.conversation.responseStream.emit({
            type: 'ingest_progress',
            conversation_id,
            msg_id: other.msg_id || '',
            data: { status: 'complete', total: successCount + failedCount, successCount, failedCount },
          });

          // Track ingested files for post-response KB notification
          if (successCount > 0) {
            ingestedFileNames = getFilesForAutoIngest(workspaceFiles).map((f) => path.basename(f));
          }
        } else {
          // Small files only: fire-and-forget (they're passed inline via @ references anyway)
          void autoIngestFilesToKnowledgeBase(__webUiUserId as string, workspaceFiles);
        }
      } catch (err) {
        log.warn({ err, userId: __webUiUserId }, 'Auto-ingest to knowledge base failed (non-fatal)');
      }
    }

    // Remove large files from workspace after RAG ingestion to prevent
    // agents from reading them into context (causing overflow).
    // Content is preserved in the knowledge base for RAG retrieval.
    if (hasLargeFiles && workspaceFiles) {
      for (const f of workspaceFiles) {
        if (isLargeFile(f)) {
          try {
            await fs.promises.unlink(f);
            log.info({ file: path.basename(f) }, 'Removed large file from workspace after RAG ingestion');
          } catch {
            // Best-effort: file may already be gone
          }
        }
      }
    }

    // Filter large files from the files array for ALL agent types
    // (they should already be deleted above, but this guards against unlink failures)
    const filesToSend = workspaceFiles ? workspaceFiles.filter((f) => !isLargeFile(f)) : workspaceFiles;

    let sendResult: { success: boolean; msg?: string };
    try {
      // Call the corresponding sendMessage method based on task type
      // Pass hasAutoIngestedFiles so RAG search is forced when large files were ingested
      if (task.type === 'gemini') {
        await (task as GeminiAgentManager).sendMessage({ ...other, files: filesToSend, hasAutoIngestedFiles: hasLargeFiles });
        sendResult = { success: true };
      } else if (task.type === 'acp') {
        await (task as AcpAgentManager).sendMessage({ content: other.input, files: filesToSend, msg_id: other.msg_id, hasAutoIngestedFiles: hasLargeFiles });
        sendResult = { success: true };
      } else if (task.type === 'codex') {
        await (task as CodexAgentManager).sendMessage({ content: other.input, files: filesToSend, msg_id: other.msg_id, hasAutoIngestedFiles: hasLargeFiles });
        sendResult = { success: true };
      } else {
        sendResult = { success: false, msg: `Unsupported task type: ${task.type}` };
      }
    } catch (err: unknown) {
      sendResult = { success: false, msg: err instanceof Error ? err.message : String(err) };
    }

    // Emit KB notification AFTER agent response so the agent's answer appears first
    if (ingestedFileNames.length > 0) {
      const fileList = ingestedFileNames.map((f) => `- ${f}`).join('\n');
      const completionContent = `📚 **Knowledge Base Updated**\n\nThe following file(s) have been added to your Knowledge Base:\n${fileList}\n\nThis content is now stored and available across all conversations. You can ask follow-up questions anytime.`;

      const completionMsg = {
        type: 'content' as const,
        conversation_id,
        msg_id: uuid(),
        data: completionContent,
      };
      // Persist to DB so it's visible when user returns
      const tMessage = transformMessage(completionMsg);
      if (tMessage) addMessage(conversation_id, tMessage);
      // Emit to frontend for immediate display
      ipcBridge.conversation.responseStream.emit(completionMsg);
    }

    return sendResult;
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
