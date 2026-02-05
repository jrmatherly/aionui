/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Form component for creating/editing global models.
 * Features:
 * - Alphabetically sorted platform list
 * - Auto-fetch available models after API key entry
 */

import { ipcBridge } from '@/common';
import { MODEL_PLATFORMS, getPlatformByValue, type PlatformConfig } from '@/renderer/config/modelPlatforms';
import { Button, Form, Input, InputNumber, Message, Select, Space, Switch } from '@arco-design/web-react';
import { LinkCloud, Refresh, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Provider Logo Component - displays platform logo with fallback icon
 */
const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 20 }) => {
  if (logo) {
    return <img src={logo} alt={name} className='object-contain shrink-0' style={{ width: size, height: size }} />;
  }
  return <LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />;
};

/**
 * Platform dropdown option renderer with logo
 */
const renderPlatformOption = (platform: PlatformConfig) => {
  return (
    <div className='flex items-center gap-8px'>
      <ProviderLogo logo={platform.logo} name={platform.name} size={18} />
      <span>{platform.name}</span>
    </div>
  );
};

const FormItem = Form.Item;

export interface GlobalModelFormData {
  platform: string;
  name: string;
  base_url?: string;
  api_key?: string;
  models: string[];
  enabled?: boolean;
  priority?: number;
}

interface GlobalModelFormProps {
  initialData?: {
    id: string;
    platform: string;
    name: string;
    base_url: string;
    models: string[];
    enabled: boolean;
    priority: number;
    apiKeyHint?: string;
  };
  onSubmit: (data: GlobalModelFormData) => void;
  onCancel: () => void;
}

