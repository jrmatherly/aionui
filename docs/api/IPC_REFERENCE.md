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
dialog.showOpen.invoke(options: OpenDialogOptions): Promise<string[] | undefined>
dialog.showSave.invoke(options: SaveDialogOptions): Promise<string | undefined>
```

### `fs`

File system operations.

```typescript
fs.list.invoke({ path }): Promise<IDirOrFile[]>
fs.read.invoke({ path, encoding }): Promise<string>
fs.write.invoke({ path, content, encoding }): Promise<void>
fs.mkdir.invoke({ path }): Promise<void>
fs.remove.invoke({ path }): Promise<void>
fs.rename.invoke({ oldPath, newPath }): Promise<void>
fs.copy.invoke({ source, destination }): Promise<void>
fs.stat.invoke({ path }): Promise<IFileStat>
fs.exists.invoke({ path }): Promise<boolean>
```

### `conversation`

Core conversation management (unified across agent types).

```typescript
// Conversation CRUD
conversation.create.invoke(params: ICreateConversationParams): Promise<TChatConversation>
conversation.createWithConversation.invoke({ conversation, sourceConversationId }): Promise<TChatConversation>
conversation.get.invoke({ id }): Promise<TChatConversation>
conversation.getAssociateConversation.invoke({ conversation_id }): Promise<TChatConversation[]>
conversation.remove.invoke({ id }): Promise<boolean>
conversation.update.invoke({ id, updates, mergeExtra? }): Promise<boolean>
conversation.reset.invoke(params: IResetConversationParams): Promise<void>

// Messaging
conversation.sendMessage.invoke(params: ISendMessageParams): Promise<IBridgeResponse>
conversation.stop.invoke({ conversation_id }): Promise<IBridgeResponse>
conversation.responseStream.on(callback: (message: IResponseMessage) => void)

