/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ERROR_CODES, globalErrorService } from '@/agent/codex/core/ErrorService';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import type { CodexEventMsg } from '@/common/codex/types';
import { uuid } from '@/common/utils';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { hasCronCommands } from '@process/task/CronCommandDetector';
import { processCronInMessage } from '@process/task/MessageMiddleware';

export class CodexMessageProcessor {
  private currentLoadingId: string | null = null;
  private deltaTimeout: NodeJS.Timeout | null = null;
  private reasoningMsgId: string | null = null;
  private currentReason: string = '';

  constructor(
    private conversation_id: string,
    private messageEmitter: ICodexMessageEmitter
  ) {}

  processTaskStart() {
    this.currentLoadingId = uuid();
    this.reasoningMsgId = uuid();
    this.currentReason = '';
  }

  processReasonSectionBreak() {
    this.currentReason = '';
  }

  processTaskComplete() {
    this.currentLoadingId = null;
    this.reasoningMsgId = null;
    this.currentReason = '';

    // Mark conversation as no longer processing
    // This is the reliable completion point for Codex message flow
    cronBusyGuard.setProcessing(this.conversation_id, false);

    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'finish',
        msg_id: uuid(),
        conversation_id: this.conversation_id,
        data: null,
      },
      false
    );
  }

  handleReasoningMessage(msg: Extract<CodexEventMsg, { type: 'agent_reasoning_delta' }> | Extract<CodexEventMsg, { type: 'agent_reasoning' }> | Extract<CodexEventMsg, { type: 'agent_reasoning_section_break' }>) {
    // Handle different data structures based on event type - TypeScript automatic type narrowing
    let deltaText = '';
    if (msg.type === 'agent_reasoning_delta') {
      deltaText = msg.delta ?? '';
    } else if (msg.type === 'agent_reasoning') {
      deltaText = msg.text ?? '';
    }
    // AGENT_REASONING_SECTION_BREAK does not add content, only resets current reasoning
    this.currentReason = this.currentReason + deltaText;
    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'thought',
        msg_id: this.reasoningMsgId, // Use fixed msg_id to ensure message merging
        conversation_id: this.conversation_id,
        data: {
          description: this.currentReason,
          subject: 'Thinking',
        },
      },
      false
    );
  }

  processMessageDelta(msg: Extract<CodexEventMsg, { type: 'agent_message_delta' }>) {
    const rawDelta = msg.delta;
    const deltaMessage = {
      type: 'content' as const,
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId,
      data: rawDelta,
    };
    // Delta messages: only emit to frontend for streaming display, do NOT persist
    // Frontend will accumulate deltas in memory for real-time UI updates
    this.messageEmitter.emitAndPersistMessage(deltaMessage, false);
  }

  processFinalMessage(msg: Extract<CodexEventMsg, { type: 'agent_message' }>) {
    // Final message: only persist to database, do NOT emit to frontend
    // Frontend has already shown the content via deltas

    const transformedMessage: TMessage = {
      id: this.currentLoadingId || uuid(),
      msg_id: this.currentLoadingId,
      type: 'text' as const,
      position: 'left' as const,
      conversation_id: this.conversation_id,
      content: { content: msg.message },
      status: 'finish', // Mark as finished for cron detection
      createdAt: Date.now(),
    };

    // Use messageEmitter to persist, maintaining architecture separation
    this.messageEmitter.persistMessage(transformedMessage);

    // Process cron commands in final message
    // This is the reliable point to detect cron commands since we have the complete message text
    const messageText = msg.message || '';

    if (hasCronCommands(messageText)) {
      // Collect system responses to send back to AI
      const collectedResponses: string[] = [];
      void processCronInMessage(this.conversation_id, 'codex', transformedMessage, (sysMsg) => {
        collectedResponses.push(sysMsg);
        // Also emit to frontend for display
        ipcBridge.codexConversation.responseStream.emit({
          type: 'system',
          conversation_id: this.conversation_id,
          msg_id: uuid(),
          data: sysMsg,
        });
      }).then(() => {
        // Send collected responses back to AI agent so it can continue
        if (collectedResponses.length > 0 && this.messageEmitter.sendMessageToAgent) {
          const feedbackMessage = `[System Response]\n${collectedResponses.join('\n')}`;
          void this.messageEmitter.sendMessageToAgent(feedbackMessage);
        }
      });
    }
  }

  processStreamError(message: string) {
    // Use error service to create standardized error
    const codexError = globalErrorService.createError(ERROR_CODES.NETWORK_UNKNOWN, message, {
      context: 'CodexMessageProcessor.processStreamError',
      technicalDetails: {
        originalMessage: message,
        eventType: 'STREAM_ERROR',
      },
    });

    // Process through error service for user-friendly message
    const processedError = globalErrorService.handleError(codexError);

    const errorHash = this.generateErrorHash(message);

    // Detect message type: retry message vs final error message
    const isRetryMessage = message.includes('retrying');
    const isFinalError = !isRetryMessage && message.includes('error sending request');

    let msgId: string;
    if (isRetryMessage) {
      // All retry messages use the same ID so they will be merged/updated
      msgId = `stream_retry_${errorHash}`;
    } else if (isFinalError) {
      // Final error message also uses retry message ID to replace retry messages
      msgId = `stream_retry_${errorHash}`;
    } else {
      // Other errors use unique ID
      msgId = `stream_error_${errorHash}`;
    }

    // Use error code for structured error handling
    // The data will contain error code info that can be translated on frontend
    const errorData = processedError.code ? `ERROR_${processedError.code}: ${message}` : processedError.userMessage || message;

    const errMsg = {
      type: 'error' as const,
      conversation_id: this.conversation_id,
      msg_id: msgId,
      data: errorData,
    };
    this.messageEmitter.emitAndPersistMessage(errMsg);
  }

  processGenericError(evt: { type: 'error'; data: { message?: string } | string }) {
    const message = typeof evt.data === 'string' ? evt.data : evt.data.message || 'Unknown error';

    // Generate consistent msg_id for same error messages to avoid duplicate display
    const errorHash = this.generateErrorHash(message);

    const errMsg = {
      type: 'error' as const,
      conversation_id: this.conversation_id,
      msg_id: `error_${errorHash}`,
      data: message,
    };

    this.messageEmitter.emitAndPersistMessage(errMsg);
  }

  private generateErrorHash(message: string): string {
    // For retry-type error messages, extract core error information
    const normalizedMessage = this.normalizeRetryMessage(message);

    // Generate consistent short hash for same error messages
    let hash = 0;
    for (let i = 0; i < normalizedMessage.length; i++) {
      const char = normalizedMessage.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private normalizeRetryMessage(message: string): string {
    // If it's a retry message, extract core error information, ignoring retry count and delay time
    if (message.includes('retrying')) {
      // Match "retrying X/Y in Zms..." pattern and remove it
      return message.replace(/;\s*retrying\s+\d+\/\d+\s+in\s+[\d.]+[ms]+[^;]*$/i, '');
    }

    // Return other types of error messages directly
    return message;
  }

  cleanup() {
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
      this.deltaTimeout = null;
    }
  }
}
