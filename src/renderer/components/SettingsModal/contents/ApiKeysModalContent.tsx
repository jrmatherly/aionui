/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 *
 * API Keys settings component for managing per-user API keys.
 * Keys are stored encrypted in the database and never sent back to the renderer.
 */

import { userApiKeys } from '@/common/ipcBridge';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { Alert, Button, Collapse, Empty, Form, Input, Message, Modal, Popconfirm, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { Delete, Key, Link, Plus, Save } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../settingsViewContext';

// Provider info for display (matches PROVIDER_INFO in UserApiKeyService.ts)
const PROVIDER_INFO: Record<string, { name: string; description: string; link?: string }> = {
  anthropic: { name: 'Anthropic', description: 'Claude models', link: 'https://console.anthropic.com/' },
  openai: { name: 'OpenAI', description: 'GPT models, Codex', link: 'https://platform.openai.com/' },
  google: { name: 'Google AI', description: 'Gemini models', link: 'https://ai.google.dev/' },
  groq: { name: 'Groq', description: 'Fast inference', link: 'https://console.groq.com/' },
  mistral: { name: 'Mistral', description: 'Mistral models', link: 'https://console.mistral.ai/' },
  deepseek: { name: 'DeepSeek', description: 'DeepSeek models', link: 'https://platform.deepseek.com/' },
  together: { name: 'Together AI', description: 'Open models hosting', link: 'https://api.together.xyz/' },
  fireworks: { name: 'Fireworks', description: 'Fast open models', link: 'https://fireworks.ai/' },
  openrouter: { name: 'OpenRouter', description: 'Multi-model proxy', link: 'https://openrouter.ai/' },
  dashscope: { name: 'Dashscope', description: 'Alibaba/Qwen', link: 'https://dashscope.console.aliyun.com/' },
  moonshot: { name: 'Moonshot', description: 'Kimi models', link: 'https://platform.moonshot.cn/' },
  azure: { name: 'Azure OpenAI', description: 'Azure-hosted OpenAI', link: 'https://azure.microsoft.com/products/ai-services/openai-service' },
  replicate: { name: 'Replicate', description: 'Model hosting', link: 'https://replicate.com/' },
  huggingface: { name: 'Hugging Face', description: 'Model hub', link: 'https://huggingface.co/' },
  cohere: { name: 'Cohere', description: 'Enterprise LLMs', link: 'https://cohere.com/' },
  perplexity: { name: 'Perplexity', description: 'Search-augmented', link: 'https://www.perplexity.ai/' },
};

// Commonly used providers shown first
const COMMON_PROVIDERS = ['anthropic', 'openai', 'google', 'groq', 'mistral', 'deepseek', 'openrouter'];

interface StoredKey {
  provider: string;
  keyHint: string;
}

const ApiKeysModalContent: React.FC = () => {
  const { t } = useTranslation();
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
  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const keys = await userApiKeys.get.invoke({});
      setStoredKeys(keys || []);
    } catch (error) {
      console.error('[ApiKeys] Failed to load keys:', error);
      message.error(t('settings.apiKeys.loadError', { defaultValue: 'Failed to load API keys' }));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  // Save a new key
  const handleSaveKey = async () => {
    if (!selectedProvider || !apiKeyInput.trim()) {
      message.warning(t('settings.apiKeys.enterKey', { defaultValue: 'Please enter an API key' }));
      return;
    }

    try {
      setSaving(true);
      await userApiKeys.set.invoke({ provider: selectedProvider, apiKey: apiKeyInput.trim() });
      message.success(t('settings.apiKeys.saved', { defaultValue: 'API key saved successfully' }));
      setAddModalVisible(false);
      setSelectedProvider(null);
      setApiKeyInput('');
      await loadKeys();
    } catch (error) {
      console.error('[ApiKeys] Failed to save key:', error);
      message.error(t('settings.apiKeys.saveError', { defaultValue: 'Failed to save API key' }));
    } finally {
      setSaving(false);
    }
  };

  // Delete a key
  const handleDeleteKey = async (provider: string) => {
    try {
      await userApiKeys.delete.invoke({ provider });
      message.success(t('settings.apiKeys.deleted', { defaultValue: 'API key deleted' }));
      await loadKeys();
    } catch (error) {
      console.error('[ApiKeys] Failed to delete key:', error);
      message.error(t('settings.apiKeys.deleteError', { defaultValue: 'Failed to delete API key' }));
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
                  {t('settings.apiKeys.configured', { defaultValue: 'Configured' })}
                </Tag>
              )}
            </div>
            <div className='text-12px text-t-secondary truncate'>{hasKey ? <span className='font-mono'>••••••{hint}</span> : info.description}</div>
          </div>
        </div>

        <div className='flex items-center gap-8px shrink-0'>
          {info.link && (
            <Tooltip content={t('settings.apiKeys.getKey', { defaultValue: 'Get API key' })}>
              <Button type='text' size='small' icon={<Link theme='outline' size='16' />} onClick={() => window.open(info.link, '_blank')} />
            </Tooltip>
          )}

          {hasKey ? (
            <>
              <Tooltip content={t('settings.apiKeys.update', { defaultValue: 'Update key' })}>
                <Button type='text' size='small' icon={<Save theme='outline' size='16' />} onClick={() => openAddModal(provider)} />
              </Tooltip>
              <Popconfirm title={t('settings.apiKeys.confirmDelete', { defaultValue: 'Delete this API key?' })} onOk={() => handleDeleteKey(provider)}>
                <Tooltip content={t('settings.apiKeys.delete', { defaultValue: 'Delete key' })}>
                  <Button type='text' size='small' status='danger' icon={<Delete theme='outline' size='16' />} />
                </Tooltip>
              </Popconfirm>
            </>
          ) : (
            <Button type='primary' size='small' icon={<Plus theme='outline' size='14' />} onClick={() => openAddModal(provider)}>
              {t('settings.apiKeys.add', { defaultValue: 'Add' })}
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Get other providers (not in common list but have stored keys or are available)
  const otherProviders = Object.keys(PROVIDER_INFO).filter((p) => !COMMON_PROVIDERS.includes(p) && (hasStoredKey(p) || true));

  return (
    <div className='flex flex-col h-full w-full'>
      {messageContext}

      <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
        {/* Security notice */}
        <Alert
          type='info'
          className='mb-16px'
          content={
            <div className='text-12px'>
              {t('settings.apiKeys.securityNote', {
                defaultValue: 'Your API keys are encrypted and stored securely. They are only used when you run CLI agents and are never shared with other users.',
              })}
            </div>
          }
        />

        {loading ? (
          <div className='flex items-center justify-center py-40px'>
            <Spin size={24} />
          </div>
        ) : (
          <Collapse defaultActiveKey={['common', 'other']} bordered={false}>
            {/* Common providers */}
            <Collapse.Item header={<span className='font-medium'>{t('settings.apiKeys.commonProviders', { defaultValue: 'Common Providers' })}</span>} name='common'>
              <div className='pt-8px'>{COMMON_PROVIDERS.map((provider) => renderProviderCard(provider))}</div>
            </Collapse.Item>

            {/* Other providers */}
            <Collapse.Item header={<span className='font-medium'>{t('settings.apiKeys.otherProviders', { defaultValue: 'Other Providers' })}</span>} name='other'>
              <div className='pt-8px'>{otherProviders.length > 0 ? otherProviders.map((provider) => renderProviderCard(provider)) : <Empty description={t('settings.apiKeys.noOther', { defaultValue: 'No other providers' })} />}</div>
            </Collapse.Item>
          </Collapse>
        )}
      </AionScrollArea>

      {/* Add/Update key modal */}
      <Modal
        title={
          selectedProvider
            ? hasStoredKey(selectedProvider)
              ? t('settings.apiKeys.updateTitle', {
                  provider: getProviderInfo(selectedProvider).name,
                  defaultValue: `Update ${getProviderInfo(selectedProvider).name} API Key`,
                })
              : t('settings.apiKeys.addTitle', {
                  provider: getProviderInfo(selectedProvider).name,
                  defaultValue: `Add ${getProviderInfo(selectedProvider).name} API Key`,
                })
            : ''
        }
        visible={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          setSelectedProvider(null);
          setApiKeyInput('');
        }}
        onOk={handleSaveKey}
        confirmLoading={saving}
        okText={t('common.save', { defaultValue: 'Save' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      >
        <Form layout='vertical'>
          <Form.Item label={t('settings.apiKeys.apiKey', { defaultValue: 'API Key' })}>
            <Input.Password placeholder={hasStoredKey(selectedProvider || '') ? t('settings.apiKeys.enterNewKey', { defaultValue: 'Enter new API key to update' }) : t('settings.apiKeys.enterKey', { defaultValue: 'Enter your API key' })} value={apiKeyInput} onChange={setApiKeyInput} autoFocus />
          </Form.Item>

          {selectedProvider && getProviderInfo(selectedProvider).link && (
            <div className='text-12px text-t-secondary'>
              {t('settings.apiKeys.getKeyFrom', { defaultValue: "Don't have a key?" })}{' '}
              <a href={getProviderInfo(selectedProvider).link} target='_blank' rel='noopener noreferrer' className='text-primary'>
                {t('settings.apiKeys.getOne', { defaultValue: 'Get one here' })} →
              </a>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default ApiKeysModalContent;
