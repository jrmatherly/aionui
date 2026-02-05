/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/storage';
import type { AcpBackendAll } from '@/types/acpTypes';
import { JSONRPC_VERSION } from '@/types/acpTypes';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { exec } from 'child_process';
import { app } from 'electron';
import { promisify } from 'util';
import { mcpLogger as log } from '@/common/logger';

/**
 * MCP source type - includes all ACP backends and AionUi built-in
 */
export type McpSource = AcpBackendAll | 'aionui';

/**
 * MCP operation result interface
 */
export interface McpOperationResult {
  success: boolean;
  error?: string;
}

/**
 * MCP connection test result interface
 */
export interface McpConnectionTestResult {
  success: boolean;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
  needsAuth?: boolean; // Whether OAuth authentication is required
  authMethod?: 'oauth' | 'basic'; // Authentication method
  wwwAuthenticate?: string; // WWW-Authenticate header content
}

/**
 * MCP detection result interface
 */
export interface DetectedMcpServer {
  source: McpSource;
  servers: IMcpServer[];
}

/**
 * MCP sync result interface
 */
export interface McpSyncResult {
  success: boolean;
  results: Array<{
    agent: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * MCP protocol interface - defines standard protocol for MCP operations
 */
export interface IMcpProtocol {
  /**
   * Detect MCP configuration
   * @param cliPath Optional CLI path
   * @returns MCP server list
   */
  detectMcpServers(cliPath?: string): Promise<IMcpServer[]>;

  /**
   * Install MCP servers to agent
   * @param mcpServers List of MCP servers to install
   * @returns Operation result
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult>;

  /**
   * Remove MCP server from agent
   * @param mcpServerName Name of the MCP server to remove
   * @returns Operation result
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult>;

  /**
   * Test MCP server connection
   * @param server MCP server configuration
   * @returns Connection test result
   */
  testMcpConnection(server: IMcpServer): Promise<McpConnectionTestResult>;

  /**
   * Get supported transport types
   * @returns List of supported transport types
   */
  getSupportedTransports(): string[];

  /**
   * Get agent backend type
   * @returns Agent backend type
   */
  getBackendType(): McpSource;
}

/**
 * MCP protocol abstract base class
 */
export abstract class AbstractMcpAgent implements IMcpProtocol {
  protected readonly backend: McpSource;
  protected readonly timeout: number;
  private operationQueue: Promise<any> = Promise.resolve();

  constructor(backend: McpSource, timeout: number = 30000) {
    this.backend = backend;
    this.timeout = timeout;
  }

  /**
   * Mutex lock to ensure serial execution of operations
   */
  protected withLock<T>(operation: () => Promise<T>): Promise<T> {
    const currentQueue = this.operationQueue;
    const operationName = operation.name || 'anonymous operation';

    // Create a new Promise that waits for the previous operation to complete
    const newOperation = currentQueue
      .then(() => operation())
      .catch((error) => {
        log.warn({ err: error }, `[${this.backend} MCP] ${operationName} failed`);
        // Even if the operation fails, continue executing the next operation in the queue
        throw error;
      });

    // Update queue (ignore errors to ensure queue continues)
    this.operationQueue = newOperation.catch(() => {
      // Empty catch to prevent unhandled rejection
    });

    return newOperation;
  }

  abstract detectMcpServers(cliPath?: string): Promise<IMcpServer[]>;

  abstract installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult>;

  abstract removeMcpServer(mcpServerName: string): Promise<McpOperationResult>;

  abstract getSupportedTransports(): string[];

  getBackendType(): McpSource {
    return this.backend;
  }

  /**
   * Generic implementation for testing MCP server connection
   * @param serverOrTransport Full server configuration or transport configuration only
   */
  testMcpConnection(serverOrTransport: IMcpServer | IMcpServer['transport']): Promise<McpConnectionTestResult> {
    try {
      // Determine if it's a full IMcpServer or just transport
      const transport = 'transport' in serverOrTransport ? serverOrTransport.transport : serverOrTransport;

      switch (transport.type) {
        case 'stdio':
          return this.testStdioConnection(transport);
        case 'sse':
          return this.testSseConnection(transport);
        case 'http':
          return this.testHttpConnection(transport);
        case 'streamable_http':
          return this.testStreamableHttpConnection(transport);
        default:
          return Promise.resolve({ success: false, error: 'Unsupported transport type' });
      }
    } catch (error) {
      return Promise.resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Generic implementation for testing Stdio connection
   * Uses MCP SDK for proper protocol communication
   */
  protected async testStdioConnection(
    transport: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    },
    retryCount: number = 0
  ): Promise<McpConnectionTestResult> {
    let mcpClient: Client | null = null;

    try {
      // app imported statically

      // Create Stdio transport layer
      const stdioTransport = new StdioClientTransport({
        command: transport.command,
        args: transport.args || [],
        env: { ...process.env, ...transport.env },
      });

      // Create MCP client
      mcpClient = new Client(
        {
          name: app.getName(),
          version: app.getVersion(),
        },
        {
          capabilities: {
            sampling: {},
          },
        }
      );

      // Connect to server and get tools list
      await mcpClient.connect(stdioTransport);
      const result = await mcpClient.listTools();

      const tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));

      return { success: true, tools };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Detect npm cache issue and auto-fix
      if (errorMessage.includes('ENOTEMPTY') && retryCount < 1) {
        try {
          // exec imported statically
          // promisify imported statically
          const execAsync = promisify(exec);

          // Clean npm cache and retry
          await Promise.race([execAsync('npm cache clean --force && rm -rf ~/.npm/_npx'), new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 10000))]);

          return await this.testStdioConnection(transport, retryCount + 1);
        } catch (cleanupError) {
          return {
            success: false,
            error: `npm cache corruption detected. Auto-cleanup failed, please manually run: npm cache clean --force`,
          };
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      // Clean up connection
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (closeError) {
          log.error({ err: closeError }, 'Error closing connection');
        }
      }
    }
  }

