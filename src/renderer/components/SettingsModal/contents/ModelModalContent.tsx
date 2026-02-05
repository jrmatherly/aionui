/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/storage';
import { useBranding } from '@/renderer/hooks/useBranding';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AddModelModal from '@/renderer/pages/settings/components/AddModelModal';
import AddPlatformModal from '@/renderer/pages/settings/components/AddPlatformModal';
import EditModeModal from '@/renderer/pages/settings/components/EditModeModal';
import { Button, Collapse, Divider, Message, Popconfirm } from '@arco-design/web-react';
import { DeleteFour, Info, Minus, Plus, Write } from '@icon-park/react';
import React, { useState } from 'react';
import useSWR from 'swr';
import { useSettingsViewMode } from '../settingsViewContext';

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
  const [collapseKey, setCollapseKey] = useState<Record<string, boolean>>({});
  const { data } = useSWR(cacheKey, () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      if (!data) return [];
      return data;
    });
  });
  const [message, messageContext] = Message.useMessage();

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
        console.error('Failed to save model config:', error);
        message.error('Failed to save model configuration');
      });
  };

  const updatePlatform = (platform: IProvider, success: () => void) => {
    const newData = [...(data || [])];
    const originData = newData.find((item) => item.id === platform.id);
    if (originData) {
      Object.assign(originData, platform);
    } else {
      newData.push(platform);
    }
    saveModelConfig(newData, success);
  };

  const removePlatform = (id: string) => {
    const newData = data.filter((item) => item.id !== id);
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
        {!data || data.length === 0 ? (
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
        ) : (
          <div className='space-y-12px'>
            {(data || []).map((platform) => {
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
        )}
      </AionScrollArea>
    </div>
  );
};

export default ModelModalContent;
