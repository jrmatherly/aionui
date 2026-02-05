/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Form component for creating/editing global models.
 */

import { MODEL_PLATFORMS, type PlatformConfig } from '@/renderer/config/modelPlatforms';
import { Button, Form, Input, InputNumber, InputTag, Select, Space, Switch } from '@arco-design/web-react';
import React from 'react';

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

  // Platform options from MODEL_PLATFORMS config
  const platformOptions = MODEL_PLATFORMS.map((p: PlatformConfig) => ({
    label: p.name,
    value: p.value,
  }));

  const handleSubmit = () => {
    void form.validate().then((values) => {
      onSubmit({
        ...values,
        base_url: values.base_url || '',
      });
    });
  };

  // Platforms that require baseUrl
  const baseUrlPlatforms = ['litellm', 'azureopenai', 'azureaifoundry', 'portkey', 'kong', 'agentgateway', 'envoy'];
  const selectedPlatform = Form.useWatch('platform', form);
  const showBaseUrl = baseUrlPlatforms.includes(selectedPlatform);

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
        <Select placeholder='Select platform' options={platformOptions} showSearch filterOption={(inputValue, option) => (option as { label?: string })?.label?.toLowerCase().includes(inputValue.toLowerCase()) ?? false} />
      </FormItem>

      <FormItem label='Name' field='name' rules={[{ required: true, message: 'Please enter a name' }]}>
        <Input placeholder='e.g., Corporate OpenAI' />
      </FormItem>

      {showBaseUrl && (
        <FormItem
          label='Base URL'
          field='base_url'
          rules={[
            { required: true, message: 'Base URL is required for this platform' },
            {
              match: /^https?:\/\//,
              message: 'Must be a valid URL starting with http:// or https://',
            },
          ]}
        >
          <Input placeholder='https://your-gateway.example.com/v1' />
        </FormItem>
      )}

      <FormItem label={isEdit ? 'API Key (leave empty to keep current)' : 'API Key'} field='api_key' rules={isEdit ? [] : [{ required: true, message: 'Please enter an API key' }]} extra={isEdit && initialData?.apiKeyHint ? <span className='text-12px text-t-secondary'>Current key: {initialData.apiKeyHint}</span> : undefined}>
        <Input.Password placeholder='sk-...' visibilityToggle />
      </FormItem>

      <FormItem label='Models' field='models' rules={[{ required: true, message: 'Please add at least one model' }]} extra='Press Enter to add each model name'>
        <InputTag placeholder='Enter model names...' allowClear tokenSeparators={[',']} />
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