// Workspace
conversation.getWorkspace.invoke({ conversation_id, workspace, path, search? }): Promise<IDirOrFile[]>
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
acpConversation.sendMessage.invoke(params): Promise<IBridgeResponse>
acpConversation.responseStream.on(callback)
acpConversation.confirmMessage.invoke(params): Promise<IBridgeResponse>
acpConversation.startAgent.invoke({ conversation_id, agent, sessionId? }): Promise<IBridgeResponse>
acpConversation.stopAgent.invoke({ conversation_id }): Promise<IBridgeResponse>
acpConversation.getAvailableAgents.invoke(): Promise<IBridgeResponse<AcpBackend[]>>
acpConversation.getAgentAuthStatus.invoke({ agent }): Promise<IBridgeResponse<{ authenticated: boolean }>>
acpConversation.statusChange.on(callback)
```

### `codexConversation`

Codex CLI agent operations.

```typescript
codexConversation.sendMessage.invoke(params): Promise<IBridgeResponse>
codexConversation.responseStream.on(callback)
codexConversation.statusChange.on(callback)
```

### `geminiConversation`

Gemini-specific operations.

```typescript
geminiConversation.sendMessage  // Alias for conversation.sendMessage
geminiConversation.confirmMessage.invoke(params): Promise<IBridgeResponse>
geminiConversation.responseStream  // Alias for conversation.responseStream
```

### `mcpService`

MCP (Model Context Protocol) server management.

```typescript
mcpService.testMcpConnection.invoke({ name, command, args?, env?, transport? }): Promise<IBridgeResponse>
mcpService.syncMcpToAgents.invoke({ configs }): Promise<IBridgeResponse>
mcpService.removeMcpFromAgents.invoke({ mcpId }): Promise<IBridgeResponse>
mcpService.getAgentMcpConfigs.invoke({ agentType }): Promise<IBridgeResponse<McpConfig[]>>
mcpService.loginMcpOAuth.invoke({ mcpId, serverId }): Promise<IBridgeResponse>
mcpService.logoutMcpOAuth.invoke({ mcpId }): Promise<IBridgeResponse>
mcpService.checkOAuthStatus.invoke({ mcpId }): Promise<IBridgeResponse>
mcpService.getAuthenticatedServers.invoke(): Promise<IBridgeResponse<string[]>>
```

### `cron`

Scheduled job management.

```typescript
cron.list.invoke(): Promise<CronJob[]>
cron.add.invoke(job: Omit<CronJob, 'id'>): Promise<CronJob>
cron.update.invoke({ id, ...updates }): Promise<CronJob>
cron.remove.invoke({ id }): Promise<boolean>
cron.execute.invoke({ id }): Promise<IBridgeResponse>
```

### `channel`

External channel plugins (Telegram, Lark, etc.).

```typescript
channel.enable.invoke({ type, config }): Promise<IBridgeResponse>
channel.disable.invoke({ type }): Promise<IBridgeResponse>
channel.test.invoke({ type, config }): Promise<IBridgeResponse>
channel.pair.invoke({ channelType, userId }): Promise<{ pairingCode, expiresAt }>
channel.status.invoke({ type }): Promise<IBridgeResponse>
channel.listPairedUsers.invoke({ type }): Promise<IBridgeResponse>
channel.unpairUser.invoke({ type, pairId }): Promise<IBridgeResponse>
```

### `webui`

WebUI server management.

```typescript
webui.getStatus.invoke(): Promise<{ running, port, allowRemote }>
webui.changePassword.invoke(newPassword): Promise<IBridgeResponse>
webui.generateQRToken.invoke(): Promise<{ success, token?, expiresAt? }>
webui.resetPassword.invoke(): Promise<{ success, newPassword? }>
```

### `userApiKeys`

Per-user API key management.

```typescript
userApiKeys.get.invoke({ userId, provider }): Promise<string | null>
userApiKeys.set.invoke({ userId, provider, apiKey }): Promise<void>
userApiKeys.delete.invoke({ userId, provider }): Promise<void>
userApiKeys.list.invoke({ userId }): Promise<{ provider: string; hasKey: boolean }[]>
```

### `mode`

Model/mode configuration management.

```typescript
mode.list.invoke(): Promise<IProvider[]>
mode.get.invoke({ id }): Promise<IProvider | null>
mode.add.invoke(provider: Omit<IProvider, 'id'>): Promise<IProvider>
mode.update.invoke({ id, ...updates }): Promise<IProvider>
mode.remove.invoke({ id }): Promise<boolean>
mode.setDefault.invoke({ id }): Promise<void>
mode.testConnection.invoke({ provider }): Promise<IBridgeResponse>
mode.detectProtocol.invoke(request: ProtocolDetectionRequest): Promise<ProtocolDetectionResponse>
```

### `googleAuth`

Google OAuth for Gemini API.

```typescript
googleAuth.getAuth.invoke(): Promise<GoogleAuth | null>
googleAuth.signIn.invoke(): Promise<GoogleAuth>
googleAuth.signOut.invoke(): Promise<void>
googleAuth.refresh.invoke(): Promise<GoogleAuth>
googleAuth.authChange.on(callback)
```

### `gemini`

Gemini model operations.

```typescript
gemini.listModels.invoke({ useAuth?, useVertexAi? }): Promise<GeminiModel[]>
gemini.generateContent.invoke(params): Promise<GenerateContentResponse>
```

### `preview`

File preview operations.

```typescript
preview.getSnapshot.invoke({ conversationId, path }): Promise<PreviewSnapshotInfo>
preview.saveSnapshot.invoke({ conversationId, path, content }): Promise<void>
```

### `previewHistory`

Preview version history.

```typescript
previewHistory.list.invoke({ conversationId }): Promise<PreviewHistoryTarget[]>
previewHistory.get.invoke({ conversationId, path, version? }): Promise<string>
previewHistory.revert.invoke({ conversationId, path, version }): Promise<void>
```

### `document`

Document parsing and export.

```typescript
document.parse.invoke({ path }): Promise<ParsedDocument>
document.export.invoke({ content, format, outputPath }): Promise<void>
```

### `windowControls`

Window management (Electron only).

```typescript
windowControls.minimize.invoke(): Promise<void>
windowControls.maximize.invoke(): Promise<void>
windowControls.close.invoke(): Promise<void>
windowControls.isMaximized.invoke(): Promise<boolean>
```

### `database`

Direct database operations (for admin/debugging).

```typescript
database.query.invoke({ sql, params? }): Promise<any[]>
database.execute.invoke({ sql, params? }): Promise<{ changes: number }>
```

## Response Types

### `IBridgeResponse<T>`

Standard response wrapper:

```typescript
interface IBridgeResponse<T = void> {
  success: boolean;
  data?: T;
  msg?: string;
  error?: string;
}
```

### `IResponseMessage`

Streaming message from AI agent:

```typescript
interface IResponseMessage {
  id: string;
  msg_id: string;
  conversation_id: string;
  type: TMessageType;
  content?: any;
  data?: any;
  status?: string;
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

All `invoke()` calls may throw or return `{ success: false, error: string }`. Best practice:

```typescript
try {
  const response = await ipcBridge.conversation.sendMessage.invoke(params);
  if (!response.success) {
    console.error('Send failed:', response.error || response.msg);
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
