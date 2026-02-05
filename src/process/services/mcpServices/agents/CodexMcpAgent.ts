/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/storage';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import { mcpLogger as log } from '@/common/logger';

const execAsync = promisify(exec);

/**
 * Codex CLI MCP Agent Implementation
 *
 * Uses the Codex CLI's mcp subcommand to manage MCP server configuration
 * Note: Codex CLI currently only supports stdio transport type
 */
export class CodexMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('codex');
  }

  getSupportedTransports(): string[] {
    // Codex CLI currently only supports stdio transport type
    return ['stdio'];
  }

  /**
   * Detect Codex CLI MCP configuration
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // Use Codex CLI command to get MCP configuration
        const { stdout: result } = await execAsync('codex mcp list', { timeout: this.timeout });

        // If no MCP servers are configured, return empty array
        if (result.includes('No MCP servers configured') || !result.trim()) {
          return [];
        }

        // Parse table format output
        // Example format:
        // Name  Command  Args      Env
        // Bazi  npx      bazi-mcp  -
        const mcpServers: IMcpServer[] = [];
        const lines = result.split('\n');

        // Skip header row (first line)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // Remove ANSI color codes
          // eslint-disable-next-line no-control-regex
          const cleanLine = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();

          if (!cleanLine) continue;

          // Use regex to parse table columns (separated by multiple spaces)
          const parts = cleanLine.split(/\s{2,}/);
          if (parts.length < 2) continue;

          const name = parts[0].trim();
          const command = parts[1].trim();
          const argsStr = parts[2]?.trim() || '';
          const envStr = parts[3]?.trim() || '';

          // Parse args (if "-" it means no arguments)
          const args = argsStr === '-' ? [] : argsStr.split(/\s+/);

          // Parse env (if "-" it means no environment variables)
          const env: Record<string, string> = {};
          if (envStr && envStr !== '-') {
            // Environment variable format may be KEY=VALUE
            const envPairs = envStr.split(/\s+/);
            for (const pair of envPairs) {
              const [key, value] = pair.split('=');
              if (key && value) {
                env[key] = value;
              }
            }
          }

          // Try to get tools info (for all server types)
          let tools: Array<{ name: string; description?: string }> = [];
          try {
            const testResult = await this.testMcpConnection({
              type: 'stdio',
              command: command,
              args: args,
              env: env,
            });
            tools = testResult.tools || [];
          } catch (error) {
            log.warn({ err: error }, `Failed to get tools for ${name}`);
          }

          mcpServers.push({
            id: `codex_${name}`,
            name: name,
            transport: {
              type: 'stdio',
              command: command,
              args: args,
              env: env,
            },
            tools: tools,
            enabled: true,
            status: tools.length > 0 ? 'connected' : 'disconnected',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
            originalJson: JSON.stringify(
              {
                mcpServers: {
                  [name]: {
                    command: command,
                    args: args,
                    description: `Detected from Codex CLI`,
                  },
                },
              },
              null,
              2
            ),
          });
        }

        log.info(`Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        log.warn({ err: error }, 'Failed to get Codex MCP config');
        return [];
      }
    };

    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * Install MCP servers to Codex CLI
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // Use Codex CLI to add MCP server
            // Format: codex mcp add <NAME> <COMMAND> [ARGS]... [--env KEY=VALUE]
            const args = server.transport.args || [];
            const envArgs = Object.entries(server.transport.env || {}).map(([key, value]) => `--env ${key}=${value}`);

            // Build command array
            const commandParts = ['codex', 'mcp', 'add', server.name, server.transport.command, ...args, ...envArgs];

            // Convert command array to shell command string
            const command = commandParts.map((part) => `"${part}"`).join(' ');

            try {
              await execAsync(command, { timeout: 5000 });
              log.info(`Added MCP server: ${server.name}`);
            } catch (error) {
              log.warn({ err: error }, `Failed to add MCP ${server.name} to Codex`);
              // Continue processing other servers, don't stop for one failure
            }
          } else {
            log.warn(`Skipping ${server.name}: Codex CLI only supports stdio transport type`);
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
   * Remove MCP server from Codex CLI
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // Use Codex CLI command to remove MCP server
        const removeCommand = `codex mcp remove "${mcpServerName}"`;

        try {
          const result = await execAsync(removeCommand, { timeout: 5000 });

          // Check output to confirm successful removal
          if (result.stdout && (result.stdout.includes('removed') || result.stdout.includes('Removed'))) {
            log.info(`Removed MCP server: ${mcpServerName}`);
            return { success: true };
          } else if (result.stdout && (result.stdout.includes('not found') || result.stdout.includes('No such server'))) {
            // Server doesn't exist, also consider it success
            log.info(`MCP server '${mcpServerName}' not found, nothing to remove`);
            return { success: true };
          } else {
            // Other cases considered success (backward compatible)
            return { success: true };
          }
        } catch (cmdError) {
          // If command execution fails, check if it's because server doesn't exist
          if (cmdError instanceof Error && (cmdError.message.includes('not found') || cmdError.message.includes('does not exist'))) {
            return { success: true };
          }
          return { success: false, error: cmdError instanceof Error ? cmdError.message : String(cmdError) };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
