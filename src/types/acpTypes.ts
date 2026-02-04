/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP Backend Type Definitions
 *
 * For better extensibility, all supported ACP backends are defined here.
 * When adding a new backend, simply add it here.
 */

/**
 * The primary agent type for preset assistants, used to determine which conversation type to create.
 */
export type PresetAgentType = 'gemini' | 'claude' | 'codex' | 'opencode';

/**
 * Preset agent types that use ACP protocol (need to be routed through ACP backend)
 *
 * These types will use corresponding ACP backend when creating conversation, instead of native Gemini
 */
export const ACP_ROUTED_PRESET_TYPES: readonly PresetAgentType[] = ['claude', 'opencode'] as const;

/**
 * Check if preset agent type should be routed through ACP backend
 */
export function isAcpRoutedPresetType(type: PresetAgentType | undefined): boolean {
  return type !== undefined && ACP_ROUTED_PRESET_TYPES.includes(type);
}

// All backend types - including temporarily unsupported ones
export type AcpBackendAll =
  | 'claude' // Claude ACP
  | 'gemini' // Google Gemini ACP
  | 'qwen' // Qwen Code ACP
  | 'iflow' // iFlow CLI ACP
  | 'codex' // OpenAI Codex MCP
  | 'droid' // Factory Droid CLI (ACP via `droid exec --output-format acp`)
  | 'goose' // Block's Goose CLI
  | 'auggie' // Augment Code CLI
  | 'kimi' // Kimi CLI (Moonshot)
  | 'opencode' // OpenCode CLI
  | 'copilot' // GitHub Copilot CLI
  | 'qoder' // Qoder CLI
  | 'custom'; // User-configured custom ACP agent

/**
 * Potential ACP CLI tools list.
 * Used for auto-detecting CLI tools installed on user's local machine.
 * When new ACP CLI tools are released, simply add them to this list.
 */
export interface PotentialAcpCli {
  /** CLI executable filename */
  cmd: string;
  /** ACP launch arguments */
  args: string[];
  /** Display name */
  name: string;
  /** Corresponding backend id */
  backendId: AcpBackendAll;
}

/** Default ACP launch arguments */
const DEFAULT_ACP_ARGS = ['--experimental-acp'];

/**
 * Generate detectable CLI list from ACP_BACKENDS_ALL
 * Only includes enabled backends with cliCommand (excludes gemini and custom)
 */
function generatePotentialAcpClis(): PotentialAcpCli[] {
  // Must be called after ACP_BACKENDS_ALL is defined, so use lazy initialization
  return Object.entries(ACP_BACKENDS_ALL)
    .filter(([id, config]) => {
      // Exclude backends without CLI command (gemini is built-in, custom is user-configured)
      if (!config.cliCommand) return false;
      if (id === 'gemini' || id === 'custom') return false;
      return config.enabled;
    })
    .map(([id, config]) => ({
      cmd: config.cliCommand!,
      args: config.acpArgs || DEFAULT_ACP_ARGS,
      name: config.name,
      backendId: id as AcpBackendAll,
    }));
}

// Lazy initialization to avoid circular dependency
let _potentialAcpClis: PotentialAcpCli[] | null = null;

/**
 * List of known CLI tools supporting ACP protocol
 * Iterates this list during detection and checks via `which` command
 * Automatically generated from ACP_BACKENDS_ALL to avoid data redundancy
 */
export const POTENTIAL_ACP_CLIS: PotentialAcpCli[] = new Proxy([] as PotentialAcpCli[], {
  get(_target, prop) {
    if (_potentialAcpClis === null) {
      _potentialAcpClis = generatePotentialAcpClis();
    }
    if (prop === 'length') return _potentialAcpClis.length;
    if (typeof prop === 'string' && !isNaN(Number(prop))) {
      return _potentialAcpClis[Number(prop)];
    }
    if (prop === Symbol.iterator) {
      return function* () {
        yield* _potentialAcpClis!;
      };
    }
    if (prop === 'map') return _potentialAcpClis.map.bind(_potentialAcpClis);
    if (prop === 'filter') return _potentialAcpClis.filter.bind(_potentialAcpClis);
    if (prop === 'forEach') return _potentialAcpClis.forEach.bind(_potentialAcpClis);
    return Reflect.get(_potentialAcpClis, prop);
  },
});

/**
 * Configuration for an ACP backend agent.
 * Used for both built-in backends (claude, gemini, qwen) and custom user agents.
 */
export interface AcpBackendConfig {
  /**
   * Unique identifier for the backend (e.g., 'claude', 'gemini', 'custom')
   */
  id: string;

  /**
   * Display name shown in the UI (e.g., 'Goose', 'Claude Code')
   */
  name: string;

