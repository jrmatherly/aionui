/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 *
 * API Keys settings component for managing per-user API keys.
 * Keys are stored encrypted in the database and never sent back to the renderer.
 */

import { COMMON_PROVIDERS, getOtherProviders, PROVIDER_INFO } from '@/common/constants/providers';
import { userApiKeys } from '@/common/ipcBridge';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { Alert, Button, Collapse, Empty, Form, Input, Message, Modal, Popconfirm, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { Delete, Key, Link, Plus, Save } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useSettingsViewMode } from '../settingsViewContext';

interface StoredKey {
  provider: string;
  keyHint: string;
}

const ApiKeysModalContent: React.FC = () => {
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  const [message, messageContext] = Message.useMessage({ maxCount: 3 });
  const [storedKeys, setStoredKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Load stored keys on mount
  // Note: message and t are intentionally excluded from deps to prevent infinite re-render loops.
  // Message.useMessage() returns a new reference on every render, which would cause loadKeys
  // to get a new identity → useEffect fires → setState → re-render → infinite loop.
  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const keys = await userApiKeys.get.invoke({});
      setStoredKeys(keys || []);
    } catch (error) {
      console.error('[ApiKeys] Failed to load keys:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  // Save a new key
  const handleSaveKey = async () => {
    if (!selectedProvider || !apiKeyInput.trim()) {
      message.warning('Please enter an API key');
      return;
    }

    try {
      setSaving(true);
      await userApiKeys.set.invoke({ provider: selectedProvider, apiKey: apiKeyInput.trim() });
      message.success('API key saved successfully');
      setAddModalVisible(false);
      setSelectedProvider(null);
      setApiKeyInput('');
      await loadKeys();
    } catch (error) {
      console.error('[ApiKeys] Failed to save key:', error);
      message.error('Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  // Delete a key
  const handleDeleteKey = async (provider: string) => {
    try {
      await userApiKeys.delete.invoke({ provider });
      message.success('API key deleted');
      await loadKeys();
    } catch (error) {
      console.error('[ApiKeys] Failed to delete key:', error);
      message.error('Failed to delete API key');
    }
  };

  // Get provider info
  const getProviderInfo = (provider: string) => {
    return PROVIDER_INFO[provider] || { name: provider, description: '' };
  };

  // Check if provider has a stored key
  const hasStoredKey = (provider: string) => {
    return storedKeys.some((k) => k.provider === provider);
  };

  // Get key hint for a provider
  const getKeyHint = (provider: string) => {
    const stored = storedKeys.find((k) => k.provider === provider);
    return stored?.keyHint || '';
  };

  // Open add/update modal for a provider
  const openAddModal = (provider: string) => {
    setSelectedProvider(provider);
    setApiKeyInput('');
    setAddModalVisible(true);
  };

  // Render provider card
  const renderProviderCard = (provider: string) => {
    const info = getProviderInfo(provider);
    const hasKey = hasStoredKey(provider);
    const hint = getKeyHint(provider);

    return (
      <div key={provider} className='flex items-center justify-between p-12px bg-fill-1 rd-8px mb-8px hover:bg-fill-2 transition-colors'>
        <div className='flex items-center gap-12px flex-1 min-w-0'>
          <div className='w-40px h-40px bg-fill-3 rd-8px flex items-center justify-center shrink-0'>
            <Key theme='outline' size='20' className='text-t-secondary' />
          </div>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-8px'>
              <span className='font-medium text-t-primary'>{info.name}</span>
              {hasKey && (
                <Tag color='green' size='small'>
                  {'Configured'}
                </Tag>
              )}
            </div>
            <div className='text-12px text-t-secondary truncate'>{hasKey ? <span className='font-mono'>••••••{hint}</span> : info.description}</div>
          </div>
        </div>

        <div className='flex items-center gap-8px shrink-0'>
          {info.link && (
            <Tooltip content={'Get API key'}>
              <Button type='text' size='small' icon={<Link theme='outline' size='16' />} onClick={() => window.open(info.link, '_blank')} />
            </Tooltip>
          )}

          {hasKey ? (
            <>
              <Tooltip content={'Update key'}>
                <Button type='text' size='small' icon={<Save theme='outline' size='16' />} onClick={() => openAddModal(provider)} />
              </Tooltip>
              <Popconfirm title={'Delete this API key?'} onOk={() => handleDeleteKey(provider)}>
                <Tooltip content={'Delete key'}>
                  <Button type='text' size='small' status='danger' icon={<Delete theme='outline' size='16' />} />
                </Tooltip>
              </Popconfirm>
            </>
          ) : (
            <Button type='primary' size='small' icon={<Plus theme='outline' size='14' />} onClick={() => openAddModal(provider)}>
              {'Add'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Get other providers (not in common list)
  const otherProviders = getOtherProviders();

  return (
    <div className='flex flex-col h-full w-full'>
      {messageContext}

      <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
        {/* Security notice */}
        <Alert type='info' className='mb-16px' content={<div className='text-12px'>{'Your API keys are encrypted and stored securely. They are only used when you run CLI agents and are never shared with other users.'}</div>} />

        {loading ? (
          <div className='flex items-center justify-center py-40px'>
            <Spin size={24} />
          </div>
        ) : (
          <Collapse defaultActiveKey={['common', 'other']} bordered={false}>
            {/* Common providers */}
            <Collapse.Item header={<span className='font-medium'>{'Common Providers'}</span>} name='common'>
              <div className='pt-8px'>{COMMON_PROVIDERS.map((provider) => renderProviderCard(provider))}</div>
            </Collapse.Item>

            {/* Other providers */}
            <Collapse.Item header={<span className='font-medium'>{'Other Providers'}</span>} name='other'>
              <div className='pt-8px'>{otherProviders.length > 0 ? otherProviders.map((provider) => renderProviderCard(provider)) : <Empty description={'No other providers'} />}</div>
            </Collapse.Item>
          </Collapse>
        )}
      </AionScrollArea>

      {/* Add/Update key modal */}
      <Modal
        title={selectedProvider ? (hasStoredKey(selectedProvider) ? `Update ${getProviderInfo(selectedProvider).name} API Key` : `Add ${getProviderInfo(selectedProvider).name} API Key`) : ''}
        visible={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          setSelectedProvider(null);
          setApiKeyInput('');
        }}
        onOk={handleSaveKey}
        confirmLoading={saving}
        okText={'Save'}
        cancelText={'Cancel'}
      >
        <Form layout='vertical'>
          <Form.Item label={'API Key'}>
            <Input.Password placeholder={hasStoredKey(selectedProvider || '') ? 'Enter new API key to update' : 'Enter your API key'} value={apiKeyInput} onChange={setApiKeyInput} autoFocus />
          </Form.Item>

          {selectedProvider && getProviderInfo(selectedProvider).link && (
            <div className='text-12px text-t-secondary'>
              {"Don't have a key?"}{' '}
              <a href={getProviderInfo(selectedProvider).link} target='_blank' rel='noopener noreferrer' className='text-primary'>
                {'Get one here'} →
              </a>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default ApiKeysModalContent;
