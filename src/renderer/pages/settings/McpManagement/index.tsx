import { acpConversation } from '@/common/ipcBridge';
import type { IMcpServer } from '@/common/storage';
import { useMcpAgentStatus, useMcpConnection, useMcpModal, useMcpOAuth, useMcpOperations, useMcpServerCRUD, useMcpServers } from '@/renderer/hooks/mcp';
import { Button, Collapse, Dropdown, Menu, Modal } from '@arco-design/web-react';
import { Down, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import AddMcpServerModal from '../components/AddMcpServerModal';
import McpServerItem from './McpServerItem';

interface McpManagementProps {
  message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0];
}

const McpManagement: React.FC<McpManagementProps> = ({ message }) => {
  const { t } = useTranslation();

  // Use custom hooks to manage various states and operations
  const { mcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);

  // OAuth hook
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();

  // Callback when authentication is required
  const handleAuthRequired = React.useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(mcpServers, saveMcpServers, message, handleAuthRequired);
  const { showMcpModal, editingMcpServer, deleteConfirmVisible, serverToDelete, mcpCollapseKey, showAddMcpModal, showEditMcpModal, hideMcpModal, showDeleteConfirm, hideDeleteConfirm, toggleServerCollapse } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer, handleToggleMcpServer } = useMcpServerCRUD(mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message);

  // OAuth login handler
  const handleOAuthLogin = React.useCallback(
    async (server: IMcpServer) => {
      const result = await login(server);

      if (result.success) {
        message.success(`${server.name}: ${t('settings.mcpOAuthLoginSuccess') || 'Login successful'}`);
        // Re-test connection after successful login
        void handleTestMcpConnection(server);
      } else {
        message.error(`${server.name}: ${result.error || t('settings.mcpOAuthLoginFailed') || 'Login failed'}`);
      }
    },
    [login, message, t, handleTestMcpConnection]
  );

  // Wrap add server, auto-test connection after adding
  const wrappedHandleAddMcpServer = React.useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (addedServer) {
        // Use returned server object directly for testing to avoid closure issues
        void handleTestMcpConnection(addedServer);
        // For HTTP/SSE servers, check OAuth status
        if (addedServer.transport.type === 'http' || addedServer.transport.type === 'sse') {
          void checkOAuthStatus(addedServer);
        }
        // Fix #518: Use actual server enabled state instead of input data
        // The server may be modified during addition, need to use final actual state
        if (addedServer.enabled) {
          void syncMcpToAgents(addedServer, true);
        }
      }
    },
    [handleAddMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  // Wrap edit server, auto-test connection after editing
  const wrappedHandleEditMcpServer = React.useCallback(
    async (editingMcpServer: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const updatedServer = await handleEditMcpServer(editingMcpServer, serverData);
      if (updatedServer) {
        // Use returned server object directly for testing
        void handleTestMcpConnection(updatedServer);
        // For HTTP/SSE servers, check OAuth status
        if (updatedServer.transport.type === 'http' || updatedServer.transport.type === 'sse') {
          void checkOAuthStatus(updatedServer);
        }
        // Fix #518: Use actual server enabled state instead of input data
        if (updatedServer.enabled) {
          void syncMcpToAgents(updatedServer, true);
        }
      }
    },
    [handleEditMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  // Wrap batch import, auto-test connection after importing
  const wrappedHandleBatchImportMcpServers = React.useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const addedServers = await handleBatchImportMcpServers(serversData);
      if (addedServers && addedServers.length > 0) {
        addedServers.forEach((server) => {
          void handleTestMcpConnection(server);
          // For HTTP/SSE servers, check OAuth status
          if (server.transport.type === 'http' || server.transport.type === 'sse') {
            void checkOAuthStatus(server);
          }
          if (server.enabled) {
            void syncMcpToAgents(server, true);
          }
        });
      }
    },
    [handleBatchImportMcpServers, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  // Detect available agents status
  const [detectedAgents, setDetectedAgents] = React.useState<Array<{ backend: string; name: string }>>([]);
  const [importMode, setImportMode] = React.useState<'json' | 'oneclick'>('json');

  React.useEffect(() => {
    const loadAgents = async () => {
      try {
        const response = await acpConversation.getAvailableAgents.invoke();
        if (response.success && response.data) {
          setDetectedAgents(response.data.map((agent) => ({ backend: agent.backend, name: agent.name })));
        }
      } catch (error) {
        console.error('Failed to load agents:', error);
      }
    };
    void loadAgents();
  }, []);

  // Check OAuth status for all HTTP/SSE servers on initialization
  React.useEffect(() => {
    const httpServers = mcpServers.filter((s) => s.transport.type === 'http' || s.transport.type === 'sse');
    if (httpServers.length > 0) {
      httpServers.forEach((server) => {
        void checkOAuthStatus(server);
      });
    }
  }, [mcpServers, checkOAuthStatus]);

  // Delete confirmation handler
  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;
    hideDeleteConfirm();
    await handleDeleteMcpServer(serverToDelete);
  };

  return (
    <div>
      <Collapse.Item
        className={' [&_div.arco-collapse-item-header-title]:flex-1'}
        header={
          <div className='flex items-center justify-between'>
            {t('settings.mcpSettings')}
            {detectedAgents.length > 0 ? (
              <Dropdown
                trigger='click'
                droplist={
                  <Menu>
                    <Menu.Item
                      key='json'
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportMode('json');
                        showAddMcpModal();
                      }}
                    >
                      {t('settings.mcpImportFromJSON')}
                    </Menu.Item>
                    <Menu.Item
                      key='oneclick'
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportMode('oneclick');
                        showAddMcpModal();
                      }}
                    >
                      {t('settings.mcpOneKeyImport')}
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button type='outline' icon={<Plus size={'14'} />} shape='round' onClick={(e) => e.stopPropagation()}>
                  {t('settings.mcpAddServer')} <Down size={'12'} />
                </Button>
              </Dropdown>
            ) : (
              <Button
                type='outline'
                icon={<Plus size={'16'} />}
                shape='round'
                onClick={(e) => {
                  e.stopPropagation();
                  setImportMode('json');
                  showAddMcpModal();
                }}
              >
                {t('settings.mcpAddServer')}
              </Button>
            )}
          </div>
        }
        name={'mcp-servers'}
      >
        <div>
          {mcpServers.length === 0 ? <div className='text-center py-8 text-t-secondary'>{t('settings.mcpNoServersFound')}</div> : mcpServers.map((server) => <McpServerItem key={server.id} server={server} isCollapsed={mcpCollapseKey[server.id] || false} agentInstallStatus={agentInstallStatus} isServerLoading={isServerLoading} isTestingConnection={testingServers[server.id] || false} oauthStatus={oauthStatus[server.id]} isLoggingIn={loggingIn[server.id]} onToggleCollapse={() => toggleServerCollapse(server.id)} onTestConnection={handleTestMcpConnection} onEditServer={showEditMcpModal} onDeleteServer={showDeleteConfirm} onToggleServer={handleToggleMcpServer} onOAuthLogin={handleOAuthLogin} />)}
        </div>
        <div>{mcpServers.length === 0 ? <div className='text-center py-8 text-t-secondary'>{t('settings.mcpNoServersFound')}</div> : mcpServers.map((server) => <McpServerItem key={server.id} server={server} isCollapsed={mcpCollapseKey[server.id] || false} agentInstallStatus={agentInstallStatus} isServerLoading={isServerLoading} isTestingConnection={testingServers[server.id] || false} onToggleCollapse={() => toggleServerCollapse(server.id)} onTestConnection={handleTestMcpConnection} onEditServer={showEditMcpModal} onDeleteServer={showDeleteConfirm} onToggleServer={handleToggleMcpServer} />)}</div>
      </Collapse.Item>

      <AddMcpServerModal visible={showMcpModal} server={editingMcpServer} onCancel={hideMcpModal} onSubmit={editingMcpServer ? (serverData) => wrappedHandleEditMcpServer(editingMcpServer, serverData) : wrappedHandleAddMcpServer} onBatchImport={wrappedHandleBatchImportMcpServers} importMode={importMode} />

      <Modal title={t('settings.mcpDeleteServer')} visible={deleteConfirmVisible} onCancel={hideDeleteConfirm} onOk={handleConfirmDelete} okButtonProps={{ status: 'danger' }} okText={t('common.confirm')} cancelText={t('common.cancel')}>
        <p>{t('settings.mcpDeleteConfirm')}</p>
      </Modal>
    </div>
  );
};

export default McpManagement;
