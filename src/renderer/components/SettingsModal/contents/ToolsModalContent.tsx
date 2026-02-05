/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpConversation } from '@/common/ipcBridge';
import { ConfigStorage, type IConfigStorageRefer, type IMcpServer } from '@/common/storage';
import { useBranding } from '@/renderer/hooks/useBranding';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionSelect from '@/renderer/components/base/AionSelect';
import { useMcpAgentStatus, useMcpConnection, useMcpModal, useMcpOAuth, useMcpOperations, useMcpServerCRUD, useMcpServers } from '@/renderer/hooks/mcp';
import useConfigModelListWithImage from '@/renderer/hooks/useConfigModelListWithImage';
import McpServerItem from '@/renderer/pages/settings/McpManagement/McpServerItem';
import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import { Button, Divider, Dropdown, Form, Menu, Message, Modal, Switch, Tooltip } from '@arco-design/web-react';
import { Down, Help, Plus } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsViewMode } from '../settingsViewContext';
import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('ToolsModalContent');

type MessageInstance = ReturnType<typeof Message.useMessage>[0];

const ModalMcpManagementSection: React.FC<{ message: MessageInstance; isPageMode?: boolean }> = ({ message, isPageMode }) => {
  const { mcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();

  const handleAuthRequired = useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(mcpServers, saveMcpServers, message, handleAuthRequired);
  const { showMcpModal, editingMcpServer, deleteConfirmVisible, serverToDelete, mcpCollapseKey, showAddMcpModal, showEditMcpModal, hideMcpModal, showDeleteConfirm, hideDeleteConfirm, toggleServerCollapse } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer, handleToggleMcpServer } = useMcpServerCRUD(mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message);

  const handleOAuthLogin = useCallback(
    async (server: IMcpServer) => {
      const result = await login(server);

      if (result.success) {
        message.success(`${server.name}: ${'OAuth login successful'}`);
        void handleTestMcpConnection(server);
      } else {
        message.error(`${server.name}: ${result.error}`);
      }
    },
    [login, message, handleTestMcpConnection]
  );

  const wrappedHandleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (addedServer) {
        void handleTestMcpConnection(addedServer);
        if (addedServer.transport.type === 'http' || addedServer.transport.type === 'sse') {
          void checkOAuthStatus(addedServer);
        }
        if (serverData.enabled) {
          void syncMcpToAgents(addedServer, true);
        }
      }
    },
    [handleAddMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const wrappedHandleEditMcpServer = useCallback(
    async (editingMcpServer: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const updatedServer = await handleEditMcpServer(editingMcpServer, serverData);
      if (updatedServer) {
        void handleTestMcpConnection(updatedServer);
        if (updatedServer.transport.type === 'http' || updatedServer.transport.type === 'sse') {
          void checkOAuthStatus(updatedServer);
        }
        if (serverData.enabled) {
          void syncMcpToAgents(updatedServer, true);
        }
      }
    },
    [handleEditMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const wrappedHandleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const addedServers = await handleBatchImportMcpServers(serversData);
      if (addedServers && addedServers.length > 0) {
        addedServers.forEach((server) => {
          void handleTestMcpConnection(server);
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

  const [detectedAgents, setDetectedAgents] = useState<Array<{ backend: string; name: string }>>([]);
  const [importMode, setImportMode] = useState<'json' | 'oneclick'>('json');

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const response = await acpConversation.getAvailableAgents.invoke();
        if (response.success && response.data) {
          setDetectedAgents(response.data.map((agent) => ({ backend: agent.backend, name: agent.name })));
        }
      } catch (error) {
        log.error({ err: error }, 'Failed to load agents');
      }
    };
    void loadAgents();
  }, []);

  useEffect(() => {
    const httpServers = mcpServers.filter((s) => s.transport.type === 'http' || s.transport.type === 'sse');
    if (httpServers.length > 0) {
      httpServers.forEach((server) => {
        void checkOAuthStatus(server);
      });
    }
  }, [mcpServers, checkOAuthStatus]);

  const handleConfirmDelete = useCallback(async () => {
    if (!serverToDelete) return;
    hideDeleteConfirm();
    await handleDeleteMcpServer(serverToDelete);
  }, [serverToDelete, hideDeleteConfirm, handleDeleteMcpServer]);

  const renderAddButton = () => {
    if (detectedAgents.length > 0) {
      return (
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
                {'Import from JSON'}
              </Menu.Item>
              <Menu.Item
                key='oneclick'
                onClick={(e) => {
                  e.stopPropagation();
                  setImportMode('oneclick');
                  showAddMcpModal();
                }}
              >
                {'One-Click Import'}
              </Menu.Item>
            </Menu>
          }
        >
          <Button type='outline' icon={<Plus size={'16'} />} shape='round' onClick={(e) => e.stopPropagation()}>
            {'Manual Add'} <Down size='12' />
          </Button>
        </Dropdown>
      );
    }

    return (
      <Button
        type='outline'
        icon={<Plus size={'16'} />}
        shape='round'
        onClick={() => {
          setImportMode('json');
          showAddMcpModal();
        }}
      >
        {'Manual Add'}
      </Button>
    );
  };

  return (
    <div className='flex flex-col gap-16px min-h-0'>
      <div className='flex gap-8px items-center justify-between'>
        <div className='text-14px text-t-primary'>{'MCP Tools Configuration'}</div>
        <div>{renderAddButton()}</div>
      </div>

      <div className='flex-1 min-h-0'>
        {mcpServers.length === 0 ? (
          <div className='py-24px text-center text-t-secondary text-14px border border-dashed border-border-2 rd-12px'>{'No MCP servers found'}</div>
        ) : (
          <AionScrollArea className={classNames('max-h-360px', isPageMode && 'max-h-none')} disableOverflow={isPageMode}>
            <div className='space-y-12px'>
              {mcpServers.map((server) => (
                <McpServerItem key={server.id} server={server} isCollapsed={mcpCollapseKey[server.id] || false} agentInstallStatus={agentInstallStatus} isServerLoading={isServerLoading} isTestingConnection={testingServers[server.id] || false} oauthStatus={oauthStatus[server.id]} isLoggingIn={loggingIn[server.id]} onToggleCollapse={() => toggleServerCollapse(server.id)} onTestConnection={handleTestMcpConnection} onEditServer={showEditMcpModal} onDeleteServer={showDeleteConfirm} onToggleServer={handleToggleMcpServer} onOAuthLogin={handleOAuthLogin} />
              ))}
            </div>
          </AionScrollArea>
        )}
      </div>

      <AddMcpServerModal visible={showMcpModal} server={editingMcpServer} onCancel={hideMcpModal} onSubmit={editingMcpServer ? (serverData) => wrappedHandleEditMcpServer(editingMcpServer, serverData) : wrappedHandleAddMcpServer} onBatchImport={wrappedHandleBatchImportMcpServers} importMode={importMode} />

      <Modal title={'Delete'} visible={deleteConfirmVisible} onCancel={hideDeleteConfirm} onOk={handleConfirmDelete} okButtonProps={{ status: 'danger' }} okText={'Confirm'} cancelText={'Cancel'}>
        <p>{'Are you sure you want to delete this MCP server?'}</p>
      </Modal>
    </div>
  );
};

