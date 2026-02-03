/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Core Management Layer
export { default as CodexAgentManager } from '@process/task/CodexAgentManager';
export { CodexAgent, type CodexAgentConfig } from './core/CodexAgent';
// Export the app configuration function for use in main process
export { setAppConfig as setCodexAgentAppConfig } from '../../common/utils/appConfig';

// Connection Layer
export { CodexConnection, type CodexEventEnvelope, type NetworkError } from './connection/CodexConnection';

// Handlers Layer
export { CodexEventHandler } from './handlers/CodexEventHandler';
export { CodexFileOperationHandler, type FileOperation } from './handlers/CodexFileOperationHandler';
export { CodexSessionManager, type CodexSessionConfig } from './handlers/CodexSessionManager';

// Messaging Layer
export { type ICodexMessageEmitter } from './messaging/CodexMessageEmitter';
export { CodexMessageProcessor } from './messaging/CodexMessageProcessor';

// Tools Layer
export { OutputFormat, RendererType, ToolCategory, ToolRegistry, type McpToolInfo, type ToolAvailability, type ToolCapabilities, type ToolDefinition, type ToolRenderer } from '@/common/codex/utils';
export { CodexToolHandlers } from './handlers/CodexToolHandlers';
