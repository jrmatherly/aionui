/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexToolHandlers } from '@/agent/codex/handlers/CodexToolHandlers';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { CodexMessageProcessor } from '@/agent/codex/messaging/CodexMessageProcessor';
import type { CodexEventMsg, CodexJsonRpcEvent } from '@/common/codex/types';
import { PermissionType } from '@/common/codex/types/permissionTypes';
import { createPermissionOptionsForType, getPermissionDisplayInfo } from '@/common/codex/utils';
import { uuid } from '@/common/utils';

export class CodexEventHandler {
  private messageProcessor: CodexMessageProcessor;
  private toolHandlers: CodexToolHandlers;
  private messageEmitter: ICodexMessageEmitter;

  constructor(
    private conversation_id: string,
    messageEmitter: ICodexMessageEmitter
  ) {
    this.messageEmitter = messageEmitter;
    this.messageProcessor = new CodexMessageProcessor(conversation_id, messageEmitter);
    this.toolHandlers = new CodexToolHandlers(conversation_id, messageEmitter);
  }

  handleEvent(evt: CodexJsonRpcEvent) {
    return this.processCodexEvent(evt.params.msg);
  }

  private processCodexEvent(msg: CodexEventMsg) {
    const type = msg.type;

    // agent_reasoning is ignored because agent_reasoning_delta provides the same info
    if (type === 'agent_reasoning') {
      return;
    }

    // agent_message is the complete message, used for final persistence (not sent to frontend to avoid duplicate display)
    if (type === 'agent_message') {
      this.messageProcessor.processFinalMessage(msg);
      return;
    }
    if (type === 'session_configured' || type === 'token_count') {
      return;
    }
    if (type === 'task_started') {
      this.messageProcessor.processTaskStart();
      return;
    }
    if (type === 'task_complete') {
      this.messageProcessor.processTaskComplete();
      return;
    }

    // Handle special message types that need custom processing
    if (this.isMessageType(msg, 'agent_message_delta')) {
      this.messageProcessor.processMessageDelta(msg);
      return;
    }

    // Handle reasoning deltas and reasoning messages - send them to UI for dynamic thinking display
    if (this.isMessageType(msg, 'agent_reasoning_delta')) {
      this.messageProcessor.handleReasoningMessage(msg);
      return;
    }

    if (this.isMessageType(msg, 'agent_reasoning_section_break')) {
      // Reasoning process was interrupted
      this.messageProcessor.processReasonSectionBreak();
      return;
    }
    // Note: Generic error events are now handled as stream_error type
    // Handle ALL permission-related requests through unified handler
    if (this.isMessageType(msg, 'exec_approval_request') || this.isMessageType(msg, 'apply_patch_approval_request')) {
      this.handleUnifiedPermissionRequest(msg);
      return;
    }

    // Tool: patch apply
    if (this.isMessageType(msg, 'patch_apply_begin')) {
      this.toolHandlers.handlePatchApplyBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'patch_apply_end')) {
      this.toolHandlers.handlePatchApplyEnd(msg);
      return;
    }

