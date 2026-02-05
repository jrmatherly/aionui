/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexAgent } from '@/agent/codex';
import type { NetworkError } from '@/agent/codex/connection/CodexConnection';
import { CodexEventHandler } from '@/agent/codex/handlers/CodexEventHandler';
import { CodexFileOperationHandler } from '@/agent/codex/handlers/CodexFileOperationHandler';
import { CodexSessionManager } from '@/agent/codex/handlers/CodexSessionManager';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { ipcBridge } from '@/common';
import type { IConfirmation, TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { CodexAgentManagerData, FileChange } from '@/common/codex/types';
import { PERMISSION_DECISION_MAP } from '@/common/codex/types/permissionTypes';
import { mapPermissionDecision } from '@/common/codex/utils';
import { AIONUI_FILES_MARKER } from '@/common/constants';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { ProcessConfig } from '@process/initStorage';
import { addMessage } from '@process/message';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import BaseAgentManager from '@process/task/BaseAgentManager';
import { createLogger } from '@/common/logger';

const log = createLogger('Codex');
import { prepareFirstMessageWithSkillsIndex } from '@process/task/agentUtils';
import { handlePreviewOpenEvent } from '@process/utils/previewUtils';
import { getConfiguredAppClientName, getConfiguredAppClientVersion, getConfiguredCodexMcpProtocolVersion, setAppConfig } from '../../common/utils/appConfig';

const APP_CLIENT_NAME = getConfiguredAppClientName();
const APP_CLIENT_VERSION = getConfiguredAppClientVersion();
const CODEX_MCP_PROTOCOL_VERSION = getConfiguredCodexMcpProtocolVersion();

class CodexAgentManager extends BaseAgentManager<CodexAgentManagerData> implements ICodexMessageEmitter {
  workspace?: string;
  agent!: CodexAgent; // Initialized in bootstrap promise
  bootstrap: Promise<CodexAgent>;
  private isFirstMessage: boolean = true;
  private options: CodexAgentManagerData; // Store original config data

  constructor(data: CodexAgentManagerData) {
    // Do not fork a worker for Codex; we run the agent in-process now
    super('codex', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data; // Save original data for later use

    this.initAgent(data);
  }

  private initAgent(data: CodexAgentManagerData) {
    // Initialize managers - following ACP architecture, passing message emitter
    const eventHandler = new CodexEventHandler(data.conversation_id, this);
    const sessionManager = new CodexSessionManager(
      {
        conversation_id: data.conversation_id,
        cliPath: data.cliPath,
        workingDir: data.workspace || process.cwd(),
      },
      this
    );
    const fileOperationHandler = new CodexFileOperationHandler(data.workspace || process.cwd(), data.conversation_id, this);

    // Use SessionManager to manage connection state - following ACP pattern
    // Use async bootstrap to read config and initialize agent
    this.bootstrap = (async () => {
      // Set Codex Agent app config using Electron API in main process
      try {
        const electronModule = await import('electron');
        const app = electronModule.app;
        setAppConfig({
          name: app.getName(),
          version: app.getVersion(),
          protocolVersion: CODEX_MCP_PROTOCOL_VERSION,
        });
      } catch (error) {
        // If not in main process, use generic method to get version
        setAppConfig({
          name: APP_CLIENT_NAME,
          version: APP_CLIENT_VERSION,
          protocolVersion: CODEX_MCP_PROTOCOL_VERSION,
        });
      }

      // Read codex.config for global yoloMode setting
      // yoloMode priority: data.yoloMode (from CronService) > config setting
      const codexConfig = await ProcessConfig.get('codex.config');
      const yoloMode = data.yoloMode ?? codexConfig?.yoloMode;

      this.agent = new CodexAgent({
        id: data.conversation_id,
        cliPath: data.cliPath,
        workingDir: data.workspace || process.cwd(),
        eventHandler,
        sessionManager,
        fileOperationHandler,
        sandboxMode: data.sandboxMode || 'workspace-write', // Enable file writing within workspace by default
        yoloMode: yoloMode, // yoloMode from CronService or config
        userId: data.userId, // Per-user API key injection
        onNetworkError: (error) => {
          this.handleNetworkError(error);
        },
      });

      await this.startWithSessionManagement();
      return this.agent;
    })().catch((e) => {
      this.agent?.getSessionManager?.()?.emitSessionEvent('bootstrap_failed', { error: e.message });
      throw e;
    });
  }

  /**
   * Start with session management - following ACP startup flow
   */
  private async startWithSessionManagement(): Promise<void> {
    // 1. Start session manager
    await this.agent.getSessionManager().startSession();

    // 2. Start MCP Agent
    await this.agent.start();

    // 3. Perform authentication and session creation
    this.performPostConnectionSetup();
  }

  /**
   * Post-connection setup - following ACP authentication and session creation
   */
  private performPostConnectionSetup(): void {
    try {
      // Get connection diagnostics
      void this.getDiagnostics();

      // Delay session creation until first user message to avoid empty prompt issue
      // Session will be created with first user message - no session event sent here
    } catch (error) {
      // Output more detailed diagnostic information
      const diagnostics = this.getDiagnostics();

      // Provide specific error messages and suggestions
      const errorMessage = error instanceof Error ? error.message : String(error);
      let suggestions: string[] = [];

      if (errorMessage.includes('timed out')) {
        suggestions = ['Check if Codex CLI is installed: run "codex --version"', 'Verify authentication: run "codex auth status"', 'Check network connectivity', 'Try restarting the application'];
      } else if (errorMessage.includes('command not found')) {
        suggestions = ['Install Codex CLI: https://codex.com/install', 'Add Codex to your PATH environment variable', 'Restart your terminal/application after installation'];
      } else if (errorMessage.includes('authentication')) {
        suggestions = ['Run "codex auth" to authenticate with your account', 'Check if your authentication token is valid', 'Try logging out and logging back in'];
      }

      // Log troubleshooting suggestions for debugging

      // Even if setup fails, try to continue running as connection may still be valid
      this.agent.getSessionManager().emitSessionEvent('session_partial', {
        workspace: this.workspace,
        agent_type: 'codex',
        error: errorMessage,
        diagnostics,
        suggestions,
      });

      // Don't throw error, let the application continue running
      return;
    }
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }) {
    cronBusyGuard.setProcessing(this.conversation_id, true);
    try {
      await this.bootstrap;
      const contentToSend = data.content?.includes(AIONUI_FILES_MARKER) ? data.content.split(AIONUI_FILES_MARKER)[0].trimEnd() : data.content;

      // Save user message to chat history only (renderer already inserts right-hand bubble)
      if (data.msg_id && data.content) {
        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: { content: data.content },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);
      }

      // Process file references - following ACP file reference handling
      let processedContent = this.agent.getFileOperationHandler().processFileReferences(contentToSend, data.files);

      // If this is the first message, send via newSession to avoid double message issue
      if (this.isFirstMessage) {
        this.isFirstMessage = false;

        // Inject preset context and skills INDEX from smart assistant (if available)
        processedContent = await prepareFirstMessageWithSkillsIndex(processedContent, {
          presetContext: this.options.presetContext,
          enabledSkills: this.options.enabledSkills,
        });

        const result = await this.agent.newSession(this.workspace, processedContent);

        // Session created successfully - Codex will send session_configured event automatically
        // Note: setProcessing(false) is called in CodexMessageProcessor.processTaskComplete
        // when the message flow is actually complete
        return result;
      } else {
        // Subsequent messages use normal sendPrompt
        const result = await this.agent.sendPrompt(processedContent);
        // Note: setProcessing(false) is called in CodexMessageProcessor.processTaskComplete
        return result;
      }
    } catch (e) {
      cronBusyGuard.setProcessing(this.conversation_id, false);
      // For certain error types, avoid duplicate error message handling
      // These errors are usually already handled via MCP connection event stream
      const errorMsg = e instanceof Error ? e.message : String(e);
      const isUsageLimitError = errorMsg.toLowerCase().includes("you've hit your usage limit");

      if (isUsageLimitError) {
        // Usage limit error already handled via MCP event stream, avoid duplicate sending
        throw e;
      }

      // Create more descriptive error message based on error type
      let errorMessage = 'Failed to send message to Codex';
      if (e instanceof Error) {
        if (e.message.includes('timeout')) {
          errorMessage = 'Request timed out. Please check your connection and try again.';
        } else if (e.message.includes('authentication')) {
          errorMessage = 'Authentication failed. Please verify your Codex credentials.';
        } else if (e.message.includes('network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else {
          errorMessage = `Codex error: ${e.message}`;
        }
      }

      const message: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: data.msg_id || uuid(),
        data: errorMessage,
      };
      // Emit to frontend - frontend will handle transformation and persistence
      ipcBridge.codexConversation.responseStream.emit(message);
      throw e;
    }
  }

  /**
   * Unified confirmation method - manage all confirmations through addConfirmation
   * Following GeminiAgentManager and AcpAgentManager implementation
   */
  async confirm(id: string, callId: string, data: string) {
    super.confirm(id, callId, data);
    await this.bootstrap;
    this.agent.getEventHandler().getToolHandlers().removePendingConfirmation(callId);

    // Use standardized permission decision mapping
    // Maps UI options to Codex CLI's ReviewDecision (snake_case format)
    const decisionKey = data in PERMISSION_DECISION_MAP ? (data as keyof typeof PERMISSION_DECISION_MAP) : 'reject_once';
    const decision = mapPermissionDecision(decisionKey) as 'approved' | 'approved_for_session' | 'denied' | 'abort';

    const isApproved = decision === 'approved' || decision === 'approved_for_session';

    // Store decision in ApprovalStore if user selected "always allow" or "always reject"
    if (decision === 'approved_for_session' || decision === 'abort') {
      this.storeApprovalDecision(callId, decision);
    }

    // Apply patch changes if available and approved
    const changes = this.agent.getEventHandler().getToolHandlers().getPatchChanges(callId);
    if (changes && isApproved) {
      await this.applyPatchChanges(callId, changes);
    }

    // Normalize call id back to server's codex_call_id
    // Handle the new unified permission_ prefix as well as legacy prefixes
    const origCallId = callId.startsWith('permission_')
      ? callId.substring(11) // Remove 'permission_' prefix
      : callId.startsWith('patch_')
        ? callId.substring(6)
        : callId.startsWith('elicitation_')
          ? callId.substring(12)
          : callId.startsWith('exec_')
            ? callId.substring(5)
            : callId;

    // Respond to elicitation (server expects JSON-RPC response)
    this.agent.respondElicitation(origCallId, decision);

    // Also resolve local pause gate to resume queued requests
    this.agent.resolvePermission(origCallId, isApproved);
  }

  /**
   * Store approval/rejection decision in ApprovalStore based on request type
   */
  private storeApprovalDecision(callId: string, decision: 'approved_for_session' | 'abort'): void {
    const toolHandlers = this.agent.getEventHandler().getToolHandlers();

    // Check if this is an exec request
    const execMeta = toolHandlers.getExecRequestMeta(callId);
    if (execMeta) {
      this.agent.storeExecApproval(execMeta.command, execMeta.cwd, decision);
      return;
    }

    // Check if this is a patch request
    const patchChanges = toolHandlers.getPatchChanges(callId);
    if (patchChanges) {
      const files = Object.keys(patchChanges);
      this.agent.storePatchApproval(files, decision);
    }
  }

  private async applyPatchChanges(callId: string, changes: Record<string, FileChange>): Promise<void> {
    try {
      // Use file operation handler to apply changes - following ACP batch operations
      await this.agent.getFileOperationHandler().applyBatchChanges(changes);

      // Emit success event
      this.agent.getSessionManager().emitSessionEvent('patch_applied', {
        callId,
        changeCount: Object.keys(changes).length,
        files: Object.keys(changes),
      });

      // Patch changes applied successfully
    } catch (error) {
      // Emit failure event
      this.agent.getSessionManager().emitSessionEvent('patch_failed', {
        callId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  private handleNetworkError(error: NetworkError): void {
    // Emit network error as status message
    this.emitStatus('error');

    // Create a user-friendly error message based on error type
    let userMessage = '';
    let recoveryActions: string[] = [];

    switch (error.type) {
      case 'cloudflare_blocked':
        userMessage = '🚫 Codex service blocked by Cloudflare protection';
        recoveryActions = ['• Use VPN or proxy service', '• Switch network environment (like mobile hotspot)', '• Wait 10-30 minutes and retry', '• Clear browser cache and cookies', '• Switch to other available services: ChatGPT, Claude, Qwen, Gemini'];
        break;

      case 'network_timeout':
        userMessage = '⏱️ Network connection timeout';
        recoveryActions = ['• Check if network connection is stable', '• Retry connection operation', '• Switch to more stable network environment', '• Check firewall settings'];
        break;

      case 'connection_refused':
        userMessage = '❌ Service connection refused';
        recoveryActions = ['• Check if Codex CLI is properly installed', '• Verify service configuration and API keys', '• Restart application', '• Check if local ports are occupied'];
        break;

      default:
        userMessage = '🔌 Network connection error';
        recoveryActions = ['• Check network connection status', '• Retry current operation', '• Switch network environment', '• Contact technical support'];
    }

    const detailedMessage = `${userMessage}\n\n${'**Suggested Solutions:**'}\n${recoveryActions.join('\n')}\n\n${'**Technical Information:**'}\n- ${'Error Type'}：${error.type}\n- ${'Retry Count'}：${error.retryCount}\n- ${'Error Details'}：${error.originalError.substring(0, 200)}${error.originalError.length > 200 ? '...' : ''}`;

    // Emit network error message to UI
    const networkErrorMessage: IResponseMessage = {
      type: 'tips',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        error: error,
        title: userMessage,
        message: detailedMessage,
        recoveryActions: recoveryActions,
        quickSwitchContent: "When current service encounters network restrictions, you can:\n\n1. **Switch AI Assistant Immediately**: Select other available assistants from the left panel\n2. **Check Service Status**: Availability of different AI services may vary by region\n3. **Network Optimization**: Use stable network environment to improve connection success rate\n4. **Retry Later**: Network restrictions are usually temporary\n\n**Tip**: It's recommended to configure multiple AI services as alternatives to ensure work continuity.",
      },
    };

    // Emit network error message to UI
    // Backend handles persistence before emitting to frontend
    const tMessage = transformMessage(networkErrorMessage);
    if (tMessage) {
      addMessage(this.conversation_id, tMessage);
    }
    ipcBridge.codexConversation.responseStream.emit(networkErrorMessage);
  }

  private emitStatus(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'disconnected') {
    const statusMessage: IResponseMessage = {
      type: 'agent_status',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        backend: 'codex', // Agent identifier from AcpBackend type
        status,
      },
    };
    // Use emitAndPersistMessage to ensure status messages are both emitted and persisted
    this.emitAndPersistMessage(statusMessage);
  }

  getDiagnostics() {
    const agentDiagnostics = this.agent.getDiagnostics();
    const sessionInfo = this.agent.getSessionManager().getSessionInfo();

    return {
      agent: agentDiagnostics,
      session: sessionInfo,
      workspace: this.workspace,
      conversation_id: this.conversation_id,
    };
  }

  cleanup() {
    // Clean up all managers - following ACP cleanup pattern
    this.agent.getEventHandler().cleanup();
    this.agent.getSessionManager().cleanup();
    this.agent.getFileOperationHandler().cleanup();

    // Stop agent
    this.agent?.stop?.().catch((error) => {
      log.error({ err: error }, 'Failed to stop Codex agent during cleanup');
    });

    // Cleanup completed
  }

  // Stop current Codex stream in-process (override ForkTask default which targets a worker)
  stop() {
    return this.agent?.stop?.() ?? Promise.resolve();
  }

  // Ensure we clean up agent resources on kill
  kill() {
    try {
      this.agent?.stop?.().catch((error) => {
        log.error({ err: error }, 'Failed to stop Codex agent during kill');
      });
    } finally {
      super.kill();
    }
  }

  emitAndPersistMessage(message: IResponseMessage, persist: boolean = true): void {
    message.conversation_id = this.conversation_id;

    // Handle preview_open event (chrome-devtools navigation interception)
    if (handlePreviewOpenEvent(message)) {
      return; // Don't process further
    }

    // Backend handles persistence if needed
    if (persist) {
      const tMessage = transformMessage(message);
      if (tMessage) {
        addMessage(this.conversation_id, tMessage);
        // Note: Cron command detection is handled in CodexMessageProcessor.processFinalMessage
        // where we have the complete agent_message text
      }
    }

    // Always emit to frontend for UI display
    ipcBridge.codexConversation.responseStream.emit(message);
  }

  /**
   * Implement ICodexMessageEmitter interface's addConfirmation method
   * Delegate to BaseAgentManager's addConfirmation for unified management
   */
  addConfirmation(data: IConfirmation): void {
    super.addConfirmation(data);
  }

  persistMessage(message: TMessage): void {
    // Direct persistence to database without emitting to frontend
    // Used for final messages where frontend has already displayed content via deltas
    addMessage(this.conversation_id, message);
  }

  /**
   * Send message back to AI agent (for system response feedback)
   * Used by CodexMessageProcessor to send cron command results back to AI
   */
  async sendMessageToAgent(content: string): Promise<void> {
    await this.sendMessage({
      content,
      msg_id: uuid(),
    });
  }

  // ===== ApprovalStore integration (ICodexMessageEmitter) =====

  /**
   * Check if an exec command has been approved for session
   */
  checkExecApproval(command: string | string[], cwd?: string): boolean {
    return this.agent?.checkExecApproval(command, cwd) || false;
  }

  /**
   * Check if file changes have been approved for session
   */
  checkPatchApproval(files: string[]): boolean {
    return this.agent?.checkPatchApproval(files) || false;
  }

  /**
   * Check if an exec command has been rejected for session (abort)
   */
  checkExecRejection(command: string | string[], cwd?: string): boolean {
    return this.agent?.checkExecRejection(command, cwd) || false;
  }

  /**
   * Check if file changes have been rejected for session (abort)
   */
  checkPatchRejection(files: string[]): boolean {
    return this.agent?.checkPatchRejection(files) || false;
  }

  /**
   * Auto-confirm a permission request (used when ApprovalStore has cached approval)
   */
  autoConfirm(callId: string, decision: string): void {
    // Simulate user clicking "allow_always" - reuse the confirm logic
    void this.confirm(callId, callId, decision);
  }
}

export default CodexAgentManager;
