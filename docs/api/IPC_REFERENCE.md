# IPC API Reference

This document describes the Inter-Process Communication (IPC) API used between the renderer and main processes in AionUI.

## Overview

AionUI uses `@office-ai/platform` bridge for IPC communication. In Electron mode, this goes through `contextBridge`. In web mode, it communicates via WebSocket to the backend server.

All IPC methods are defined in `src/common/ipcBridge.ts` using:
- `bridge.buildProvider<Response, Request>(channel)` — Request/response pattern
- `bridge.buildEmitter<Event>(channel)` — Event emission pattern

## Namespaces

### `shell`

System shell operations for opening files and URLs.

```typescript
shell.openFile.invoke(path: string): Promise<void>
shell.showItemInFolder.invoke(path: string): Promise<void>
shell.openExternal.invoke(url: string): Promise<void>
```

### `application`

Application-level operations.

```typescript
application.restart.invoke(): Promise<void>
application.openDevTools.invoke(): Promise<void>
application.systemInfo.invoke(): Promise<{
  cacheDir: string;
  workDir: string;
  platform: string;
  arch: string;
}>
application.updateSystemInfo.invoke(data: { cacheDir: string; workDir: string }): Promise<IBridgeResponse>
application.getZoomFactor.invoke(): Promise<number>
application.setZoomFactor.invoke({ factor: number }): Promise<number>
```

### `branding`

Application branding configuration (supports env var overrides).

```typescript
branding.getConfig.invoke(): Promise<BrandingConfig>
// Returns: { appName, logoUrl, faviconUrl }
```

### `update`

Manual update management via GitHub releases.

```typescript
update.open.emit({ source?: 'menu' | 'about' })  // Request UI to show update dialog
update.check.invoke(request: UpdateCheckRequest): Promise<IBridgeResponse<UpdateCheckResult>>
update.download.invoke(request: UpdateDownloadRequest): Promise<IBridgeResponse<UpdateDownloadResult>>
update.downloadProgress.on(callback: (event: UpdateDownloadProgressEvent) => void)
```

### `dialog`

Native dialog operations.

```typescript
dialog.showOpen.invoke(options?: {
  defaultPath?: string;
  properties?: OpenDialogOptions['properties'];
  filters?: OpenDialogOptions['filters'];
}): Promise<string[] | undefined>
```

### `fs`

File system operations.

```typescript
// Directory listing
fs.getFilesByDir.invoke({ dir: string; root: string }): Promise<IDirOrFile[]>

// Image operations
fs.getImageBase64.invoke({ path: string }): Promise<string>
fs.fetchRemoteImage.invoke({ url: string }): Promise<string>

// File I/O
fs.readFile.invoke({ path: string }): Promise<string>              // UTF-8 text
fs.readFileBuffer.invoke({ path: string }): Promise<ArrayBuffer>   // Binary
fs.createTempFile.invoke({ fileName: string }): Promise<string>
fs.writeFile.invoke({ path: string; data: Uint8Array | string }): Promise<boolean>
fs.getFileMetadata.invoke({ path: string }): Promise<IFileMetadata>

// File management
fs.copyFilesToWorkspace.invoke({
  filePaths: string[];
  workspace: string;
  sourceRoot?: string;
}): Promise<IBridgeResponse<{
  copiedFiles: string[];
  failedFiles?: Array<{ path: string; error: string }>;
}>>
fs.removeEntry.invoke({ path: string }): Promise<IBridgeResponse>
fs.renameEntry.invoke({ path: string; newName: string }): Promise<IBridgeResponse<{ newPath: string }>>

// Built-in rules and skills
fs.readBuiltinRule.invoke({ fileName: string }): Promise<string>
fs.readBuiltinSkill.invoke({ fileName: string }): Promise<string>

// Assistant rule file operations
fs.readAssistantRule.invoke({ assistantId: string; locale?: string }): Promise<string>
fs.writeAssistantRule.invoke({ assistantId: string; content: string; locale?: string }): Promise<boolean>
fs.deleteAssistantRule.invoke({ assistantId: string }): Promise<boolean>

// Assistant skill file operations
fs.readAssistantSkill.invoke({ assistantId: string; locale?: string }): Promise<string>
fs.writeAssistantSkill.invoke({ assistantId: string; content: string; locale?: string }): Promise<boolean>
fs.deleteAssistantSkill.invoke({ assistantId: string }): Promise<boolean>

// Skill management
fs.listAvailableSkills.invoke(): Promise<Array<{
  name: string;
  description: string;
  location: string;
  isCustom: boolean;
}>>
fs.readSkillInfo.invoke({ skillPath: string }): Promise<IBridgeResponse<{ name: string; description: string }>>
fs.importSkill.invoke({ skillPath: string }): Promise<IBridgeResponse<{ skillName: string }>>
fs.scanForSkills.invoke({ folderPath: string }): Promise<IBridgeResponse<Array<{
  name: string;
  description: string;
  path: string;
}>>>
fs.detectCommonSkillPaths.invoke(): Promise<IBridgeResponse<Array<{ name: string; path: string }>>>
```

