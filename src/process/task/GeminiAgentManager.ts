/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channelEventBus } from '@/channels/agent/ChannelEventBus';
import { ipcBridge } from '@/common';
import type { IMessageToolGroup, TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { IMcpServer, TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import { ProcessConfig, getSkillsDir } from '@/process/initStorage';
import { getOauthInfoWithCache } from '@office-ai/aioncli-core';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { GeminiApprovalStore } from '../../agent/gemini/GeminiApprovalStore';
import { ToolConfirmationOutcome } from '../../agent/gemini/cli/tools/tools';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '../message';
import { handlePreviewOpenEvent } from '../utils/previewUtils';
import BaseAgentManager from './BaseAgentManager';
import { hasCronCommands } from './CronCommandDetector';
import { extractTextFromMessage, processCronInMessage } from './MessageMiddleware';
import { buildSystemInstructions, prepareMessageWithRAGContext } from './agentUtils';

// Gemini agent manager class
type UiMcpServerConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
  description?: string;
};

export class GeminiAgentManager extends BaseAgentManager<
  {
    workspace: string;
    model: TProviderWithModel;
    imageGenerationModel?: TProviderWithModel;
    webSearchEngine?: 'google' | 'default';
    mcpServers?: Record<string, UiMcpServerConfig>;
    contextFileName?: string;
    // System rules
    presetRules?: string;
    contextContent?: string; // Backward compatible
    GOOGLE_CLOUD_PROJECT?: string;
    /** Builtin skills directory path */
    skillsDir?: string;
    /** Enabled skills list */
    enabledSkills?: string[];
    /** Yolo mode: auto-approve all tool calls */
    yoloMode?: boolean;
    /** User ID for per-user features like RAG */
    userId?: string;
  },
  string
> {
  workspace: string;
  model: TProviderWithModel;
  contextFileName?: string;
  presetRules?: string;
  contextContent?: string;
  enabledSkills?: string[];
  userId?: string;
  private bootstrap: Promise<void>;

  /** Session-level approval store for "always allow" memory */
  readonly approvalStore = new GeminiApprovalStore();

  private async injectHistoryFromDatabase(): Promise<void> {
    // ... (omitting injectHistoryFromDatabase for space)
  }

  /** Force yolo mode (for cron jobs) */
  private forceYoloMode?: boolean;

  constructor(
    data: {
      workspace: string;
      conversation_id: string;
      webSearchEngine?: 'google' | 'default';
      contextFileName?: string;
      // System rules
      presetRules?: string;
      contextContent?: string; // Backward compatible
      /** Enabled skills list */
      enabledSkills?: string[];
      /** Force yolo mode (for cron jobs) */
      yoloMode?: boolean;
      /** User ID for per-user features like RAG */
      userId?: string;
    },
    model: TProviderWithModel
  ) {
    super('gemini', { ...data, model });
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.contextFileName = data.contextFileName;
    this.presetRules = data.presetRules;
    this.enabledSkills = data.enabledSkills;
    this.forceYoloMode = data.yoloMode;
    this.userId = data.userId;
    // Backward compatible
    this.contextContent = data.contextContent || data.presetRules;
    this.bootstrap = Promise.all([ProcessConfig.get('gemini.config'), this.getImageGenerationModel(), this.getMcpServers()])
      .then(async ([config, imageGenerationModel, mcpServers]) => {
        // Get GOOGLE_CLOUD_PROJECT for current account
        let projectId: string | undefined;
        try {
          const oauthInfo = await getOauthInfoWithCache(config?.proxy);
          if (oauthInfo && oauthInfo.email && config?.accountProjects) {
            projectId = config.accountProjects[oauthInfo.email];
          }
          // Note: Don't fall back to old global GOOGLE_CLOUD_PROJECT, it might belong to another account
        } catch {
          // If account retrieval fails, don't set projectId, let system use default
        }

        // Build system instructions using unified agentUtils
        // Always include 'cron' as a built-in skill
        const allEnabledSkills = ['cron', ...(this.enabledSkills || [])];
        const finalPresetRules = await buildSystemInstructions({
          presetContext: this.presetRules,
          enabledSkills: allEnabledSkills,
        });

        // Determine yoloMode: forceYoloMode (cron jobs) takes priority over config setting
        const yoloMode = this.forceYoloMode ?? config?.yoloMode ?? false;

        return this.start({
          ...config,
          GOOGLE_CLOUD_PROJECT: projectId,
          workspace: this.workspace,
          model: this.model,
          imageGenerationModel,
          webSearchEngine: data.webSearchEngine,
          mcpServers,
          contextFileName: this.contextFileName,
          presetRules: finalPresetRules,
          contextContent: this.contextContent,
          // Skills loaded via SkillManager
          skillsDir: getSkillsDir(),
          // Enabled skills list for filtering skills in SkillManager
          enabledSkills: this.enabledSkills,
          // Yolo mode: auto-approve all tool calls
          yoloMode,
        });
      })
      .then(async () => {
        await this.injectHistoryFromDatabase();
      });
  }

  private getImageGenerationModel(): Promise<TProviderWithModel | undefined> {
    return ProcessConfig.get('tools.imageGenerationModel')
      .then((imageGenerationModel) => {
        if (imageGenerationModel && imageGenerationModel.switch) {
          return imageGenerationModel;
        }
        return undefined;
      })
      .catch(() => Promise.resolve(undefined));
  }

  private async getMcpServers(): Promise<Record<string, UiMcpServerConfig>> {
    try {
      const mcpServers = await ProcessConfig.get('mcp.config');
      if (!mcpServers || !Array.isArray(mcpServers)) {
        return {};
      }

      // Convert to format expected by aioncli-core
      const mcpConfig: Record<string, UiMcpServerConfig> = {};
      mcpServers
        .filter((server: IMcpServer) => server.enabled && server.status === 'connected') // Only use enabled and connected servers
        .forEach((server: IMcpServer) => {
          // Only handle stdio transport type, as aioncli-core only supports this type
          if (server.transport.type === 'stdio') {
            mcpConfig[server.name] = {
              command: server.transport.command,
              args: server.transport.args || [],
              env: server.transport.env || {},
              description: server.description,
            };
          }
        });

      return mcpConfig;
    } catch (error) {
      return {};
    }
  }

  async sendMessage(data: { input: string; msg_id: string; files?: string[]; hasAutoIngestedFiles?: boolean }) {
    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      content: {
        content: data.input,
      },
    };
    addMessage(this.conversation_id, message);
    this.status = 'pending';
    cronBusyGuard.setProcessing(this.conversation_id, true);

    // Prepare message data with potential RAG context injection
    let messageData = data;
    if (this.userId) {
      try {
        const ragResult = await prepareMessageWithRAGContext(data.input, this.userId, {
          attachedFiles: data.files,
          hasAutoIngestedFiles: data.hasAutoIngestedFiles,
        });
        if (ragResult.ragUsed) {
          messageData = { ...data, input: ragResult.content };
          // Note: Using conversationLogger since geminiLogger isn't available in this file
          // The log will still be useful for debugging
        }
      } catch {
        // RAG failure should not block the message - continue with original data
      }
    }

    const result = await this.bootstrap
      .catch((e) => {
        cronBusyGuard.setProcessing(this.conversation_id, false);
        this.emit('gemini.message', {
          type: 'error',
          data: e.message || JSON.stringify(e),
          msg_id: data.msg_id,
        });
        // Need to sync before returning the result
        // Why is this necessary?
        // In some cases, messages need to be synced to local files, and since it's async, it may cause the frontend to receive responses without getting the latest messages, so we need to wait for sync before returning
        return new Promise((_, reject) => {
          nextTickToLocalFinish(() => {
            reject(e);
          });
        });
      })
      .then(() => super.sendMessage(messageData))
      .finally(() => {
        cronBusyGuard.setProcessing(this.conversation_id, false);
      });
    return result;
  }

  private getConfirmationButtons = (confirmationDetails: IMessageToolGroup['content'][number]['confirmationDetails'], t: (key: string, options?: any) => string) => {
    if (!confirmationDetails) return {};
    let question: string;
    let description: string;
    const options: Array<{ label: string; value: ToolConfirmationOutcome; params?: Record<string, string> }> = [];
    switch (confirmationDetails.type) {
      case 'edit':
        {
          question = 'Apply this change?';
          description = confirmationDetails.fileName;
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'exec':
        {
          question = 'Allow execution?';
          description = confirmationDetails.command;
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'info':
        {
          question = 'Do you want to proceed?';
          description = confirmationDetails.urls?.join(';') || confirmationDetails.prompt;
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      default: {
        const mcpProps = confirmationDetails;
        question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
        description = confirmationDetails.serverName + ':' + confirmationDetails.toolName;
        options.push(
          {
            label: 'Yes, allow once',
            value: ToolConfirmationOutcome.ProceedOnce,
          },
          {
            label: `Yes, always allow tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"`,
            value: ToolConfirmationOutcome.ProceedAlwaysTool,
            params: { toolName: mcpProps.toolName, serverName: mcpProps.serverName },
          },
          {
            label: `Yes, always allow all tools from server "${mcpProps.serverName}"`,
            value: ToolConfirmationOutcome.ProceedAlwaysServer,
            params: { serverName: mcpProps.serverName },
          },
          { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
        );
      }
    }
    return {
      question,
      description,
      options,
    };
  };
  private handleConformationMessage(message: IMessageToolGroup) {
    const execMessages = message.content.filter((c) => c.status === 'Confirming');
    if (execMessages.length) {
      execMessages.forEach((content) => {
        const { question, options, description } = this.getConfirmationButtons(content.confirmationDetails, (k) => k);
        const hasDetails = Boolean(content.confirmationDetails);
        const hasOptions = options && options.length > 0;
        if (!question && !hasDetails) {
          // Fallback confirmation when tool is waiting but missing details
          this.addConfirmation({
            title: 'Awaiting Confirmation',
            id: content.callId,
            action: 'confirm',
            description: content.description || content.name || 'Tool requires confirmation',
            callId: content.callId,
            options: [
              { label: 'messages.confirmation.yesAllowOnce', value: ToolConfirmationOutcome.ProceedOnce },
              { label: 'messages.confirmation.no', value: ToolConfirmationOutcome.Cancel },
            ],
          });
          return;
        }
        if (!question || !hasOptions) return;
        // Extract commandType from exec confirmations for "always allow" memory
        const commandType = content.confirmationDetails?.type === 'exec' ? (content.confirmationDetails as { rootCommand?: string }).rootCommand : undefined;
        this.addConfirmation({
          title: content.confirmationDetails?.title || '',
          id: content.callId,
          action: content.confirmationDetails.type,
          description: description || content.description || '',
          callId: content.callId,
          options: options,
          commandType,
        });
      });
    }
  }

  init() {
    super.init();
    // Receive conversation messages from child process
    this.on('gemini.message', (data) => {
      if (data.type === 'finish') {
        this.status = 'finished';
        // When stream finishes, check for cron commands in the accumulated message
        // Use longer delay and retry logic to ensure message is persisted
        this.checkCronWithRetry(0);
      }
      if (data.type === 'start') {
        this.status = 'running';
      }

      // Handle preview open event (triggered by chrome-devtools navigation)
      if (handlePreviewOpenEvent(data)) {
        return; // No need to continue processing
      }

      data.conversation_id = this.conversation_id;
      // Transform and persist message (skip transient UI state messages)
      // Skip transient UI state messages that don't need persistence (thought, finished, start, finish)
      const skipTransformTypes = ['thought', 'finished', 'start', 'finish'];
      if (!skipTransformTypes.includes(data.type)) {
        const tMessage = transformMessage(data as IResponseMessage);
        if (tMessage) {
          addOrUpdateMessage(this.conversation_id, tMessage, 'gemini');
          if (tMessage.type === 'tool_group') {
            this.handleConformationMessage(tMessage);
          }
        }
      }

      ipcBridge.geminiConversation.responseStream.emit(data);

      // Emit to Channel global event bus (for Telegram and other external platforms)
      channelEventBus.emitAgentMessage(this.conversation_id, data);
    });
  }

  /**
   * Retry checking for cron commands with increasing delays
   * Max 3 retries: 1s, 2s, 3s
   * @param attempt - current attempt number
   * @param checkAfterTimestamp - only process messages created after this timestamp
   */
  private checkCronWithRetry(attempt: number, checkAfterTimestamp?: number): void {
    const delays = [1000, 2000, 3000];
    const maxAttempts = delays.length;

    if (attempt >= maxAttempts) {
      return;
    }

    // Record timestamp on first attempt to avoid re-processing old messages
    const timestamp = checkAfterTimestamp ?? Date.now();
    const delay = delays[attempt];

    setTimeout(async () => {
      const found = await this.checkCronCommandsOnFinish(timestamp);
      if (!found && attempt < maxAttempts - 1) {
        // No assistant messages found, retry with same timestamp
        this.checkCronWithRetry(attempt + 1, timestamp);
      }
    }, delay);
  }

  /**
   * Check for cron commands when stream finishes
   * Gets recent assistant messages from database and processes them
   * @param afterTimestamp - Only process messages created after this timestamp
   * Returns true if assistant messages were found (regardless of cron commands)
   */
  private async checkCronCommandsOnFinish(afterTimestamp: number): Promise<boolean> {
    try {
      const { getDatabase } = await import('@process/database');
      const db = getDatabase();
      const result = db.getConversationMessages(this.conversation_id, 0, 20, 'DESC');

      if (!result.data || result.data.length === 0) {
        return false;
      }

      // Check recent assistant messages for cron commands (position: left means assistant)
      // Filter by timestamp to avoid re-processing old messages
      const assistantMsgs = result.data.filter((m) => m.position === 'left' && (m.createdAt ?? 0) > afterTimestamp);

      // Return false if no assistant messages found after timestamp (will trigger retry)
      if (assistantMsgs.length === 0) {
        return false;
      }

      // Only check the LATEST assistant message to avoid re-processing old messages
      // Messages are sorted DESC, so the first one is the latest
      const latestMsg = assistantMsgs[0];
      const textContent = extractTextFromMessage(latestMsg);

      if (textContent && hasCronCommands(textContent)) {
        // Create a message with finish status for middleware
        const msgWithStatus = { ...latestMsg, status: 'finish' as const };
        // Collect system responses to send back to AI
        const collectedResponses: string[] = [];
        await processCronInMessage(this.conversation_id, 'gemini', msgWithStatus, (sysMsg) => {
          collectedResponses.push(sysMsg);
          // Also emit to frontend for display
          ipcBridge.geminiConversation.responseStream.emit({
            type: 'system',
            conversation_id: this.conversation_id,
            msg_id: uuid(),
            data: sysMsg,
          });
        });
        // Send collected responses back to AI agent so it can continue
        if (collectedResponses.length > 0) {
          const feedbackMessage = `[System Response]\n${collectedResponses.join('\n')}`;
          // Use sendMessage to send the feedback back to AI
          await this.sendMessage({
            input: feedbackMessage,
            msg_id: uuid(),
          });
        }
      }

      // Found assistant messages, no need to retry
      return true;
    } catch {
      return false;
    }
  }

  confirm(id: string, callId: string, data: string) {
    // Store "always allow" decision before removing confirmation from cache
    if (data === ToolConfirmationOutcome.ProceedAlways) {
      const confirmation = this.confirmations.find((c) => c.callId === callId);
      if (confirmation?.action) {
        const keys = GeminiApprovalStore.createKeysFromConfirmation(confirmation.action, confirmation.commandType);
        this.approvalStore.approveAll(keys);
      }
    }

    super.confirm(id, callId, data);
    // Send confirmation to worker, using callId as message type
    return this.postMessagePromise(callId, data);
  }

  // Manually trigger context reload
  async reloadContext(): Promise<void> {
    await this.injectHistoryFromDatabase();
  }
}
