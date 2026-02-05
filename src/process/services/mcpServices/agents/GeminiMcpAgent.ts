/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { IMcpServer } from '../../../../common/storage';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import { mcpLogger as log } from '@/common/logger';

const execAsync = promisify(exec);

/**
 * Google Gemini CLI MCP Agent Implementation
 *
 * Uses the official Google Gemini CLI's mcp subcommand to manage MCP server configuration
 * Note: This manages the real Google Gemini CLI, not @office-ai/aioncli-core
 */
export class GeminiMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('gemini');
  }

  getSupportedTransports(): string[] {
    // Google Gemini CLI supports stdio, sse, http transport types
    return ['stdio', 'sse', 'http'];
  }

  /**
   * Detect Google Gemini CLI MCP configuration
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt === 1) {
            log.info('Starting MCP detection...');
          } else {
            log.info(`Retrying detection (attempt ${attempt}/${maxRetries})...`);
            // If not the first attempt, add a short delay to avoid conflicts with other operations
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          // Use Gemini CLI command to get MCP configuration
          const { stdout: result } = await execAsync('gemini mcp list', { timeout: this.timeout });

          // If no MCP servers are configured, return empty array
          if (result.includes('No MCP servers configured') || !result.trim()) {
            log.info('No MCP servers configured');
            return [];
          }

          // Parse text output
          const mcpServers: IMcpServer[] = [];
          const lines = result.split('\n');

          for (const line of lines) {
            // Remove ANSI color codes (supports multiple formats)
            /* eslint-disable no-control-regex */
            const cleanLine = line
              .replace(/\u001b\[[0-9;]*m/g, '')
              .replace(/\[[0-9;]*m/g, '')
              .trim();
            /* eslint-enable no-control-regex */

            // Find format like: "✓ 12306-mcp: npx -y 12306-mcp (stdio) - Connected"
            const match = cleanLine.match(/[✓✗]\s+([^:]+):\s+(.+?)\s+\(([^)]+)\)\s*-\s*(Connected|Disconnected)/);
            if (match) {
              const [, name, commandStr, transport, status] = match;
              const commandParts = commandStr.trim().split(/\s+/);
              const command = commandParts[0];
              const args = commandParts.slice(1);

              const transportType = transport as 'stdio' | 'sse' | 'http';

              // Build transport object
              const transportObj: any =
                transportType === 'stdio'
                  ? {
                      type: 'stdio',
                      command: command,
                      args: args,
                      env: {},
                    }
                  : transportType === 'sse'
                    ? {
                        type: 'sse',
                        url: commandStr.trim(),
                      }
                    : {
                        type: 'http',
                        url: commandStr.trim(),
                      };

              // Try to get tools info (for all connected servers)
              let tools: Array<{ name: string; description?: string }> = [];
              if (status === 'Connected') {
                try {
                  const testResult = await this.testMcpConnection(transportObj);
                  tools = testResult.tools || [];
                } catch (error) {
                  log.warn({ err: error }, `Failed to get tools for ${name.trim()}`);
                }
              }

              mcpServers.push({
                id: `gemini_${name.trim()}`,
                name: name.trim(),
                transport: transportObj,
                tools: tools,
                enabled: true,
                status: status === 'Connected' ? 'connected' : 'disconnected',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                description: '',
                originalJson: JSON.stringify(
                  {
                    mcpServers: {
                      [name.trim()]:
                        transportType === 'stdio'
                          ? {
                              command: command,
                              args: args,
                              description: `Detected from Google Gemini CLI`,
                            }
                          : {
                              url: commandStr.trim(),
                              type: transportType,
                              description: `Detected from Google Gemini CLI`,
                            },
                    },
                  },
                  null,
                  2
                ),
              });
            }
          }

          log.info(`Detection complete: found ${mcpServers.length} server(s)`);

          // Validate result: if output contains "Configured MCP servers:" but no servers detected, it may be truncated
          const hasConfigHeader = result.includes('Configured MCP servers:');
          const hasServerLines = lines.some((line) => line.match(/[✓✗]\s+[^:]+:/));

          if (hasConfigHeader && hasServerLines && mcpServers.length === 0) {
            throw new Error('Output appears truncated: found server markers but parsed 0 servers');
          }

          // Success, return result
          return mcpServers;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          log.warn({ attempt, error: lastError.message }, `Detection attempt ${attempt} failed`);

          // If there are retry attempts remaining, continue to next attempt
          if (attempt < maxRetries) {
            continue;
          }
        }
      }

      // All retry attempts failed
      log.warn({ err: lastError }, 'All detection attempts failed. Last error');
      return [];
    };

    // Use named function for better logging
    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * Install MCP servers to Google Gemini CLI
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // Use Gemini CLI to add MCP server
            // Format: gemini mcp add <name> <command> [args...]
            const args = server.transport.args?.join(' ') || '';
            let command = `gemini mcp add "${server.name}" "${server.transport.command}"`;
            if (args) {
              command += ` ${args}`;
            }

            // Add scope parameter (user or project)
            command += ' -s user';

            try {
              await execAsync(command, { timeout: 5000 });
              log.info(`Added MCP server: ${server.name}`);
            } catch (error) {
              log.warn({ err: error }, `Failed to add MCP ${server.name} to Gemini`);
              // Continue processing other servers
            }
          } else if (server.transport.type === 'sse' || server.transport.type === 'http') {
            // Handle SSE/HTTP transport types
            let command = `gemini mcp add "${server.name}" "${server.transport.url}"`;

            // Add transport type
            command += ` --transport ${server.transport.type}`;

            // Add scope parameter
            command += ' -s user';

            try {
              await execAsync(command, { timeout: 5000 });
              log.info(`Added MCP server: ${server.name}`);
            } catch (error) {
              log.warn({ err: error }, `Failed to add MCP ${server.name} to Gemini`);
            }
          } else {
            log.warn(`Skipping ${server.name}: Gemini CLI does not support ${server.transport.type} transport type`);
          }
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(installOperation, 'name', { value: 'installMcpServers' });
    return this.withLock(installOperation);
  }

  /**
   * Remove MCP server from Google Gemini CLI
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // Use Gemini CLI command to remove MCP server
        // First try user scope
        try {
          const removeCommand = `gemini mcp remove "${mcpServerName}" -s user`;
          const result = await execAsync(removeCommand, { timeout: 5000 });

          if (result.stdout && result.stdout.includes('removed')) {
            log.info(`Removed MCP server: ${mcpServerName}`);
            return { success: true };
          } else if (result.stdout && result.stdout.includes('not found')) {
            // Try project scope
            throw new Error('Server not found in user scope');
          } else {
            return { success: true };
          }
        } catch (userError) {
          // Try project scope
          try {
            const removeCommand = `gemini mcp remove "${mcpServerName}" -s project`;
            const result = await execAsync(removeCommand, { timeout: 5000 });

            if (result.stdout && result.stdout.includes('removed')) {
              log.info(`Removed MCP server from project: ${mcpServerName}`);
              return { success: true };
            } else {
              // Server doesn't exist, also consider it success
              return { success: true };
            }
          } catch (projectError) {
            // If server doesn't exist, also consider it success
            if (userError instanceof Error && userError.message.includes('not found')) {
              return { success: true };
            }
            return { success: false, error: userError instanceof Error ? userError.message : String(userError) };
          }
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
