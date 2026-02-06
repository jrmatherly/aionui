/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- IPC messages carry arbitrary serialized data */

import type { BrandingConfig } from '@/common/branding';
import type { IConfirmation } from '@/common/chatLib';
import { bridge } from '@office-ai/platform';
import type { OpenDialogOptions } from 'electron';
import type { McpSource } from '../process/services/mcpServices/McpProtocol';
import type { AcpBackend, PresetAgentType } from '../types/acpTypes';
import type { IMcpServer, IProvider, TChatConversation, TProviderWithModel } from './storage';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from './types/preview';
import type { UpdateCheckRequest, UpdateCheckResult, UpdateDownloadProgressEvent, UpdateDownloadRequest, UpdateDownloadResult } from './updateTypes';
import type { ProtocolDetectionRequest, ProtocolDetectionResponse } from './utils/protocolDetector';

export const shell = {
  openFile: bridge.buildProvider<void, string>('open-file'), // Open file with system default application
  showItemInFolder: bridge.buildProvider<void, string>('show-item-in-folder'), // Open folder
  openExternal: bridge.buildProvider<void, string>('open-external'), // Open external link with system default application
};

// General conversation capabilities
export const conversation = {
  create: bridge.buildProvider<TChatConversation, ICreateConversationParams>('create-conversation'), // Create conversation
  createWithConversation: bridge.buildProvider<TChatConversation, { conversation: TChatConversation; sourceConversationId?: string }>('create-conversation-with-conversation'), // Create new conversation from history (supports migration)
  get: bridge.buildProvider<TChatConversation, { id: string }>('get-conversation'), // Get conversation information
  getAssociateConversation: bridge.buildProvider<TChatConversation[], { conversation_id: string }>('get-associated-conversation'), // Get associated conversations
  remove: bridge.buildProvider<boolean, { id: string }>('remove-conversation'), // Delete conversation
  update: bridge.buildProvider<boolean, { id: string; updates: Partial<TChatConversation>; mergeExtra?: boolean }>('update-conversation'), // Update conversation information
  reset: bridge.buildProvider<void, IResetConversationParams>('reset-conversation'), // Reset conversation
  stop: bridge.buildProvider<IBridgeResponse<{}>, { conversation_id: string }>('chat.stop.stream'), // Stop conversation stream
  sendMessage: bridge.buildProvider<IBridgeResponse<{}>, ISendMessageParams>('chat.send.message'), // Send message (unified interface)
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('conversation.confirm.message'), // General confirmation message
  responseStream: bridge.buildEmitter<IResponseMessage>('chat.response.stream'), // Receive message stream (unified interface)
  getWorkspace: bridge.buildProvider<
    IDirOrFile[],
    {
      conversation_id: string;
      workspace: string;
      path: string;
      search?: string;
    }
  >('conversation.get-workspace'),
  responseSearchWorkSpace: bridge.buildProvider<void, { file: number; dir: number; match?: IDirOrFile }>('conversation.response.search.workspace'),
  reloadContext: bridge.buildProvider<IBridgeResponse, { conversation_id: string }>('conversation.reload-context'),
  confirmation: {
    add: bridge.buildEmitter<IConfirmation<any> & { conversation_id: string }>('confirmation.add'),
    update: bridge.buildEmitter<IConfirmation<any> & { conversation_id: string }>('confirmation.update'),
    confirm: bridge.buildProvider<IBridgeResponse, { conversation_id: string; msg_id: string; data: any; callId: string }>('confirmation.confirm'),
    list: bridge.buildProvider<IConfirmation<any>[], { conversation_id: string }>('confirmation.list'),
    remove: bridge.buildEmitter<{ conversation_id: string; id: string }>('confirmation.remove'),
  },
  // Session-level approval memory for "always allow" decisions
  approval: {
    // Check if action is approved (keys are parsed from action+commandType in backend)
    check: bridge.buildProvider<boolean, { conversation_id: string; action: string; commandType?: string }>('approval.check'),
  },
};

// Gemini conversation interface - Reuses unified conversation interface
export const geminiConversation = {
  sendMessage: conversation.sendMessage,
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('input.confirm.message'),
  responseStream: conversation.responseStream,
};

