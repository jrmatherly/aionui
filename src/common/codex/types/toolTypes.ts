/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CodexAgentEventType } from './eventTypes';

// Tool category enumeration
export enum ToolCategory {
  EXECUTION = 'execution', // shell, bash, python, etc.
  FILE_OPS = 'file_ops', // read/write, edit, search files
  SEARCH = 'search', // various search methods
  ANALYSIS = 'analysis', // code analysis, chart generation
  COMMUNICATION = 'communication', // network requests, API calls
  CUSTOM = 'custom', // MCP tools and other custom tools
}

// Output format enumeration
export enum OutputFormat {
  TEXT = 'text',
  MARKDOWN = 'markdown',
  JSON = 'json',
  IMAGE = 'image',
  CHART = 'chart',
  DIAGRAM = 'diagram',
  TABLE = 'table',
}

// Renderer type enumeration
export enum RendererType {
  STANDARD = 'standard', // standard text rendering
  MARKDOWN = 'markdown', // Markdown rendering
  CODE = 'code', // code highlighting rendering
  CHART = 'chart', // chart rendering
  IMAGE = 'image', // image rendering
  INTERACTIVE = 'interactive', // interactive rendering
  COMPOSITE = 'composite', // composite rendering
}

// Tool availability configuration
export interface ToolAvailability {
  platforms: string[]; // ['darwin', 'linux', 'win32']
  requires?: string[]; // required tools or services
  experimental?: boolean; // whether it's an experimental feature
}

// Tool capabilities configuration
export interface ToolCapabilities {
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsCharts: boolean;
  supportsMarkdown: boolean;
  supportsInteraction: boolean; // whether user interaction is required
  outputFormats: OutputFormat[];
}

// Renderer configuration
export interface ToolRenderer {
  type: RendererType;
  config: Record<string, any>;
}

// Tool definition interface
export interface ToolDefinition {
  id: string;
  name: string;
  displayNameKey: string; // i18n key for display name
  category: ToolCategory;
  priority: number; // priority, lower number means higher priority
  availability: ToolAvailability;
  capabilities: ToolCapabilities;
  renderer: ToolRenderer;
  icon?: string; // tool icon
  descriptionKey: string; // i18n key for description
  schema?: any; // tool schema
}

// MCP tool information
export interface McpToolInfo {
  name: string;
  serverName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

// Event data type definition (simplified using CodexEventMsg structure)
export type EventDataMap = {
  [CodexAgentEventType.EXEC_COMMAND_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'exec_command_begin' }>;
  [CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA]: Extract<import('./eventData').CodexEventMsg, { type: 'exec_command_output_delta' }>;
  [CodexAgentEventType.EXEC_COMMAND_END]: Extract<import('./eventData').CodexEventMsg, { type: 'exec_command_end' }>;
  [CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST]: Extract<import('./eventData').CodexEventMsg, { type: 'apply_patch_approval_request' }>;
  [CodexAgentEventType.PATCH_APPLY_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'patch_apply_begin' }>;
  [CodexAgentEventType.PATCH_APPLY_END]: Extract<import('./eventData').CodexEventMsg, { type: 'patch_apply_end' }>;
  [CodexAgentEventType.MCP_TOOL_CALL_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'mcp_tool_call_begin' }>;
  [CodexAgentEventType.MCP_TOOL_CALL_END]: Extract<import('./eventData').CodexEventMsg, { type: 'mcp_tool_call_end' }>;
  [CodexAgentEventType.WEB_SEARCH_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'web_search_begin' }>;
  [CodexAgentEventType.WEB_SEARCH_END]: Extract<import('./eventData').CodexEventMsg, { type: 'web_search_end' }>;
};