### `fileWatch`

File watching operations for monitoring file changes in real time.

```typescript
fileWatch.startWatch.invoke({ filePath: string }): Promise<IBridgeResponse>   // Start watching a file
fileWatch.stopWatch.invoke({ filePath: string }): Promise<IBridgeResponse>    // Stop watching a file
fileWatch.stopAllWatches.invoke(): Promise<IBridgeResponse>                    // Stop all active watches
fileWatch.fileChanged.on(callback: (event: {
  filePath: string;
  eventType: string;
}) => void)                                                                    // File change event
```

### `fileStream`

File streaming updates for real-time content push when an agent writes files.

```typescript
fileStream.contentUpdate.on(callback: (event: {
  filePath: string;      // Absolute file path
  content: string;       // New content
  workspace: string;     // Workspace root directory
  relativePath: string;  // Relative path within workspace
  operation: 'write' | 'delete';  // Operation type
}) => void)
```

### `conversation`

Core conversation management (unified across agent types).

```typescript
// Conversation CRUD
conversation.create.invoke(params: ICreateConversationParams): Promise<TChatConversation>
conversation.createWithConversation.invoke({ conversation, sourceConversationId? }): Promise<TChatConversation>
conversation.get.invoke({ id }): Promise<TChatConversation>
conversation.getAssociateConversation.invoke({ conversation_id }): Promise<TChatConversation[]>
conversation.remove.invoke({ id }): Promise<boolean>
conversation.update.invoke({ id, updates, mergeExtra? }): Promise<boolean>
conversation.reset.invoke(params: IResetConversationParams): Promise<void>

// Messaging
conversation.sendMessage.invoke(params: ISendMessageParams): Promise<IBridgeResponse>
conversation.confirmMessage.invoke(params: IConfirmMessageParams): Promise<IBridgeResponse>
conversation.stop.invoke({ conversation_id }): Promise<IBridgeResponse>
conversation.responseStream.on(callback: (message: IResponseMessage) => void)

// Workspace
conversation.getWorkspace.invoke({ conversation_id, workspace, path, search? }): Promise<IDirOrFile[]>
conversation.responseSearchWorkSpace.invoke({ file: number; dir: number; match?: IDirOrFile }): Promise<void>
conversation.reloadContext.invoke({ conversation_id }): Promise<IBridgeResponse>

// Confirmations
conversation.confirmation.add.on(callback)
conversation.confirmation.update.on(callback)
conversation.confirmation.confirm.invoke({ conversation_id, msg_id, data, callId }): Promise<IBridgeResponse>
conversation.confirmation.list.invoke({ conversation_id }): Promise<IConfirmation[]>
conversation.confirmation.remove.on(callback)

// Approval memory
conversation.approval.check.invoke({ conversation_id, action, commandType? }): Promise<boolean>
```

### `acpConversation`

ACP (Agent Control Protocol) specific operations.

