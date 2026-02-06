/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexAgentManager } from '@/agent/codex';
import type { TChatConversation } from '@/common/storage';
import AcpAgentManager from './task/AcpAgentManager';
// import type { AcpAgentTask } from './task/AcpAgentTask';
import { getDatabase } from './database/export';
import { ProcessChat } from './initStorage';
import type AgentBaseTask from './task/BaseAgentManager';
import { GeminiAgentManager } from './task/GeminiAgentManager';
import { createLogger } from '@/common/logger';

const log = createLogger('WorkerManager');

const taskList: {
  id: string;
  task: AgentBaseTask<unknown>;
}[] = [];

/**
 * Runtime options for building conversations
 * Used by cron jobs to force yoloMode
 */
export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls) */
  yoloMode?: boolean;
  /** Skip task cache - create a new isolated instance */
  skipCache?: boolean;
  /** User ID for per-user API key injection (auto-fetched from DB if not provided) */
  userId?: string;
}

const getTaskById = (id: string) => {
  return taskList.find((item) => item.id === id)?.task;
};

const buildConversation = (conversation: TChatConversation, options?: BuildConversationOptions) => {
  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = getTaskById(conversation.id);
    if (task) {
      return task;
    }
  }

  switch (conversation.type) {
    case 'gemini': {
      const task = new GeminiAgentManager(
        {
          workspace: conversation.extra.workspace,
          conversation_id: conversation.id,
          webSearchEngine: conversation.extra.webSearchEngine,
          // System rules
          presetRules: conversation.extra.presetRules,
          // Backward compatible
          contextContent: conversation.extra.contextContent,
          // Enabled skills list (loaded via SkillManager)
          enabledSkills: conversation.extra.enabledSkills,
          // Runtime options
          yoloMode: options?.yoloMode,
          // Per-user features (RAG)
          userId: options?.userId,
        },
        conversation.model
      );
      // Only cache if not skipping cache
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
      }
      return task;
    }
    case 'acp': {
      const task = new AcpAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        // Runtime options
        yoloMode: options?.yoloMode,
        // Per-user API key injection
        userId: options?.userId,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
      }
      return task;
    }
    case 'codex': {
      const task = new CodexAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        // Runtime options
        yoloMode: options?.yoloMode,
        // Per-user API key injection
        userId: options?.userId,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
      }
      return task;
    }
    default: {
      return null;
    }
  }
};

const getTaskByIdRollbackBuild = async (id: string, options?: BuildConversationOptions): Promise<AgentBaseTask<unknown>> => {
  log.debug({ id, options }, 'getTaskByIdRollbackBuild');

  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = taskList.find((item) => item.id === id)?.task;
    if (task) {
      // Inject userId into cached task if provided but missing (safety net for
      // tasks built before userId was available, e.g. createWithConversation)
      if (options?.userId && task.type === 'gemini') {
        const geminiTask = task as GeminiAgentManager;
        if (!geminiTask.userId) {
          geminiTask.userId = options.userId;
        }
      }
      log.debug({ id }, 'Found existing task in memory');
      return Promise.resolve(task);
    }
  }

  // Try to load from database first (with userId for per-user API key injection)
  const db = getDatabase();
  const dbResult = db.getConversationWithUserId(id);
  log.debug({ id, success: dbResult.success, hasData: !!dbResult.data }, 'Database lookup result');

  if (dbResult.success && dbResult.data) {
    const { conversation, userId } = dbResult.data;
    log.debug({ id, userId }, 'Building conversation from database');
    return buildConversation(conversation, {
      ...options,
      userId, // Pass userId for per-user API key injection
    });
  }

  // Fallback to file storage (no userId available - will use container env vars)
  const list = (await ProcessChat.get('chat.history')) as TChatConversation[] | undefined;
  const conversation = list?.find((item) => item.id === id);
  if (conversation) {
    log.debug({ id }, 'Building conversation from file storage (no userId - using container env)');
    return buildConversation(conversation, options);
  }

  log.error({ id }, 'Conversation not found in database or file storage');
  return Promise.reject(new Error('Conversation not found'));
};

const kill = (id: string) => {
  const index = taskList.findIndex((item) => item.id === id);
  if (index === -1) return;
  const task = taskList[index];
  if (task) {
    task.task.kill();
  }
  taskList.splice(index, 1);
};

const clear = () => {
  taskList.forEach((item) => {
    item.task.kill();
  });
  taskList.length = 0;
};

const addTask = (id: string, task: AgentBaseTask<unknown>) => {
  const existing = taskList.find((item) => item.id === id);
  if (existing) {
    existing.task = task;
  } else {
    taskList.push({ id, task });
  }
};

const listTasks = () => {
  return taskList.map((t) => ({ id: t.id, type: t.task.type }));
};

const WorkerManage = {
  buildConversation,
  getTaskById,
  getTaskByIdRollbackBuild,
  addTask,
  listTasks,
  kill,
  clear,
};

export default WorkerManage;