  /**
   * Localized names (e.g., { 'zh-CN': '...', 'en-US': '...' })
   */
  nameI18n?: Record<string, string>;

  /**
   * Short description shown in assistant lists or settings
   */
  description?: string;

  /**
   * Localized descriptions (e.g., { 'zh-CN': '...', 'en-US': '...' })
   */
  descriptionI18n?: Record<string, string>;

  /**
   * Avatar for the assistant - can be an emoji string or image path
   */
  avatar?: string;

  /**
   * CLI command name used for detection via `which` command.
   * Example: 'goose', 'claude', 'qwen'
   * Only needed if the binary name differs from id.
   */
  cliCommand?: string;

  /**
   * Full CLI path with optional arguments (space-separated).
   * Used when spawning the process.
   * Examples:
   *   - 'goose' (simple binary)
   *   - 'npx @qwen-code/qwen-code' (npx package)
   *   - '/usr/local/bin/my-agent --verbose' (full path with args)
   * Note: '--experimental-acp' is auto-appended for non-custom backends.
   */
  defaultCliPath?: string;

  /** Whether this backend requires authentication before use */
  authRequired?: boolean;

  /** Whether this backend is enabled and should appear in the UI */
  enabled?: boolean;

  /** Whether this backend supports streaming responses */
  supportsStreaming?: boolean;

  /**
   * Custom environment variables to pass to the spawned process.
   * Merged with process.env when spawning.
   * Example: { "ANTHROPIC_API_KEY": "sk-...", "DEBUG": "true" }
   */
  env?: Record<string, string>;

  /**
   * Arguments to enable ACP mode when spawning the CLI.
   * Different CLIs use different conventions:
   *   - ['--experimental-acp'] for claude (default if not specified)
   *   - ['--acp'] for qwen, auggie
   *   - ['acp'] for goose (subcommand)
   * If not specified, defaults to ['--experimental-acp'].
   */
  acpArgs?: string[];

  /** Whether this is a prompt-based preset (no CLI binary required) */
  isPreset?: boolean;

  /** The system prompt or rule context for this preset */
  context?: string;

  /** Localized prompts for this preset (e.g., { 'zh-CN': '...', 'en-US': '...' }) */
  contextI18n?: Record<string, string>;

  /** Example prompts for this preset */
  prompts?: string[];

  /** Localized example prompts */
  promptsI18n?: Record<string, string[]>;

  /**
   * The primary agent type for this preset (only applies when isPreset=true).
   * Determines which conversation type to create when selecting this preset.
   * - 'gemini': Creates a Gemini conversation
   * - 'claude': Creates an ACP conversation with Claude backend
   * - 'codex': Creates a Codex conversation
   * Defaults to 'gemini' for backward compatibility.
   */
  presetAgentType?: PresetAgentType;

  /**
   * Available models for this assistant (only applies when isPreset=true).
   * If not specified, system default models will be used.
   */
  models?: string[];

  /** Whether this is a built-in assistant (cannot be edited/deleted) */
  isBuiltin?: boolean;

  /**
   * Enabled skills for this assistant (only applies when isPreset=true).
   * If not specified or empty array, all available skills will be loaded.
   */
  enabledSkills?: string[];

  /**
   * List of custom skill names added via "Add Skills" button (only applies when isPreset=true).
   * These skills will be displayed in the Custom Skills section even after being imported.
   */
  customSkillNames?: string[];
}

