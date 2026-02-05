import type { IProvider } from '@/common/storage';
import AionModal from '@/renderer/components/base/AionModal';
import { ProviderLogo, getProviderLogo } from '@/renderer/components/shared/ProviderLogo';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input } from '@arco-design/web-react';
import React, { useEffect, useMemo } from 'react';

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(({ modalProps, modalCtrl, ...props }) => {
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
      header={{ title: 'Edit Model Platform', showClose: true }}
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
      okText={'Save'}
      cancelText={'Cancel'}
    >
      <div className='py-20px'>
        <Form form={form} layout='vertical'>
          {/* Model Provider name (editable, with Logo) */}
          <Form.Item
            label={
              <div className='flex items-center gap-6px'>
                <ProviderLogo logo={providerLogo} name={data?.name || ''} size={16} />
                <span>{'Model Provider'}</span>
              </div>
            }
            field='name'
            required
            rules={[{ required: true }]}
          >
            <Input placeholder={'Model Provider'} />
          </Form.Item>

          {/* Base URL / Endpoint URL */}
          <Form.Item label={'base url'} required={data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai'} rules={[{ required: data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' }]} field={'baseUrl'}>
            <Input placeholder='https://api.example.com/v1' />
          </Form.Item>

          <Form.Item label={'API Key'} required rules={[{ required: true }]} field={'apiKey'} extra={<div className='text-11px text-t-secondary mt-2'>💡 {'Support multiple API Keys, one per line, system will auto-rotate'}</div>}>
            <Input.TextArea rows={4} placeholder={'Enter API Key(s), one per line for multiple keys'} />
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
