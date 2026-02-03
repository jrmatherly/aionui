import type { IMcpServer } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { useCallback, useEffect, useState } from 'react';

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
        console.error('[useMcpServers] Failed to load MCP config:', error);
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
              console.error('Failed to save MCP servers:', error);
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
