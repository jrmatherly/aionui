/**
 * @author Jason Matherly
 * @modified 2026-02-03
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Admin Group Role Mappings Page
 *
 * Displays the current EntraID group → application role mappings.
 * Read-only — mappings are configured via GROUP_MAPPINGS_FILE or GROUP_MAPPINGS_JSON env var.
 */

import { Message, Table, Tag } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import React, { useCallback, useEffect, useState } from 'react';
import SettingsPageWrapper from '../settings/components/SettingsPageWrapper';

interface IGroupMapping {
  groupId: string;
  groupName: string;
  role: 'admin' | 'user' | 'viewer';
}

const GroupMappings: React.FC = () => {
  const [mappings, setMappings] = useState<IGroupMapping[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/group-mappings', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMappings(data.mappings ?? []);
    } catch (err) {
      Message.error('Failed to load group mappings');
      console.error('[Admin] fetchMappings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMappings();
  }, [fetchMappings]);

  const columns: ColumnProps<IGroupMapping>[] = [
    {
      title: 'Group Name',
      dataIndex: 'groupName',
      width: 240,
    },
    {
      title: 'Group ID',
      dataIndex: 'groupId',
      render: (id: string) => <code className='text-xs'>{id}</code>,
    },
    {
      title: 'Assigned Role',
      dataIndex: 'role',
      width: 140,
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'red' : role === 'user' ? 'arcoblue' : 'gray'} size='small'>
          {role.toUpperCase()}
        </Tag>
      ),
    },
  ];

  return (
    <SettingsPageWrapper>
      <div className='mb-24px'>
        <h2 className='text-xl font-semibold m-0 mb-8px'>EntraID Group Mappings</h2>
        <p className='color-gray-5 text-sm m-0'>
          Maps EntraID security groups to application roles. Configure via <code>GROUP_MAPPINGS_FILE</code> or <code>GROUP_MAPPINGS_JSON</code> environment variable.
        </p>
      </div>

      <Table columns={columns} data={mappings} loading={loading} pagination={false} rowKey='groupId' size='small' noDataElement={<div className='py-40px text-center color-gray-5'>No group mappings configured. All SSO users default to &quot;user&quot; role.</div>} />
    </SettingsPageWrapper>
  );
};

export default GroupMappings;