```typescript
acpConversation.sendMessage  // Alias for conversation.sendMessage
acpConversation.responseStream  // Alias for conversation.responseStream
acpConversation.detectCliPath.invoke({ backend: AcpBackend }): Promise<IBridgeResponse<{ path?: string }>>
acpConversation.getAvailableAgents.invoke(): Promise<IBridgeResponse<Array<{
  backend: AcpBackend;
  name: string;
  cliPath?: string;
  customAgentId?: string;
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: PresetAgentType;
}>>>
acpConversation.checkEnv.invoke(): Promise<{ env: Record<string, string> }>
acpConversation.refreshCustomAgents.invoke(): Promise<IBridgeResponse>
```

### `codexConversation`

Codex CLI agent operations.

```typescript
codexConversation.sendMessage  // Alias for conversation.sendMessage
codexConversation.responseStream  // Alias for conversation.responseStream
```

### `geminiConversation`

Gemini-specific operations.

```typescript
geminiConversation.sendMessage  // Alias for conversation.sendMessage
geminiConversation.confirmMessage.invoke(params: IConfirmMessageParams): Promise<IBridgeResponse>
geminiConversation.responseStream  // Alias for conversation.responseStream
```

### `mcpService`

MCP (Model Context Protocol) server management.

```typescript
mcpService.getAgentMcpConfigs.invoke(
  agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>
): Promise<IBridgeResponse<Array<{ source: McpSource; servers: IMcpServer[] }>>>

mcpService.testMcpConnection.invoke(server: IMcpServer): Promise<IBridgeResponse<{
  success: boolean;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
  needsAuth?: boolean;
  authMethod?: 'oauth' | 'basic';
  wwwAuthenticate?: string;
}>>

mcpService.syncMcpToAgents.invoke({
  mcpServers: IMcpServer[];
  agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>;
}): Promise<IBridgeResponse<{
  success: boolean;
  results: Array<{ agent: string; success: boolean; error?: string }>;
}>>

mcpService.removeMcpFromAgents.invoke({
  mcpServerName: string;
  agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>;
}): Promise<IBridgeResponse<{
  success: boolean;
  results: Array<{ agent: string; success: boolean; error?: string }>;
}>>

// OAuth
mcpService.checkOAuthStatus.invoke(server: IMcpServer): Promise<IBridgeResponse<{
  isAuthenticated: boolean;
  needsLogin: boolean;
  error?: string;
}>>
mcpService.loginMcpOAuth.invoke({ server: IMcpServer; config?: any }): Promise<IBridgeResponse<{
  success: boolean;
  error?: string;
}>>
mcpService.logoutMcpOAuth.invoke(serverName: string): Promise<IBridgeResponse>
mcpService.getAuthenticatedServers.invoke(): Promise<IBridgeResponse<string[]>>
```

### `cron`

Scheduled job management.

```typescript
// Query
cron.listJobs.invoke(): Promise<ICronJob[]>
cron.listJobsByConversation.invoke({ conversationId }): Promise<ICronJob[]>
cron.getJob.invoke({ jobId }): Promise<ICronJob | null>

// CRUD
cron.addJob.invoke(params: ICreateCronJobParams): Promise<ICronJob>
cron.updateJob.invoke({ jobId, updates }): Promise<ICronJob>
cron.removeJob.invoke({ jobId }): Promise<void>

// Events
cron.onJobCreated.on(callback: (job: ICronJob) => void)
cron.onJobUpdated.on(callback: (job: ICronJob) => void)
cron.onJobRemoved.on(callback: (event: { jobId: string }) => void)
cron.onJobExecuted.on(callback: (event: {
  jobId: string;
  status: 'ok' | 'error' | 'skipped';
  error?: string;
}) => void)
```

### `channel`

External channel plugins (Telegram, Lark, etc.).

