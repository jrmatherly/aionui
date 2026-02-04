/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpBackendConfig } from '@/types/acpTypes';
import { storage } from '@office-ai/platform';

/**
 * @description Chat-related storage
 */
export const ChatStorage = storage.buildStorage<IChatConversationRefer>('agent.chat');

// Chat message storage
export const ChatMessageStorage = storage.buildStorage('agent.chat.message');

// System configuration storage
export const ConfigStorage = storage.buildStorage<IConfigStorageRefer>('agent.config');

// System environment variable storage
export const EnvStorage = storage.buildStorage<IEnvStorageRefer>('agent.env');

export interface IConfigStorageRefer {
  'gemini.config': {
    authType: string;
    proxy: string;
    GOOGLE_GEMINI_BASE_URL?: string;
    /** @deprecated Use accountProjects instead. Kept for backward compatibility migration. */
    GOOGLE_CLOUD_PROJECT?: string;
    /** GCP project IDs stored per Google account */
    accountProjects?: Record<string, string>;
    yoloMode?: boolean;
  };
  'codex.config'?: {
    cliPath?: string;
    yoloMode?: boolean;
  };
  'acp.config': {
    [backend in AcpBackend]?: {
      authMethodId?: string;
      authToken?: string;
      lastAuthTime?: number;
      cliPath?: string;
      yoloMode?: boolean;
    };
  };
  'acp.customAgents'?: AcpBackendConfig[];
  'model.config': IProvider[];
  'mcp.config': IMcpServer[];
  'mcp.agentInstallStatus': Record<string, string[]>;
  language: string;
  theme: string;
  colorScheme: string;
  customCss: string; // Custom CSS styles
  'css.themes': ICssTheme[]; // Custom CSS themes list
  'css.activeThemeId': string; // Currently active theme ID
  'gemini.defaultModel': string | { id: string; useModel: string };
  'tools.imageGenerationModel': TProviderWithModel & {
    switch: boolean;
  };
  // Whether to ask for confirmation when pasting files to workspace (true = don't ask again)
  'workspace.pasteConfirm'?: boolean;
  // Last selected agent type on guid page
  'guid.lastSelectedAgent'?: string;
  // Migration flag: fix assistant enabled default value issue in older versions
  'migration.assistantEnabledFixed'?: boolean;
  // Migration flag: add default enabled skills for cowork assistant
  /** @deprecated Use migration.builtinDefaultSkillsAdded_v2 instead */
  'migration.coworkDefaultSkillsAdded'?: boolean;
  // Migration flag: add default enabled skills for all builtin assistants
  'migration.builtinDefaultSkillsAdded_v2'?: boolean;
  // Telegram assistant default model
  'assistant.telegram.defaultModel'?: {
    id: string;
    useModel: string;
  };
  // Lark assistant default model
  'assistant.lark.defaultModel'?: {
    id: string;
    useModel: string;
  };
}

export interface IEnvStorageRefer {
  'aionui.dir': {
    workDir: string;
    cacheDir: string;
  };
}

/**
 * Conversation source type - identifies where the conversation was created
 */
export type ConversationSource = 'aionui' | 'telegram';

interface IChatConversation<T, Extra> {
  createTime: number;
  modifyTime: number;
  name: string;
  desc?: string;
  id: string;
  type: T;
  extra: Extra;
  model: TProviderWithModel;
  status?: 'pending' | 'running' | 'finished' | undefined;
  /** Conversation source, defaults to aionui */
  source?: ConversationSource;
}

// Token usage statistics data type
export interface TokenUsageData {
  totalTokens: number;
}