    if (this.isMessageType(msg, 'exec_command_begin')) {
      this.toolHandlers.handleExecCommandBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'exec_command_output_delta')) {
      this.toolHandlers.handleExecCommandOutputDelta(msg);
      return;
    }

    if (this.isMessageType(msg, 'exec_command_end')) {
      this.toolHandlers.handleExecCommandEnd(msg);
      return;
    }

    // Tool: mcp tool
    if (this.isMessageType(msg, 'mcp_tool_call_begin')) {
      this.toolHandlers.handleMcpToolCallBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'mcp_tool_call_end')) {
      this.toolHandlers.handleMcpToolCallEnd(msg);
      return;
    }

    // Tool: web search
    if (this.isMessageType(msg, 'web_search_begin')) {
      this.toolHandlers.handleWebSearchBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'web_search_end')) {
      this.toolHandlers.handleWebSearchEnd(msg);
      return;
    }

    // Tool: turn diff
    if (this.isMessageType(msg, 'turn_diff')) {
      this.toolHandlers.handleTurnDiff(msg);
      return;
    }
  }

  /**
   * Unified permission request handler to prevent duplicates
   */
  private handleUnifiedPermissionRequest(msg: Extract<CodexEventMsg, { type: 'exec_approval_request' }> | Extract<CodexEventMsg, { type: 'apply_patch_approval_request' }>) {
    // Extract call_id - both types have this field
    const callId = msg.call_id || uuid();
    const unifiedRequestId = `permission_${callId}`;

    // Check if we've already processed this call_id to avoid duplicates
    if (this.toolHandlers.getPendingConfirmations().has(unifiedRequestId)) {
      return;
    }

    // Mark this request as being processed
    this.toolHandlers.getPendingConfirmations().add(unifiedRequestId);

    // Route to appropriate handler based on event type
    if (msg.type === 'exec_approval_request') {
      this.processExecApprovalRequest(msg, unifiedRequestId);
    } else {
      this.processApplyPatchRequest(msg, unifiedRequestId);
    }
  }

  private processExecApprovalRequest(
    msg: Extract<
      CodexEventMsg,
      {
        type: 'exec_approval_request';
      }
    >,
    unifiedRequestId: string
  ) {
    const callId = msg.call_id || uuid();
    const command = msg.command;
    const cwd = msg.cwd;

    // Store exec metadata for ApprovalStore (used when user confirms)
    this.toolHandlers.storeExecRequestMeta(unifiedRequestId, { command, cwd });

    // Check ApprovalStore for cached rejection first
    if (this.messageEmitter.checkExecRejection?.(command, cwd)) {
      // Auto-reject without showing dialog
      this.messageEmitter.autoConfirm?.(unifiedRequestId, 'reject_always');
      return;
    }

    // Check ApprovalStore for cached approval
    if (this.messageEmitter.checkExecApproval?.(command, cwd)) {
      // Auto-confirm without showing dialog
      this.messageEmitter.autoConfirm?.(unifiedRequestId, 'allow_always');
      return;
    }

    const displayInfo = getPermissionDisplayInfo(PermissionType.COMMAND_EXECUTION);
    const options = createPermissionOptionsForType(PermissionType.COMMAND_EXECUTION);
    const description = msg.reason || `${displayInfo.icon} Codex wants to execute command: ${Array.isArray(msg.command) ? msg.command.join(' ') : msg.command}`;

    // Manage confirmation items through unified addConfirmation
    this.messageEmitter.addConfirmation({
      title: displayInfo.titleKey,
      id: unifiedRequestId,
      action: 'exec',
      description: description,
      callId: unifiedRequestId,
      options: options.map((opt) => ({
        label: opt.name,
        value: opt.optionId,
      })),
    });

    // Permission requests need to be persisted
    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'codex_permission',
        msg_id: unifiedRequestId,
        conversation_id: this.conversation_id,
        data: {
          subtype: 'exec_approval_request',
          title: displayInfo.titleKey,
          description: description,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: callId,
          data: msg, // Use original event data directly
        },
      },
      true
    );
  }

  private processApplyPatchRequest(
    msg: Extract<
      CodexEventMsg,
      {
        type: 'apply_patch_approval_request';
      }
    >,
    unifiedRequestId: string
  ) {
    const callId = msg.call_id || uuid();

    // Store patch changes for later execution
    const changes = msg?.changes || msg?.codex_changes;
    if (changes) {
      this.toolHandlers.storePatchChanges(unifiedRequestId, changes);
    }

    // Get file paths for ApprovalStore check
    const files = changes ? Object.keys(changes) : [];

    // Check ApprovalStore for cached rejection first
    if (files.length > 0 && this.messageEmitter.checkPatchRejection?.(files)) {
      // Auto-reject without showing dialog
      this.messageEmitter.autoConfirm?.(unifiedRequestId, 'reject_always');
      return;
    }

    // Check ApprovalStore for cached approval
    if (files.length > 0 && this.messageEmitter.checkPatchApproval?.(files)) {
      // Auto-confirm without showing dialog
      this.messageEmitter.autoConfirm?.(unifiedRequestId, 'allow_always');
      return;
    }

    const displayInfo = getPermissionDisplayInfo(PermissionType.FILE_WRITE);
    const options = createPermissionOptionsForType(PermissionType.FILE_WRITE);
    const description = msg.message || `${displayInfo.icon} Codex wants to apply proposed code changes`;

    // Manage confirmation items through unified addConfirmation
    this.messageEmitter.addConfirmation({
      title: displayInfo.titleKey,
      id: unifiedRequestId,
      action: 'edit',
      description: description,
      callId: unifiedRequestId,
      options: options.map((opt) => ({
        label: opt.name,
        value: opt.optionId,
      })),
    });

    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'codex_permission',
        msg_id: unifiedRequestId,
        conversation_id: this.conversation_id,
        data: {
          subtype: 'apply_patch_approval_request',
          title: displayInfo.titleKey,
          description: description,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: callId,
          data: msg, // Use original event data directly
        },
      },
      true
    );
  }

  // Expose tool handlers for external access
  getToolHandlers(): CodexToolHandlers {
    return this.toolHandlers;
  }

  // Expose message processor for external access
  getMessageProcessor(): CodexMessageProcessor {
    return this.messageProcessor;
  }

  // Type guard functions for intelligent type inference
  private isMessageType<T extends CodexEventMsg['type']>(
    msg: CodexEventMsg,
    messageType: T
  ): msg is Extract<
    CodexEventMsg,
    {
      type: T;
    }
  > {
    return msg.type === messageType;
  }

  cleanup() {
    this.messageProcessor.cleanup();
    this.toolHandlers.cleanup();
  }
}
