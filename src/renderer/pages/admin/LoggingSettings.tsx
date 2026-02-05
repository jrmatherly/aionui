/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin page for managing logging configuration.
 * Allows runtime control of log levels, OTEL, syslog, and Langfuse settings.
 */

import { createLogger } from '@/renderer/utils/logger';
import { Button, Card, Form, Grid, Input, InputNumber, Message, Select, Switch, Typography } from '@arco-design/web-react';
import { Check, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';

const log = createLogger('LoggingSettings');

const FormItem = Form.Item;
const Option = Select.Option;
const Row = Grid.Row;
const Col = Grid.Col;

interface LoggingConfig {
  log_level: string;
  log_format: string;
  log_file?: string;
  retention_days: number;
  max_size_mb: number;
  destinations: string[];
  otel_enabled: boolean;
  otel_endpoint?: string;
  otel_protocol?: string;
  otel_service_name?: string;
  otel_log_level?: string;
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
const LOG_FORMATS = ['json', 'pretty'];
const SYSLOG_PROTOCOLS = ['udp', 'tcp', 'tls'];
const OTEL_PROTOCOLS = ['http', 'grpc'];
const OTEL_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

/** Shared gutter for all grid rows */
const GUTTER = 20;

const LoggingSettings: React.FC = () => {
  const [form] = Form.useForm<LoggingConfig>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSyslog, setTestingSyslog] = useState(false);

  // NOTE: Use static Message.error/success instead of useMessage() hook.
  // The hook returns a new reference each render which causes infinite
  // re-fetch loops when used in useCallback dependency arrays.

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
        Message.error(data.error || 'Failed to fetch logging configuration');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch logging config');
      Message.error('Failed to fetch logging configuration');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

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
        Message.success('Logging configuration updated successfully');
        void fetchConfig();
      } else {
        Message.error(data.error || 'Failed to update configuration');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to save logging config');
      Message.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

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
        Message.success(data.message || 'Syslog connectivity test successful');
      } else {
        Message.error(data.error || 'Syslog connectivity test failed');
      }
    } catch (error) {
      log.error({ err: error }, 'Syslog test failed');
      Message.error('Syslog connectivity test failed');
    } finally {
      setTestingSyslog(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <Typography.Title heading={4} style={{ margin: 0 }}>
            Logging Settings
          </Typography.Title>
          <Typography.Text type='secondary' style={{ fontSize: '13px' }}>
            Configure log levels, distributed tracing, SIEM forwarding, and LLM observability.
          </Typography.Text>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button onClick={fetchConfig} disabled={loading || saving} icon={<Refresh />}>
            Reset
          </Button>
          <Button type='primary' onClick={handleSave} loading={saving} disabled={loading}>
            Save Configuration
          </Button>
        </div>
      </div>

      <Form
        form={form}
        layout='vertical'
        initialValues={{
          log_level: 'info',
          log_format: 'json',
          log_file: '',
          retention_days: 30,
          max_size_mb: 500,
          otel_enabled: false,
          otel_endpoint: 'http://localhost:4318',
          otel_protocol: 'http',
          otel_service_name: 'aionui',
          otel_log_level: 'info',
          syslog_enabled: false,
          syslog_host: 'localhost',
          syslog_port: 514,
          syslog_protocol: 'udp',
          syslog_facility: 16,
          langfuse_enabled: false,
          langfuse_host: 'https://cloud.langfuse.com',
        }}
      >
        {/* Row 1: Core Logging + OpenTelemetry */}
        <Row gutter={GUTTER} style={{ marginBottom: '20px' }}>
          <Col xs={24} md={12}>
            <Card title='Core Logging' bordered style={{ height: '100%' }}>
              <Row gutter={GUTTER}>
                <Col span={12}>
                  <FormItem label='Log Level' field='log_level' rules={[{ required: true, message: 'Log level is required' }]}>
                    <Select placeholder='Select log level' disabled={loading}>
                      {LOG_LEVELS.map((level) => (
                        <Option key={level} value={level}>
                          {level.toUpperCase()}
                        </Option>
                      ))}
                    </Select>
                  </FormItem>
                </Col>
                <Col span={12}>
                  <FormItem label='Log Format' field='log_format' rules={[{ required: true, message: 'Log format is required' }]}>
                    <Select placeholder='Select format' disabled={loading}>
                      {LOG_FORMATS.map((fmt) => (
                        <Option key={fmt} value={fmt}>
                          {fmt.toUpperCase()}
                        </Option>
                      ))}
                    </Select>
                  </FormItem>
                </Col>
              </Row>

              <FormItem label='Log File Path' field='log_file' extra='Optional — writes JSON to file with rotation. Leave blank for stdout only.'>
                <Input placeholder='/var/log/aionui/app.log' disabled={loading} allowClear />
              </FormItem>

              <Row gutter={GUTTER}>
                <Col span={12}>
                  <FormItem
                    label='Retention Days'
                    field='retention_days'
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: 1, max: 365, message: '1–365' },
                    ]}
                  >
                    <InputNumber placeholder='30' min={1} max={365} style={{ width: '100%' }} disabled={loading} />
                  </FormItem>
                </Col>
                <Col span={12}>
                  <FormItem
                    label='Max File Size (MB)'
                    field='max_size_mb'
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: 10, max: 10000, message: '10–10,000' },
                    ]}
                  >
                    <InputNumber placeholder='500' min={10} max={10000} style={{ width: '100%' }} disabled={loading} />
                  </FormItem>
                </Col>
              </Row>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title='OpenTelemetry (Distributed Tracing)' bordered style={{ height: '100%' }}>
              <FormItem label='Enable OTEL' field='otel_enabled' triggerPropName='checked'>
                <Switch disabled={loading} />
              </FormItem>

              <Form.Item noStyle shouldUpdate={(prev, next) => prev.otel_enabled !== next.otel_enabled}>
                {(values) => {
                  const otelEnabled = values.otel_enabled;
                  return (
                    <>
                      <FormItem label='OTLP Endpoint' field='otel_endpoint' rules={[{ required: otelEnabled, message: 'Required when OTEL is enabled' }]}>
                        <Input placeholder='http://localhost:4318' disabled={loading || !otelEnabled} />
                      </FormItem>

                      <Row gutter={GUTTER}>
                        <Col span={12}>
                          <FormItem label='Protocol' field='otel_protocol'>
                            <Select placeholder='Protocol' disabled={loading || !otelEnabled}>
                              {OTEL_PROTOCOLS.map((protocol) => (
                                <Option key={protocol} value={protocol}>
                                  {protocol.toUpperCase()}
                                </Option>
                              ))}
                            </Select>
                          </FormItem>
                        </Col>
                        <Col span={12}>
                          <FormItem label='Diagnostic Log Level' field='otel_log_level'>
                            <Select placeholder='Log level' disabled={loading || !otelEnabled}>
                              {OTEL_LOG_LEVELS.map((level) => (
                                <Option key={level} value={level}>
                                  {level.toUpperCase()}
                                </Option>
                              ))}
                            </Select>
                          </FormItem>
                        </Col>
                      </Row>

                      <FormItem label='Service Name' field='otel_service_name'>
                        <Input placeholder='aionui' disabled={loading || !otelEnabled} />
                      </FormItem>
                    </>
                  );
                }}
              </Form.Item>
            </Card>
          </Col>
        </Row>

        {/* Row 2: Syslog + Langfuse */}
        <Row gutter={GUTTER}>
          <Col xs={24} md={12}>
            <Card title='Syslog / SIEM Forwarding' bordered style={{ height: '100%' }}>
              <FormItem label='Enable Syslog' field='syslog_enabled' triggerPropName='checked'>
                <Switch disabled={loading} />
              </FormItem>

              <Form.Item noStyle shouldUpdate={(prev, next) => prev.syslog_enabled !== next.syslog_enabled}>
                {(values) => {
                  const syslogEnabled = values.syslog_enabled;
                  return (
                    <>
                      <FormItem label='Syslog Host' field='syslog_host' rules={[{ required: syslogEnabled, message: 'Required when syslog is enabled' }]}>
                        <Input placeholder='syslog.example.com' disabled={loading || !syslogEnabled} />
                      </FormItem>

                      <Row gutter={GUTTER}>
                        <Col span={8}>
                          <FormItem
                            label='Port'
                            field='syslog_port'
                            rules={[
                              { required: syslogEnabled, message: 'Required' },
                              { type: 'number', min: 1, max: 65535, message: 'Invalid port' },
                            ]}
                          >
                            <InputNumber placeholder='514' min={1} max={65535} style={{ width: '100%' }} disabled={loading || !syslogEnabled} />
                          </FormItem>
                        </Col>
                        <Col span={8}>
                          <FormItem label='Protocol' field='syslog_protocol'>
                            <Select placeholder='Protocol' disabled={loading || !syslogEnabled}>
                              {SYSLOG_PROTOCOLS.map((protocol) => (
                                <Option key={protocol} value={protocol}>
                                  {protocol.toUpperCase()}
                                </Option>
                              ))}
                            </Select>
                          </FormItem>
                        </Col>
                        <Col span={8}>
                          <FormItem label='Facility' field='syslog_facility' rules={[{ type: 'number', min: 0, max: 23, message: '0–23' }]}>
                            <InputNumber placeholder='16' min={0} max={23} style={{ width: '100%' }} disabled={loading || !syslogEnabled} />
                          </FormItem>
                        </Col>
                      </Row>

                      {syslogEnabled && (
                        <FormItem>
                          <Button type='outline' icon={testingSyslog ? <Refresh spin /> : <Check />} onClick={handleTestSyslog} loading={testingSyslog} disabled={loading} long>
                            Test Syslog Connectivity
                          </Button>
                        </FormItem>
                      )}
                    </>
                  );
                }}
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title='Langfuse (LLM Observability)' bordered style={{ height: '100%' }}>
              <FormItem label='Enable Langfuse' field='langfuse_enabled' triggerPropName='checked'>
                <Switch disabled={loading} />
              </FormItem>

              <Form.Item noStyle shouldUpdate={(prev, next) => prev.langfuse_enabled !== next.langfuse_enabled}>
                {(values) => {
                  const langfuseEnabled = values.langfuse_enabled;
                  return (
                    <>
                      <FormItem label='Langfuse Host' field='langfuse_host' rules={[{ required: langfuseEnabled, message: 'Required when Langfuse is enabled' }]}>
                        <Input placeholder='https://cloud.langfuse.com' disabled={loading || !langfuseEnabled} />
                      </FormItem>

                      <FormItem label='Public Key' field='langfuse_public_key' rules={[{ required: langfuseEnabled, message: 'Required when Langfuse is enabled' }]}>
                        <Input.Password placeholder='pk-...' disabled={loading || !langfuseEnabled} visibilityToggle />
                      </FormItem>

                      <FormItem label='Secret Key' field='langfuse_secret_key' rules={[{ required: langfuseEnabled, message: 'Required when Langfuse is enabled' }]}>
                        <Input.Password placeholder='sk-...' disabled={loading || !langfuseEnabled} visibilityToggle />
                      </FormItem>
                    </>
                  );
                }}
              </Form.Item>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default LoggingSettings;
