/**
 * @author Jason Matherly
 * @modified 2026-02-03
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Admin User Management Page
 *
 * Lists all users, allows role editing, shows auth method and last login.
 * Only accessible to users with admin role.
 */

import { createLogger } from '@/renderer/utils/logger';
import { withCsrfToken } from '@/webserver/middleware/csrfClient';
import { Button, Message, Modal, Select, Table, Tag, Tooltip } from '@arco-design/web-react';
import { IconEdit, IconRefresh } from '@arco-design/web-react/icon';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import React, { useCallback, useEffect, useState } from 'react';
import SettingsPageWrapper from '../settings/components/SettingsPageWrapper';

const log = createLogger('UserManagement');

interface IAdminUser {
  id: string;
  username: string;
  email?: string;
  role: 'admin' | 'user' | 'viewer';
  authMethod: 'local' | 'oidc';
  displayName?: string;
  groups: string[];
  createdAt: number;
  updatedAt: number;
  lastLogin?: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  user: 'arcoblue',
  viewer: 'gray',
};

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<IAdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<IAdminUser | null>(null);
  const [pendingRole, setPendingRole] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      Message.error('Failed to load users');
      log.error({ err }, 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleRoleUpdate = useCallback(async () => {
    if (!editingUser || !pendingRole) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withCsrfToken({ role: pendingRole })),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      Message.success(`Role updated to ${pendingRole}`);
      setEditingUser(null);
      void fetchUsers();
    } catch (err: any) {
      Message.error(err.message || 'Failed to update role');
    } finally {
      setSaving(false);
    }
  }, [editingUser, pendingRole, fetchUsers]);

  const columns: ColumnProps<IAdminUser>[] = [
    {
      title: 'Username',
      dataIndex: 'username',
      width: 160,
      render: (val: string, record: IAdminUser) => {
        const content = (
          <span style={{ whiteSpace: 'nowrap' }}>
            <strong>{val}</strong>
          </span>
        );
        // Show displayName in tooltip if different from username
        if (record.displayName && record.displayName !== val) {
          return <Tooltip content={record.displayName}>{content}</Tooltip>;
        }
        return content;
      },
    },
    {
      title: 'Email',
      dataIndex: 'email',
      ellipsis: true,
      render: (val?: string) => val || '—',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      width: 80,
      render: (role: string) => (
        <Tag color={ROLE_COLORS[role] || 'gray'} size='small'>
          {role.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Auth',
      dataIndex: 'authMethod',
      width: 75,
      render: (method: string) => <Tag size='small'>{method === 'oidc' ? 'EntraID' : 'Local'}</Tag>,
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLogin',
      width: 120,
      render: (ts?: number) => (
        <span className='text-xs' style={{ whiteSpace: 'nowrap' }}>
          {formatDateTime(ts)}
        </span>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 110,
      render: (ts: number) => (
        <span className='text-xs' style={{ whiteSpace: 'nowrap' }}>
          {formatDate(ts)}
        </span>
      ),
    },
    {
      title: '',
      width: 50,
      align: 'center',
      render: (_: unknown, record: IAdminUser) => (
        <Button
          type='text'
          size='small'
          icon={<IconEdit />}
          onClick={() => {
            setEditingUser(record);
            setPendingRole(record.role);
          }}
        />
      ),
    },
  ];

  return (
    <SettingsPageWrapper>
      <div className='flex items-center justify-between mb-24px'>
        <h2 className='text-xl font-semibold m-0'>User Management</h2>
        <Button type='primary' icon={<IconRefresh />} onClick={() => void fetchUsers()} loading={loading} size='small'>
          Refresh
        </Button>
      </div>

      <Table columns={columns} data={users} loading={loading} pagination={{ pageSize: 25, simple: true }} rowKey='id' size='small' noDataElement={<div className='py-40px text-center color-gray-5'>No users found</div>} />

      <Modal title='Edit User Role' visible={!!editingUser} onOk={() => void handleRoleUpdate()} onCancel={() => setEditingUser(null)} confirmLoading={saving} autoFocus={false} style={{ maxWidth: 400 }}>
        {editingUser && (
          <>
            <div className='mb-12px'>
              <strong>{editingUser.username}</strong>
              {editingUser.displayName && <span className='color-gray-5 ml-8px'>{editingUser.displayName}</span>}
            </div>
            <Select placeholder='Select role' value={pendingRole} onChange={setPendingRole} style={{ width: '100%' }}>
              <Select.Option value='admin'>Admin</Select.Option>
              <Select.Option value='user'>User</Select.Option>
              <Select.Option value='viewer'>Viewer</Select.Option>
            </Select>
          </>
        )}
      </Modal>
    </SettingsPageWrapper>
  );
};

export default UserManagement;
