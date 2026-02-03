/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexPermissionRequest } from '@/common/codex/types';
import type { ExecCommandBeginData, ExecCommandEndData, ExecCommandOutputDeltaData, McpToolCallBeginData, McpToolCallEndData, PatchApplyBeginData, PatchApplyEndData, TurnDiffData, WebSearchBeginData, WebSearchEndData } from '@/common/codex/types/eventData';
import type { AcpBackend, AcpPermissionRequest, PlanUpdate, ToolCallUpdate } from '@/types/acpTypes';
import type { IResponseMessage } from './ipcBridge';
import { uuid } from './utils';

/**
 * Safe path joining function, compatible with Windows and Mac
 * @param basePath Base path
 * @param relativePath Relative path
 * @returns Joined absolute path
 */
export const joinPath = (basePath: string, relativePath: string): string => {
  // Normalize path separators to /
  const normalizePath = (path: string) => path.replace(/\\/g, '/');

  const base = normalizePath(basePath);
  const relative = normalizePath(relativePath);

  // Remove trailing slashes from base path
  const cleanBase = base.replace(/\/+$/, '');

  // Handle ./ and ../ in relative path
  const parts = relative.split('/');
  const resultParts = [];

  for (const part of parts) {
    if (part === '.' || part === '') {
      continue; // Skip . and empty strings
    } else if (part === '..') {
      // Handle parent directory
      if (resultParts.length > 0) {
        resultParts.pop(); // Remove the last part
      }
    } else {
      resultParts.push(part);
    }
  }

  // Join the path
  const result = cleanBase + '/' + resultParts.join('/');

  // Ensure correct path format
  return result.replace(/\/+/g, '/'); // Replace multiple consecutive slashes with single
};

/**
 * @description Conversation-related message type declarations and related processing
 */

type TMessageType = 'text' | 'tips' | 'tool_call' | 'tool_group' | 'agent_status' | 'acp_permission' | 'acp_tool_call' | 'codex_permission' | 'codex_tool_call' | 'plan';

interface IMessage<T extends TMessageType, Content extends Record<string, any>> {
  /**
   * Unique ID
   */
  id: string;
  /**
   * Message source ID
   */
  msg_id?: string;

  // Message conversation ID
  conversation_id: string;
  /**
   * Message type
   */
  type: T;
  /**
   * Message content
   */
  content: Content;
  /**
   * Message creation time
   */
  createdAt?: number;
  /**
   * Message position
   */
  position?: 'left' | 'right' | 'center' | 'pop';
  /**
   * Message status
   */
  status?: 'finish' | 'pending' | 'error' | 'work';
}

export type IMessageText = IMessage<'text', { content: string }>;

export type IMessageTips = IMessage<'tips', { content: string; type: 'error' | 'success' | 'warning' }>;

export type IMessageToolCall = IMessage<
  'tool_call',
  {
    callId: string;
    name: string;
    args: Record<string, any>;
    error?: string;
    status?: 'success' | 'error';
  }
>;

type IMessageToolGroupConfirmationDetailsBase<Type, Extra extends Record<string, any>> = {
  type: Type;
  title: string;
} & Extra;