export const application = {
  restart: bridge.buildProvider<void, void>('restart-app'), // Restart application
  openDevTools: bridge.buildProvider<void, void>('open-dev-tools'), // Open developer tools
  systemInfo: bridge.buildProvider<{ cacheDir: string; workDir: string; platform: string; arch: string }, void>('system.info'), // Get system information
  updateSystemInfo: bridge.buildProvider<IBridgeResponse, { cacheDir: string; workDir: string }>('system.update-info'), // Update system information
  getZoomFactor: bridge.buildProvider<number, void>('app.get-zoom-factor'),
  setZoomFactor: bridge.buildProvider<number, { factor: number }>('app.set-zoom-factor'),
};

// Branding configuration (env var overrides from main process)
export const branding = {
  getConfig: bridge.buildProvider<BrandingConfig, void>('get-branding-config'),
};

// Manual (opt-in) updates via GitHub Releases
export const update = {
  /** Ask the renderer to open the update UI (e.g. from app menu). */
  open: bridge.buildEmitter<{ source?: 'menu' | 'about' }>('update.open'),
  /** Check GitHub releases and return latest version info. */
  check: bridge.buildProvider<IBridgeResponse<UpdateCheckResult>, UpdateCheckRequest>('update.check'),
  /** Download a chosen release asset (explicit user action). */
  download: bridge.buildProvider<IBridgeResponse<UpdateDownloadResult>, UpdateDownloadRequest>('update.download'),
  /** Download progress events emitted by main process. */
  downloadProgress: bridge.buildEmitter<UpdateDownloadProgressEvent>('update.download.progress'),
};

export const dialog = {
  showOpen: bridge.buildProvider<
    string[] | undefined,
    | {
        defaultPath?: string;
        properties?: OpenDialogOptions['properties'];
        filters?: OpenDialogOptions['filters'];
      }
    | undefined
  >('show-open'), // Open file/folder selection window
};
export const fs = {
  getFilesByDir: bridge.buildProvider<Array<IDirOrFile>, { dir: string; root: string }>('get-file-by-dir'), // Get list of folders and files in specified directory
  getImageBase64: bridge.buildProvider<string, { path: string }>('get-image-base64'), // Get image base64
  fetchRemoteImage: bridge.buildProvider<string, { url: string }>('fetch-remote-image'), // Convert remote image to base64
  readFile: bridge.buildProvider<string, { path: string }>('read-file'), // Read file content (UTF-8)
  readFileBuffer: bridge.buildProvider<ArrayBuffer, { path: string }>('read-file-buffer'), // Read binary file as ArrayBuffer
  createTempFile: bridge.buildProvider<string, { fileName: string }>('create-temp-file'), // Create temporary file
  writeFile: bridge.buildProvider<boolean, { path: string; data: Uint8Array | string }>('write-file'), // Write file
  getFileMetadata: bridge.buildProvider<IFileMetadata, { path: string }>('get-file-metadata'), // Get file metadata
  copyFilesToWorkspace: bridge.buildProvider<
    // Return details for successful and failed copies for better UI feedback
    IBridgeResponse<{
      copiedFiles: string[];
      failedFiles?: Array<{ path: string; error: string }>;
    }>,
    { filePaths: string[]; workspace: string; sourceRoot?: string }
  >('copy-files-to-workspace'), // Copy files into workspace
  removeEntry: bridge.buildProvider<IBridgeResponse, { path: string }>('remove-entry'), // Remove file or folder
  renameEntry: bridge.buildProvider<IBridgeResponse<{ newPath: string }>, { path: string; newName: string }>('rename-entry'), // Rename file or folder
  readBuiltinRule: bridge.buildProvider<string, { fileName: string }>('read-builtin-rule'), // Read built-in rules file
  readBuiltinSkill: bridge.buildProvider<string, { fileName: string }>('read-builtin-skill'), // Read built-in skills file
  // Assistant rule file operations
  readAssistantRule: bridge.buildProvider<string, { assistantId: string; locale?: string }>('read-assistant-rule'), // Read assistant rule file
  writeAssistantRule: bridge.buildProvider<boolean, { assistantId: string; content: string; locale?: string }>('write-assistant-rule'), // Write assistant rule file
  deleteAssistantRule: bridge.buildProvider<boolean, { assistantId: string }>('delete-assistant-rule'), // Delete assistant rule file
  // Assistant skill file operations
  readAssistantSkill: bridge.buildProvider<string, { assistantId: string; locale?: string }>('read-assistant-skill'), // Read assistant skill file
  writeAssistantSkill: bridge.buildProvider<boolean, { assistantId: string; content: string; locale?: string }>('write-assistant-skill'), // Write assistant skill file
  deleteAssistantSkill: bridge.buildProvider<boolean, { assistantId: string }>('delete-assistant-skill'), // Delete assistant skill file
  // List available skills from skills directory
  listAvailableSkills: bridge.buildProvider<
    Array<{
      name: string;
      description: string;
      location: string;
      isCustom: boolean;
    }>,
    void
  >('list-available-skills'),
  // Read skill info without importing
  readSkillInfo: bridge.buildProvider<IBridgeResponse<{ name: string; description: string }>, { skillPath: string }>('read-skill-info'),
  // Import skill directory
  importSkill: bridge.buildProvider<IBridgeResponse<{ skillName: string }>, { skillPath: string }>('import-skill'),
  // Scan directory for skills
  scanForSkills: bridge.buildProvider<IBridgeResponse<Array<{ name: string; description: string; path: string }>>, { folderPath: string }>('scan-for-skills'),
  // Detect common skills paths
  detectCommonSkillPaths: bridge.buildProvider<IBridgeResponse<Array<{ name: string; path: string }>>, void>('detect-common-skill-paths'),
};

