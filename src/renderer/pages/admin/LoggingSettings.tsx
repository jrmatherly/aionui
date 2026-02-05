/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin page for managing logging configuration.
 * Allows runtime control of log levels, OTEL, syslog, and Langfuse settings.
 */

import { createLogger } from '@/renderer/utils/logger';
import { Button, Card, Divider, Form, Input, InputNumber, Message, Select, Space, Switch } from '@arco-design/web-react';
import { Check, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';

const log = createLogger('LoggingSettings');

const FormItem = Form.Item;
const Option = Select.Option;

interface LoggingConfig {
  log_level: string;
  retention_days: number;
  max_size_mb: number;
  destinations: string[];
  otel_enabled: boolean;
  otel_endpoint?: string;
  otel_protocol?: string;
  otel_service_name?: string;
  syslog_enabled: boolean;
  syslog_host?: string;
  syslog_port?: number;
  syslog_protocol?: string;
  syslog_facility?: number;
  langfuse_enabled: boolean;
  langfuse_host?: string;
  langfuse_public_key?: string;
  langfuse_secret_key?: string;
  updated_by?: string;
  updated_at?: number;
}

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
const SYSLOG_PROTOCOLS = ['udp', 'tcp', 'tls'];
const OTEL_PROTOCOLS = ['http', 'grpc'];

const LoggingSettings: React.FC = () => {
  const [form] = Form.useForm<LoggingConfig>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSyslog, setTestingSyslog] = useState(false);
  const [message, messageContext] = Message.useMessage();

  // Fetch current configuration
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/logging', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        form.setFieldsValue(data.config);
      } else {
        message.error(data.error || 'Failed to fetch logging configuration');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch logging config');
      message.error('Failed to fetch logging configuration');
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  // Save configuration
  const handleSave = async () => {
    try {
      await form.validate();
      const values = form.getFieldsValue();

      setSaving(true);
      const response = await fetch('/api/admin/logging', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(values),
      });

      const data = await response.json();
      if (data.success) {
        message.success('Logging configuration updated successfully');
        void fetchConfig(); // Refresh to show updated values
      } else {
        message.error(data.error || 'Failed to update configuration');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to save logging config');
      message.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Test syslog connectivity
  const handleTestSyslog = async () => {
    try {
      await form.validate(['syslog_host', 'syslog_port', 'syslog_protocol']);
      const values = form.getFieldsValue(['syslog_host', 'syslog_port', 'syslog_protocol']);

      setTestingSyslog(true);
      const response = await fetch('/api/admin/logging/test-syslog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          host: values.syslog_host,
          port: values.syslog_port,
          protocol: values.syslog_protocol,
        }),
      });

      const data = await response.json();
      if (data.success) {
        message.success(data.message || 'Syslog connectivity test successful');
      } else {
        message.error(data.error || 'Syslog connectivity test failed');
      }
    } catch (error) {
      log.error({ err: error }, 'Syslog test failed');
      message.error('Syslog connectivity test failed');
    } finally {
      setTestingSyslog(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      {messageContext}
      <h2 style={{ marginBottom: '20px' }}>Logging Settings</h2>

      <Form
        form={form}
        layout='vertical'
        initialValues={{
          log_level: 'info',
          retention_days: 30,
          max_size_mb: 500,
          otel_enabled: false,
          otel_endpoint: 'http://localhost:4318',
          otel_protocol: 'http',
          otel_service_name: 'aionui',
          syslog_enabled: false,
          syslog_host: 'localhost',
          syslog_port: 514,
          syslog_protocol: 'udp',
          syslog_facility: 16,
          langfuse_enabled: false,
          langfuse_host: 'https://cloud.langfuse.com',
        }}
      >
        {/* Core Logging Settings */}
        <Card title='Core Logging' bordered style={{ marginBottom: '20px' }}>
          <FormItem label='Log Level' field='log_level' rules={[{ required: true, message: 'Log level is required' }]}>
            <Select placeholder='Select log level' disabled={loading}>
              {LOG_LEVELS.map((level) => (
                <Option key={level} value={level}>
                  {level.toUpperCase()}
                </Option>
              ))}
            </Select>
          </FormItem>

          <FormItem
            label='Retention Days'
            field='retention_days'
            rules={[
              { required: true, message: 'Retention days is required' },
              { type: 'number', min: 1, max: 365, message: 'Must be between 1 and 365' },
            ]}
          >
            <InputNumber placeholder='Days to keep logs' min={1} max={365} style={{ width: '100%' }} disabled={loading} />
          </FormItem>

          <FormItem
            label='Max Log File Size (MB)'
            field='max_size_mb'
            rules={[
              { required: true, message: 'Max size is required' },
              { type: 'number', min: 10, max: 10000, message: 'Must be between 10 and 10000' },
            ]}
          >
            <InputNumber placeholder='Max file size in MB' min={10} max={10000} style={{ width: '100%' }} disabled={loading} />
          </FormItem>
        </Card>

        {/* OpenTelemetry Settings */}
        <Card title='OpenTelemetry (Distributed Tracing)' bordered style={{ marginBottom: '20px' }}>
          <FormItem label='Enable OTEL' field='otel_enabled' triggerPropName='checked'>
            <Switch disabled={loading} />
          </FormItem>

          <Form.Item noStyle shouldUpdate={(prev, next) => prev.otel_enabled !== next.otel_enabled}>
            {(values) => {
              const otelEnabled = values.otel_enabled;
              return (
                <>
                  <FormItem
                    label='OTLP Endpoint'
                    field='otel_endpoint'
                    rules={[
                      {
                        required: otelEnabled,
                        message: 'OTLP endpoint is required when OTEL is enabled',
                      },
                    ]}
                  >
                    <Input placeholder='http://localhost:4318' disabled={loading || !otelEnabled} />
                  </FormItem>

                  <FormItem label='Protocol' field='otel_protocol'>
                    <Select placeholder='Select protocol' disabled={loading || !otelEnabled}>
                      {OTEL_PROTOCOLS.map((protocol) => (
                        <Option key={protocol} value={protocol}>
                          {protocol.toUpperCase()}
                        </Option>
                      ))}
                    </Select>
                  </FormItem>

                  <FormItem label='Service Name' field='otel_service_name'>
                    <Input placeholder='aionui' disabled={loading || !otelEnabled} />
                  </FormItem>
                </>
              );
            }}
          </Form.Item>
        </Card>

        {/* Syslog Settings */}
        <Card title='Syslog / SIEM Forwarding' bordered style={{ marginBottom: '20px' }}>
          <FormItem label='Enable Syslog' field='syslog_enabled' triggerPropName='checked'>
            <Switch disabled={loading} />
          </FormItem>

          <Form.Item noStyle shouldUpdate={(prev, next) => prev.syslog_enabled !== next.syslog_enabled}>
            {(values) => {
              const syslogEnabled = values.syslog_enabled;
              return (
                <>
                  <FormItem
                    label='Syslog Host'
                    field='syslog_host'
                    rules={[
                      {
                        required: syslogEnabled,
                        message: 'Syslog host is required when syslog is enabled',
                      },
                    ]}
                  >
                    <Input placeholder='syslog.example.com' disabled={loading || !syslogEnabled} />
                  </FormItem>

                  <FormItem
                    label='Port'
                    field='syslog_port'
                    rules={[
                      {
                        required: syslogEnabled,
                        message: 'Port is required when syslog is enabled',
                      },
                      { type: 'number', min: 1, max: 65535, message: 'Invalid port number' },
                    ]}
                  >
                    <InputNumber placeholder='514' min={1} max={65535} style={{ width: '100%' }} disabled={loading || !syslogEnabled} />
                  </FormItem>

                  <FormItem label='Protocol' field='syslog_protocol'>
                    <Select placeholder='Select protocol' disabled={loading || !syslogEnabled}>
                      {SYSLOG_PROTOCOLS.map((protocol) => (
                        <Option key={protocol} value={protocol}>
                          {protocol.toUpperCase()}
                        </Option>
                      ))}
                    </Select>
                  </FormItem>

                  <FormItem label='Facility' field='syslog_facility' rules={[{ type: 'number', min: 0, max: 23, message: 'Must be between 0 and 23' }]}>
                    <InputNumber placeholder='16 (local0)' min={0} max={23} style={{ width: '100%' }} disabled={loading || !syslogEnabled} />
                  </FormItem>

                  {syslogEnabled && (
                    <FormItem>
                      <Button type='outline' icon={testingSyslog ? <Refresh spin /> : <Check />} onClick={handleTestSyslog} loading={testingSyslog} disabled={loading}>
                        Test Syslog Connectivity
                      </Button>
                    </FormItem>
                  )}
                </>
              );
            }}
          </Form.Item>
        </Card>

        {/* Langfuse Settings */}
        <Card title='Langfuse (LLM Observability)' bordered style={{ marginBottom: '20px' }}>
          <FormItem label='Enable Langfuse' field='langfuse_enabled' triggerPropName='checked'>
            <Switch disabled={loading} />
          </FormItem>

          <Form.Item noStyle shouldUpdate={(prev, next) => prev.langfuse_enabled !== next.langfuse_enabled}>
            {(values) => {
              const langfuseEnabled = values.langfuse_enabled;
              return (
                <>
                  <FormItem
                    label='Langfuse Host'
                    field='langfuse_host'
                    rules={[
                      {
                        required: langfuseEnabled,
                        message: 'Langfuse host is required when Langfuse is enabled',
                      },
                    ]}
                  >
                    <Input placeholder='https://cloud.langfuse.com' disabled={loading || !langfuseEnabled} />
                  </FormItem>

                  <FormItem
                    label='Public Key'
                    field='langfuse_public_key'
                    rules={[
                      {
                        required: langfuseEnabled,
                        message: 'Public key is required when Langfuse is enabled',
                      },
                    ]}
                  >
                    <Input.Password placeholder='pk-...' disabled={loading || !langfuseEnabled} visibilityToggle />
                  </FormItem>

                  <FormItem
                    label='Secret Key'
                    field='langfuse_secret_key'
                    rules={[
                      {
                        required: langfuseEnabled,
                        message: 'Secret key is required when Langfuse is enabled',
                      },
                    ]}
                  >
                    <Input.Password placeholder='sk-...' disabled={loading || !langfuseEnabled} visibilityToggle />
                  </FormItem>
                </>
              );
            }}
          </Form.Item>
        </Card>

        <Divider />

        {/* Action Buttons */}
        <Space size='medium'>
          <Button type='primary' onClick={handleSave} loading={saving} disabled={loading}>
            Save Configuration
          </Button>
          <Button onClick={fetchConfig} disabled={loading || saving}>
            Reset
          </Button>
        </Space>
      </Form>
    </div>
  );
};

export default LoggingSettings;