export type TChatConversation =
  | IChatConversation<
      'gemini',
      {
        workspace: string;
        customWorkspace?: boolean; // true: user-specified working directory, false: system default
        webSearchEngine?: 'google' | 'default'; // Search engine configuration
        lastTokenUsage?: TokenUsageData; // Last token usage statistics
        contextFileName?: string;
        contextContent?: string;
        // System rules support
        presetRules?: string; // System rules, injected at initialization
        /** Enabled skills list for filtering SkillManager skills */
        enabledSkills?: string[];
        /** Preset assistant ID for displaying name and avatar in conversation panel */
        presetAssistantId?: string;
      }
    >
  | Omit<
      IChatConversation<
        'acp',
        {
          workspace?: string;
          backend: AcpBackend;
          cliPath?: string;
          customWorkspace?: boolean;
          agentName?: string;
          customAgentId?: string; // UUID for identifying specific custom agent
          presetContext?: string; // Preset context from smart assistant (rules/prompts)
          /** Enabled skills list for filtering SkillManager skills */
          enabledSkills?: string[];
          /** Preset assistant ID for displaying name and avatar in conversation panel */
          presetAssistantId?: string;
        }
      >,
      'model'
    >
  | Omit<
      IChatConversation<
        'codex',
        {
          workspace?: string;
          cliPath?: string;
          customWorkspace?: boolean;
          sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'; // Codex sandbox permission mode
          presetContext?: string; // Preset context from smart assistant (rules/prompts)
          /** Enabled skills list for filtering SkillManager skills */
          enabledSkills?: string[];
          /** Preset assistant ID for displaying name and avatar in conversation panel */
          presetAssistantId?: string;
        }
      >,
      'model'
    >;

export type IChatConversationRefer = {
  'chat.history': TChatConversation[];
};

export type ModelType =
  | 'text' // Text conversation
  | 'vision' // Visual understanding
  | 'function_calling' // Tool calling
  | 'image_generation' // Image generation
  | 'web_search' // Web search
  | 'reasoning' // Reasoning model
  | 'embedding' // Embedding model
  | 'rerank' // Reranking model
  | 'excludeFromPrimary'; // Exclude: not suitable as primary model

export type ModelCapability = {
  type: ModelType;
  /**
   * Whether user manually selected. If true, user manually selected this type; if false, user manually disabled this model; if undefined, use default value.
   */
  isUserSelected?: boolean;
};

export interface IProvider {
  id: string;
  platform: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string[];
  /**
   * Model capability tag list. Tagged means supported, untagged means not supported.
   */
  capabilities?: ModelCapability[];
  /**
   * Context token limit. Optional field, only fill in when explicitly known.
   */
  contextLimit?: number;
}

export type TProviderWithModel = Omit<IProvider, 'model'> & { useModel: string };

// MCP Server Configuration Types
export type McpTransportType = 'stdio' | 'sse' | 'http';

export interface IMcpServerTransportStdio {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface IMcpServerTransportSSE {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface IMcpServerTransportHTTP {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface IMcpServerTransportStreamableHTTP {
  type: 'streamable_http';
  url: string;
  headers?: Record<string, string>;
}

export type IMcpServerTransport = IMcpServerTransportStdio | IMcpServerTransportSSE | IMcpServerTransportHTTP | IMcpServerTransportStreamableHTTP;

export interface IMcpServer {
  id: string;
  name: string;
  description?: string;
  enabled: boolean; // Whether installed to CLI agents (controls Switch state)
  transport: IMcpServerTransport;
  tools?: IMcpTool[];
  status?: 'connected' | 'disconnected' | 'error' | 'testing'; // Connection status (also indicates service availability)
  lastConnected?: number;
  createdAt: number;
  updatedAt: number;
  originalJson: string; // Store original JSON config for accurate display when editing
}

export interface IMcpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/**
 * CSS Theme configuration interface
 * Used to store user-defined CSS skins
 */
export interface ICssTheme {
  id: string; // Unique identifier
  name: string; // Theme name
  cover?: string; // Cover image base64 or URL
  css: string; // CSS style code
  isPreset?: boolean; // Whether it's a preset theme
  createdAt: number; // Creation time
  updatedAt: number; // Update time
}
