# IPC API Reference

This document describes the Inter-Process Communication (IPC) API used between the renderer and main processes in AionUI.

## Overview

AionUI uses Electron's `contextBridge` to securely expose IPC methods to the renderer process. All IPC communication goes through the `window.electron` API.

## Base API

### `window.electron.emit(name, data)`

Send a message to the main process.

**Parameters:**

- `name: string` - Event name (e.g., `conversation.sendMessage`)
- `data: any` - Event payload

**Returns:** `void`

### `window.electron.on(name, callback)`

Listen for events from the main process.

**Parameters:**

- `name: string` - Event name to listen for
- `callback: (data: any) => void` - Handler function

**Returns:** Cleanup function

### `window.electron.getPathForFile(file)`

Get the file system path for a File object.

**Parameters:**

- `file: File` - File object from input or drag-drop

**Returns:** `string` - File path

## WebUI Methods

### `window.electron.webuiGetStatus()`

Get current WebUI server status.

**Returns:**

```typescript
{
  running: boolean;
  port: number;
  allowRemote: boolean;
}
```

### `window.electron.webuiChangePassword(newPassword)`

Change the WebUI admin password.

**Parameters:**

- `newPassword: string` - New password

**Returns:** `{ success: boolean; message?: string }`

### `window.electron.webuiGenerateQRToken()`

Generate a QR code token for mobile login.

**Returns:**

```typescript
{
  success: boolean;
  token?: string;
  expiresAt?: number;
}
```

### `window.electron.webuiResetPassword()`

Reset the WebUI admin password.

**Returns:** `{ success: boolean; newPassword?: string }`

## Conversation API

### `conversation.create`

Create a new conversation.

**Request:**

```typescript
{
  type: 'gemini' | 'codex' | 'acp';
  workspace?: string;
  title?: string;
}
```

**Response:**

```typescript
{
  id: string;
  type: string;
  workspace: string;
  title: string;
  createdAt: number;
}
```

### `conversation.sendMessage`

Send a message to the AI agent.

**Request:**

```typescript
{
  conversationId: string;
  content: string;
  attachments?: string[];  // File paths
}
```

**Response:** Stream events via `conversation.${id}.stream`

### `conversation.stop`

Stop the current message generation.

**Request:**

```typescript
{
  conversationId: string;
}
```

### `conversation.get`

Get conversation details.

**Request:**

```typescript
{
  id: string;
}
```

**Response:**

```typescript
{
  id: string;
  type: string;
  workspace: string;
  title: string;
  createdAt: number;
  messages: TMessage[];
}
```

### `conversation.update`

Update conversation metadata.

**Request:**

```typescript
{
  id: string;
  title?: string;
  workspace?: string;
}
```

### `conversation.remove`

Delete a conversation.

**Request:**

```typescript
{
  id: string;
}
```

### `conversation.reset`

Clear conversation history.

**Request:**

```typescript
{
  id: string;
}
```

### `conversation.confirmation.confirm`

Respond to a confirmation request.

**Request:**

```typescript
{
  conversationId: string;
  confirmationId: string;
  approved: boolean;
}
```

### `conversation.confirmation.list`

List pending confirmations.

**Request:**

```typescript
{
  conversationId: string;
}
```

**Response:**

```typescript
{
  confirmations: IConfirmation[];
}
```

## MCP Service API

### `mcpService.testMcpConnection`

Test connection to an MCP server.

**Request:**

```typescript
{
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
```

**Response:**

```typescript
{
  success: boolean;
  error?: string;
  tools?: ToolDefinition[];
}
```

### `mcpService.syncMcpToAgents`

Sync MCP configuration to agents.

**Request:**

```typescript
{
  configs: McpConfig[];
}
```

### `mcpService.removeMcpFromAgents`

Remove an MCP server from agents.

**Request:**

```typescript
{
  mcpId: string;
}
```

### `mcpService.getAgentMcpConfigs`

Get MCP configurations for an agent.

**Request:**

```typescript
{
  agentType: string;
}
```

**Response:**

```typescript
{
  configs: McpConfig[];
}
```

### `mcpService.loginMcpOAuth`

Initiate OAuth login for an MCP server.

**Request:**

```typescript
{
  mcpId: string;
  serverId: string;
}
```

### `mcpService.logoutMcpOAuth`

Logout from an MCP OAuth session.

**Request:**

```typescript
{
  mcpId: string;
}
```

### `mcpService.checkOAuthStatus`

Check OAuth status for an MCP server.

**Request:**

```typescript
{
  mcpId: string;
}
```

**Response:**

```typescript
{
  authenticated: boolean;
  expiresAt?: number;
}
```

### `mcpService.getAuthenticatedServers`

Get list of authenticated MCP servers.

