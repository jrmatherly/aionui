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

const execAsync = promisify(exec);

/**
 * iFlow CLI MCP agent implementation
 * Note: iFlow CLI supports stdio, SSE, HTTP transport types and headers, but does not support streamable_http
 */
export class IflowMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('iflow');
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'sse', 'http'];
  }

  /**
   * Detect iFlow CLI MCP configuration (internal implementation, without lock)
   */
  private async detectMcpServersInternal(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      // Use iFlow CLI list command to get MCP configuration
      const { stdout: result } = await execAsync('iflow mcp list', { timeout: this.timeout });

      // If no MCP servers are configured, return empty array
      if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
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
        // Find format like: "✓ Bazi: npx bazi-mcp (stdio) - Connected" or Chinese locale output with status text
        const match = cleanLine.match(/[✓✗]\s+([^:]+):\s+(.+?)\s+\(([^)]+)\)\s*-\s*(Connected|Disconnected|已连接|已断开)/);
        if (match) {
          const [, name, commandStr, transport, statusRaw] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          // Map Chinese status to English
          const status = statusRaw === '已连接' ? 'Connected' : statusRaw === '已断开' ? 'Disconnected' : statusRaw;

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

          // Try to get tools information (for all connected servers)
          let tools: Array<{ name: string; description?: string }> = [];
          if (status === 'Connected') {
            try {
              const testResult = await this.testMcpConnection(transportObj);
              tools = testResult.tools || [];
            } catch (error) {
              console.warn(`[IflowMcpAgent] Failed to get tools for ${name.trim()}:`, error);
              // If getting tools fails, continue with empty array
            }
          }

          mcpServers.push({
            id: `iflow_${name.trim()}`,
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
                          description: `Detected from iFlow CLI`,
                        }
                      : {
                          url: commandStr.trim(),
                          type: transportType,
                          description: `Detected from iFlow CLI`,
                        },
                },
              },
              null,
              2
            ),
          });
        }
      }

      console.log(`[IflowMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
      return mcpServers;
    } catch (error) {
      console.warn('[IflowMcpAgent] Failed to get iFlow CLI MCP config:', error);
      return [];
    }
  }

  /**
   * Detect iFlow CLI MCP configuration (public interface, with lock)
   */
  detectMcpServers(cliPath?: string): Promise<IMcpServer[]> {
    return this.withLock(() => this.detectMcpServersInternal(cliPath));
  }

  /**
   * Install MCP servers to iFlow agent
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        // Get current configured iFlow MCP server list (using internal method to avoid deadlock)
        const existingServers = await this.detectMcpServersInternal();
        const existingServerNames = new Set(existingServers.map((s) => s.name));

        // Add each enabled MCP server to iFlow configuration
        for (const server of mcpServers.filter((s) => s.enabled)) {
          // Skip servers that already exist
          if (existingServerNames.has(server.name)) {
            continue;
          }

          if (server.transport.type === 'streamable_http') {
            console.warn(`Skipping ${server.name}: iFlow CLI does not support streamable_http transport type`);
            continue;
          }

          try {
            let addCommand = `iflow mcp add "${server.name}"`;

            // Build command based on transport type
            if (server.transport.type === 'stdio' && 'command' in server.transport) {
              addCommand += ` "${server.transport.command}"`;
              if (server.transport.args && server.transport.args.length > 0) {
                addCommand += ` ${server.transport.args.map((arg: string) => `"${arg}"`).join(' ')}`;
              }
              addCommand += ' --transport stdio';

              // Add environment variables (stdio only)
              if (server.transport.env) {
                for (const [key, value] of Object.entries(server.transport.env)) {
                  addCommand += ` --env ${key}="${value}"`;
                }
              }
            } else if ((server.transport.type === 'sse' || server.transport.type === 'http') && 'url' in server.transport) {
              addCommand += ` "${server.transport.url}"`;
              addCommand += ` --transport ${server.transport.type}`;

              // Add headers support
              if (server.transport.headers) {
                for (const [key, value] of Object.entries(server.transport.headers)) {
                  addCommand += ` -H "${key}: ${value}"`;
                }
              }
            }

            // Add description
            if (server.description) {
              addCommand += ` --description "${server.description}"`;
            }

            // Add scope parameter, use user scope
            addCommand += ' -s user';

            // Execute add command
            await execAsync(addCommand, { timeout: 10000 });
          } catch (error) {
            console.warn(`Failed to add MCP server ${server.name} to iFlow:`, error);
            // Continue processing other servers, don't stop the entire process due to one failure
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
   * Remove MCP server from iFlow agent
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // Use iFlow CLI remove command to delete MCP server (try different scopes)
        // First try user scope (consistent with installation), then try project scope
        try {
          const removeCommand = `iflow mcp remove "${mcpServerName}" -s user`;
          await execAsync(removeCommand, { timeout: 5000 });
          return { success: true };
        } catch (userError) {
          // User scope failed, try project scope
          try {
            const removeCommand = `iflow mcp remove "${mcpServerName}" -s project`;
            const { stdout } = await execAsync(removeCommand, { timeout: 5000 });

            // Check if output contains "not found", if so continue trying user scope
            if (stdout && stdout.includes('not found')) {
              throw new Error('Server not found in project settings');
            }

            return { success: true };
          } catch (projectError) {
            // If server doesn't exist, also consider it successful
            if (userError instanceof Error && (userError.message.includes('not found') || userError.message.includes('does not exist'))) {
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