const ToolsModalContent: React.FC = () => {
  const branding = useBranding();
  const [mcpMessage, mcpMessageContext] = Message.useMessage({ maxCount: 10 });
  const [imageGenerationModel, setImageGenerationModel] = useState<IConfigStorageRefer['tools.imageGenerationModel'] | undefined>();
  const [claudeYoloMode, setClaudeYoloMode] = useState(false);
  const { modelListWithImage: data } = useConfigModelListWithImage();

  const imageGenerationModelList = useMemo(() => {
    if (!data) return [];
    // Filter models that support image generation
    const isImageModel = (modelName: string) => {
      const name = modelName.toLowerCase();
      return name.includes('image') || name.includes('banana');
    };
    return (data || [])
      .filter((v) => {
        const filteredModels = v.model.filter(isImageModel);
        return filteredModels.length > 0;
      })
      .map((v) => ({
        ...v,
        model: v.model.filter(isImageModel),
      }));
  }, [data]);

  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const data = await ConfigStorage.get('tools.imageGenerationModel');
        if (data) {
          setImageGenerationModel(data);
        }
      } catch (error) {
        log.error({ err: error }, 'Failed to load image generation model config');
      }

      try {
        const config = await ConfigStorage.get('acp.config');
        setClaudeYoloMode(Boolean(config?.claude?.yoloMode));
      } catch (error) {
        log.error({ err: error }, 'Failed to load ACP config');
      }
    };

    void loadConfigs();
  }, []);

  // Sync imageGenerationModel apiKey when provider apiKey changes
  useEffect(() => {
    if (!imageGenerationModel || !data) return;

    const currentProvider = data.find((p) => p.id === imageGenerationModel.id);

    if (currentProvider && currentProvider.apiKey !== imageGenerationModel.apiKey) {
      const updatedModel = {
        ...imageGenerationModel,
        apiKey: currentProvider.apiKey,
      };

      setImageGenerationModel(updatedModel);
      ConfigStorage.set('tools.imageGenerationModel', updatedModel).catch((error) => {
        log.error({ err: error }, 'Failed to save image generation model config');
      });
    } else if (!currentProvider) {
      setImageGenerationModel(undefined);
      ConfigStorage.remove('tools.imageGenerationModel').catch((error) => {
        log.error({ err: error }, 'Failed to remove image generation model config');
      });
    }
  }, [data, imageGenerationModel?.id, imageGenerationModel?.apiKey]);

  const handleImageGenerationModelChange = (value: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
    setImageGenerationModel((prev) => {
      const newImageGenerationModel = { ...prev, ...value };
      ConfigStorage.set('tools.imageGenerationModel', newImageGenerationModel).catch((error) => {
        log.error({ err: error }, 'Failed to update image generation model config');
      });
      return newImageGenerationModel;
    });
  };

  const handleClaudeYoloModeChange = async (enabled: boolean) => {
    setClaudeYoloMode(enabled);
    try {
      const config = await ConfigStorage.get('acp.config');
      const nextConfig: IConfigStorageRefer['acp.config'] = {
        ...(config || {}),
        claude: {
          ...(config?.claude || {}),
          yoloMode: enabled,
        },
      };
      await ConfigStorage.set('acp.config', nextConfig);
    } catch (error) {
      log.error({ err: error }, 'Failed to update ACP config');
    }
  };

  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      {mcpMessageContext}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* MCP Tool Configuration */}
          <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px flex flex-col min-h-0 border border-border-2'>
            <div className='flex-1 min-h-0'>
              <AionScrollArea className={classNames('h-full', isPageMode && 'overflow-visible')} disableOverflow={isPageMode}>
                <ModalMcpManagementSection message={mcpMessage} isPageMode={isPageMode} />
              </AionScrollArea>
            </div>
          </div>
          {/* Image Generation */}
          <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
            <div className='flex items-center justify-between mb-16px'>
              <span className='text-14px text-t-primary'>{'Image Generation'}</span>
              <Switch disabled={!imageGenerationModelList.length || !imageGenerationModel?.useModel} checked={imageGenerationModel?.switch} onChange={(checked) => handleImageGenerationModelChange({ switch: checked })} />
            </div>

            <Divider className='mt-0px mb-20px' />

            <Form layout='horizontal' labelAlign='left' className='space-y-12px'>
              <Form.Item label={'Image Model'}>
                {imageGenerationModelList.length > 0 ? (
                  <AionSelect
                    value={imageGenerationModel?.id && imageGenerationModel?.useModel ? `${imageGenerationModel.id}|${imageGenerationModel.useModel}` : undefined}
                    onChange={(value) => {
                      const [platformId, modelName] = value.split('|');
                      const platform = imageGenerationModelList.find((p) => p.id === platformId);
                      if (platform) {
                        handleImageGenerationModelChange({ ...platform, useModel: modelName });
                      }
                    }}
                  >
                    {imageGenerationModelList.map(({ model, ...platform }) => (
                      <AionSelect.OptGroup label={platform.name} key={platform.id}>
                        {model.map((modelName) => (
                          <AionSelect.Option key={platform.id + modelName} value={platform.id + '|' + modelName}>
                            {modelName}
                          </AionSelect.Option>
                        ))}
                      </AionSelect.OptGroup>
                    ))}
                  </AionSelect>
                ) : (
                  <div className='text-t-secondary flex items-center'>
                    {'No available image models, please configure first.'}
                    <Tooltip
                      content={
                        <div>
                          {'If you need help, please check'}
                          <a href={branding.docs.imageGeneration} target='_blank' rel='noopener noreferrer' className='text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] underline ml-4px' onClick={(e) => e.stopPropagation()}>
                            {'configuration guide'}
                          </a>
                        </div>
                      }
                    >
                      <a href={branding.docs.imageGeneration} target='_blank' rel='noopener noreferrer' className='ml-8px text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] cursor-pointer' onClick={(e) => e.stopPropagation()}>
                        <Help theme='outline' size='14' />
                      </a>
                    </Tooltip>
                  </div>
                )}
              </Form.Item>
            </Form>
          </div>

          {/* Claude Code YOLO mode — only visible when ALLOW_CLAUDE_YOLO=true */}
          {branding.features?.allowClaudeYolo && (
            <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
              <div className='flex items-center justify-between mb-16px'>
                <span className='text-14px text-t-primary flex items-center gap-8px'>
                  {'Claude YOLO (Skip Permissions)'}
                  <Tooltip content={'Bypass all Claude Code permission checks (equivalent to --dangerously-skip-permissions).'} position='top'>
                    <span className='inline-flex cursor-help text-[rgb(var(--primary-6))]'>
                      <Help theme='outline' size='14' />
                    </span>
                  </Tooltip>
                </span>
                <Switch checked={claudeYoloMode} onChange={handleClaudeYoloModeChange} />
              </div>

              <Divider className='mt-0px mb-0px' />
            </div>
          )}
        </div>
      </AionScrollArea>
    </div>
  );
};

export default ToolsModalContent;
