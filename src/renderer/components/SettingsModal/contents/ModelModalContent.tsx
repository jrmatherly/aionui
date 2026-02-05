/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/storage';
import { useBranding } from '@/renderer/hooks/useBranding';
import { isWebMode } from '@/renderer/utils/platform';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AddModelModal from '@/renderer/pages/settings/components/AddModelModal';
import AddPlatformModal from '@/renderer/pages/settings/components/AddPlatformModal';
import EditModeModal from '@/renderer/pages/settings/components/EditModeModal';
import { Button, Collapse, Divider, Message, Popconfirm, Tag, Tooltip } from '@arco-design/web-react';
import { Copy, DeleteFour, Eyes, PreviewCloseOne, Info, Minus, Planet, Plus, Write } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSettingsViewMode } from '../settingsViewContext';
import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('ModelModalContent');

interface GlobalModel {
  id: string;
  platform: string;
  name: string;
  models: string[];
  enabled: boolean;
}

// Calculate API Key count
const getApiKeyCount = (apiKey: string): number => {
  if (!apiKey) return 0;
  return apiKey.split(/[,\n]/).filter((k) => k.trim().length > 0).length;
};

const ModelModalContent: React.FC = () => {
  const branding = useBranding();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [cacheKey, setCacheKey] = useState('model.config');
  const [globalCacheKey, setGlobalCacheKey] = useState('global.models');
  const [collapseKey, setCollapseKey] = useState<Record<string, boolean>>({});
  const [message, messageContext] = Message.useMessage();

  // Fetch user's local models
  const { data } = useSWR(cacheKey, () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      if (!data) return [];
      return data;
    });
  });

  // Filter out global/shared models from user's local models
  // Global models are tagged with isGlobal=true by getEffectiveModels()
  // They already appear under "Organization Models" — don't duplicate in "Your Models"
  const localModels = useMemo(() => {
    if (!data) return [];
    return data.filter((p) => !p.isGlobal);
  }, [data]);

  // Fetch visible global models (web mode only)
  const { data: globalModels } = useSWR(isWebMode() ? globalCacheKey : null, async () => {
    try {
      const response = await fetch('/api/models/global', { credentials: 'include' });
      const result = await response.json();
      return result.success ? (result.models as GlobalModel[]) : [];
    } catch {
      return [];
    }
  });

  // Fetch hidden global models (web mode only)
  const { data: hiddenModels } = useSWR(isWebMode() ? `${globalCacheKey}.hidden` : null, async () => {
    try {
      const response = await fetch('/api/models/global/hidden', { credentials: 'include' });
      const result = await response.json();
      return result.success ? (result.models as GlobalModel[]) : [];
    } catch {
      return [];
    }
  });

  // Hide a global model
  const hideGlobalModel = useCallback(
    async (modelId: string) => {
      try {
        const response = await fetch(`/api/models/global/${modelId}/hide`, {
          method: 'POST',
          credentials: 'include',
        });
        const result = await response.json();
        if (result.success) {
          message.success('Model hidden');
          setGlobalCacheKey(`global.models.${Date.now()}`);
        } else {
          message.error(result.error || 'Failed to hide model');
        }
      } catch {
        message.error('Failed to hide model');
      }
    },
    [message]
  );

  // Unhide a global model
  const unhideGlobalModel = useCallback(
    async (modelId: string) => {
      try {
        const response = await fetch(`/api/models/global/${modelId}/unhide`, {
          method: 'POST',
          credentials: 'include',
        });
        const result = await response.json();
        if (result.success) {
          message.success('Model shown');
          setGlobalCacheKey(`global.models.${Date.now()}`);
        } else {
          message.error(result.error || 'Failed to show model');
        }
      } catch {
        message.error('Failed to show model');
      }
    },
    [message]
  );

  const saveModelConfig = (newData: IProvider[], success?: () => void) => {
    ipcBridge.mode.saveModelConfig
      .invoke(newData)
      .then((data) => {
        if (data.success) {
          setCacheKey('model.config' + Date.now());
          success?.();
        } else {
          message.error(data.msg);
        }
      })
      .catch((error) => {
        log.error({ err: error }, 'Failed to save model config');
        message.error('Failed to save model configuration');
      });
  };

  const updatePlatform = (platform: IProvider, success: () => void) => {
    // Only operate on local models — never save global models to local storage
    const newData = [...localModels];
    const originData = newData.find((item) => item.id === platform.id);
    if (originData) {
      Object.assign(originData, platform);
    } else {
      newData.push(platform);
    }
    saveModelConfig(newData, success);
  };

  const removePlatform = (id: string) => {
    // Only operate on local models — never save global models to local storage
    const newData = localModels.filter((item) => item.id !== id);
    saveModelConfig(newData);
  };

  const [addPlatformModalCtrl, addPlatformModalContext] = AddPlatformModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => addPlatformModalCtrl.close());
    },
  });

  const [addModelModalCtrl, addModelModalContext] = AddModelModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => {
        addModelModalCtrl.close();
      });
    },
  });

  const [editModalCtrl, editModalContext] = EditModeModal.useModal({
    onChange(platform) {
      updatePlatform(platform, () => editModalCtrl.close());
    },
  });

  // Copy global model to local (override)
  const copyGlobalToLocal = useCallback(
    async (globalModel: GlobalModel) => {
      try {
        // Fetch full model details to get baseUrl
        const response = await fetch(`/api/models/global/${globalModel.id}`, { credentials: 'include' });
        const result = await response.json();
        if (!result.success) {
          message.error('Failed to get model details');
          return;
        }
        const fullModel = result.model;

        // Create local copy with unique ID
        const localCopy: IProvider = {
          id: `local-${globalModel.id}-${Date.now()}`,
          platform: globalModel.platform,
          name: `${globalModel.name} (Copy)`,
          baseUrl: fullModel.base_url || '',
          apiKey: '', // User must provide their own key
          model: [...globalModel.models],
        };

        const newData = [...localModels, localCopy];
        saveModelConfig(newData, () => {
          message.success('Model copied - please add your API key');
          // Open edit modal for the new copy
          editModalCtrl.open({ data: localCopy });
        });
      } catch {
        message.error('Failed to copy model');
      }
    },
    [localModels, message, editModalCtrl, saveModelConfig]
  );

  return (
    <div className='flex flex-col bg-2 rd-16px px-[12px] md:px-32px py-20px'>
      {messageContext}
      {addPlatformModalContext}
      {editModalContext}
      {addModelModalContext}

      {/* Header with Add Button */}
      <div className='flex-shrink-0 border-b flex items-center justify-between mb-20px'>
        <div className='text-14px text-t-primary'>{'Model'}</div>
        <Button type='outline' shape='round' icon={<Plus size='16' />} onClick={() => addPlatformModalCtrl.open()} className='rd-100px border-1 border-t-secondary'>
          {'Add Model'}
        </Button>
      </div>

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0' disableOverflow={isPageMode}>
        {/* Your Models Section (local only — global models shown in Organization Models) */}
        {localModels.length > 0 && (
          <>
            {isWebMode() && (globalModels?.length || hiddenModels?.length) ? <div className='text-12px text-t-secondary font-500 mb-12px uppercase tracking-wide'>{'Your Models'}</div> : null}
            <div className='space-y-12px'>
              {localModels.map((platform) => {
                const key = platform.id;
                const isExpanded = collapseKey[platform.id] ?? false;
                return (
                  <Collapse
                    activeKey={isExpanded ? ['image-generation'] : []}
                    onChange={(_, activeKeys) => {
                      const expanded = activeKeys.includes('image-generation');
                      setCollapseKey((prev) => ({ ...prev, [platform.id]: expanded }));
                    }}
                    key={key}
                    bordered
                  >
                    <Collapse.Item
                      name='image-generation'
                      className='[&_.arco-collapse-item-header-title]:flex-1'
                      header={
                        <div className='flex items-center justify-between w-full'>
                          <span className='text-14px text-t-primary'>{platform.name}</span>
                          <div className='flex items-center gap-8px' onClick={(e) => e.stopPropagation()}>
                            <span className='text-12px text-t-secondary'>
                              <span
                                className='cursor-pointer hover:text-t-primary'
                                onClick={() => {
                                  setCollapseKey((prev) => ({ ...prev, [platform.id]: !isExpanded }));
                                }}
                              >
                                {'Model'}（{platform.model.length}）
                              </span>
                              |{' '}
                              <span className='cursor-pointer hover:text-t-primary' onClick={() => editModalCtrl.open({ data: platform })}>
                                {'API Key'}（{getApiKeyCount(platform.apiKey)}）
                              </span>
                            </span>
                            <Button size='mini' icon={<Plus size='14' />} onClick={() => addModelModalCtrl.open({ data: platform })} />
                            <Popconfirm title={'Are you sure you want to delete all models?'} onOk={() => removePlatform(platform.id)}>
                              <Button size='mini' icon={<Minus size='14' />} />
                            </Popconfirm>
                            <Button size='mini' icon={<Write size='14' />} onClick={() => editModalCtrl.open({ data: platform })} />
                          </div>
                        </div>
                      }
                    >
                      {platform.model.map((model, index, arr) => (
                        <div key={model}>
                          <div className='flex items-center justify-between py-4px'>
                            <span className='text-14px text-t-primary'>{model}</span>
                            <Popconfirm
                              title={'Are you sure you want to delete this model?'}
                              onOk={() => {
                                const newModels = platform.model.filter((item) => item !== model);
                                updatePlatform({ ...platform, model: newModels }, () => {
                                  setCacheKey('model.config' + Date.now());
                                });
                              }}
                            >
                              <Button size='mini' icon={<DeleteFour theme='outline' size='18' strokeWidth={2} />} />
                            </Popconfirm>
                          </div>
                          {index < arr.length - 1 && <Divider className='!my-8px' />}
                        </div>
                      ))}
                    </Collapse.Item>
                  </Collapse>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state for local models */}
        {localModels.length === 0 && (!globalModels || globalModels.length === 0) && (
          <div className='flex flex-col items-center justify-center py-40px'>
            <Info theme='outline' size='48' className='text-t-secondary mb-16px' />
            <h3 className='text-16px font-500 text-t-primary mb-8px'>{'No configured models'}</h3>
            <p className='text-14px text-t-secondary text-center max-w-400px'>
              {'Need help? Check out the detailed'}
              <a href={branding.docs.llmConfig} target='_blank' rel='noopener noreferrer' className='text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] underline ml-4px'>
                {'configuration guide'}
              </a>
              {'.'}
            </p>
          </div>
        )}

        {/* Organization Models Section (web mode only) */}
        {isWebMode() && globalModels && globalModels.length > 0 && (
          <>
            <Divider className='!my-20px' />
            <div className='text-12px text-t-secondary font-500 mb-12px uppercase tracking-wide flex items-center gap-6px'>
              <Planet size='14' />
              {'Organization Models'}
            </div>
            <div className='space-y-12px'>
              {globalModels.map((globalModel) => {
                const isExpanded = collapseKey[`global-${globalModel.id}`] ?? false;
                return (
                  <Collapse
                    activeKey={isExpanded ? ['global-model'] : []}
                    onChange={(_, activeKeys) => {
                      const expanded = activeKeys.includes('global-model');
                      setCollapseKey((prev) => ({ ...prev, [`global-${globalModel.id}`]: expanded }));
                    }}
                    key={`global-${globalModel.id}`}
                    bordered
                    className='[&_.arco-collapse-item-header]:bg-[rgba(var(--primary-6),0.05)]'
                  >
                    <Collapse.Item
                      name='global-model'
                      className='[&_.arco-collapse-item-header-title]:flex-1'
                      header={
                        <div className='flex items-center justify-between w-full'>
                          <div className='flex items-center gap-8px'>
                            <Tag color='arcoblue' size='small'>
                              <Planet size='12' className='mr-4px' />
                              {'Shared'}
                            </Tag>
                            <span className='text-14px text-t-primary'>{globalModel.name}</span>
                          </div>
                          <div className='flex items-center gap-8px' onClick={(e) => e.stopPropagation()}>
                            <span className='text-12px text-t-secondary'>
                              <span
                                className='cursor-pointer hover:text-t-primary'
                                onClick={() => {
                                  setCollapseKey((prev) => ({ ...prev, [`global-${globalModel.id}`]: !isExpanded }));
                                }}
                              >
                                {'Model'}（{globalModel.models.length}）
                              </span>
                            </span>
                            <Tooltip content='Copy to your models'>
                              <Button size='mini' icon={<Copy size='14' />} onClick={() => copyGlobalToLocal(globalModel)} />
                            </Tooltip>
                            <Tooltip content='Hide this model'>
                              <Button size='mini' icon={<PreviewCloseOne size='14' />} onClick={() => hideGlobalModel(globalModel.id)} />
                            </Tooltip>
                          </div>
                        </div>
                      }
                    >
                      {globalModel.models.map((model, index, arr) => (
                        <div key={model}>
                          <div className='flex items-center justify-between py-4px'>
                            <span className='text-14px text-t-primary'>{model}</span>
                          </div>
                          {index < arr.length - 1 && <Divider className='!my-8px' />}
                        </div>
                      ))}
                    </Collapse.Item>
                  </Collapse>
                );
              })}
            </div>
          </>
        )}

        {/* Hidden Models Section (web mode only) */}
        {isWebMode() && hiddenModels && hiddenModels.length > 0 && (
          <>
            <Divider className='!my-20px' />
            <div className='text-12px text-t-secondary font-500 mb-12px uppercase tracking-wide flex items-center gap-6px'>
              <PreviewCloseOne size='14' />
              {'Hidden Models'}
            </div>
            <div className='space-y-8px'>
              {hiddenModels.map((hiddenModel) => (
                <div key={`hidden-${hiddenModel.id}`} className='flex items-center justify-between py-8px px-12px bg-3 rd-8px opacity-60 hover:opacity-80 transition-opacity'>
                  <div className='flex items-center gap-8px'>
                    <Tag color='gray' size='small'>
                      {'Hidden'}
                    </Tag>
                    <span className='text-14px text-t-secondary'>{hiddenModel.name}</span>
                    <span className='text-12px text-t-tertiary'>({hiddenModel.models.length} models)</span>
                  </div>
                  <Tooltip content='Show this model'>
                    <Button size='mini' icon={<Eyes size='14' />} onClick={() => unhideGlobalModel(hiddenModel.id)} />
                  </Tooltip>
                </div>
              ))}
            </div>
          </>
        )}
      </AionScrollArea>
    </div>
  );
};

export default ModelModalContent;
