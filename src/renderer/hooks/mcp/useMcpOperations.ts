import { acpConversation, mcpService } from '@/common/ipcBridge';
import type { IMcpServer } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { useCallback } from 'react';
import { globalMessageQueue } from './messageQueue';

/**
 * Truncate long error messages to keep them readable
 */
const truncateErrorMessage = (message: string, maxLength: number = 150): string => {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + '...';
};

// Define MCP operation result types
interface McpOperationResult {
  agent: string;
  success: boolean;
  error?: string;
}

interface McpOperationResponse {
  success: boolean;
  data?: {
    results: McpOperationResult[];
  };
  msg?: string;
}

/**
 * MCP Operations Management Hook
 * Handles sync and remove operations between MCP servers and agents
 */
export const useMcpOperations = (mcpServers: IMcpServer[], message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0]) => {
  // Handle MCP config sync to agents result
  const handleMcpOperationResult = useCallback(
    async (response: McpOperationResponse, operation: 'sync' | 'remove', successMessage?: string, skipRecheck = false) => {
      if (response.success && response.data) {
        const { results } = response.data;
        const failedAgents = results.filter((r: McpOperationResult) => !r.success);

        // Immediately show operation start message, then trigger status update
        if (failedAgents.length > 0) {
          const failedNames = failedAgents.map((r: McpOperationResult) => `${r.agent}: ${truncateErrorMessage(r.error || '')}`).join(', ');
          const truncatedErrors = truncateErrorMessage(failedNames, 200);
          const partialFailedMsg = operation === 'sync' ? `MCP configuration sync partially failed: ${truncatedErrors}` : `MCP configuration removal partially failed: ${truncatedErrors}`;
          await globalMessageQueue.add(() => {
            message.warning({ content: partialFailedMsg, duration: 6000 });
          });
        } else {
          if (successMessage) {
            await globalMessageQueue.add(() => {
              message.success(successMessage);
            });
          }
          // No longer show "operation started" message since it was already shown at operation start
        }

        // Then update UI state
        if (!skipRecheck) {
          void ConfigStorage.get('mcp.config')
            .then((latestServers) => {
              if (latestServers) {
                // Can trigger status check here, but need to provide callback at usage site
              }
            })
            .catch(() => {
              // Handle loading error silently
            });
        }
      } else {
        const errorMsg = truncateErrorMessage(response.msg || 'Unknown error');
        const failedMsg = operation === 'sync' ? `MCP configuration sync failed: ${errorMsg}` : `MCP configuration removal failed: ${errorMsg}`;
        await globalMessageQueue.add(() => {
          message.error({ content: failedMsg, duration: 6000 });
        });
      }
    },
    [message]
  );

  // Remove MCP config from agents
  const removeMcpFromAgents = useCallback(
    async (serverName: string, successMessage?: string) => {
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (agentsResponse.success && agentsResponse.data) {
        // Show removal started message (via queue)
        await globalMessageQueue.add(() => {
          message.info(`Removing MCP configuration from ${agentsResponse.data.length} agents...`);
        });

        const removeResponse = await mcpService.removeMcpFromAgents.invoke({
          mcpServerName: serverName,
          agents: agentsResponse.data,
        });
        await handleMcpOperationResult(removeResponse, 'remove', successMessage, true); // Skip re-check
      }
    },
    [message, handleMcpOperationResult]
  );

  // Sync MCP config to agents
  const syncMcpToAgents = useCallback(
    async (server: IMcpServer, skipRecheck = false) => {
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (agentsResponse.success && agentsResponse.data) {
        // Show sync started message (via queue)
        await globalMessageQueue.add(() => {
          message.info(`Adding MCP configuration to ${agentsResponse.data.length} agents...`);
        });

        const syncResponse = await mcpService.syncMcpToAgents.invoke({
          mcpServers: [server],
          agents: agentsResponse.data,
        });

        await handleMcpOperationResult(syncResponse, 'sync', undefined, skipRecheck);
      } else {
        // Fix: Handle case when no agents are available, show user-friendly error message
        console.error('[useMcpOperations] Failed to get available agents:', agentsResponse.msg);
        await globalMessageQueue.add(() => {
          message.error('No available agents detected, unable to sync MCP configuration');
        });
      }
    },
    [message, handleMcpOperationResult]
  );

  return {
    syncMcpToAgents,
    removeMcpFromAgents,
    handleMcpOperationResult,
  };
};