// All backend configurations - including temporarily disabled ones
export const ACP_BACKENDS_ALL: Record<AcpBackendAll, AcpBackendConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    cliCommand: 'claude',
    authRequired: true,
    enabled: true,
    supportsStreaming: false,
  },
  gemini: {
    id: 'gemini',
    name: 'Google CLI',
    cliCommand: 'gemini',
    authRequired: true,
    enabled: false,
    supportsStreaming: true,
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    authRequired: true,
    enabled: true, // ✅ Verified support: Qwen CLI v0.0.10+ supports --acp
    supportsStreaming: true,
    acpArgs: ['--acp'], // Use --acp instead of deprecated --experimental-acp
  },
  iflow: {
    id: 'iflow',
    name: 'iFlow CLI',
    cliCommand: 'iflow',
    authRequired: true,
    enabled: true,
    supportsStreaming: false,
  },
  codex: {
    id: 'codex',
    name: 'Codex ',
    cliCommand: 'codex',
    authRequired: false,
    enabled: true, // ✅ Verified support: Codex CLI v0.4.0+ supports acp mode
    supportsStreaming: false,
  },
  goose: {
    id: 'goose',
    name: 'Goose',
    cliCommand: 'goose',
    authRequired: false,
    enabled: true, // ✅ Block's Goose CLI, started with `goose acp`
    supportsStreaming: false,
    acpArgs: ['acp'], // goose uses subcommand instead of flag
  },
  auggie: {
    id: 'auggie',
    name: 'Augment Code',
    cliCommand: 'auggie',
    authRequired: false,
    enabled: true, // ✅ Augment Code CLI, started with `auggie --acp`
    supportsStreaming: false,
    acpArgs: ['--acp'], // auggie uses --acp flag
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi CLI',
    cliCommand: 'kimi',
    authRequired: false,
    enabled: true, // ✅ Kimi CLI (Moonshot), started with `kimi acp`
    supportsStreaming: false,
    acpArgs: ['acp'], // kimi uses acp subcommand
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    cliCommand: 'opencode',
    authRequired: false,
    enabled: true, // ✅ OpenCode CLI, started with `opencode acp`
    supportsStreaming: false,
    acpArgs: ['acp'], // opencode uses acp subcommand
  },
  droid: {
    id: 'droid',
    name: 'Factory Droid',
    cliCommand: 'droid',
    // Droid uses FACTORY_API_KEY from environment, not an interactive auth flow.
    authRequired: false,
    enabled: true, // ✅ Factory docs: `droid exec --output-format acp` (JetBrains/Zed ACP integration)
    supportsStreaming: false,
    acpArgs: ['exec', '--output-format', 'acp'],
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    cliCommand: 'copilot',
    authRequired: false,
    enabled: true, // ✅ GitHub Copilot CLI, started with `copilot --acp --stdio`
    supportsStreaming: true,
    acpArgs: ['--acp', '--stdio'], // copilot uses --acp --stdio for ACP mode
  },
  qoder: {
    id: 'qoder',
    name: 'Qoder CLI',
    cliCommand: 'qodercli',
    authRequired: false,
    enabled: true, // ✅ Qoder CLI, started with `qodercli --acp`
    supportsStreaming: false,
    acpArgs: ['--acp'], // qoder uses --acp flag
  },
  custom: {
    id: 'custom',
    name: 'Custom Agent',
    cliCommand: undefined, // User-configured via settings
    authRequired: false,
    enabled: true,
    supportsStreaming: false,
  },
};

// Enabled backends only
export const ACP_ENABLED_BACKENDS: Record<string, AcpBackendConfig> = Object.fromEntries(Object.entries(ACP_BACKENDS_ALL).filter(([_, config]) => config.enabled));

// Currently enabled backend types
export type AcpBackend = keyof typeof ACP_BACKENDS_ALL;
export type AcpBackendId = AcpBackend; // Backward compatibility

// Utility functions
export function isValidAcpBackend(backend: string): backend is AcpBackend {
  return backend in ACP_ENABLED_BACKENDS;
}

export function getAcpBackendConfig(backend: AcpBackend): AcpBackendConfig {
  return ACP_ENABLED_BACKENDS[backend];
}

// Get all enabled backend configurations
export function getEnabledAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_ENABLED_BACKENDS);
}

// Get all backend configurations (including disabled ones)
export function getAllAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_BACKENDS_ALL);
}

// Check if a backend is enabled
export function isAcpBackendEnabled(backend: AcpBackendAll): boolean {
  return ACP_BACKENDS_ALL[backend]?.enabled ?? false;
}

// ACP Error Type System - Elegant error handling
export enum AcpErrorType {
  CONNECTION_NOT_READY = 'CONNECTION_NOT_READY',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN = 'UNKNOWN',
}

export interface AcpError {
  type: AcpErrorType;
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

// ACP Result Type - Type-safe result handling
export type AcpResult<T = unknown> = { success: true; data: T } | { success: false; error: AcpError };

// Helper function to create ACP errors
export function createAcpError(type: AcpErrorType, message: string, retryable: boolean = false, details?: unknown): AcpError {
  return {
    type,
    code: type.toString(),
    message,
    retryable,
    details,
  };
}

export function isRetryableError(error: AcpError): boolean {
  return error.retryable || error.type === AcpErrorType.CONNECTION_NOT_READY;
}

// ACP JSON-RPC Protocol Types
export const JSONRPC_VERSION = '2.0' as const;

export interface AcpRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface AcpResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export interface AcpNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

// Base interface for all session updates
export interface BaseSessionUpdate {
  sessionId: string;
}

// Agent message chunk update
export interface AgentMessageChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'agent_message_chunk';
    content: {
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    };
  };
}

// Agent thought chunk update
export interface AgentThoughtChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'agent_thought_chunk';
    content: {
      type: 'text';
      text: string;
    };
  };
}

// ===== Shared sub-types =====

/** Tool call content item type */
export interface ToolCallContentItem {
  type: 'content' | 'diff';
  content?: {
    type: 'text';
    text: string;
  };
  path?: string;
  oldText?: string | null;
  newText?: string;
}