export const fileWatch = {
  startWatch: bridge.buildProvider<IBridgeResponse, { filePath: string }>('file-watch-start'), // Start watching file changes
  stopWatch: bridge.buildProvider<IBridgeResponse, { filePath: string }>('file-watch-stop'), // Stop watching file changes
  stopAllWatches: bridge.buildProvider<IBridgeResponse, void>('file-watch-stop-all'), // Stop all file watching
  fileChanged: bridge.buildEmitter<{ filePath: string; eventType: string }>('file-changed'), // File content changed event
};

// File streaming updates (real-time content push when agent writes)
export const fileStream = {
  contentUpdate: bridge.buildEmitter<{
    filePath: string; // Absolute file path
    content: string; // New content
    workspace: string; // Workspace root directory
    relativePath: string; // Relative path
    operation: 'write' | 'delete'; // Operation type
  }>('file-stream-content-update'), // Streaming content update when agent writes file
};

export const googleAuth = {
  login: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.login'),
  logout: bridge.buildProvider<void, {}>('google.auth.logout'),
  status: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.status'),
};

// Subscription check for Gemini models
export const gemini = {
  subscriptionStatus: bridge.buildProvider<
    IBridgeResponse<{
      isSubscriber: boolean;
      tier?: string;
      lastChecked: number;
      message?: string;
    }>,
    { proxy?: string }
  >('gemini.subscription-status'),
};

export const mode = {
  fetchModelList: bridge.buildProvider<IBridgeResponse<{ mode: Array<string>; fix_base_url?: string }>, { base_url?: string; api_key: string; try_fix?: boolean; platform?: string; custom_headers?: Record<string, string> }>('mode.get-model-list'),
  saveModelConfig: bridge.buildProvider<IBridgeResponse, IProvider[]>('mode.save-model-config'),
  getModelConfig: bridge.buildProvider<IProvider[], void>('mode.get-model-config'),
  /** Protocol detection - auto-detect API protocol type */
  detectProtocol: bridge.buildProvider<IBridgeResponse<ProtocolDetectionResponse>, ProtocolDetectionRequest>('mode.detect-protocol'),
};

// ACP conversation interface - Reuses unified conversation interface
export const acpConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  detectCliPath: bridge.buildProvider<IBridgeResponse<{ path?: string }>, { backend: AcpBackend }>('acp.detect-cli-path'),
  getAvailableAgents: bridge.buildProvider<
    IBridgeResponse<
      Array<{
        backend: AcpBackend;
        name: string;
        cliPath?: string;
        customAgentId?: string;
        isPreset?: boolean;
        context?: string;
        avatar?: string;
        presetAgentType?: PresetAgentType;
      }>
    >,
    void
  >('acp.get-available-agents'),
  checkEnv: bridge.buildProvider<{ env: Record<string, string> }, void>('acp.check.env'),
  refreshCustomAgents: bridge.buildProvider<IBridgeResponse, void>('acp.refresh-custom-agents'),
  // clearAllCache: bridge.buildProvider<IBridgeResponse<{ details?: any }>, void>('acp.clear.all.cache'),
};

