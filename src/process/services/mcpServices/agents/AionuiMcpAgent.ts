/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '../../../../common/storage';
import { ProcessConfig } from '../../../initStorage';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';

/**
 * AionUi Local MCP Agent Implementation
 *
 * Specifically used to manage MCP configuration for the local Gemini CLI running via @office-ai/aioncli-core
 *
 * How it works:
 * 1. MCP configuration is stored in ProcessConfig's 'mcp.config'
 * 2. GeminiAgentManager reads from mcp.config at startup and converts to @office-ai/aioncli-core format
 * 3. @office-ai/aioncli-core uses these MCP servers at runtime
 *
 * Difference from other ACP Backend MCP Agents:
 * - ACP Backend Agents: Manage MCP configuration for real CLI tools (e.g., claude mcp, qwen mcp commands)
 * - AionuiMcpAgent: Manage runtime MCP configuration for AionUi's local @office-ai/aioncli-core
 */
export class AionuiMcpAgent extends AbstractMcpAgent {
  constructor() {
    // Use 'aionui' as backend type to distinguish from real Gemini CLI
    // Although configuration is ultimately used by GeminiAgentManager, it's an independent agent at the MCP management level
    super('aionui');
  }

  getSupportedTransports(): string[] {
    // @office-ai/aioncli-core supports stdio, sse, http
    // Reference: node_modules/@office-ai/aioncli-core/dist/src/config/config.d.ts -> MCPServerConfig
    return ['stdio', 'sse', 'http'];
  }

  /**
   * Detect MCP configuration managed by AionUi
   * Read from ProcessConfig's unified configuration
   */
  async detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      const mcpConfig = await ProcessConfig.get('mcp.config');
      if (!mcpConfig || !Array.isArray(mcpConfig)) {
        return [];
      }

      // Return all configured MCP servers
      // Filter to transport types supported by @office-ai/aioncli-core
      return mcpConfig.filter((server: IMcpServer) => {
        const supportedTypes = this.getSupportedTransports();
        return supportedTypes.includes(server.transport.type);
      });
    } catch (error) {
      console.warn('[AionuiMcpAgent] Failed to detect MCP servers:', error);
      return [];
    }
  }

  /**
   * Install MCP servers to AionUi configuration
   * Actually merges configuration into ProcessConfig's unified configuration
   */
  async installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    try {
      // Read current configuration
      const currentConfig = (await ProcessConfig.get('mcp.config')) || [];
      const existingServers = Array.isArray(currentConfig) ? currentConfig : [];

      // Merge new servers (deduplicate by name as key)
      const serverMap = new Map<string, IMcpServer>();

      // Add existing servers first
      existingServers.forEach((server: IMcpServer) => {
        serverMap.set(server.name, server);
      });

      // Add or update new servers
      mcpServers.forEach((server) => {
        // Only install supported transport types
        if (this.getSupportedTransports().includes(server.transport.type)) {
          serverMap.set(server.name, {
            ...server,
            updatedAt: Date.now(),
          });
        } else {
          console.warn(`[AionuiMcpAgent] Skipping ${server.name}: unsupported transport type ${server.transport.type}`);
        }
      });

      // Convert back to array and save
      const mergedServers = Array.from(serverMap.values());
      await ProcessConfig.set('mcp.config', mergedServers);

      console.log('[AionuiMcpAgent] Installed MCP servers:', mcpServers.map((s) => s.name).join(', '));
      return { success: true };
    } catch (error) {
      console.error('[AionuiMcpAgent] Failed to install MCP servers:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Remove MCP server from AionUi configuration
   *
   * Note: AionUi's MCP configuration is managed uniformly by the frontend (renderer layer)
   * No operation is performed here because:
   * 1. When toggle is turned off: Frontend has already set enabled: false, no need for backend to modify again
   * 2. When deleting a server: Frontend has already removed it from configuration, no need for backend to delete again
   *
   * AionuiMcpAgent is only responsible for reading configuration (detectMcpServers) and adding configuration (installMcpServers),
   * should not modify configuration in the remove flow to avoid conflicts with frontend configuration management
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    console.log(`[AionuiMcpAgent] Skip removing '${mcpServerName}' - config managed by renderer`);
    return Promise.resolve({ success: true });
  }
}
