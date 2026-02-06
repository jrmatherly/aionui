/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Reuse existing business type definitions
import type { TMessage } from '@/common/chatLib';
import type { IConfigStorageRefer, TChatConversation } from '@/common/storage';

/**
 * ======================
 * Database-specific types (new features)
 * ======================
 */

/**
 * User role for RBAC
 */
export type UserRole = 'admin' | 'user' | 'viewer';

/**
 * Authentication method
 */
export type AuthMethod = 'local' | 'oidc';

/**
 * User account (multi-user auth system)
 */
export interface IUser {
  id: string;
  username: string;
  email?: string;
  password_hash: string;
  avatar_path?: string;
  avatar_url?: string | null; // Base64 data URL from Microsoft Graph
  jwt_secret?: string | null;
  role: UserRole;
  auth_method: AuthMethod;
  oidc_subject?: string | null;
  display_name?: string | null;
  groups?: string | null; // JSON array of group IDs
  created_at: number;
  updated_at: number;
  last_login?: number | null;
}

// Image metadata removed - images are stored in filesystem and referenced via message.resultDisplay

/**
 * ======================
 * Organization & Team types (multi-tenant)
 * ======================
 */

/**
 * Organization - top-level tenant container
 */
export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  settings?: string; // JSON string of org settings
  created_at: number;
  updated_at: number;
}

/**
 * Team - group within an organization
 */
export interface ITeam {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description?: string;
  settings?: string; // JSON string of team settings
  created_at: number;
  updated_at: number;
}

/**
 * Team/Org member role
 */
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Team membership
 */
export interface ITeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: number;
}

/**
 * Organization membership
 */
export interface IOrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: number;
}

/**
 * ======================
 * Directory isolation types
 * ======================
 */

/**
 * Per-user directory paths
 */
export interface IUserDirectories {
  id: string;
  user_id: string;
  base_dir: string;
  cache_dir: string;
  work_dir: string;
  skills_dir?: string;
  assistants_dir?: string;
  created_at: number;
  updated_at: number;
}

/**
 * Team shared directories
 */
export interface ITeamDirectories {
  id: string;
  team_id: string;
  base_dir: string;
  shared_skills_dir?: string;
  shared_assistants_dir?: string;
  shared_workspace_dir?: string;
  created_at: number;
  updated_at: number;
}

/**
 * Organization shared directories
 */
export interface IOrgDirectories {
  id: string;
  org_id: string;
  base_dir: string;
  shared_skills_dir?: string;
  shared_assistants_dir?: string;
  created_at: number;
  updated_at: number;
}

/**
 * Directory chain for resource resolution
 * Resources are resolved in order: user -> team(s) -> org -> global
 */
export interface IDirectoryChain {
  user?: IUserDirectories;
  teams?: ITeamDirectories[];
  organization?: IOrgDirectories;
  global: {
    skills_dir: string;
    assistants_dir: string;
    builtin_skills_dir: string;
  };
}

/**
 * ======================
 * Global Models types (admin-managed shared model configs)
 * ======================
 */

/**
 * Override type for user model overrides
 */
export type ModelOverrideType = 'hidden' | 'modified';

/**
 * Global model configuration (admin-managed, shared across all users)
 * Stored in database, available to all users unless hidden
 */
export interface IGlobalModel {
  id: string;
  platform: string;
  name: string;
  base_url: string;
  // Note: encrypted_api_key NOT exposed in this interface (security)
  models: string[]; // Parsed from JSON
  capabilities?: string[]; // Parsed from JSON
  context_limit?: number;
  custom_headers?: Record<string, string>; // Parsed from JSON
  enabled: boolean;
  priority: number;
  /** Group-based access control: NULL/empty = everyone, array = restricted to listed groups */
  allowed_groups?: string[] | null; // Parsed from JSON
  created_by: string;
  created_at: number;
  updated_at: number;
}

/**
 * Global model with API key (internal use only, never sent to frontend)
 */
export interface IGlobalModelWithKey extends IGlobalModel {
  api_key: string; // Decrypted API key
}

/**
 * Global model database row (raw from SQLite)
 */
export interface IGlobalModelRow {
  id: string;
  platform: string;
  name: string;
  base_url: string;
  encrypted_api_key: string | null;
  models: string; // JSON string
  capabilities: string | null; // JSON string
  context_limit: number | null;
  custom_headers: string | null; // JSON string
  enabled: number; // SQLite boolean (0/1)
  priority: number;
  allowed_groups: string | null; // JSON string array of group names
  created_by: string;
  created_at: number;
  updated_at: number;
}

/**
 * User override for a global model
 */
