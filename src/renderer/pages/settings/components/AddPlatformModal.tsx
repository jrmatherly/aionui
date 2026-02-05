import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/storage';
import { uuid } from '@/common/utils';
import { isGoogleApisHost } from '@/common/utils/urlValidation';
import AionModal from '@/renderer/components/base/AionModal';
import { renderPlatformOption } from '@/renderer/components/shared/ProviderLogo';
import { MODEL_PLATFORMS, getPlatformByValue, isCustomOption, isGeminiPlatform } from '@/renderer/config/modelPlatforms';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Message, Select } from '@arco-design/web-react';
import { Edit, Search } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import useModeModeList from '../../../hooks/useModeModeList';
import useProtocolDetection from '../../../hooks/useProtocolDetection';
import ApiKeyEditorModal from './ApiKeyEditorModal';
import ProtocolDetectionStatus from './ProtocolDetectionStatus';

const AddPlatformModal = ModalHOC<{
  onSubmit: (platform: IProvider) => void;
}>(({ modalProps, onSubmit, modalCtrl }) => {
  const [message, messageContext] = Message.useMessage();
  const [form] = Form.useForm();
  const [apiKeyEditorVisible, setApiKeyEditorVisible] = useState(false);
  // Track last detection input to avoid redundant detection
  const [lastDetectionInput, setLastDetectionInput] = useState<{ baseUrl: string; apiKey: string } | null>(null);

  const platformValue = Form.useWatch('platform', form);
  const baseUrl = Form.useWatch('baseUrl', form);
  const apiKey = Form.useWatch('apiKey', form);
  const customHeadersRaw = Form.useWatch('customHeaders', form);

  // Get current selected platform config
  const selectedPlatform = useMemo(() => getPlatformByValue(platformValue), [platformValue]);

  const platform = selectedPlatform?.platform ?? 'gemini';
  // Check if "Custom" option (no preset baseUrl)
  const isCustom = isCustomOption(platformValue);
  const isGemini = isGeminiPlatform(platform);

  // Show base URL field for custom, gemini, and gateway/proxy providers
  const showBaseUrl = isCustom || platformValue === 'gemini' || !!selectedPlatform?.requiresBaseUrl || ['LiteLLM', 'Portkey', 'AzureOpenAI', 'AzureAIFoundry', 'KongAI', 'AgentGateway', 'EnvoyAI'].includes(platformValue);
  // Base URL is required when no usable preset exists
  const requiresBaseUrl = isCustom || !!selectedPlatform?.requiresBaseUrl;
  // Show custom headers for gateway providers or when platform has default headers
  const showCustomHeaders = isCustom || !!selectedPlatform?.defaultHeaders || ['Portkey', 'EnvoyAI'].includes(platformValue);

  // Calculate actual baseUrl (prefer user input, fallback to platform preset)
  const actualBaseUrl = useMemo(() => {
    if (baseUrl) return baseUrl;
    return selectedPlatform?.baseUrl || '';
  }, [baseUrl, selectedPlatform?.baseUrl]);

  // Parse custom headers for model list fetching (safe parse, ignore invalid JSON)
  const parsedCustomHeaders = useMemo(() => {
    if (!customHeadersRaw?.trim()) return undefined;
    try {
      return JSON.parse(customHeadersRaw) as Record<string, string>;
    } catch {
      return undefined;
    }
  }, [customHeadersRaw]);

  const modelListState = useModeModeList(platform, actualBaseUrl, apiKey, true, parsedCustomHeaders);

  // Protocol detection hook
  // Enable detection when:
  // 1. Custom platform OR user entered a custom base URL (non-official, like local proxy)
  // 2. Input values differ from last "accepted suggestion" (avoid redundant detection after platform switch)
  const isNonOfficialBaseUrl = baseUrl && !isGoogleApisHost(baseUrl);
  const shouldEnableDetection = isCustom || isNonOfficialBaseUrl;
  // Only trigger detection when input changed since last accepted suggestion
  const inputChangedSinceLastSwitch = !lastDetectionInput || lastDetectionInput.baseUrl !== actualBaseUrl || lastDetectionInput.apiKey !== apiKey;
  const protocolDetection = useProtocolDetection(shouldEnableDetection && inputChangedSinceLastSwitch ? actualBaseUrl : '', shouldEnableDetection && inputChangedSinceLastSwitch ? apiKey : '', {
    debounceMs: 1000,
    autoDetect: true,
    timeout: 10000,
  });

  // Whether to show detection result: enabled AND (has result or detecting) AND input changed since last switch
  const shouldShowDetectionResult = shouldEnableDetection && inputChangedSinceLastSwitch;

  // Handle platform switch suggestion
  const handleSwitchPlatform = (suggestedPlatform: string) => {
    const targetPlatform = MODEL_PLATFORMS.find((p) => p.value === suggestedPlatform || p.name === suggestedPlatform);
    if (targetPlatform) {
      form.setFieldValue('platform', targetPlatform.value);
      form.setFieldValue('model', '');
      protocolDetection.reset();
      // Record current input to prevent redundant detection after switch
      setLastDetectionInput({ baseUrl: actualBaseUrl, apiKey });
      message.success(`Switched to ${targetPlatform.name} platform`);
    }
  };

  // Reset form when modal opens
  useEffect(() => {
    if (modalProps.visible) {
      form.resetFields();
      form.setFieldValue('platform', 'gemini');
      protocolDetection.reset();
      setLastDetectionInput(null); // Reset detection record
    }
  }, [modalProps.visible]);

  useEffect(() => {
    if (platform?.includes('gemini')) {
      void modelListState.mutate();
    }
  }, [platform]);

  // Handle auto-fixed base_url
  useEffect(() => {
    if (modelListState.data?.fix_base_url) {
      form.setFieldValue('baseUrl', modelListState.data.fix_base_url);
      message.info(`base_url auto fix to: ${modelListState.data.fix_base_url}`);
    }
  }, [modelListState.data?.fix_base_url, form]);

  const handleSubmit = () => {
    form
      .validate()
      .then((values) => {
        // Use platform display name or fall back to platform value
        const name = selectedPlatform?.name ?? values.platform;

        // Parse custom headers from JSON string (if provided)
        let customHeaders: Record<string, string> | undefined;
        if (values.customHeaders?.trim()) {
          try {
            customHeaders = JSON.parse(values.customHeaders);
          } catch {
            message.error('Invalid JSON format in Custom Headers');
            return;
          }
        }

        onSubmit({
          id: uuid(),
          platform: selectedPlatform?.platform ?? 'custom',
          name,
          // Prefer user input baseUrl, fallback to platform preset
          baseUrl: values.baseUrl || selectedPlatform?.baseUrl || '',
          apiKey: values.apiKey,
          model: [values.model],
          customHeaders,
        });
        modalCtrl.close();
      })
      .catch(() => {
        // validation failed
      });
  };

  return (
    <AionModal visible={modalProps.visible} onCancel={modalCtrl.close} header={{ title: 'Add Model', showClose: true }} style={{ maxWidth: '92vw', borderRadius: 16 }} contentStyle={{ background: 'var(--bg-1)', borderRadius: 16, padding: '20px 24px 16px', overflow: 'auto' }} onOk={handleSubmit} confirmLoading={modalProps.confirmLoading} okText={'Confirm'} cancelText={'Cancel'}>
      {messageContext}
      <div className='flex flex-col gap-16px py-20px'>
        <Form form={form} layout='vertical' className='space-y-0'>
          {/* Model Platform Selection (first level) */}
          <Form.Item initialValue='gemini' label={'Model Platform'} field={'platform'} required rules={[{ required: true }]}>
            <Select
              showSearch
              filterOption={(inputValue, option) => {
                const optionValue = (option as React.ReactElement<{ value?: string }>)?.props?.value;
                const plat = MODEL_PLATFORMS.find((p) => p.value === optionValue);
                return plat?.name.toLowerCase().includes(inputValue.toLowerCase()) ?? false;
              }}
              onChange={(value) => {
                const plat = MODEL_PLATFORMS.find((p) => p.value === value);
                if (plat) {
                  form.setFieldValue('model', '');
                }
              }}
              renderFormat={(option) => {
                const optionValue = (option as { value?: string })?.value;
                const plat = MODEL_PLATFORMS.find((p) => p.value === optionValue);
                if (!plat) return optionValue;
                return renderPlatformOption(plat);
              }}
            >
              {MODEL_PLATFORMS.map((plat) => (
                <Select.Option key={plat.value} value={plat.value}>
                  {renderPlatformOption(plat)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* Base URL - shown for Custom, Gemini, and gateway/proxy providers */}
          <Form.Item hidden={!showBaseUrl} label={'base url'} field={'baseUrl'} required={requiresBaseUrl} rules={[{ required: requiresBaseUrl }]}>
            <Input
              placeholder={selectedPlatform?.baseUrlPlaceholder || selectedPlatform?.baseUrl || 'https://api.example.com/v1'}
              onBlur={() => {
                void modelListState.mutate();
              }}
            />
          </Form.Item>

          {/* API Key */}
          <Form.Item
            label={'API Key'}
            required
            rules={[{ required: true }]}
            field={'apiKey'}
            extra={
              <div className='space-y-2px'>
                <div className='text-11px text-t-secondary mt-2 leading-4'>{'💡 To add multiple API Keys for auto-rotation, configure in platform edit later'}</div>
                {/* Protocol detection status */}
                {shouldShowDetectionResult && <ProtocolDetectionStatus isDetecting={protocolDetection.isDetecting} result={protocolDetection.result} currentPlatform={platformValue} onSwitchPlatform={handleSwitchPlatform} />}
              </div>
            }
          >
            <Input
              onBlur={() => {
                void modelListState.mutate();
              }}
              suffix={<Edit theme='outline' size={16} className='cursor-pointer text-t-secondary hover:text-t-primary flex' onClick={() => setApiKeyEditorVisible(true)} />}
            />
          </Form.Item>

          {/* Custom Headers — for gateway/proxy providers */}
          {showCustomHeaders && (
            <Form.Item
              label='Custom Headers'
              field={'customHeaders'}
              extra={
                <div className='text-11px text-t-secondary mt-2 leading-4'>
                  Optional HTTP headers for gateway routing/auth (JSON format).
                  {selectedPlatform?.helpUrl && (
                    <>
                      {' '}
                      <a href={selectedPlatform.helpUrl} target='_blank' rel='noopener noreferrer' className='text-[rgb(var(--primary-6))]'>
                        Provider docs →
                      </a>
                    </>
                  )}
                </div>
              }
            >
              <Input.TextArea rows={3} placeholder={selectedPlatform?.defaultHeaders ? JSON.stringify(selectedPlatform.defaultHeaders, null, 2) : '{"header-name": "header-value"}'} />
            </Form.Item>
          )}

          {/* Model Selection */}
          <Form.Item label={'Model Name'} field={'model'} required rules={[{ required: true }]} validateStatus={modelListState.error ? 'error' : 'success'} help={modelListState.error}>
            <Select
              loading={modelListState.isLoading}
              showSearch
              allowCreate
              suffixIcon={
                <Search
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCustom && !baseUrl) {
                      message.warning('Please enter Base URL');
                      return;
                    }
                    if (!isGemini && !apiKey) {
                      message.warning('Please enter API Key');
                      return;
                    }
                    void modelListState.mutate();
                  }}
                  className='flex'
                />
              }
              options={modelListState.data?.models || []}
            />
          </Form.Item>
        </Form>
      </div>

      {/* API Key Editor Modal */}
      <ApiKeyEditorModal
        visible={apiKeyEditorVisible}
        apiKeys={apiKey || ''}
        onClose={() => setApiKeyEditorVisible(false)}
        onSave={(keys) => {
          form.setFieldValue('apiKey', keys);
          void modelListState.mutate();
        }}
        onTestKey={async (key) => {
          try {
            const res = await ipcBridge.mode.fetchModelList.invoke({
              base_url: actualBaseUrl,
              api_key: key,
              platform: selectedPlatform?.platform ?? 'custom',
              custom_headers: parsedCustomHeaders,
            });
            // Strict check: success is true and model list is returned
            return res.success === true && Array.isArray(res.data?.mode) && res.data.mode.length > 0;
          } catch {
            return false;
          }
        }}
      />
    </AionModal>
  );
});

export default AddPlatformModal;