// MCP service interface
export const mcpService = {
  getAgentMcpConfigs: bridge.buildProvider<IBridgeResponse<Array<{ source: McpSource; servers: IMcpServer[] }>>, Array<{ backend: AcpBackend; name: string; cliPath?: string }>>('mcp.get-agent-configs'),
  testMcpConnection: bridge.buildProvider<
    IBridgeResponse<{
      success: boolean;
      tools?: Array<{ name: string; description?: string }>;
      error?: string;
      needsAuth?: boolean;
      authMethod?: 'oauth' | 'basic';
      wwwAuthenticate?: string;
    }>,
    IMcpServer
  >('mcp.test-connection'),
  syncMcpToAgents: bridge.buildProvider<
    IBridgeResponse<{
      success: boolean;
      results: Array<{ agent: string; success: boolean; error?: string }>;
    }>,
    {
      mcpServers: IMcpServer[];
      agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>;
    }
  >('mcp.sync-to-agents'),
  removeMcpFromAgents: bridge.buildProvider<
    IBridgeResponse<{
      success: boolean;
      results: Array<{ agent: string; success: boolean; error?: string }>;
    }>,
    {
      mcpServerName: string;
      agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>;
    }
  >('mcp.remove-from-agents'),
  // OAuth interface
  checkOAuthStatus: bridge.buildProvider<
    IBridgeResponse<{
      isAuthenticated: boolean;
      needsLogin: boolean;
      error?: string;
    }>,
    IMcpServer
  >('mcp.check-oauth-status'),
  loginMcpOAuth: bridge.buildProvider<IBridgeResponse<{ success: boolean; error?: string }>, { server: IMcpServer; config?: any }>('mcp.login-oauth'),
  logoutMcpOAuth: bridge.buildProvider<IBridgeResponse, string>('mcp.logout-oauth'),
  getAuthenticatedServers: bridge.buildProvider<IBridgeResponse<string[]>, void>('mcp.get-authenticated-servers'),
};

// Codex conversation interface - Reuses unified conversation interface
export const codexConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
};

// Database operations
export const database = {
  getConversationMessages: bridge.buildProvider<import('@/common/chatLib').TMessage[], { conversation_id: string; page?: number; pageSize?: number }>('database.get-conversation-messages'),
  getUserConversations: bridge.buildProvider<import('@/common/storage').TChatConversation[], { page?: number; pageSize?: number }>('database.get-user-conversations'),
};

export const previewHistory = {
  list: bridge.buildProvider<PreviewSnapshotInfo[], { target: PreviewHistoryTarget }>('preview-history.list'),
  save: bridge.buildProvider<PreviewSnapshotInfo, { target: PreviewHistoryTarget; content: string }>('preview-history.save'),
  getContent: bridge.buildProvider<{ snapshot: PreviewSnapshotInfo; content: string } | null, { target: PreviewHistoryTarget; snapshotId: string }>('preview-history.get-content'),
};

// Preview panel API
export const preview = {
  // Agent triggers open preview (e.g., chrome-devtools navigates to URL)
  open: bridge.buildEmitter<{
    content: string; // URL or content
    contentType: import('./types/preview').PreviewContentType; // Content type
    metadata?: {
      title?: string;
      fileName?: string;
    };
  }>('preview.open'),
};

export const document = {
  convert: bridge.buildProvider<import('./types/conversion').DocumentConversionResponse, import('./types/conversion').DocumentConversionRequest>('document.convert'),
};

// Window controls API
export const windowControls = {
  minimize: bridge.buildProvider<void, void>('window-controls:minimize'),
  maximize: bridge.buildProvider<void, void>('window-controls:maximize'),
  unmaximize: bridge.buildProvider<void, void>('window-controls:unmaximize'),
  close: bridge.buildProvider<void, void>('window-controls:close'),
  isMaximized: bridge.buildProvider<boolean, void>('window-controls:is-maximized'),
  maximizedChanged: bridge.buildEmitter<{ isMaximized: boolean }>('window-controls:maximized-changed'),
};

