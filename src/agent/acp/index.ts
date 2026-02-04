/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcpAdapter } from '@/agent/acp/AcpAdapter';
import { extractAtPaths, parseAllAtCommands, reconstructQuery } from '@/common/atCommandParser';
import type { TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { NavigationInterceptor } from '@/common/navigation';
import { uuid } from '@/common/utils';
import type { AcpBackend, AcpPermissionRequest, AcpResult, AcpSessionUpdate, ToolCallUpdate } from '@/types/acpTypes';
import { AcpErrorType, createAcpError } from '@/types/acpTypes';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AcpConnection } from './AcpConnection';
import { AcpApprovalStore, createAcpApprovalKey } from './ApprovalStore';
import { CLAUDE_YOLO_SESSION_MODE } from './constants';
import { getClaudeModel } from './utils';

/**
 * Initialize response result interface
 */
interface InitializeResult {
  authMethods?: Array<{
    type: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Helper function to normalize tool call status
 *
 * Note: This preserves the original behavior of (status as any) || 'pending'
 * Only converts falsy values to 'pending', keeps all truthy values unchanged
 */
function normalizeToolCallStatus(status: string | undefined): 'pending' | 'in_progress' | 'completed' | 'failed' {
  // Matches original: (status as any) || 'pending'
  // If falsy (undefined, null, ''), return 'pending'
  if (!status) {
    return 'pending';
  }
  // Preserve original value for backward compatibility
  return status as 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AcpAgentConfig {
  id: string;
  backend: AcpBackend;
  cliPath?: string;
  workingDir: string;
  customArgs?: string[]; // Custom CLI arguments (for custom backend)
  customEnv?: Record<string, string>; // Custom environment variables (for custom backend)
  userId?: string; // User ID for per-user API key injection
  extra?: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
    userId?: string; // User ID for per-user API key injection
  };
  onStreamEvent: (data: IResponseMessage) => void;
  onSignalEvent?: (data: IResponseMessage) => void; // New: send signal only, do not update UI
}

// ACP agent task class
export class AcpAgent {
  private readonly id: string;
  private extra: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
    userId?: string;
  };
  private connection: AcpConnection;
  private adapter: AcpAdapter;
  private pendingPermissions = new Map<string, { resolve: (response: { optionId: string }) => void; reject: (error: Error) => void }>();
  private statusMessageId: string | null = null;
  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onSignalEvent?: (data: IResponseMessage) => void;

  // Track pending navigation tool calls for URL extraction from results
  private pendingNavigationTools = new Set<string>();

  // ApprovalStore for session-level "always allow" caching
  // Workaround for claude-code-acp bug: it doesn't check suggestions to auto-approve
  private approvalStore = new AcpApprovalStore();

  // Store permission request metadata for later use in confirmMessage
  private permissionRequestMeta = new Map<string, { kind?: string; title?: string; rawInput?: Record<string, unknown> }>();

  constructor(config: AcpAgentConfig) {
    this.id = config.id;
    this.onStreamEvent = config.onStreamEvent;
    this.onSignalEvent = config.onSignalEvent;
    this.extra = config.extra || {
      workspace: config.workingDir,
      backend: config.backend,
      cliPath: config.cliPath,
      customWorkspace: false, // Default to system workspace
      customArgs: config.customArgs,
      customEnv: config.customEnv,
      yoloMode: false,
      userId: config.userId, // Per-user API key injection
    };

    this.connection = new AcpConnection();
    this.adapter = new AcpAdapter(this.id, this.extra.backend);

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.connection.onSessionUpdate = (data: AcpSessionUpdate) => {
      this.handleSessionUpdate(data);
    };
    this.connection.onPermissionRequest = (data: AcpPermissionRequest) => {
      return this.handlePermissionRequest(data);
    };
    this.connection.onEndTurn = () => {
      this.handleEndTurn();
    };
    this.connection.onFileOperation = (operation) => {
      this.handleFileOperation(operation);
    };
  }

  /**
   * Check if a tool is a chrome-devtools navigation tool
   *
   * Delegates to NavigationInterceptor for unified logic
   */
  private isNavigationTool(toolName: string): boolean {
    return NavigationInterceptor.isNavigationTool(toolName);
  }

  /**
   * Extract URL from navigation tool's permission request data
   *
   * Delegates to NavigationInterceptor for unified logic
   */
  // eslint-disable-next-line max-len
  private extractNavigationUrl(toolCall: { rawInput?: Record<string, unknown>; content?: Array<{ type?: string; content?: { type?: string; text?: string }; text?: string }>; title?: string }): string | null {
    return NavigationInterceptor.extractUrl(toolCall);
  }

  /**
   * Handle intercepted navigation tool by emitting preview_open event
   */
  private handleInterceptedNavigation(url: string, _toolName: string): void {
    const previewMessage = NavigationInterceptor.createPreviewMessage(url, this.id);
    this.onStreamEvent(previewMessage);
  }

  // Start ACP connection and session
  async start(): Promise<void> {
    try {
      this.emitStatusMessage('connecting');

      let connectTimeoutId: NodeJS.Timeout | null = null;
      const connectTimeoutPromise = new Promise<never>((_, reject) => {
        connectTimeoutId = setTimeout(() => reject(new Error('Connection timeout after 70 seconds')), 70000);
      });

      try {
        await Promise.race([this.connection.connect(this.extra.backend, this.extra.cliPath, this.extra.workspace, this.extra.customArgs, this.extra.customEnv, this.extra.userId), connectTimeoutPromise]);
      } finally {
        if (connectTimeoutId) {
          clearTimeout(connectTimeoutId);
        }
      }
      this.emitStatusMessage('connected');
      await this.performAuthentication();
      // Avoid duplicate session creation: only create when no active session exists
      if (!this.connection.hasActiveSession) {
        await this.connection.newSession(this.extra.workspace);
      }

      // Claude Code "YOLO" mode: bypass all permission checks (equivalent to --dangerously-skip-permissions)
      if (this.extra.backend === 'claude' && this.extra.yoloMode) {
        try {
          await this.connection.setSessionMode(CLAUDE_YOLO_SESSION_MODE);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`[ACP] Failed to enable Claude YOLO mode (${CLAUDE_YOLO_SESSION_MODE}): ${errorMessage}`);
        }
      }

      // Auto-set model from ~/.claude/settings.json for Claude backend
      if (this.extra.backend === 'claude') {
        const configuredModel = getClaudeModel();
        if (configuredModel) {
          try {
            await this.connection.setModel(configuredModel);
          } catch (error) {
            // Log warning but don't fail - fallback to default model
            console.warn(`[ACP] Failed to set model from settings: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      this.emitStatusMessage('session_active');
    } catch (error) {
      this.emitStatusMessage('error');
      throw error;
    }
  }

  stop(): Promise<void> {
    this.connection.disconnect();
    this.emitStatusMessage('disconnected');
    // Clear session-scoped caches when session ends
    this.approvalStore.clear();
    this.permissionRequestMeta.clear();
    // Emit finish event to reset frontend UI state
    this.onStreamEvent({
      type: 'finish',
      conversation_id: this.id,
      msg_id: uuid(),
      data: null,
    });
    return Promise.resolve();
  }

  // Send message to ACP server
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    try {
      if (!this.connection.isConnected || !this.connection.hasActiveSession) {
        return {
          success: false,
          error: createAcpError(AcpErrorType.CONNECTION_NOT_READY, 'ACP connection not ready', true),
        };
      }
      this.adapter.resetMessageTracking();
      let processedContent = data.content;

      // Add @ prefix to ALL uploaded files (including images) with FULL PATH
      // Claude CLI needs full path to read files
      if (data.files && data.files.length > 0) {
        const fileRefs = data.files
          .map((filePath) => {
            // Use full path instead of just filename
            // Escape paths with spaces using quotes for Claude CLI
            if (filePath.includes(' ')) {
              return `@"${filePath}"`;
            }
            return '@' + filePath;
          })
          .join(' ');
        // Prepend file references to the content
        processedContent = fileRefs + ' ' + processedContent;
      }

      // Process @ file references in the message
      processedContent = await this.processAtFileReferences(processedContent, data.files);

      await this.connection.sendPrompt(processedContent);
      this.statusMessageId = null;
      return { success: true, data: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Special handling for Internal error
      if (errorMsg.includes('Internal error')) {
        if (this.extra.backend === 'qwen') {
          const enhancedMsg = `Qwen ACP Internal Error: This usually means authentication failed or ` + `the Qwen CLI has compatibility issues. Please try: 1) Restart the application ` + `2) Use 'npx @qwen-code/qwen-code' instead of global qwen 3) Check if you have valid Qwen credentials.`;
          this.emitErrorMessage(enhancedMsg);
          return {
            success: false,
            error: createAcpError(AcpErrorType.AUTHENTICATION_FAILED, enhancedMsg, false),
          };
        }
      }
      // Classify error types based on message content
      let errorType: AcpErrorType = AcpErrorType.UNKNOWN;
      let retryable = false;

      if (errorMsg.includes('authentication') || errorMsg.includes('auth failed') || errorMsg.includes('[ACP-AUTH-')) {
        errorType = AcpErrorType.AUTHENTICATION_FAILED;
        retryable = false;
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout') || errorMsg.includes('timed out')) {
        errorType = AcpErrorType.TIMEOUT;
        retryable = true;
      } else if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
        errorType = AcpErrorType.PERMISSION_DENIED;
        retryable = false;
      } else if (errorMsg.includes('connection') || errorMsg.includes('Connection')) {
        errorType = AcpErrorType.NETWORK_ERROR;
        retryable = true;
      }

      this.emitErrorMessage(errorMsg);
      return {
        success: false,
        error: createAcpError(errorType, errorMsg, retryable),
      };
    }
  }

  /**
   * Process @ file references in the message content
   *
   * This method resolves @ references to actual files in the workspace,
   * reads their content, and appends it to the message.
   */
  private async processAtFileReferences(content: string, uploadedFiles?: string[]): Promise<string> {
    const workspace = this.extra.workspace;
    if (!workspace) {
      return content;
    }

    // Parse all @ references in the content
    // Note: @ prefix is already added to content by sendMessage for uploaded files
    const parts = parseAllAtCommands(content);
    const atPaths = extractAtPaths(content);

    // If no @ references found, return original content
    if (atPaths.length === 0) {
      return content;
    }

    // Track which @ references are resolved to files
    const resolvedFiles: Map<string, string> = new Map(); // atPath -> file content
    // Track @ references that should be removed (duplicate file references by filename)
    const referencesToRemove: Set<string> = new Set();

    for (const atPath of atPaths) {
      // Check if this @ reference is an uploaded file (full path or filename)
      // If yes, skip it - let Claude CLI handle it natively
      const matchedUploadFile = uploadedFiles?.find((filePath) => {
        // Match by full path
        if (atPath === filePath) return true;
        // Match by filename (for cases where message contains just filename)
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        return atPath === fileName;
      });

      if (matchedUploadFile) {
        // If this is a filename reference (not full path), mark for removal
        // The full path reference will be kept
        if (atPath !== matchedUploadFile) {
          referencesToRemove.add(atPath);
        }
        // Skip uploaded files - they are already in @ format with full path
        // Claude CLI will handle them natively
        continue;
      }

      // For workspace file references (filename only), try to resolve and read
      const resolvedPath = await this.resolveAtPath(atPath, workspace);

      if (resolvedPath) {
        try {
          // Try to read as text file
          const fileContent = await fs.readFile(resolvedPath, 'utf-8');
          resolvedFiles.set(atPath, fileContent);
        } catch (error) {
          // Binary files (images, etc.) cannot be read as text
          // Keep the @ reference as-is, let CLI handle it
          console.warn(`[ACP] Skipping binary file ${atPath} (will be handled by CLI)`);
        }
      }
    }

    // If no files were resolved and no references to remove, return original content
    if (resolvedFiles.size === 0 && referencesToRemove.size === 0) {
      return content;
    }

    // Reconstruct the message: replace @ references with plain text and append file contents
    const reconstructedQuery = reconstructQuery(parts, (atPath) => {
      // Remove duplicate filename references (when full path already exists)
      if (referencesToRemove.has(atPath)) {
        return '';
      }
      if (resolvedFiles.has(atPath)) {
        // Replace with just the filename (without @) as the reference
        return atPath;
      }
      // Keep unresolved @ references as-is
      return '@' + atPath;
    });

    // Append file contents at the end of the message
    let result = reconstructedQuery;
    if (resolvedFiles.size > 0) {
      result += '\n\n--- Referenced file contents ---';
      for (const [atPath, fileContent] of resolvedFiles) {
        result += `\n\n[Content of ${atPath}]:\n${fileContent}`;
      }
      result += '\n--- End of file contents ---';
    }

    return result;
  }

  /**
   * Resolve an @ path to an actual file path in the workspace
   */
  private async resolveAtPath(atPath: string, workspace: string): Promise<string | null> {
    // Try direct path first
    const directPath = path.resolve(workspace, atPath);
    try {
      const stats = await fs.stat(directPath);
      if (stats.isFile()) {
        return directPath;
      }
      // If it's a directory, we don't read it (for now)
      return null;
    } catch {
      // Direct path doesn't exist, try searching for the file
    }

    // Try to find file by name in workspace (simple search)
    try {
      const fileName = path.basename(atPath);
      const foundPath = await this.findFileInWorkspace(workspace, fileName);
      return foundPath;
    } catch {
      return null;
    }
  }

  /**
   * Simple file search in workspace (non-recursive for performance)
   */
  private async findFileInWorkspace(workspace: string, fileName: string, maxDepth: number = 3): Promise<string | null> {
    const searchDir = async (dir: string, depth: number): Promise<string | null> => {
      if (depth > maxDepth) return null;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile() && entry.name === fileName) {
            return fullPath;
          }
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const found = await searchDir(fullPath, depth + 1);
            if (found) return found;
          }
        }
      } catch {
        // Ignore permission errors
      }
      return null;
    };

    return await searchDir(workspace, 0);
  }

  confirmMessage(data: { confirmKey: string; callId: string }): Promise<AcpResult> {
    try {
      if (this.pendingPermissions.has(data.callId)) {
        const { resolve } = this.pendingPermissions.get(data.callId)!;
        this.pendingPermissions.delete(data.callId);

        // Store "allow_always" decision to ApprovalStore for future auto-approval
        // Workaround for claude-code-acp bug: it returns updatedPermissions but doesn't check suggestions
        if (data.confirmKey === 'allow_always') {
          const meta = this.permissionRequestMeta.get(data.callId);
          if (meta) {
            const approvalKey = createAcpApprovalKey({
              kind: meta.kind,
              title: meta.title,
              rawInput: meta.rawInput,
            });
            this.approvalStore.put(approvalKey, 'allow_always');
          }
        }

        // Clean up metadata
        this.permissionRequestMeta.delete(data.callId);

        resolve({ optionId: data.confirmKey });
        return Promise.resolve({ success: true, data: null });
      }
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, `Permission request not found for callId: ${data.callId}`, false),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, errorMsg, false),
      });
    }
  }

  private handleSessionUpdate(data: AcpSessionUpdate): void {
    try {
      // Intercept chrome-devtools navigation tools from session updates
      if (data.update?.sessionUpdate === 'tool_call') {
        const toolCallUpdate = data as ToolCallUpdate;
        const toolName = toolCallUpdate.update?.title || '';
        const toolCallId = toolCallUpdate.update?.toolCallId;
        if (this.isNavigationTool(toolName)) {
          // Track this navigation tool call for result interception
          if (toolCallId) {
            this.pendingNavigationTools.add(toolCallId);
          }
          const url = this.extractNavigationUrl(toolCallUpdate.update);
          if (url) {
            // Emit preview_open event to show URL in preview panel
            this.handleInterceptedNavigation(url, toolName);
          }
        }
      }

      // Intercept tool_call_update to extract URL from navigation tool results
      if (data.update?.sessionUpdate === 'tool_call_update') {
        const statusUpdate = data as import('@/types/acpTypes').ToolCallUpdateStatus;
        const toolCallId = statusUpdate.update?.toolCallId;
        if (toolCallId && this.pendingNavigationTools.has(toolCallId)) {
          // This is a result for a tracked navigation tool
          if (statusUpdate.update?.status === 'completed' && statusUpdate.update?.content) {
            // Try to extract URL from the result content
            for (const item of statusUpdate.update.content) {
              const text = item.content?.text || '';
              const urlMatch = text.match(/https?:\/\/[^\s<>"]+/i);
              if (urlMatch) {
                this.handleInterceptedNavigation(urlMatch[0], 'navigate_page');
                break;
              }
            }
          }
          // Clean up tracking
          this.pendingNavigationTools.delete(toolCallId);
        }
      }

      const messages = this.adapter.convertSessionUpdate(data);

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        // Send all messages directly without complex replacement logic
        this.emitMessage(message);
      }
    } catch (error) {
      this.emitErrorMessage(`Failed to process session update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private handlePermissionRequest(data: AcpPermissionRequest): Promise<{ optionId: string }> {
    return new Promise((resolve, reject) => {
      // Ensure every permission request has a stable toolCallId so UI + pending map stay in sync
      if (data.toolCall && !data.toolCall.toolCallId) {
        data.toolCall.toolCallId = uuid();
      }
      const requestId = data.toolCall.toolCallId; // Use toolCallId as requestId

      // Check ApprovalStore for cached "always allow" decision
      // Workaround for claude-code-acp bug: it returns updatedPermissions but doesn't check suggestions
      const approvalKey = createAcpApprovalKey(data.toolCall);
      if (this.approvalStore.isApprovedForSession(approvalKey)) {
        // Auto-approve without showing dialog - no metadata storage needed
        resolve({ optionId: 'allow_always' });
        return;
      }

      // Clean up any existing metadata for this requestId before storing new one
      // This handles duplicate permission requests properly
      if (this.permissionRequestMeta.has(requestId)) {
        this.permissionRequestMeta.delete(requestId);
      }

      // Store metadata for later use in confirmMessage
      this.permissionRequestMeta.set(requestId, {
        kind: data.toolCall.kind,
        title: data.toolCall.title,
        rawInput: data.toolCall.rawInput,
      });

      // Intercept chrome-devtools navigation tools and show in preview panel
      // Note: We only emit preview_open event, do NOT block tool execution
      // The agent needs chrome-devtools to fetch web content
      const toolName = data.toolCall?.title || '';
      if (this.isNavigationTool(toolName)) {
        const url = this.extractNavigationUrl(data.toolCall);
        if (url) {
          // Emit preview_open event to show URL in preview panel
          this.handleInterceptedNavigation(url, toolName);
        }
        // Track for later extraction from result if URL not available now
        this.pendingNavigationTools.add(requestId);
      }

      // Check for duplicate permission requests
      if (this.pendingPermissions.has(requestId)) {
        // If duplicate request, clean up the old one first
        const oldRequest = this.pendingPermissions.get(requestId);
        if (oldRequest) {
          oldRequest.reject(new Error('Replaced by new permission request'));
        }
        this.pendingPermissions.delete(requestId);
      }

      this.pendingPermissions.set(requestId, { resolve, reject });

      // Ensure permission message is always sent, even with async issues
      try {
        this.emitPermissionRequest(data); // Pass AcpPermissionRequest directly
      } catch (error) {
        this.pendingPermissions.delete(requestId);
        reject(error);
        return;
      }

      setTimeout(() => {
        if (this.pendingPermissions.has(requestId)) {
          this.pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }
      }, 70000);
    });
  }

  private handleEndTurn(): void {
    // Use signal callback to send end_turn event without adding to message list
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }
  }

  private handleFileOperation(operation: { method: string; path: string; content?: string; sessionId: string }): void {
    // Create file operation message to display in UI
    const fileOperationMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: {
        content: this.formatFileOperationMessage(operation),
      },
    };

    this.emitMessage(fileOperationMessage);
  }

  private formatFileOperationMessage(operation: { method: string; path: string; content?: string; sessionId: string }): string {
    switch (operation.method) {
      case 'fs/write_text_file': {
        const content = operation.content || '';
        return `📝 File written: \`${operation.path}\`\n\n\`\`\`\n${content}\n\`\`\``;
      }
      case 'fs/read_text_file':
        return `📖 File read: \`${operation.path}\``;
      default:
        return `🔧 File operation: \`${operation.path}\``;
    }
  }

  private emitStatusMessage(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error'): void {
    // Use fixed ID for status messages so they update instead of duplicate
    if (!this.statusMessageId) {
      this.statusMessageId = uuid();
    }

    const statusMessage: TMessage = {
      id: this.statusMessageId,
      msg_id: this.statusMessageId,
      conversation_id: this.id,
      type: 'agent_status',
      position: 'center',
      createdAt: Date.now(),
      content: {
        backend: this.extra.backend,
        status,
      },
    };

    this.emitMessage(statusMessage);
  }

  private emitPermissionRequest(data: AcpPermissionRequest): void {
    // Important: Register toolCall from permission request to adapter's activeToolCalls
    // This allows subsequent tool_call_update events to find the corresponding tool call
    if (data.toolCall) {
      // Map the kind from permission request to the correct type
      const mapKindToValidType = (kind?: string): 'read' | 'edit' | 'execute' => {
        switch (kind) {
          case 'read':
            return 'read';
          case 'edit':
            return 'edit';
          case 'execute':
            return 'execute';
          default:
            return 'execute'; // Default to execute
        }
      };

      const toolCallUpdate: ToolCallUpdate = {
        sessionId: data.sessionId,
        update: {
          sessionUpdate: 'tool_call' as const,
          toolCallId: data.toolCall.toolCallId,
          status: normalizeToolCallStatus(data.toolCall.status),
          title: data.toolCall.title || 'Tool Call',
          kind: mapKindToValidType(data.toolCall.kind),
          content: data.toolCall.content || [],
          locations: data.toolCall.locations || [],
        },
      };

      // Create tool call message to register with activeToolCalls
      this.adapter.convertSessionUpdate(toolCallUpdate);
    }

    // Use onSignalEvent instead of emitMessage so message won't be persisted to database
    // Permission request is a temporary interaction message that becomes meaningless once user makes a choice
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'acp_permission',
        conversation_id: this.id,
        msg_id: uuid(),
        data: data,
      });
    }
  }

  private emitErrorMessage(error: string): void {
    const errorMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'tips',
      position: 'center',
      createdAt: Date.now(),
      content: {
        content: error,
        type: 'error',
      },
    };

    this.emitMessage(errorMessage);
  }

  private extractThoughtSubject(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0].trim();

    // Try to extract subject from **Subject** format
    const subjectMatch = firstLine.match(/^\*\*(.+?)\*\*$/);
    if (subjectMatch) {
      return subjectMatch[1];
    }

    // Use first line as subject if it looks like a title
    if (firstLine.length < 80 && !firstLine.endsWith('.')) {
      return firstLine;
    }

    // Extract first sentence as subject
    const firstSentence = content.split('.')[0];
    if (firstSentence.length < 100) {
      return firstSentence;
    }

    return 'Thinking';
  }

  private emitMessage(message: TMessage): void {
    // Create response message based on the message type, following GeminiAgentTask pattern
    const responseMessage: IResponseMessage = {
      type: '', // Will be set in switch statement
      data: null, // Will be set in switch statement
      conversation_id: this.id,
      msg_id: message.msg_id || message.id, // Use the message's own msg_id
    };

    // Map TMessage types to backend response types
    switch (message.type) {
      case 'text':
        responseMessage.type = 'content';
        responseMessage.data = message.content.content;
        break;
      case 'agent_status':
        responseMessage.type = 'agent_status';
        responseMessage.data = message.content;
        break;
      case 'acp_permission':
        responseMessage.type = 'acp_permission';
        responseMessage.data = message.content;
        break;
      case 'tips':
        // Distinguish between thought messages and error messages
        if (message.content.type === 'warning' && message.position === 'center') {
          const subject = this.extractThoughtSubject(message.content.content);

          responseMessage.type = 'thought';
          responseMessage.data = {
            subject,
            description: message.content.content,
          };
        } else {
          responseMessage.type = 'error';
          responseMessage.data = message.content.content;
        }
        break;
      case 'acp_tool_call': {
        responseMessage.type = 'acp_tool_call';
        responseMessage.data = message.content;
        break;
      }
      case 'plan':
        {
          responseMessage.type = 'plan';
          responseMessage.data = message.content;
        }
        break;
      default:
        responseMessage.type = 'content';
        responseMessage.data = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    }
    this.onStreamEvent(responseMessage);
  }

  postMessagePromise(action: string, data: unknown): Promise<AcpResult | void> {
    switch (action) {
      case 'send.message':
        return this.sendMessage(data as { content: string; files?: string[]; msg_id?: string });
      case 'stop.stream':
        return this.stop();
      default:
        return Promise.reject(new Error(`Unknown action: ${action}`));
    }
  }

  get isConnected(): boolean {
    return this.connection.isConnected;
  }

  get hasActiveSession(): boolean {
    return this.connection.hasActiveSession;
  }

  // Add kill method for compatibility with WorkerManage
  kill(): void {
    this.stop().catch((error) => {
      console.error('Error stopping ACP agent:', error);
    });
  }

  private async ensureBackendAuth(backend: AcpBackend, loginArg: string): Promise<void> {
    try {
      this.emitStatusMessage('connecting');

      // Use configured CLI path to call login command
      if (!this.extra.cliPath) {
        throw new Error(`No CLI path configured for ${backend} backend`);
      }

      // Use the same command parsing logic as AcpConnection
      let command: string;
      let args: string[];

      if (this.extra.cliPath.startsWith('npx ')) {
        // For "npx @qwen-code/qwen-code" or "npx @anthropic-ai/claude-code"
        const parts = this.extra.cliPath.split(' ');
        const isWindows = process.platform === 'win32';
        command = isWindows ? 'npx.cmd' : 'npx';
        args = [...parts.slice(1), loginArg];
      } else {
        // For regular paths like '/usr/local/bin/qwen' or '/usr/local/bin/claude'
        command = this.extra.cliPath;
        args = [loginArg];
      }

      const loginProcess = spawn(command, args, {
        stdio: 'pipe', // Avoid interfering with user interface
        timeout: 70000,
      });

      await new Promise<void>((resolve, reject) => {
        loginProcess.on('close', (code) => {
          if (code === 0) {
            console.log(`${backend} authentication refreshed`);
            resolve();
          } else {
            reject(new Error(`${backend} login failed with code ${code}`));
          }
        });

        loginProcess.on('error', reject);
      });
    } catch (error) {
      console.warn(`${backend} auth refresh failed, will try to connect anyway:`, error);
      // Don't throw error, let connection attempt continue
    }
  }

  private async ensureQwenAuth(): Promise<void> {
    if (this.extra.backend !== 'qwen') return;
    await this.ensureBackendAuth('qwen', 'login');
  }

  private async ensureClaudeAuth(): Promise<void> {
    if (this.extra.backend !== 'claude') return;
    await this.ensureBackendAuth('claude', '/login');
  }

  private async performAuthentication(): Promise<void> {
    try {
      const initResponse = this.connection.getInitializeResponse();
      const result = initResponse?.result as InitializeResult | undefined;
      if (!initResponse || !result?.authMethods?.length) {
        // No auth methods available - CLI should handle authentication itself
        this.emitStatusMessage('authenticated');
        return;
      }

      // First try to create session directly to check if already authenticated
      try {
        await this.connection.newSession(this.extra.workspace);
        this.emitStatusMessage('authenticated');
        return;
      } catch (_err) {
        // Authentication required, perform conditional "warm-up" attempt
      }

      // Conditional warm-up: only try calling backend CLI login to refresh token when authentication is needed
      if (this.extra.backend === 'qwen') {
        await this.ensureQwenAuth();
      } else if (this.extra.backend === 'claude') {
        await this.ensureClaudeAuth();
      }

      // Retry creating session after warm-up
      try {
        await this.connection.newSession(this.extra.workspace);
        this.emitStatusMessage('authenticated');
        return;
      } catch (error) {
        // If still failing, guide user to manual login
        this.emitStatusMessage('error');
      }
    } catch (error) {
      this.emitStatusMessage('error');
    }
  }
}