const GlobalModelForm: React.FC<GlobalModelFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const [form] = Form.useForm<GlobalModelFormData>();
  const [message, messageContext] = Message.useMessage();
  const isEdit = !!initialData;

  // Model fetching state
  const [availableModels, setAvailableModels] = useState<{ label: string; value: string }[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);

  // Platform options from MODEL_PLATFORMS config - sorted alphabetically
  const sortedPlatforms = useMemo(() => {
    return [...MODEL_PLATFORMS].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // Watch form fields for model fetching
  const selectedPlatformValue = Form.useWatch('platform', form);
  const baseUrl = Form.useWatch('base_url', form);
  const apiKey = Form.useWatch('api_key', form);

  // Get platform config
  const selectedPlatform = useMemo(() => getPlatformByValue(selectedPlatformValue), [selectedPlatformValue]);

  // Determine actual base URL (prefer user input, fallback to platform preset)
  const actualBaseUrl = useMemo(() => {
    if (baseUrl) return baseUrl;
    return selectedPlatform?.baseUrl || '';
  }, [baseUrl, selectedPlatform?.baseUrl]);

  // Platforms that require baseUrl
  const baseUrlPlatforms = ['litellm', 'azureopenai', 'azureaifoundry', 'portkey', 'kong', 'agentgateway', 'envoy', 'custom'];
  const showBaseUrl = baseUrlPlatforms.some((p) => selectedPlatformValue?.toLowerCase().includes(p.toLowerCase())) || selectedPlatform?.requiresBaseUrl;

  // Fetch available models from the API
  const fetchModels = useCallback(async () => {
    if (!apiKey && !actualBaseUrl) {
      setAvailableModels([]);
      return;
    }

    setIsLoadingModels(true);
    setModelFetchError(null);

    try {
      const res = await ipcBridge.mode.fetchModelList.invoke({
        base_url: actualBaseUrl,
        api_key: apiKey || '',
        platform: selectedPlatform?.platform || 'custom',
        try_fix: true,
      });

      if (res.success && res.data?.mode) {
        const models = res.data.mode.map((m) => ({ label: m, value: m }));
        // Sort models alphabetically
        models.sort((a, b) => a.label.localeCompare(b.label));
        setAvailableModels(models);

        // Auto-fix base URL if returned
        if (res.data.fix_base_url) {
          form.setFieldValue('base_url', res.data.fix_base_url);
          message.info(`Base URL auto-corrected to: ${res.data.fix_base_url}`);
        }
      } else {
        setModelFetchError(res.msg || 'Failed to fetch models');
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModelFetchError('Failed to connect to API');
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, [apiKey, actualBaseUrl, selectedPlatform, form, message]);

  // Clear models when platform changes
  useEffect(() => {
    setAvailableModels([]);
    setModelFetchError(null);
    form.setFieldValue('models', []);
  }, [selectedPlatformValue, form]);

  // Pre-populate models for edit mode
  useEffect(() => {
    if (initialData?.models && initialData.models.length > 0) {
      setAvailableModels(initialData.models.map((m) => ({ label: m, value: m })));
    }
  }, [initialData]);

  const handleSubmit = () => {
    void form.validate().then((values) => {
      onSubmit({
        ...values,
        base_url: values.base_url || selectedPlatform?.baseUrl || '',
      });
    });
  };

  return (
    <Form
      form={form}
      layout='vertical'
      initialValues={
        initialData
          ? {
              platform: initialData.platform,
              name: initialData.name,
              base_url: initialData.base_url,
              models: initialData.models,
              enabled: initialData.enabled,
              priority: initialData.priority,
              api_key: '', // Don't prefill API key for security
            }
          : {
              enabled: true,
              priority: 0,
              models: [],
            }
      }
    >
      {messageContext}

      <FormItem label='Platform' field='platform' rules={[{ required: true, message: 'Please select a platform' }]}>
        <Select
          placeholder='Select platform'
          showSearch
          filterOption={(inputValue, option) => {
            const optionValue = (option as React.ReactElement<{ value?: string }>)?.props?.value;
            const plat = sortedPlatforms.find((p) => p.value === optionValue);
            return plat?.name.toLowerCase().includes(inputValue.toLowerCase()) ?? false;
          }}
          renderFormat={(option) => {
            const optionValue = (option as { value?: string })?.value;
            const plat = sortedPlatforms.find((p) => p.value === optionValue);
            if (!plat) return optionValue;
            return renderPlatformOption(plat);
          }}
        >
          {sortedPlatforms.map((plat) => (
            <Select.Option key={plat.value} value={plat.value}>
              {renderPlatformOption(plat)}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      <FormItem label='Name' field='name' rules={[{ required: true, message: 'Please enter a name' }]}>
        <Input placeholder='e.g., Corporate OpenAI' />
      </FormItem>

      {showBaseUrl && (
        <FormItem
          label='Base URL'
          field='base_url'
          rules={[
            { required: selectedPlatform?.requiresBaseUrl, message: 'Base URL is required for this platform' },
            {
              match: /^https?:\/\//,
              message: 'Must be a valid URL starting with http:// or https://',
            },
          ]}
        >
          <Input placeholder={selectedPlatform?.baseUrlPlaceholder || selectedPlatform?.baseUrl || 'https://your-gateway.example.com/v1'} onBlur={() => apiKey && void fetchModels()} />
        </FormItem>
      )}

      <FormItem
        label={isEdit ? 'API Key (leave empty to keep current)' : 'API Key'}
        field='api_key'
        rules={isEdit ? [] : [{ required: true, message: 'Please enter an API key' }]}
        extra={
          <div className='space-y-4px'>
            {isEdit && initialData?.apiKeyHint && <span className='text-12px text-t-secondary'>Current key: {initialData.apiKeyHint}</span>}
            <span className='text-11px text-t-tertiary block'>Enter API key and click refresh to load available models</span>
          </div>
        }
      >
        <Input.Password placeholder='sk-...' visibilityToggle onBlur={() => void fetchModels()} />
      </FormItem>

      <FormItem label='Models' field='models' rules={[{ required: true, message: 'Please select at least one model' }]} validateStatus={modelFetchError ? 'warning' : undefined} help={modelFetchError} extra={!modelFetchError && <span className='text-11px text-t-tertiary'>{availableModels.length > 0 ? `${availableModels.length} models available` : 'Enter API key above to load available models'}</span>}>
        <Select
          mode='multiple'
          placeholder={isLoadingModels ? 'Loading models...' : availableModels.length > 0 ? 'Select models...' : 'Enter API key to load models'}
          loading={isLoadingModels}
          allowCreate
          showSearch
          options={availableModels}
          filterOption={(inputValue, option) => (option as { label?: string })?.label?.toLowerCase().includes(inputValue.toLowerCase()) ?? false}
          suffixIcon={
            <div className='flex items-center gap-4px'>
              {isLoadingModels ? (
                <Refresh className='animate-spin text-t-secondary' size={14} />
              ) : (
                <Search
                  className='cursor-pointer text-t-secondary hover:text-primary transition-colors'
                  size={14}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!apiKey) {
                      Message.warning('Please enter an API key first');
                      return;
                    }
                    void fetchModels();
                  }}
                />
              )}
            </div>
          }
        />
      </FormItem>

      <div className='flex gap-16px'>
        <FormItem label='Enabled' field='enabled' triggerPropName='checked' className='flex-1'>
          <Switch />
        </FormItem>

        <FormItem label='Priority' field='priority' className='flex-1' extra='Higher = shown first'>
          <InputNumber min={0} max={100} placeholder='0' style={{ width: '100%' }} />
        </FormItem>
      </div>

      <FormItem className='mb-0 mt-24px'>
        <Space className='w-full justify-end'>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type='primary' onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Create Model'}
          </Button>
        </Space>
      </FormItem>
    </Form>
  );
};

export default GlobalModelForm;
