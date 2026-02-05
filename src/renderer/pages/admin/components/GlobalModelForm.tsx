/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Form component for creating/editing global models.
 * Features:
 * - Shared PlatformSelect with provider logos (alphabetically sorted)
 * - Shared useModeModeList hook for model fetching (SWR-based)
 * - Admin-specific fields: enabled toggle, priority
 */

import PlatformSelect from '@/renderer/components/shared/PlatformSelect';
import { getPlatformByValue } from '@/renderer/config/modelPlatforms';
import useModeModeList from '@/renderer/hooks/useModeModeList';
import { Button, Form, Input, InputNumber, Message, Select, Space, Switch } from '@arco-design/web-react';
import { Refresh, Search } from '@icon-park/react';
import React, { useEffect, useMemo } from 'react';

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
  const isEdit = !!initialData;

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

  // Model fetching via shared SWR hook
  const modelListState = useModeModeList(selectedPlatform?.platform || 'custom', actualBaseUrl, apiKey, true);

  // Merge fetched models with initial models (for edit mode where API key isn't sent back)
  const availableModels = useMemo(() => {
    const fetched = modelListState.data?.models || [];
    if (!initialData?.models?.length) return fetched;

    // In edit mode, seed with existing models and merge any fetched results
    const initialOptions = initialData.models.map((m) => ({ label: m, value: m }));
    if (fetched.length === 0) return initialOptions;

    // Merge: fetched models + any initial models not in fetched list
    const fetchedValues = new Set(fetched.map((f) => f.value));
    const extras = initialOptions.filter((m) => !fetchedValues.has(m.value));
    return [...fetched, ...extras];
  }, [modelListState.data?.models, initialData?.models]);

  // Handle auto-fixed base URL from API
  useEffect(() => {
    if (modelListState.data?.fix_base_url) {
      form.setFieldValue('base_url', modelListState.data.fix_base_url);
      Message.info(`Base URL auto-corrected to: ${modelListState.data.fix_base_url}`);
    }
  }, [modelListState.data?.fix_base_url, form]);

  // Clear model selection when platform changes
  useEffect(() => {
    if (!initialData) {
      form.setFieldValue('models', []);
    }
  }, [selectedPlatformValue, form, initialData]);

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
      <FormItem label='Platform' field='platform' rules={[{ required: true, message: 'Please select a platform' }]}>
        <PlatformSelect
          onChange={(value) => {
            form.setFieldValue('platform', value);
          }}
        />
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
          <Input placeholder={selectedPlatform?.baseUrlPlaceholder || selectedPlatform?.baseUrl || 'https://your-gateway.example.com/v1'} onBlur={() => apiKey && void modelListState.mutate()} />
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
        <Input.Password placeholder='sk-...' visibilityToggle onBlur={() => void modelListState.mutate()} />
      </FormItem>

      <FormItem label='Models' field='models' rules={[{ required: true, message: 'Please select at least one model' }]} validateStatus={modelListState.error ? 'warning' : undefined} help={modelListState.error ? String(modelListState.error) : undefined} extra={!modelListState.error && <span className='text-11px text-t-tertiary'>{availableModels.length > 0 ? `${availableModels.length} models available` : 'Enter API key above to load available models'}</span>}>
        <Select
          mode='multiple'
          placeholder={modelListState.isLoading ? 'Loading models...' : availableModels.length > 0 ? 'Select models...' : 'Enter API key to load models'}
          loading={modelListState.isLoading}
          allowCreate
          showSearch
          options={availableModels}
          filterOption={(inputValue, option) => (option as { label?: string })?.label?.toLowerCase().includes(inputValue.toLowerCase()) ?? false}
          suffixIcon={
            <div className='flex items-center gap-4px'>
              {modelListState.isLoading ? (
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
                    void modelListState.mutate();
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
