import type { IProvider } from '@/common/storage';
import AionModal from '@/renderer/components/base/AionModal';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input } from '@arco-design/web-react';
import { LinkCloud } from '@icon-park/react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// Provider Logo imports
import AnthropicLogo from '@/renderer/assets/logos/anthropic.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import OpenAILogo from '@/renderer/assets/logos/openai.svg';
import OpenRouterLogo from '@/renderer/assets/logos/openrouter.svg';
import XaiLogo from '@/renderer/assets/logos/xai.svg';

/**
 * Provider config for logo resolution (includes name, URL, logo).
 * Alphabetical order; hidden providers commented out for easy re-enablement.
 */
const PROVIDER_CONFIGS = [
  { name: 'Anthropic', url: 'https://api.anthropic.com/v1', logo: AnthropicLogo },
  { name: 'Gemini', url: '', logo: GeminiLogo, platform: 'gemini' },
  { name: 'Gemini (Vertex AI)', url: '', logo: GeminiLogo, platform: 'gemini-vertex-ai' },
  { name: 'OpenAI', url: 'https://api.openai.com/v1', logo: OpenAILogo },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', logo: OpenRouterLogo },
  { name: 'xAI', url: 'https://api.x.ai/v1', logo: XaiLogo },
];

/**
 * Get provider logo by name or URL
 */
const getProviderLogo = (name?: string, baseUrl?: string, platform?: string): string | null => {
  if (!name && !baseUrl && !platform) return null;

  // Prioritize matching by platform (Gemini series)
  if (platform) {
    const byPlatform = PROVIDER_CONFIGS.find((p) => p.platform === platform);
    if (byPlatform) return byPlatform.logo;
  }

  // Match by exact name
  const byName = PROVIDER_CONFIGS.find((p) => p.name === name);
  if (byName) return byName.logo;

  // Match by name case-insensitively
  const byNameLower = PROVIDER_CONFIGS.find((p) => p.name.toLowerCase() === name?.toLowerCase());
  if (byNameLower) return byNameLower.logo;

  // Match by URL
  if (baseUrl) {
    const byUrl = PROVIDER_CONFIGS.find((p) => p.url && baseUrl.includes(p.url.replace('https://', '').split('/')[0]));
    if (byUrl) return byUrl.logo;
  }

  return null;
};

/**
 * Provider Logo Component
 */
const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 20 }) => {
  if (logo) {
    return <img src={logo} alt={name} className='object-contain shrink-0' style={{ width: size, height: size }} />;
  }
  return <LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />;
};

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(({ modalProps, modalCtrl, ...props }) => {
  const { t } = useTranslation();
  const { data } = props;
  const [form] = Form.useForm();

  // Get provider logo
  const providerLogo = useMemo(() => {
    return getProviderLogo(data?.name, data?.baseUrl, data?.platform);
  }, [data?.name, data?.baseUrl, data?.platform]);

  useEffect(() => {
    if (data) {
      // Serialize customHeaders object to JSON string for the textarea
      const formData = {
        ...data,
        customHeaders: data.customHeaders ? JSON.stringify(data.customHeaders, null, 2) : '',
      };
      form.setFieldsValue(formData);
    }
  }, [data]);

  return (
    <AionModal
      visible={modalProps.visible}
      onCancel={modalCtrl.close}
      header={{ title: t('settings.editModel'), showClose: true }}
      style={{ minHeight: '400px', maxHeight: '90vh', borderRadius: 16 }}
      contentStyle={{ background: 'var(--bg-1)', borderRadius: 16, padding: '20px 24px 16px', overflow: 'auto' }}
      onOk={async () => {
        const values = await form.validate();
        // Parse customHeaders from JSON string back to object
        let customHeaders: Record<string, string> | undefined;
        if (values.customHeaders?.trim()) {
          try {
            customHeaders = JSON.parse(values.customHeaders);
          } catch {
            return; // Invalid JSON, don't save
          }
        }
        props.onChange({ ...(data || {}), ...values, customHeaders });
        modalCtrl.close();
      }}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
    >
      <div className='py-20px'>
        <Form form={form} layout='vertical'>
          {/* Model Provider name (editable, with Logo) */}
          <Form.Item
            label={
              <div className='flex items-center gap-6px'>
                <ProviderLogo logo={providerLogo} name={data?.name || ''} size={16} />
                <span>{t('settings.modelProvider')}</span>
              </div>
            }
            field='name'
            required
            rules={[{ required: true }]}
          >
            <Input placeholder={t('settings.modelProvider')} />
          </Form.Item>

          {/* Base URL / Endpoint URL */}
          <Form.Item label={t('settings.baseUrl')} required={data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai'} rules={[{ required: data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' }]} field={'baseUrl'}>
            <Input placeholder='https://api.example.com/v1' />
          </Form.Item>

          <Form.Item label={t('settings.apiKey')} required rules={[{ required: true }]} field={'apiKey'} extra={<div className='text-11px text-t-secondary mt-2'>💡 {t('settings.multiApiKeyEditTip')}</div>}>
            <Input.TextArea rows={4} placeholder={t('settings.apiKeyPlaceholder')} />
          </Form.Item>

          {/* Custom Headers */}
          <Form.Item label='Custom Headers' field={'customHeaders'} extra={<div className='text-11px text-t-secondary mt-2'>Optional JSON headers for LLM gateway routing/auth</div>}>
            <Input.TextArea rows={3} placeholder='{"header-name": "header-value"}' />
          </Form.Item>
        </Form>
      </div>
    </AionModal>
  );
});

export default EditModeModal;
