import type { IMcpServer } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import type React from 'react';
import { useCallback } from 'react';
/**
 * MCP Server CRUD operations Hook
 * Handles add, edit, delete, enable/disable operations for MCP servers
 */
export const useMcpServerCRUD = (mcpServers: IMcpServer[], saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>, syncMcpToAgents: (server: IMcpServer, skipRecheck?: boolean) => Promise<void>, removeMcpFromAgents: (serverName: string, successMessage?: string) => Promise<void>, checkSingleServerInstallStatus: (serverName: string) => Promise<void>, setAgentInstallStatus: React.Dispatch<React.SetStateAction<Record<string, string[]>>>, message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0]) => {
  // Add MCP server
  const handleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = Date.now();
      let serverToSync: IMcpServer | null = null;

      // Use functional update to avoid closure issues
      await saveMcpServers((prevServers) => {
        const existingServerIndex = prevServers.findIndex((server) => server.name === serverData.name);

        if (existingServerIndex !== -1) {
          // If server with same name exists, update existing server
          const updatedServers = [...prevServers];
          updatedServers[existingServerIndex] = {
            ...updatedServers[existingServerIndex],
            ...serverData,
            updatedAt: now,
          };
          serverToSync = updatedServers[existingServerIndex];
          return updatedServers;
        } else {
          // If server with same name doesn't exist, add new server
          const newServer: IMcpServer = {
            ...serverData,
            id: `mcp_${now}`,
            createdAt: now,
            updatedAt: now,
          };
          serverToSync = newServer;
          return [...prevServers, newServer];
        }
      });

      // Check installation status
      if (serverToSync) {
        setTimeout(() => void checkSingleServerInstallStatus(serverToSync.name), 100);
      }

      // Return newly added/updated server for subsequent connection tests
      return serverToSync;
    },
    [saveMcpServers, syncMcpToAgents, message, checkSingleServerInstallStatus]
  );

  // Batch import MCP servers
  const handleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const now = Date.now();
      const addedServers: IMcpServer[] = [];

      // Use functional update to avoid closure issues
      await saveMcpServers((prevServers) => {
        const updatedServers = [...prevServers];

        serversData.forEach((serverData, index) => {
          const existingServerIndex = updatedServers.findIndex((server) => server.name === serverData.name);

          if (existingServerIndex !== -1) {
            // If server with same name exists, update existing server
            updatedServers[existingServerIndex] = {
              ...updatedServers[existingServerIndex],
              ...serverData,
              updatedAt: now,
            };
          } else {
            // If server with same name doesn't exist, add new server
            const newServer: IMcpServer = {
              ...serverData,
              id: `mcp_${now}_${index}`,
              createdAt: now,
              updatedAt: now,
            };
            updatedServers.push(newServer);
            addedServers.push(newServer);
          }
        });

        return updatedServers;
      });

      // Check installation status
      setTimeout(() => {
        serversData.forEach((serverData) => {
          void checkSingleServerInstallStatus(serverData.name);
        });
      }, 100);

      // Return list of newly added servers for subsequent connection tests
      return addedServers;
    },
    [saveMcpServers, syncMcpToAgents, message, checkSingleServerInstallStatus]
  );

  // Edit MCP server
  const handleEditMcpServer = useCallback(
    async (editingMcpServer: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<IMcpServer | undefined> => {
      if (!editingMcpServer) return undefined;

      let updatedServer: IMcpServer | undefined;

      // Use functional update to avoid closure issues
      await saveMcpServers((prevServers) => {
        updatedServer = {
          ...editingMcpServer,
          ...serverData,
          updatedAt: Date.now(),
        };

        return prevServers.map((server) => (server.id === editingMcpServer.id ? updatedServer : server));
      });

      message.success('Import successful');
      // Immediately check installation status for this server after edit (installation status only)
      setTimeout(() => void checkSingleServerInstallStatus(serverData.name), 100);

      // Return updated server object for subsequent connection tests
      return updatedServer;
    },
    [saveMcpServers, message, checkSingleServerInstallStatus]
  );

  // Delete MCP server
  const handleDeleteMcpServer = useCallback(
    async (serverId: string) => {
      let targetServer: IMcpServer | undefined;

      // Use functional update to avoid closure issues
      await saveMcpServers((prevServers) => {
        targetServer = prevServers.find((server) => server.id === serverId);
        if (!targetServer) return prevServers;

        return prevServers.filter((server) => server.id !== serverId);
      });

      if (!targetServer) return;

      // Update installation status directly after deletion without triggering detection
      setAgentInstallStatus((prev) => {
        const updated = { ...prev };
        delete updated[targetServer.name];
        // Also update local storage
        void ConfigStorage.set('mcp.agentInstallStatus', updated).catch(() => {
          // Handle storage error silently
        });
        return updated;
      });

      try {
        // If server is enabled, need to delete MCP config from all agents
        if (targetServer.enabled) {
          await removeMcpFromAgents(targetServer.name, 'MCP server deleted and configuration cleaned up');
        } else {
          message.success('MCP server deleted');
        }
      } catch (error) {
        message.error('Error deleting MCP configuration');
      }
    },
    [saveMcpServers, setAgentInstallStatus, removeMcpFromAgents, message]
  );

  // Enable/Disable MCP server
  const handleToggleMcpServer = useCallback(
    async (serverId: string, enabled: boolean) => {
      let targetServer: IMcpServer | undefined;
      let updatedTargetServer: IMcpServer | undefined;

      // Use functional update to avoid closure issues
      await saveMcpServers((prevServers) => {
        targetServer = prevServers.find((server) => server.id === serverId);
        if (!targetServer) return prevServers;

        return prevServers.map((server) => {
          if (server.id === serverId) {
            updatedTargetServer = { ...server, enabled, updatedAt: Date.now() };
            return updatedTargetServer;
          }
          return server;
        });
      });

      if (!targetServer || !updatedTargetServer) return;

      try {
        if (enabled) {
          // If MCP server is enabled, sync only current server to all detected agents
          await syncMcpToAgents(updatedTargetServer, true);
          // Immediately check installation status for this server after enabling (installation status only)
          setTimeout(() => void checkSingleServerInstallStatus(targetServer.name), 100);
        } else {
          // If MCP server is disabled, delete this config from all agents
          await removeMcpFromAgents(targetServer.name);
          // Update UI state directly after disabling, no need to re-detect
          setAgentInstallStatus((prev) => {
            const updated = { ...prev };
            delete updated[targetServer.name];
            // Also update local storage
            void ConfigStorage.set('mcp.agentInstallStatus', updated).catch(() => {
              // Handle storage error silently
            });
            return updated;
          });
        }
      } catch (error) {
        message.error(enabled ? 'MCP configuration sync failed' : 'MCP configuration removal failed');
      }
    },
    [saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message]
  );

  return {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
  };
};
