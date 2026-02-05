import type { IMcpServer } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { createLogger } from '@/renderer/utils/logger';
import { useCallback, useEffect, useState } from 'react';

const log = createLogger('useMcpServers');

/**
 * MCP Server State Management Hook
 * Manages loading, saving, and status updates for MCP server list
 */
export const useMcpServers = () => {
  const [mcpServers, setMcpServers] = useState<IMcpServer[]>([]);

  // Load MCP server configuration
  useEffect(() => {
    void ConfigStorage.get('mcp.config')
      .then((data) => {
        if (data) {
          setMcpServers(data);
        }
      })
      .catch((error) => {
        log.error({ err: error }, 'Failed to load MCP config');
      });
  }, []);

  // Save MCP server configuration
  const saveMcpServers = useCallback((serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => {
    return new Promise<void>((resolve, reject) => {
      setMcpServers((prev) => {
        // Calculate new value
        const newServers = typeof serversOrUpdater === 'function' ? serversOrUpdater(prev) : serversOrUpdater;

        // Async save to storage (executed in microtask)
        queueMicrotask(() => {
          ConfigStorage.set('mcp.config', newServers)
            .then(() => resolve())
            .catch((error) => {
              log.error({ err: error }, 'Failed to save MCP servers');
              reject(error);
            });
        });

        return newServers;
      });
    });
  }, []);

  return {
    mcpServers,
    setMcpServers,
    saveMcpServers,
  };
};