  /**
   * Generic implementation for testing SSE connection
   * Uses MCP SDK for proper protocol communication
   */
  protected async testSseConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    let mcpClient: Client | null = null;

    try {
      // app imported statically

      // First try a simple HTTP request to detect authentication requirements
      const authCheckResponse = await fetch(transport.url, {
        method: 'GET',
        headers: transport.headers || {},
      });

      // Check if authentication is required
      if (authCheckResponse.status === 401) {
        const wwwAuthenticate = authCheckResponse.headers.get('WWW-Authenticate');
        if (wwwAuthenticate) {
          return {
            success: false,
            needsAuth: true,
            authMethod: wwwAuthenticate.toLowerCase().includes('bearer') ? 'oauth' : 'basic',
            wwwAuthenticate: wwwAuthenticate,
            error: 'Authentication required',
          };
        }
      }

      // Create SSE transport layer
      const sseTransport = new SSEClientTransport(new URL(transport.url), {
        requestInit: {
          headers: transport.headers,
        },
      });

      // Create MCP client
      mcpClient = new Client(
        {
          name: app.getName(),
          version: app.getVersion(),
        },
        {
          capabilities: {
            sampling: {},
          },
        }
      );

      // Connect to server and get tools list
      await mcpClient.connect(sseTransport);
      const result = await mcpClient.listTools();

      const tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));

      return { success: true, tools };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if error message contains authentication-related information
      if (errorMessage.toLowerCase().includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
        return {
          success: false,
          needsAuth: true,
          error: 'Authentication required',
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      // Clean up connection
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (closeError) {
          log.error({ err: closeError }, 'Error closing connection');
        }
      }
    }
  }

  /**
   * Generic implementation for testing HTTP connection
   */
  protected async testHttpConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    try {
      // app imported statically

      const initResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...transport.headers,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            clientInfo: {
              name: app.getName(),
              version: app.getVersion(),
            },
          },
        }),
      });

      // Check if authentication is required
      if (initResponse.status === 401) {
        const wwwAuthenticate = initResponse.headers.get('WWW-Authenticate');
        if (wwwAuthenticate) {
          return {
            success: false,
            needsAuth: true,
            authMethod: wwwAuthenticate.toLowerCase().includes('bearer') ? 'oauth' : 'basic',
            wwwAuthenticate: wwwAuthenticate,
            error: 'Authentication required',
          };
        }
      }

      if (!initResponse.ok) {
        return { success: false, error: `HTTP ${initResponse.status}: ${initResponse.statusText}` };
      }

      const initResult = await initResponse.json();
      if (initResult.error) {
        return { success: false, error: initResult.error.message || 'Initialize failed' };
      }

      const toolsResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...transport.headers,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          method: 'tools/list',
          id: 2,
          params: {},
        }),
      });

      if (!toolsResponse.ok) {
        return { success: true, tools: [], error: `Could not fetch tools: HTTP ${toolsResponse.status}` };
      }

      const toolsResult = await toolsResponse.json();
      if (toolsResult.error) {
        return { success: true, tools: [], error: toolsResult.error.message || 'Tools list failed' };
      }

      const tools = toolsResult.result?.tools || [];
      return {
        success: true,
        tools: tools.map((tool: { name: string; description?: string }) => ({
          name: tool.name,
          description: tool.description,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Generic implementation for testing Streamable HTTP connection
   * Uses MCP SDK for proper protocol communication
   */
  protected async testStreamableHttpConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    let mcpClient: Client | null = null;

    try {
      // app imported statically

      // Create Streamable HTTP transport layer
      const streamableHttpTransport = new StreamableHTTPClientTransport(new URL(transport.url), {
        requestInit: {
          headers: transport.headers,
        },
      });

      // Create MCP client
      mcpClient = new Client(
        {
          name: app.getName(),
          version: app.getVersion(),
        },
        {
          capabilities: {
            sampling: {},
          },
        }
      );

      // Connect to server and get tools list
      await mcpClient.connect(streamableHttpTransport);
      const result = await mcpClient.listTools();

      const tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));

      return { success: true, tools };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Clean up connection
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (closeError) {
          log.error({ err: closeError }, 'Error closing connection');
        }
      }
    }
  }
}
