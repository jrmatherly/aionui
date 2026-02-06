/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * User settings page for Python environment management.
 * Allows users to view and manage their per-user Python virtual environment.
 */

import { createLogger } from '@/renderer/utils/logger';
import { withCsrfToken } from '@/webserver/middleware/csrfClient';
import { Button, Card, Empty, Input, Message, Modal, Space, Spin, Table, Tag, Typography } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import { Delete, Download, Refresh, Tool } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const log = createLogger('PythonEnvironment');

interface PythonStatus {
  initialized: boolean;
  miseAvailable: boolean;
  pythonVersion?: string;
  uvVersion?: string;
  venvExists: boolean;
  venvPath?: string;
  message?: string;
}

interface Package {
  name: string;
  version: string;
  specifier: string;
}

const PythonEnvironment: React.FC = () => {
  const [status, setStatus] = useState<PythonStatus | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [packageInput, setPackageInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const response = await fetch('/api/python/status', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setStatus(data.status);
      } else {
        Message.error(data.error || 'Failed to fetch Python status');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch Python status');
      Message.error('Failed to fetch Python status');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchPackages = useCallback(async () => {
    try {
      setLoadingPackages(true);
      const response = await fetch('/api/python/packages', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setPackages(data.packages);
      } else {
        log.warn({ error: data.error }, 'Failed to fetch packages');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch packages');
    } finally {
      setLoadingPackages(false);
    }
  }, []);

  const handleInstall = async () => {
    const trimmedInput = packageInput.trim();
    if (!trimmedInput) {
      Message.warning('Please enter a package name');
      return;
    }

    setInstalling(true);
    try {
      const response = await fetch('/api/python/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withCsrfToken({ package: trimmedInput })),
      });
      const data = await response.json();
      if (data.success) {
        Message.success(data.message || `Installed ${trimmedInput}`);
        setPackageInput('');
        await fetchPackages();
      } else {
        Message.error(data.error || 'Failed to install package');
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to install package');
      Message.error('Failed to install package');
    } finally {
      setInstalling(false);
    }
  };

  const handleReset = () => {
    Modal.confirm({
      title: 'Reset Python Environment',
      icon: null,
      content: (
        <div style={{ padding: '8px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '16px',
              background: 'var(--color-fill-2)',
              borderRadius: '8px',
              border: '1px solid var(--color-border-2)',
            }}
          >
            <Delete style={{ fontSize: '24px', color: 'rgb(var(--danger-6))', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <Typography.Text style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>This will delete your virtual environment and all installed packages.</Typography.Text>
              <Typography.Text type='secondary' style={{ fontSize: '13px' }}>
                The environment will be recreated on next use with default skill dependencies.
              </Typography.Text>
            </div>
          </div>
        </div>
      ),
      okButtonProps: { status: 'danger' },
      okText: 'Reset Environment',
      onOk: async () => {
        setResetting(true);
        try {
          const response = await fetch('/api/python/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(withCsrfToken({})),
          });
          const data = await response.json();
          if (data.success) {
            Message.success('Environment reset successfully');
            await Promise.all([fetchStatus(), fetchPackages()]);
          } else {
            Message.error(data.error || 'Failed to reset environment');
          }
        } catch (error) {
          log.error({ err: error }, 'Failed to reset environment');
          Message.error('Failed to reset environment');
        } finally {
          setResetting(false);
        }
      },
    });
  };

  useEffect(() => {
    void Promise.all([fetchStatus(), fetchPackages()]);
  }, [fetchStatus, fetchPackages]);

  // Filter packages by search
  const filteredPackages = packages.filter((pkg) => pkg.name.toLowerCase().includes(searchFilter.toLowerCase()) || pkg.version.toLowerCase().includes(searchFilter.toLowerCase()));

  const columns: ColumnProps<Package>[] = [
    {
      title: 'Package',
      dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Version',
      dataIndex: 'version',
      width: 150,
    },
  ];

  const renderStatusCard = () => {
    if (loadingStatus) {
      return (
        <Card title='Environment Status' style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
            <Spin />
          </div>
        </Card>
      );
    }

    if (!status?.miseAvailable) {
      return (
        <Card title='Environment Status' style={{ marginBottom: '16px' }}>
          <Empty description='mise is not available on this system. Python environment management requires mise to be installed.' />
        </Card>
      );
    }

    return (
      <Card
        title='Environment Status'
        style={{ marginBottom: '16px' }}
        extra={
          <Button icon={<Refresh />} onClick={() => void fetchStatus()} loading={loadingStatus} type='text' size='small'>
            Refresh
          </Button>
        }
      >
        <Space direction='vertical' style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <Typography.Text type='secondary'>Python</Typography.Text>
              <div>
                <Tag color={status.pythonVersion ? 'green' : 'gray'}>{status.pythonVersion || 'Not installed'}</Tag>
              </div>
            </div>
            <div>
              <Typography.Text type='secondary'>uv</Typography.Text>
              <div>
                <Tag color={status.uvVersion ? 'green' : 'gray'}>{status.uvVersion || 'Not installed'}</Tag>
              </div>
            </div>
            <div>
              <Typography.Text type='secondary'>Virtual Environment</Typography.Text>
              <div>
                <Tag color={status.venvExists ? 'green' : 'orange'}>{status.venvExists ? 'Active' : 'Not created'}</Tag>
              </div>
            </div>
            <div>
              <Typography.Text type='secondary'>Initialized</Typography.Text>
              <div>
                <Tag color={status.initialized ? 'green' : 'gray'}>{status.initialized ? 'Yes' : 'No'}</Tag>
              </div>
            </div>
          </div>
          {status.venvPath && (
            <div>
              <Typography.Text type='secondary'>Path: </Typography.Text>
              <Typography.Text copyable style={{ fontSize: '12px' }}>
                {status.venvPath}
              </Typography.Text>
            </div>
          )}
        </Space>
      </Card>
    );
  };

  return (
    <SettingsPageWrapper>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Title heading={5} style={{ margin: 0 }}>
              Python Environment
            </Typography.Title>
            <Typography.Text type='secondary'>Manage your Python virtual environment and installed packages</Typography.Text>
          </div>
          <Button icon={<Delete />} status='danger' onClick={handleReset} loading={resetting} disabled={!status?.venvExists}>
            Reset Environment
          </Button>
        </div>

        {renderStatusCard()}

        <Card title={`Installed Packages (${filteredPackages.length})`} extra={<Input.Search placeholder='Search packages...' value={searchFilter} onChange={setSearchFilter} style={{ width: '200px' }} allowClear />}>
          <div style={{ marginBottom: '16px' }}>
            <Space>
              <Input placeholder='Package name (e.g., requests, anthropic>=0.39.0)' value={packageInput} onChange={setPackageInput} onPressEnter={() => void handleInstall()} style={{ width: '350px' }} disabled={!status?.miseAvailable} />
              <Button type='primary' icon={<Download />} onClick={() => void handleInstall()} loading={installing} disabled={!status?.miseAvailable || !packageInput.trim()}>
                Install
              </Button>
            </Space>
          </div>

          <Table
            columns={columns}
            data={filteredPackages}
            rowKey='name'
            loading={loadingPackages}
            pagination={{
              defaultPageSize: 10,
              showTotal: true,
              sizeCanChange: true,
              sizeOptions: [10, 20, 50, 100],
              pageSizeChangeResetCurrent: true,
            }}
            noDataElement={<Empty icon={<Tool style={{ fontSize: '48px', color: 'var(--color-text-4)' }} />} description={status?.miseAvailable ? 'No packages installed yet' : 'Python environment not available'} />}
          />
        </Card>
      </div>
    </SettingsPageWrapper>
  );
};

export default PythonEnvironment;