export interface IUserModelOverride {
  id: string;
  user_id: string;
  global_model_id: string;
  override_type: ModelOverrideType;
  local_provider_id?: string; // If modified, points to user's local copy
  created_at: number;
  updated_at: number;
}

/**
 * Create global model DTO (for admin API)
 */
export interface ICreateGlobalModelDTO {
  platform: string;
  name: string;
  base_url?: string;
  api_key?: string;
  models: string[];
  capabilities?: string[];
  context_limit?: number;
  custom_headers?: Record<string, string>;
  enabled?: boolean;
  priority?: number;
  /** Group-based access control: undefined/null/[] = everyone, array = restricted */
  allowed_groups?: string[];
}

/**
 * Update global model DTO (for admin API)
 */
export interface IUpdateGlobalModelDTO {
  platform?: string;
  name?: string;
  base_url?: string;
  api_key?: string; // Only set if changing
  models?: string[];
  capabilities?: string[];
  context_limit?: number;
  custom_headers?: Record<string, string>;
  enabled?: boolean;
  priority?: number;
  /** Group-based access control: undefined = no change, null/[] = everyone, array = restricted */
  allowed_groups?: string[] | null;
}

/**
 * ======================
 * Database query helper types
 * ======================
 */

/**
 * Database query result wrapper
 */
export interface IQueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Paginated query result
 */
export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * ======================
 * Database storage format (serialized format)
 * ======================
 */

/**
 * Conversation stored in database (serialized format)
 */
export interface IConversationRow {
  id: string;
  user_id: string;
  name: string;
  type: 'gemini' | 'acp' | 'codex';
  extra: string; // JSON string of extra data
  model?: string; // JSON string of TProviderWithModel (gemini type has this)
  status?: 'pending' | 'running' | 'finished';
  source?: 'aionui' | 'telegram'; // Conversation source
  created_at: number;
  updated_at: number;
}

/**
 * Message stored in database (serialized format)
 */
export interface IMessageRow {
  id: string;
  conversation_id: string;
  msg_id?: string; // Message source ID
  type: string; // TMessage['type']
  content: string; // JSON string of message content
  position?: 'left' | 'right' | 'center' | 'pop';
  status?: 'finish' | 'pending' | 'error' | 'work';
  created_at: number;
}

/**
 * Config stored in database (key-value, used for database version tracking)
 */
export interface IConfigRow {
  key: string;
  value: string; // JSON string
  updated_at: number;
}

/**
 * ======================
 * Type conversion functions
 * ======================
 */

/**
 * Convert TChatConversation to database row
 */
export function conversationToRow(conversation: TChatConversation, userId: string): IConversationRow {
  return {
    id: conversation.id,
    user_id: userId,
    name: conversation.name,
    type: conversation.type,
    extra: JSON.stringify(conversation.extra),
    model: 'model' in conversation ? JSON.stringify(conversation.model) : undefined,
    status: conversation.status,
    source: conversation.source,
    created_at: conversation.createTime,
    updated_at: conversation.modifyTime,
  };
}

/**
 * Convert database row to TChatConversation
 */
export function rowToConversation(row: IConversationRow): TChatConversation {
  const base = {
    id: row.id,
    name: row.name,
    desc: undefined as string | undefined,
    createTime: row.created_at,
    modifyTime: row.updated_at,
    status: row.status,
    source: row.source,
  };

  // Gemini type has model field
  if (row.type === 'gemini' && row.model) {
    return {
      ...base,
      type: 'gemini' as const,
      extra: JSON.parse(row.extra),
      model: JSON.parse(row.model),
    } as TChatConversation;
  }

  // ACP type
  if (row.type === 'acp') {
    return {
      ...base,
      type: 'acp' as const,
      extra: JSON.parse(row.extra),
    } as TChatConversation;
  }

  // Codex type
  return {
    ...base,
    type: 'codex' as const,
    extra: JSON.parse(row.extra),
  } as TChatConversation;
}

/**
 * Convert TMessage to database row
 */
export function messageToRow(message: TMessage): IMessageRow {
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    msg_id: message.msg_id,
    type: message.type,
    content: JSON.stringify(message.content),
    position: message.position,
    status: message.status,
    created_at: message.createdAt || Date.now(),
  };
}

/**
 * Convert database row to TMessage
 */
export function rowToMessage(row: IMessageRow): TMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    msg_id: row.msg_id,
    type: row.type as TMessage['type'],
    content: JSON.parse(row.content),
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
  } as TMessage;
}

/**
 * ======================
 * Export type aliases for convenience
 * ======================
 */

export type {
  IConfigStorageRefer,
  // Reused business types
  TChatConversation,
  TMessage,
};