/** Tool call location item type */
export interface ToolCallLocationItem {
  path: string;
}

// Tool call update
export interface ToolCallUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call';
    toolCallId: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    title: string;
    kind: 'read' | 'edit' | 'execute';
    rawInput?: Record<string, unknown>;
    content?: ToolCallContentItem[];
    locations?: ToolCallLocationItem[];
  };
}

// Tool call update (status change)
export interface ToolCallUpdateStatus extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call_update';
    toolCallId: string;
    status: 'completed' | 'failed';
    content?: Array<{
      type: 'content';
      content: {
        type: 'text';
        text: string;
      };
    }>;
  };
}

// Plan update
export interface PlanUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'plan';
    entries: Array<{
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
      priority?: 'low' | 'medium' | 'high';
    }>;
  };
}

// Available commands update
export interface AvailableCommandsUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'available_commands_update';
    availableCommands: Array<{
      name: string;
      description: string;
      input?: {
        hint?: string;
      } | null;
    }>;
  };
}

// User message chunk update
export interface UserMessageChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'user_message_chunk';
    content: {
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    };
  };
}

// Current mode update
export interface CurrentModeUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'current_mode_update';
    mode: string;
    description?: string;
  };
}

// Union type for all session updates
export type AcpSessionUpdate = AgentMessageChunkUpdate | AgentThoughtChunkUpdate | ToolCallUpdate | ToolCallUpdateStatus | PlanUpdate | AvailableCommandsUpdate | UserMessageChunkUpdate;
// | CurrentModeUpdate;

// Current ACP permission request interface
export interface AcpPermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}
export interface AcpPermissionRequest {
  sessionId: string;
  options: Array<AcpPermissionOption>;
  toolCall: {
    toolCallId: string;
    rawInput?: {
      command?: string;
      description?: string;
      [key: string]: unknown;
    };
    status?: string;
    title?: string;
    kind?: string;
    content?: ToolCallContentItem[];
    locations?: ToolCallLocationItem[];
  };
}

// Legacy compatibility type - supports old version data structures
export interface LegacyAcpPermissionData extends Record<string, unknown> {
  // Possible old version fields
  options?: Array<{
    optionId?: string;
    name?: string;
    kind?: string;
    // Compatible with other possible fields
    [key: string]: unknown;
  }>;
  toolCall?: {
    toolCallId?: string;
    rawInput?: unknown;
    title?: string;
    kind?: string;
    // Compatible with other possible fields
    [key: string]: unknown;
  };
}

// Compatibility union type
export type CompatibleAcpPermissionData = AcpPermissionRequest | LegacyAcpPermissionData;

export type AcpMessage = AcpRequest | AcpNotification | AcpResponse | AcpSessionUpdate;

// File Operation Request Types
export interface AcpFileWriteRequest extends AcpRequest {
  method: 'fs/write_text_file';
  params: {
    sessionId: string;
    path: string;
    content: string;
  };
}

export interface AcpFileReadRequest extends AcpRequest {
  method: 'fs/read_text_file';
  params: {
    sessionId: string;
    path: string;
  };
}

// These constants define the method names used in the ACP protocol.
// Source: Existing code implementation (no official protocol docs, sync changes if updated).

export const ACP_METHODS = {
  SESSION_UPDATE: 'session/update',
  REQUEST_PERMISSION: 'session/request_permission',
  READ_TEXT_FILE: 'fs/read_text_file',
  WRITE_TEXT_FILE: 'fs/write_text_file',
} as const;

export type AcpMethod = (typeof ACP_METHODS)[keyof typeof ACP_METHODS];

// ===== Discriminated Union Types =====
// Used for type-safe dispatching in AcpConnection.handleIncomingRequest

/** Session update notification */
export interface AcpSessionUpdateNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: typeof ACP_METHODS.SESSION_UPDATE;
  params: AcpSessionUpdate;
}

/** Permission request message */
export interface AcpPermissionRequestMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: typeof ACP_METHODS.REQUEST_PERMISSION;
  params: AcpPermissionRequest;
}

/** File read request (with typed params) */
export interface AcpFileReadMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: typeof ACP_METHODS.READ_TEXT_FILE;
  params: {
    path: string;
    sessionId?: string;
  };
}

/** File write request (with typed params) */
export interface AcpFileWriteMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: typeof ACP_METHODS.WRITE_TEXT_FILE;
  params: {
    path: string;
    content: string;
    sessionId?: string;
  };
}

/**
 * ACP incoming message union type.
 * TypeScript can automatically narrow the type based on the method field.
 */
export type AcpIncomingMessage = AcpSessionUpdateNotification | AcpPermissionRequestMessage | AcpFileReadMessage | AcpFileWriteMessage;