**Response:**

```typescript
{
  servers: string[];
}
```

## Cron API

### `cron.list`

List all cron jobs.

**Response:**

```typescript
{
  jobs: CronJob[];
}
```

### `cron.add`

Create a new cron job.

**Request:**

```typescript
{
  name: string;
  schedule: string;  // Cron expression
  conversationId: string;
  conversationTitle: string;
  message: string;
  agentType: string;
}
```

**Response:**

```typescript
{
  id: string;
  ...CronJob;
}
```

### `cron.update`

Update a cron job.

**Request:**

```typescript
{
  id: string;
  name?: string;
  schedule?: string;
  message?: string;
  enabled?: boolean;
}
```

### `cron.remove`

Delete a cron job.

**Request:**

```typescript
{
  id: string;
}
```

### `cron.execute`

Manually execute a cron job.

**Request:**

```typescript
{
  id: string;
}
```

## Channel API

### `channel.enable`

Enable a channel plugin.

**Request:**

```typescript
{
  type: 'telegram';
  config: ChannelConfig;
}
```

### `channel.disable`

Disable a channel plugin.

**Request:**

```typescript
{
  type: string;
}
```

### `channel.test`

Test channel connection.

**Request:**

```typescript
{
  type: string;
  config: ChannelConfig;
}
```

**Response:**

```typescript
{
  success: boolean;
  error?: string;
}
```

### `channel.pair`

Start device pairing.

**Request:**

```typescript
{
  channelType: string;
  userId: string;
}
```

**Response:**

```typescript
{
  pairingCode: string;
  expiresAt: number;
}
```

## Application API

### `application.openDevTools`

Open Chrome DevTools.

### `application.getVersion`

Get application version.

**Response:** `string`

### `application.checkUpdate`

Check for application updates.

**Response:**

```typescript
{
  hasUpdate: boolean;
  version?: string;
  releaseNotes?: string;
}
```

### `application.installUpdate`

Install available update.

## File System API

### `fs.readDir`

Read directory contents.

**Request:**

```typescript
{
  path: string;
}
```

**Response:**

```typescript
{
  entries: {
    name: string;
    type: 'file' | 'directory';
    size: number;
    modified: number;
  }[];
}
```

### `fs.readFile`

Read file contents.

**Request:**

```typescript
{
  path: string;
  encoding?: 'utf8' | 'base64';
}
```

**Response:**

```typescript
{
  content: string;
}
```

### `fs.writeFile`

Write file contents.

**Request:**

```typescript
{
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}
```

## Dialog API

### `dialog.showOpenDialog`

Show file/folder open dialog.

**Request:**

```typescript
{
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
}
```

**Response:**

```typescript
{
  canceled: boolean;
  filePaths: string[];
}
```

### `dialog.showSaveDialog`

Show file save dialog.

**Request:**

```typescript
{
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}
```

**Response:**

```typescript
{
  canceled: boolean;
  filePath?: string;
}
```

## Stream Events

### `conversation.${id}.stream`

Streaming response events from AI agent.

**Event Types:**

```typescript
// Text chunk
{
  type: 'text';
  content: string;
  msgId: string;
}

// Tool call start
{
  type: 'tool_call_start';
  toolCallId: string;
  toolName: string;
}

// Tool call update
{
  type: 'tool_call_update';
  toolCallId: string;
  content: string;
}

// Tool call end
{
  type: 'tool_call_end';
  toolCallId: string;
  result: any;
}

// Error
{
  type: 'error';
  error: string;
  code?: string;
}

// Done
{
  type: 'done';
  msgId: string;
}

// Permission request
{
  type: 'permission_request';
  id: string;
  action: string;
  description: string;
}
```

## Type Definitions

### `TMessage`

```typescript
type TMessage =
  | IMessageText
  | IMessageToolCall
  | IMessageToolGroup
  | IMessagePlan
  | IMessageTips
  | IMessageAgentStatus
  | IMessageCodexToolCall
  | IMessageCodexPermission
  | IMessageAcpToolCall
  | IMessageAcpPermission;
```

### `IMessage`

```typescript
interface IMessage {
  id: string;
  msg_id: string;
  conversation_id: string;
  type: TMessageType;
  content: any;
  status: string;
  position: number;
  createdAt?: number;
}
```

### `IConfirmation`

```typescript
interface IConfirmation {
  id: string;
  callId: string;
  title: string;
  description: string;
  action: string;
  options?: string[];
}
```

### `CronJob`

```typescript
interface CronJob {
  id: string;
  name: string;
  schedule: string;
  conversationId: string;
  conversationTitle: string;
  message: string;
  agentType: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
  createdBy: string;
}
```

### `McpConfig`

```typescript
interface McpConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}
```