// WebUI service management API
export interface IWebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string; // LAN IP for building remote access URL
  adminUsername: string;
  initialPassword?: string;
}

export const webui = {
  // Get WebUI status
  getStatus: bridge.buildProvider<IBridgeResponse<IWebUIStatus>, void>('webui.get-status'),
  // Start WebUI
  start: bridge.buildProvider<
    IBridgeResponse<{
      port: number;
      localUrl: string;
      networkUrl?: string;
      lanIP?: string;
      initialPassword?: string;
    }>,
    { port?: number; allowRemote?: boolean }
  >('webui.start'),
  // Stop WebUI
  stop: bridge.buildProvider<IBridgeResponse, void>('webui.stop'),
  // Change password (no current password required)
  changePassword: bridge.buildProvider<IBridgeResponse, { newPassword: string }>('webui.change-password'),
  // Reset password (generate new random password)
  resetPassword: bridge.buildProvider<IBridgeResponse<{ newPassword: string }>, void>('webui.reset-password'),
  // Generate QR login token
  generateQRToken: bridge.buildProvider<IBridgeResponse<{ token: string; expiresAt: number; qrUrl: string }>, void>('webui.generate-qr-token'),
  // Verify QR token
  verifyQRToken: bridge.buildProvider<IBridgeResponse<{ sessionToken: string; username: string }>, { qrToken: string }>('webui.verify-qr-token'),
  // Status changed event
  statusChanged: bridge.buildEmitter<{
    running: boolean;
    port?: number;
    localUrl?: string;
    networkUrl?: string;
  }>('webui.status-changed'),
  // Password reset result event (workaround for provider return value issue)
  resetPasswordResult: bridge.buildEmitter<{
    success: boolean;
    newPassword?: string;
    msg?: string;
  }>('webui.reset-password-result'),
};

// User API key management
export const userApiKeys = {
  set: bridge.buildProvider<void, { provider: string; apiKey: string; __webUiUserId?: string }>('userApiKeys.set'),
  get: bridge.buildProvider<Array<{ provider: string; keyHint: string }>, { __webUiUserId?: string }>('userApiKeys.get'),
  delete: bridge.buildProvider<boolean, { provider: string; __webUiUserId?: string }>('userApiKeys.delete'),
};

// Cron job management API
export const cron = {
  // Query
  listJobs: bridge.buildProvider<ICronJob[], void>('cron.list-jobs'),
  listJobsByConversation: bridge.buildProvider<ICronJob[], { conversationId: string }>('cron.list-jobs-by-conversation'),
  getJob: bridge.buildProvider<ICronJob | null, { jobId: string }>('cron.get-job'),
  // CRUD
  addJob: bridge.buildProvider<ICronJob, ICreateCronJobParams>('cron.add-job'),
  updateJob: bridge.buildProvider<ICronJob, { jobId: string; updates: Partial<ICronJob> }>('cron.update-job'),
  removeJob: bridge.buildProvider<void, { jobId: string }>('cron.remove-job'),
  // Events
  onJobCreated: bridge.buildEmitter<ICronJob>('cron.job-created'),
  onJobUpdated: bridge.buildEmitter<ICronJob>('cron.job-updated'),
  onJobRemoved: bridge.buildEmitter<{ jobId: string }>('cron.job-removed'),
  onJobExecuted: bridge.buildEmitter<{
    jobId: string;
    status: 'ok' | 'error' | 'skipped';
    error?: string;
  }>('cron.job-executed'),
};

// Cron job types for IPC
export type ICronSchedule = { kind: 'at'; atMs: number; description: string } | { kind: 'every'; everyMs: number; description: string } | { kind: 'cron'; expr: string; tz?: string; description: string };

export type ICronAgentType = 'gemini' | 'claude' | 'codex' | 'opencode' | 'qwen' | 'goose' | 'custom';

export interface ICronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: ICronSchedule;
  target: { payload: { kind: 'message'; text: string } };
  metadata: {
    conversationId: string;
    conversationTitle?: string;
    agentType: ICronAgentType;
    createdBy: 'user' | 'agent';
    createdAt: number;
    updatedAt: number;
  };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: 'ok' | 'error' | 'skipped';
    lastError?: string;
    runCount: number;
    retryCount: number;
    maxRetries: number;
  };
}

