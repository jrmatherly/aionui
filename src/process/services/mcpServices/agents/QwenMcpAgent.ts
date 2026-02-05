/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import type { IMcpServer } from '../../../../common/storage';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';

const execAsync = promisify(exec);

/**
 * Qwen Code MCP Agent Implementation
 * Note: Qwen CLI currently only supports stdio transport type, does not support SSE/HTTP/streamable_http
 */
export class QwenMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('qwen');
  }

  getSupportedTransports(): string[] {
    return ['stdio'];
  }

  /**
   * Detect Qwen Code MCP configuration
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // Try to get MCP configuration via Qwen CLI command
        const { stdout: result } = await execAsync('qwen mcp list', { timeout: this.timeout });

        // If no MCP servers are configured, return empty array
        if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
          console.log('[QwenMcpAgent] No MCP servers configured');
          return [];
        }

        // Parse text output
        const mcpServers: IMcpServer[] = [];
        const lines = result.split('\n');

        for (const line of lines) {
          // Remove ANSI color codes
          // eslint-disable-next-line no-control-regex
          const cleanLine = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
          // Find format like: "✓ filesystem: npx @modelcontextprotocol/server-filesystem /path (stdio) - Connected"
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
                console.warn(`[QwenMcpAgent] Failed to get tools for ${name.trim()}:`, error);
                // If getting tools fails, continue with empty array
              }
            }

            mcpServers.push({
              id: `qwen_${name.trim()}`,
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
                            description: `Detected from Qwen CLI`,
                          }
                        : {
                            url: commandStr.trim(),
                            type: transportType,
                            description: `Detected from Qwen CLI`,
                          },
                  },
                },
                null,
                2
              ),
            });
          }
        }

        console.log(`[QwenMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        console.warn('[QwenMcpAgent] Failed to get Qwen Code MCP config:', error);
        return [];
      }
    };

    // Use named function for better logging
    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * Install MCP servers to Qwen Code agent
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // Use Qwen CLI to add MCP server
            // Format: qwen mcp add <name> <command> [args...]
            const args = server.transport.args?.join(' ') || '';
            const envArgs = Object.entries(server.transport.env || {})
              .map(([key, value]) => `--env ${key}=${value}`)
              .join(' ');

            let command = `qwen mcp add "${server.name}" "${server.transport.command}"`;
            if (args) {
              command += ` ${args}`;
            }
            if (envArgs) {
              command += ` ${envArgs}`;
            }

            // Add scope parameter, prefer user scope
            command += ' -s user';

            try {
              await execAsync(command, { timeout: 5000 });
            } catch (error) {
              console.warn(`Failed to add MCP ${server.name} to Qwen Code:`, error);
            }
          } else {
            console.warn(`Skipping ${server.name}: Qwen CLI only supports stdio transport type`);
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
   * Remove MCP server from Qwen Code agent
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // Use Qwen CLI command to remove MCP server (try different scopes)
        // First try user scope (consistent with installation), then try project scope
        try {
          const removeCommand = `qwen mcp remove "${mcpServerName}" -s user`;
          const result = await execAsync(removeCommand, { timeout: 5000 });

          // Check if output indicates successful removal
          if (result.stdout && result.stdout.includes('removed from user settings')) {
            return { success: true };
          } else if (result.stdout && result.stdout.includes('not found in user')) {
            // Server not in user scope, try project scope
            throw new Error('Server not found in user settings');
          } else {
            // Other cases considered success (backward compatible)
            return { success: true };
          }
        } catch (userError) {
          // User scope failed, try project scope
          try {
            const removeCommand = `qwen mcp remove "${mcpServerName}" -s project`;
            const result = await execAsync(removeCommand, { timeout: 5000 });

            // Check if output indicates successful removal
            if (result.stdout && result.stdout.includes('removed from project settings')) {
              return { success: true };
            } else if (result.stdout && result.stdout.includes('not found in project')) {
              // Server not in project scope, try config file
              throw new Error('Server not found in project settings');
            } else {
              // Other cases considered success (backward compatible)
              return { success: true };
            }
          } catch (projectError) {
            // All CLI commands failed, try direct config file manipulation as fallback
            const configPath = join(homedir(), '.qwen', 'client_config.json');

            try {
              const config = JSON.parse(readFileSync(configPath, 'utf-8'));
              if (config.mcpServers && config.mcpServers[mcpServerName]) {
                delete config.mcpServers[mcpServerName];
                writeFileSync(configPath, JSON.stringify(config, null, 2));
              }
              return { success: true };
            } catch (fileError) {
              // File doesn't exist or can't be read — considered already removed
              const errCode = (fileError as NodeJS.ErrnoException).code;
              if (errCode !== 'ENOENT') {
                console.warn(`Failed to update config file ${configPath}:`, fileError);
              }
              return { success: true };
            }
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
