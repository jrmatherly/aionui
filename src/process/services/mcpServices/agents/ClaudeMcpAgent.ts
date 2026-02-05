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
 * Claude Code MCP agent implementation
 * Note: Claude CLI currently only supports stdio transport type, does not support SSE/HTTP/streamable_http
 */
export class ClaudeMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('claude');
  }

  getSupportedTransports(): string[] {
    return ['stdio'];
  }

  /**
   * Detect Claude Code MCP configuration
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // Use Claude Code CLI command to get MCP configuration
        const { stdout: result } = await execAsync('claude mcp list', {
          timeout: this.timeout,
          env: { ...process.env, NODE_OPTIONS: '' }, // Clear debug options to avoid debugger attachment
        });

        // If no MCP servers are configured, return empty array
        if (result.includes('No MCP servers configured') || !result.trim()) {
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

          // Match format like: "12306-mcp: npx -y 12306-mcp - ✓ Connected" or "12306-mcp: npx -y 12306-mcp - ✗ Failed to connect"
          // Supports multiple status texts
          const match = cleanLine.match(/^([^:]+):\s+(.+?)\s*-\s*[✓✗]\s*(.+)$/);
          if (match) {
            const [, name, commandStr, statusText] = match;
            const commandParts = commandStr.trim().split(/\s+/);
            const command = commandParts[0];
            const args = commandParts.slice(1);

            // Parse status: Connected, Disconnected, Failed to connect, etc.
            const isConnected = statusText.toLowerCase().includes('connected') && !statusText.toLowerCase().includes('disconnect');
            const status = isConnected ? 'connected' : 'disconnected';

            // Build transport object
            const transportObj = {
              type: 'stdio' as const,
              command: command,
              args: args,
              env: {},
            };

            // Try to get tools info (for all connected servers)
            let tools: Array<{ name: string; description?: string }> = [];
            if (isConnected) {
              try {
                const testResult = await this.testMcpConnection(transportObj);
                tools = testResult.tools || [];
              } catch (error) {
                log.warn({ err: error }, `Failed to get tools for ${name.trim()}`);
                // If getting tools fails, continue with empty array
              }
            }

            mcpServers.push({
              id: `claude_${name.trim()}`,
              name: name.trim(),
              transport: transportObj,
              tools: tools,
              enabled: true,
              status: status,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              description: '',
              originalJson: JSON.stringify(
                {
                  mcpServers: {
                    [name.trim()]: {
                      command: command,
                      args: args,
                      description: `Detected from Claude CLI`,
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
        return mcpServers;
      } catch (error) {
        log.warn({ err: error }, 'Failed to detect MCP servers');
        return [];
      }
    };

    // Use named function for display in logs
    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * Install MCP servers to Claude Code agent
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // Use Claude Code CLI to add MCP server to user scope (global configuration)
            // AionUi is a global tool, MCP configuration should be available for all projects
            // Format: claude mcp add -s user <name> <command> -- [args...] [env_options]
            const envArgs = Object.entries(server.transport.env || {})
              .map(([key, value]) => `-e ${key}=${value}`)
              .join(' ');

            let command = `claude mcp add -s user "${server.name}" "${server.transport.command}"`;

            // If there are args or env vars, use -- separator
            if (server.transport.args?.length || Object.keys(server.transport.env || {}).length) {
              command += ' --';
              if (server.transport.args?.length) {
                // Quote each argument properly to prevent args with special characters from being misparsed
                const quotedArgs = server.transport.args.map((arg: string) => `"${arg}"`).join(' ');
                command += ` ${quotedArgs}`;
              }
            }

            // Add environment variables after --
            if (envArgs) {
              command += ` ${envArgs}`;
            }

            try {
              await execAsync(command, {
                timeout: 5000,
                env: { ...process.env, NODE_OPTIONS: '' }, // Clear debug options to avoid debugger attachment
              });
              log.info(`Added MCP server: ${server.name}`);
            } catch (error) {
              log.warn({ err: error }, `Failed to add MCP ${server.name} to Claude Code`);
              // Continue processing other servers, don't stop for one failure
            }
          } else {
            log.warn(`Skipping ${server.name}: Claude CLI only supports stdio transport type`);
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
   * Remove MCP server from Claude Code agent
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // Use Claude CLI command to remove MCP server (try different scopes)
        // Try in order: user (AionUi default) -> local -> project
        // user scope takes priority since AionUi installs to user scope
        const scopes = ['user', 'local', 'project'] as const;

        for (const scope of scopes) {
          try {
            const removeCommand = `claude mcp remove -s ${scope} "${mcpServerName}"`;
            const result = await execAsync(removeCommand, {
              timeout: 5000,
              env: { ...process.env, NODE_OPTIONS: '' }, // Clear debug options to avoid debugger attachment
            });

            // Check if removal was successful
            if (result.stdout && result.stdout.includes('removed')) {
              log.info(`Removed MCP server from ${scope} scope: ${mcpServerName}`);
              return { success: true };
            }

            // If no "removed" message but no error either, server may not exist in this scope
            // Continue trying next scope
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // If it's a "not found" error, continue trying next scope
            if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
              continue;
            }

            // Other errors, log but continue trying
            log.warn({ err: errorMessage }, `Failed to remove from ${scope} scope`);
          }
        }

        // If all scopes have been tried, consider removal successful (server may not have existed)
        log.info(`MCP server ${mcpServerName} not found in any scope (may already be removed)`);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