```typescript
// Plugin Management
channel.getPluginStatus.invoke(): Promise<IBridgeResponse<IChannelPluginStatus[]>>
channel.enablePlugin.invoke({ pluginId, config }): Promise<IBridgeResponse>
channel.disablePlugin.invoke({ pluginId }): Promise<IBridgeResponse>
channel.testPlugin.invoke({ pluginId, token, extraConfig? }): Promise<IBridgeResponse<{
  success: boolean;
  botUsername?: string;
  error?: string;
}>>

// Pairing Management
channel.getPendingPairings.invoke(): Promise<IBridgeResponse<IChannelPairingRequest[]>>
channel.approvePairing.invoke({ code }): Promise<IBridgeResponse>
channel.rejectPairing.invoke({ code }): Promise<IBridgeResponse>

// User Management
channel.getAuthorizedUsers.invoke(): Promise<IBridgeResponse<IChannelUser[]>>
channel.revokeUser.invoke({ userId }): Promise<IBridgeResponse>

// Session Management
channel.getActiveSessions.invoke(): Promise<IBridgeResponse<IChannelSession[]>>

// Events
channel.pairingRequested.on(callback: (request: IChannelPairingRequest) => void)
channel.pluginStatusChanged.on(callback: (event: {
  pluginId: string;
  status: IChannelPluginStatus;
}) => void)
channel.userAuthorized.on(callback: (user: IChannelUser) => void)
```

### `webui`

WebUI server management.

```typescript
webui.getStatus.invoke(): Promise<IBridgeResponse<IWebUIStatus>>
// IWebUIStatus: { running, port, allowRemote, localUrl, networkUrl?, lanIP?, adminUsername, initialPassword? }

webui.start.invoke({ port?, allowRemote? }): Promise<IBridgeResponse<{
  port: number;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  initialPassword?: string;
}>>
webui.stop.invoke(): Promise<IBridgeResponse>
webui.changePassword.invoke({ newPassword }): Promise<IBridgeResponse>
webui.resetPassword.invoke(): Promise<IBridgeResponse<{ newPassword: string }>>
webui.generateQRToken.invoke(): Promise<IBridgeResponse<{
  token: string;
  expiresAt: number;
  qrUrl: string;
}>>
webui.verifyQRToken.invoke({ qrToken }): Promise<IBridgeResponse<{
  sessionToken: string;
  username: string;
}>>

// Events
webui.statusChanged.on(callback: (event: {
  running: boolean;
  port?: number;
  localUrl?: string;
  networkUrl?: string;
}) => void)
webui.resetPasswordResult.on(callback: (event: {
  success: boolean;
  newPassword?: string;
  msg?: string;
}) => void)
```

### `userApiKeys`

Per-user API key management.

```typescript
userApiKeys.set.invoke({ provider, apiKey, __webUiUserId? }): Promise<void>
userApiKeys.get.invoke({ __webUiUserId? }): Promise<Array<{ provider: string; keyHint: string }>>
userApiKeys.delete.invoke({ provider, __webUiUserId? }): Promise<boolean>
```

### `mode`

Model/mode configuration management.

```typescript
mode.fetchModelList.invoke({
  base_url?: string;
  api_key: string;
  try_fix?: boolean;
  platform?: string;
  custom_headers?: Record<string, string>;
}): Promise<IBridgeResponse<{ mode: string[]; fix_base_url?: string }>>
mode.saveModelConfig.invoke(providers: IProvider[]): Promise<IBridgeResponse>
mode.getModelConfig.invoke(): Promise<IProvider[]>
mode.detectProtocol.invoke(request: ProtocolDetectionRequest): Promise<IBridgeResponse<ProtocolDetectionResponse>>
```

### `googleAuth`

Google OAuth for Gemini API.

```typescript
googleAuth.login.invoke({ proxy?: string }): Promise<IBridgeResponse<{ account: string }>>
googleAuth.logout.invoke(): Promise<void>
googleAuth.status.invoke({ proxy?: string }): Promise<IBridgeResponse<{ account: string }>>
```

### `gemini`

Gemini model operations.

```typescript
gemini.subscriptionStatus.invoke({ proxy?: string }): Promise<IBridgeResponse<{
  isSubscriber: boolean;
  tier?: string;
  lastChecked: number;
  message?: string;
}>>
```

