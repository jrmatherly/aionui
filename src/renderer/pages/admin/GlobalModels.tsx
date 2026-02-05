/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin page for managing global models.
 * Global models are shared model configurations available to all users.
 */

import { Button, Message, Modal, Popconfirm, Space, Switch, Table, Tag, Tooltip } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import { AddOne, Delete, Edit, Server, Sort } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import GlobalModelForm, { type GlobalModelFormData } from './components/GlobalModelForm';

interface GlobalModel {
  id: string;
  platform: string;
  name: string;
  base_url: string;
  models: string[];
  capabilities?: string[];
  context_limit?: number;
  custom_headers?: Record<string, string>;
  enabled: boolean;
  priority: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  apiKeyHint?: string;
}

const GlobalModels: React.FC = () => {
  const [models, setModels] = useState<GlobalModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<GlobalModel | null>(null);
  const [message, messageContext] = Message.useMessage();

  // Fetch models - no dependencies to prevent infinite loop
  const fetchModels = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/models?includeDisabled=true', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setModels(data.models);
      } else {
        Message.error(data.error || 'Failed to fetch models');
      }
    } catch (error) {
      console.error('Failed to fetch global models:', error);
      Message.error('Failed to fetch global models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  // Toggle enabled
  const handleToggle = async (model: GlobalModel, enabled: boolean) => {
    try {
      const response = await fetch(`/api/admin/models/${model.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();
      if (data.success) {
        message.success(`Model ${enabled ? 'enabled' : 'disabled'}`);
        void fetchModels();
      } else {
        message.error(data.error || 'Failed to toggle model');
      }
    } catch (error) {
      console.error('Failed to toggle model:', error);
      message.error('Failed to toggle model');
    }
  };

  // Delete model
  const handleDelete = async (model: GlobalModel) => {
    try {
      const response = await fetch(`/api/admin/models/${model.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        message.success('Model deleted');
        void fetchModels();
      } else {
        message.error(data.error || 'Failed to delete model');
      }
    } catch (error) {
      console.error('Failed to delete model:', error);
      message.error('Failed to delete model');
    }
  };

  // Save model (create or update)
  const handleSave = async (formData: GlobalModelFormData) => {
    try {
      const isEdit = !!editingModel;
      const url = isEdit ? `/api/admin/models/${editingModel.id}` : '/api/admin/models';
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        message.success(isEdit ? 'Model updated' : 'Model created');
        setFormVisible(false);
        setEditingModel(null);
        void fetchModels();
      } else {
        message.error(data.error || 'Failed to save model');
      }
    } catch (error) {
      console.error('Failed to save model:', error);
      message.error('Failed to save model');
    }
  };

  // Open form for new model
  const handleAdd = () => {
    setEditingModel(null);
    setFormVisible(true);
  };

  // Open form for editing
  const handleEdit = (model: GlobalModel) => {
    setEditingModel(model);
    setFormVisible(true);
  };

  // Table columns
  const columns: ColumnProps<GlobalModel>[] = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, record) => (
        <div className='flex items-center gap-8px'>
          <Server size='16' className='text-t-secondary' />
          <span className='font-500'>{name}</span>
          {!record.enabled && (
            <Tag size='small' color='gray'>
              Disabled
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Platform',
      dataIndex: 'platform',
      width: 120,
      render: (platform: string) => (
        <Tag color='arcoblue' size='small'>
          {platform}
        </Tag>
      ),
    },
    {
      title: 'Models',
      dataIndex: 'models',
      render: (models: string[]) => (
        <Tooltip
          content={
            <div className='max-h-200px overflow-auto'>
              {models.map((m, i) => (
                <div key={i}>{m}</div>
              ))}
            </div>
          }
        >
          <span className='cursor-help'>
            {models.length} model{models.length !== 1 ? 's' : ''}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'API Key',
      dataIndex: 'apiKeyHint',
      width: 100,
      render: (hint: string) => <span className='font-mono text-12px text-t-secondary'>{hint || '—'}</span>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 80,
      align: 'center',
      render: (priority: number) => (
        <Tag size='small' color='gray'>
          {priority}
        </Tag>
      ),
    },
    {
      title: 'Enabled',
      dataIndex: 'enabled',
      width: 80,
      align: 'center',
      render: (enabled: boolean, record) => <Switch size='small' checked={enabled} onChange={(checked) => handleToggle(record, checked)} />,
    },
    {
      title: 'Actions',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Space>
          <Tooltip content='Edit'>
            <Button size='mini' type='text' icon={<Edit size='14' />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title='Delete this global model?' content='All users will lose access to this model.' onOk={() => handleDelete(record)} okText='Delete' okButtonProps={{ status: 'danger' }}>
            <Tooltip content='Delete'>
              <Button size='mini' type='text' status='danger' icon={<Delete size='14' />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className='p-24px'>
      {messageContext}

      {/* Header */}
      <div className='flex items-center justify-between mb-24px'>
        <div>
          <h1 className='text-20px font-600 text-t-primary mb-4px'>Global Models</h1>
          <p className='text-14px text-t-secondary'>Manage shared model configurations available to all users.</p>
        </div>
        <Space>
          <Tooltip content='Drag rows to reorder priority'>
            <Button type='secondary' icon={<Sort size='16' />} disabled>
              Reorder
            </Button>
          </Tooltip>
          <Button type='primary' icon={<AddOne size='16' />} onClick={handleAdd}>
            Add Model
          </Button>
        </Space>
      </div>

      {/* Table */}
      <div className='bg-2 rd-16px p-16px'>
        <Table
          rowKey='id'
          columns={columns}
          data={models}
          loading={loading}
          pagination={false}
          noDataElement={
            <div className='py-40px text-center text-t-secondary'>
              <Server size='48' className='mb-16px opacity-50' />
              <div className='text-16px font-500 mb-8px'>No global models configured</div>
              <div className='text-14px mb-16px'>Add a model to make it available to all users.</div>
              <Button type='primary' icon={<AddOne size='16' />} onClick={handleAdd}>
                Add First Model
              </Button>
            </div>
          }
        />
      </div>

      {/* Add/Edit Modal */}
      <Modal
        title={editingModel ? 'Edit Global Model' : 'Add Global Model'}
        visible={formVisible}
        onCancel={() => {
          setFormVisible(false);
          setEditingModel(null);
        }}
        footer={null}
        style={{ width: 600 }}
        unmountOnExit
      >
        <GlobalModelForm
          initialData={editingModel || undefined}
          onSubmit={handleSave}
          onCancel={() => {
            setFormVisible(false);
            setEditingModel(null);
          }}
        />
      </Modal>
    </div>
  );
};

export default GlobalModels;