export type IMessageToolGroup = IMessage<
  'tool_group',
  Array<{
    callId: string;
    description: string;
    name: string;
    renderOutputAsMarkdown: boolean;
    resultDisplay?:
      | string
      | {
          fileDiff: string;
          fileName: string;
        }
      | {
          img_url: string;
          relative_path: string;
        };
    status: 'Executing' | 'Success' | 'Error' | 'Canceled' | 'Pending' | 'Confirming';
    confirmationDetails?:
      | IMessageToolGroupConfirmationDetailsBase<
          'edit',
          {
            fileName: string;
            fileDiff: string;
            isModifying?: boolean;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'exec',
          {
            rootCommand: string;
            command: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'info',
          {
            urls?: string[];
            prompt: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'mcp',
          {
            toolName: string;
            toolDisplayName: string;
            serverName: string;
          }
        >;
  }>
>;

// Unified agent status message type for all ACP-based agents (Claude, Qwen, Codex, etc.)
export type IMessageAgentStatus = IMessage<
  'agent_status',
  {
    backend: AcpBackend; // Agent identifier: 'claude', 'qwen', 'codex', etc.
    status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error';
    // Optional legacy fields for backward compatibility
    sessionId?: string;
    isConnected?: boolean;
    hasActiveSession?: boolean;
  }
>;

export type IMessageAcpPermission = IMessage<'acp_permission', AcpPermissionRequest>;

export type IMessageAcpToolCall = IMessage<'acp_tool_call', ToolCallUpdate>;

export type IMessageCodexPermission = IMessage<'codex_permission', CodexPermissionRequest>;

// Base interface for all tool call updates
interface BaseCodexToolCallUpdate {
  toolCallId: string;
  status: 'pending' | 'executing' | 'success' | 'error' | 'canceled';
  title?: string; // Optional - can be derived from data or kind
  kind: 'execute' | 'patch' | 'mcp' | 'web_search';

  // UI display data
  description?: string;
  content?: Array<{
    type: 'text' | 'diff' | 'output';
    text?: string;
    output?: string;
    filePath?: string;
    oldText?: string;
    newText?: string;
  }>;

  // Timing
  startTime?: number;
  endTime?: number;
}

// Specific subtypes using the original event data structures
export type CodexToolCallUpdate =
  | (BaseCodexToolCallUpdate & {
      subtype: 'exec_command_begin';
      data: ExecCommandBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'exec_command_output_delta';
      data: ExecCommandOutputDeltaData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'exec_command_end';
      data: ExecCommandEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'patch_apply_begin';
      data: PatchApplyBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'patch_apply_end';
      data: PatchApplyEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'mcp_tool_call_begin';
      data: McpToolCallBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'mcp_tool_call_end';
      data: McpToolCallEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'web_search_begin';
      data: WebSearchBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'web_search_end';
      data: WebSearchEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'turn_diff';
      data: TurnDiffData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'generic';
      data?: any; // For generic updates that don't map to specific events
    });

export type IMessageCodexToolCall = IMessage<'codex_tool_call', CodexToolCallUpdate>;

export type IMessagePlan = IMessage<
  'plan',
  {
    sessionId: string;
    entries: PlanUpdate['update']['entries'];
  }
>;

// eslint-disable-next-line max-len
export type TMessage = IMessageText | IMessageTips | IMessageToolCall | IMessageToolGroup | IMessageAgentStatus | IMessageAcpPermission | IMessageAcpToolCall | IMessageCodexPermission | IMessageCodexToolCall | IMessagePlan;

// Unified type for all user interaction types
export interface IConfirmation<Option extends any = any> {
  title?: string;
  id: string;
  action?: string;
  description: string;
  callId: string;
  options: Array<{
    label: string;
    value: Option;
    params?: Record<string, string>; // Translation interpolation parameters
  }>;
}

/**
 * @description Transform backend response message to frontend message
 * */
export const transformMessage = (message: IResponseMessage): TMessage => {
  switch (message.type) {
    case 'error': {
      return {
        id: uuid(),
        type: 'tips',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: {
          content: message.data as string,
          type: 'error',
        },
      };
    }
    case 'content':
    case 'user_content': {
      return {
        id: uuid(),
        type: 'text',
        msg_id: message.msg_id,
        position: message.type === 'content' ? 'left' : 'right',
        conversation_id: message.conversation_id,
        content: {
          content: message.data as string,
        },
      };
    }
    case 'tool_call': {
      return {
        id: uuid(),
        type: 'tool_call',
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        position: 'left',
        content: message.data as any,
      };
    }
    case 'tool_group': {
      return {
        type: 'tool_group',
        id: uuid(),
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'agent_status': {
      return {
        id: uuid(),
        type: 'agent_status',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'acp_permission': {
      return {
        id: uuid(),
        type: 'acp_permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'acp_tool_call': {
      return {
        id: uuid(),
        type: 'acp_tool_call',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'codex_permission': {
      return {
        id: uuid(),
        type: 'codex_permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'codex_tool_call': {
      return {
        id: uuid(),
        type: 'codex_tool_call',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'plan': {
      return {
        id: uuid(),
        type: 'plan',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'start':
    case 'finish':
    case 'thought':
    case 'system': // Cron system responses, ignored
      break;
    default: {
      throw new Error(`Unsupported message type '${message.type}'. All non-standard message types should be pre-processed by respective AgentManagers.`);
    }
  }
};

/**
 * @description Merge message into message list
 * */
export const composeMessage = (message: TMessage | undefined, list: TMessage[] | undefined, messageHandler: (type: 'update' | 'insert', message: TMessage) => void = () => {}): TMessage[] => {
  if (!message) return list || [];
  if (!list?.length) {
    messageHandler('insert', message);
    return [message];
  }
  const last = list[list.length - 1];

  const updateMessage = (index: number, message: TMessage, change = true) => {
    message.id = list[index].id;
    list[index] = message;
    if (change) messageHandler('update', message);
    return list.slice();
  };
  const pushMessage = (message: TMessage) => {
    list.push(message);
    messageHandler('insert', message);
    return list.slice();
  };

  if (message.type === 'tool_group') {
    const tools = message.content.slice();
    for (let i = 0, len = list.length; i < len; i++) {
      const existingMessage = list[i];
      if (existingMessage.type === 'tool_group') {
        if (!existingMessage.content.length) continue;
        // Create a new content array with merged tool data
        let change = false;
        const newContent = existingMessage.content.map((tool) => {
          const newToolIndex = tools.findIndex((t) => t.callId === tool.callId);
          if (newToolIndex === -1) return tool;
          // Create new object instead of mutating original
          const merged = { ...tool, ...tools[newToolIndex] };
          change = true;
          tools.splice(newToolIndex, 1);
          return merged;
        });
        // Only return if we actually matched and merged some tools
        // Otherwise continue checking other tool_groups
        if (change) {
          return updateMessage(i, { ...existingMessage, content: newContent }, true);
        }
      }
    }
    if (tools.length) {
      message.content = tools;
      return pushMessage(message);
    }
    return list;
  }

  // Handle Gemini tool_call message merging
  if (message.type === 'tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'tool_call' && msg.content.callId === message.content.callId) {
        // Create new object instead of mutating original
        return updateMessage(i, { ...msg, content: { ...msg.content, ...message.content } });
      }
    }
    // If no existing tool call found, add new one
    return pushMessage(message);
  }

  // Handle codex_tool_call message merging
  if (message.type === 'codex_tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'codex_tool_call' && msg.content.toolCallId === message.content.toolCallId) {
        // Create new object instead of mutating original
        const merged = { ...msg.content, ...message.content };
        return updateMessage(i, { ...msg, content: merged });
      }
    }
    // If no existing tool call found, add new one
    return pushMessage(message);
  }

  // Handle acp_tool_call message merging (same logic as codex_tool_call)
  if (message.type === 'acp_tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'acp_tool_call' && msg.content.update?.toolCallId === message.content.update?.toolCallId) {
        // Create new object instead of mutating original
        const merged = { ...msg.content, ...message.content };
        return updateMessage(i, { ...msg, content: merged });
      }
    }
    // If no existing tool call found, add new one
    return pushMessage(message);
  }

  if (message.type === 'plan') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'plan' && msg.content.sessionId === message.content.sessionId) {
        // Create new object instead of mutating original
        const merged = { ...msg.content, ...message.content };
        return updateMessage(i, { ...msg, content: merged });
      }
    }
    return pushMessage(message);
    // If no existing plan found, add new one
  }

  if (last.msg_id !== message.msg_id || last.type !== message.type) return pushMessage(message);
  if (message.type === 'text' && last.type === 'text') {
    message.content.content = last.content.content + message.content.content;
  }
  return updateMessage(list.length - 1, Object.assign({}, last, message));
};

export const handleImageGenerationWithWorkspace = (message: TMessage, workspace: string): TMessage => {
  // Only process text type messages
  if (message.type !== 'text') {
    return message;
  }

  // Deep copy message to avoid modifying the original object
  const processedMessage = {
    ...message,
    content: {
      ...message.content,
      content: message.content.content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imagePath) => {
        // If it's an absolute path, http link, or data URL, keep unchanged
        if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('/') || imagePath.startsWith('file:') || imagePath.startsWith('\\') || /^[A-Za-z]:/.test(imagePath)) {
          return match;
        }
        // If it's a relative path, join with workspace
        const absolutePath = joinPath(workspace, imagePath);
        return `![${alt}](${encodeURI(absolutePath)})`;
      }),
    },
  };

  return processedMessage;
};