### `preview`

Preview panel operations.

```typescript
preview.open.on(callback: (event: {
  content: string;       // URL or content
  contentType: PreviewContentType;
  metadata?: {
    title?: string;
    fileName?: string;
  };
}) => void)
```

### `previewHistory`

Preview version history.

```typescript
previewHistory.list.invoke({ target: PreviewHistoryTarget }): Promise<PreviewSnapshotInfo[]>
previewHistory.save.invoke({ target: PreviewHistoryTarget; content: string }): Promise<PreviewSnapshotInfo>
previewHistory.getContent.invoke({
  target: PreviewHistoryTarget;
  snapshotId: string;
}): Promise<{ snapshot: PreviewSnapshotInfo; content: string } | null>
```

### `document`

Document conversion.

```typescript
document.convert.invoke(request: DocumentConversionRequest): Promise<DocumentConversionResponse>
```

### `windowControls`

Window management (Electron only).

```typescript
windowControls.minimize.invoke(): Promise<void>
windowControls.maximize.invoke(): Promise<void>
windowControls.unmaximize.invoke(): Promise<void>
windowControls.close.invoke(): Promise<void>
windowControls.isMaximized.invoke(): Promise<boolean>
windowControls.maximizedChanged.on(callback: (event: { isMaximized: boolean }) => void)
```

### `database`

Database operations for conversation data access.

```typescript
database.getConversationMessages.invoke({
  conversation_id: string;
  page?: number;
  pageSize?: number;
}): Promise<TMessage[]>

database.getUserConversations.invoke({
  page?: number;
  pageSize?: number;
}): Promise<TChatConversation[]>
```

## Response Types

### `IBridgeResponse<T>`

Standard response wrapper:

```typescript
interface IBridgeResponse<T = {}> {
  success: boolean;
  data?: T;
  msg?: string;
}
```

### `IResponseMessage`

Streaming message from AI agent:

```typescript
interface IResponseMessage {
  type: string;
  data: unknown;
  msg_id: string;
  conversation_id: string;
}
```

### Message Types

```typescript
type TMessageType =
  | 'text'           // Text content
  | 'tool_call'      // Tool invocation
  | 'tool_result'    // Tool response
  | 'plan'           // Execution plan
  | 'tips'           // System tips/errors
  | 'agent_status'   // Agent status change
  | 'permission'     // Permission request
  | 'error'          // Error message
  | 'done';          // Stream complete
```

### `ICronJob`

```typescript
interface ICronJob {
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

type ICronSchedule =
  | { kind: 'at'; atMs: number; description: string }
  | { kind: 'every'; everyMs: number; description: string }
  | { kind: 'cron'; expr: string; tz?: string; description: string };

type ICronAgentType = 'gemini' | 'claude' | 'codex' | 'opencode' | 'qwen' | 'goose' | 'custom';
```

## Stream Events

For streaming responses, listen to the `responseStream` emitter:

```typescript
conversation.responseStream.on((message: IResponseMessage) => {
  switch (message.type) {
    case 'text':
      // Append text to UI
      break;
    case 'tool_call':
      // Show tool invocation
      break;
    case 'done':
      // Stream complete
      break;
    case 'error':
      // Handle error
      break;
  }
});
```

## Error Handling

All `invoke()` calls may throw or return `{ success: false, msg: string }`. Best practice:

```typescript
try {
  const response = await ipcBridge.conversation.sendMessage.invoke(params);
  if (!response.success) {
    console.error('Send failed:', response.msg);
    return;
  }
  // Handle success
} catch (error) {
  console.error('IPC error:', error);
}
```

## Web Mode vs Electron Mode

In **Electron mode**, IPC goes through Electron's contextBridge to the main process.

In **Web mode** (Docker/browser), IPC is bridged via WebSocket to the Express backend:
- WebSocket connection established at app startup
- Messages serialized as JSON
- Same API surface, different transport

The `@office-ai/platform` bridge abstracts this difference — application code doesn't need to know which mode is active.
