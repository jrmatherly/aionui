import { acpConversation, mcpService } from '@/common/ipcBridge';
import type { IMcpServer } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
          const partialFailedKey = operation === 'sync' ? 'mcpSyncPartialFailed' : 'mcpRemovePartialFailed';
          await globalMessageQueue.add(() => {
            message.warning({ content: t(`settings.${partialFailedKey}`, { errors: truncatedErrors }), duration: 6000 });
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
        const failedKey = operation === 'sync' ? 'mcpSyncFailed' : 'mcpRemoveFailed';
        const errorMsg = truncateErrorMessage(response.msg || t('settings.unknownError'));
        await globalMessageQueue.add(() => {
          message.error({ content: t(`settings.${failedKey}`, { error: errorMsg }), duration: 6000 });
        });
      }
    },
    [message, t]
  );

  // Remove MCP config from agents
  const removeMcpFromAgents = useCallback(
    async (serverName: string, successMessage?: string) => {
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (agentsResponse.success && agentsResponse.data) {
        // Show removal started message (via queue)
        await globalMessageQueue.add(() => {
          message.info(t('settings.mcpRemoveStarted', { count: agentsResponse.data.length }));
        });

        const removeResponse = await mcpService.removeMcpFromAgents.invoke({
          mcpServerName: serverName,
          agents: agentsResponse.data,
        });
        await handleMcpOperationResult(removeResponse, 'remove', successMessage, true); // Skip re-check
      }
    },
    [message, t, handleMcpOperationResult]
  );

  // Sync MCP config to agents
  const syncMcpToAgents = useCallback(
    async (server: IMcpServer, skipRecheck = false) => {
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (agentsResponse.success && agentsResponse.data) {
        // Show sync started message (via queue)
        await globalMessageQueue.add(() => {
          message.info(t('settings.mcpSyncStarted', { count: agentsResponse.data.length }));
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
          message.error(t('settings.mcpSyncFailedNoAgents'));
        });
      }
    },
    [message, t, handleMcpOperationResult]
  );

  return {
    syncMcpToAgents,
    removeMcpFromAgents,
    handleMcpOperationResult,
  };
};