export interface ICreateCronJobParams {
  name: string;
  schedule: ICronSchedule;
  message: string;
  conversationId: string;
  conversationTitle?: string;
  agentType: ICronAgentType;
  createdBy: 'user' | 'agent';
}

interface ISendMessageParams {
  input: string;
  msg_id: string;
  conversation_id: string;
  files?: string[];
  loading_id?: string;
  /** User ID injected by WebSocket adapter for per-user features */
  __webUiUserId?: string;
}

// Unified confirm message params for all agents (Gemini, ACP, Codex)
export interface IConfirmMessageParams {
  confirmKey: string;
  msg_id: string;
  conversation_id: string;
  callId: string;
}

export interface ICreateConversationParams {
  type: 'gemini' | 'acp' | 'codex';
  id?: string;
  name?: string;
  model: TProviderWithModel;
  extra: {
    workspace?: string;
    customWorkspace?: boolean;
    defaultFiles?: string[];
    backend?: AcpBackend;
    cliPath?: string;
    webSearchEngine?: 'google' | 'default';
    agentName?: string;
    customAgentId?: string;
    context?: string;
    contextFileName?: string; // For gemini preset agents
    // System rules for smart assistants
    presetRules?: string; // system rules injected at initialization
    /** Enabled skills list for filtering SkillManager skills */
    enabledSkills?: string[];
    /**
     * Preset context/rules to inject into the first message.
     * Used by smart assistants to provide custom prompts/rules.
     * For Gemini: injected via contextContent
     * For ACP/Codex: injected via <system_instruction> tag in first message
     */
    presetContext?: string;
    /** Preset assistant ID for displaying name and avatar in conversation panel */
    presetAssistantId?: string;
  };
}
interface IResetConversationParams {
  id?: string;
  gemini?: {
    clearCachedCredentialFile?: boolean;
  };
}

// Get folder or file list
export interface IDirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}

// File metadata interface
export interface IFileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
  isDirectory?: boolean;
}

export interface IResponseMessage {
  type: string;
  data: unknown;
  msg_id: string;
  conversation_id: string;
}

interface IBridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}

// ==================== Channel API ====================

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelSession, IChannelUser } from '@/channels/types';

export const channel = {
  // Plugin Management
  getPluginStatus: bridge.buildProvider<IBridgeResponse<IChannelPluginStatus[]>, void>('channel.get-plugin-status'),
  enablePlugin: bridge.buildProvider<IBridgeResponse, { pluginId: string; config: Record<string, unknown> }>('channel.enable-plugin'),
  disablePlugin: bridge.buildProvider<IBridgeResponse, { pluginId: string }>('channel.disable-plugin'),
  testPlugin: bridge.buildProvider<IBridgeResponse<{ success: boolean; botUsername?: string; error?: string }>, { pluginId: string; token: string; extraConfig?: { appId?: string; appSecret?: string } }>('channel.test-plugin'),

  // Pairing Management
  getPendingPairings: bridge.buildProvider<IBridgeResponse<IChannelPairingRequest[]>, void>('channel.get-pending-pairings'),
  approvePairing: bridge.buildProvider<IBridgeResponse, { code: string }>('channel.approve-pairing'),
  rejectPairing: bridge.buildProvider<IBridgeResponse, { code: string }>('channel.reject-pairing'),

  // User Management
  getAuthorizedUsers: bridge.buildProvider<IBridgeResponse<IChannelUser[]>, void>('channel.get-authorized-users'),
  revokeUser: bridge.buildProvider<IBridgeResponse, { userId: string }>('channel.revoke-user'),

  // Session Management (MVP: read-only view)
  getActiveSessions: bridge.buildProvider<IBridgeResponse<IChannelSession[]>, void>('channel.get-active-sessions'),

  // Events
  pairingRequested: bridge.buildEmitter<IChannelPairingRequest>('channel.pairing-requested'),
  pluginStatusChanged: bridge.buildEmitter<{
    pluginId: string;
    status: IChannelPluginStatus;
  }>('channel.plugin-status-changed'),
  userAuthorized: bridge.buildEmitter<IChannelUser>('channel.user-authorized'),
};
