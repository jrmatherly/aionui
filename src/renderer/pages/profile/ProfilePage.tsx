/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * User Profile Page
 *
 * Displays current user account info, role, and auth method.
 * Local-auth users can change their password from here.
 */

import { withCsrfToken } from '@/webserver/middleware/csrfClient';
import { Button, Card, Descriptions, Input, Message, Modal, Tag } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import SettingsPageWrapper from '../settings/components/SettingsPageWrapper';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [changePwVisible, setChangePwVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = useCallback(async () => {
    if (!newPw || !currentPw) {
      Message.warning('Please fill in all fields');
      return;
    }
    if (newPw !== confirmPw) {
      Message.error('New passwords do not match');
      return;
    }
    if (newPw.length < 8) {
      Message.error('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withCsrfToken({ currentPassword: currentPw, newPassword: newPw })),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to change password');
      }
      Message.success('Password changed — you may need to log in again');
      setChangePwVisible(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      Message.error(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }, [currentPw, newPw, confirmPw]);

  if (!user) return null;

  const isLocal = user.authMethod === 'local' || !user.authMethod;

  return (
    <SettingsPageWrapper>
      <h2 className='text-xl font-semibold m-0 mb-24px'>Profile</h2>

      <Card className='mb-20px'>
        <Descriptions
          column={1}
          colon=' :'
          labelStyle={{ fontWeight: 500, width: 140 }}
          data={[
            { label: 'Username', value: user.username },
            {
              label: 'Role',
              value: (
                <Tag color={user.role === 'admin' ? 'red' : user.role === 'user' ? 'arcoblue' : 'gray'} size='small'>
                  {(user.role ?? 'user').toUpperCase()}
                </Tag>
              ),
            },
            {
              label: 'Auth Method',
              value: <Tag size='small'>{isLocal ? 'Local' : 'EntraID SSO'}</Tag>,
            },
          ]}
        />
      </Card>

      {isLocal && (
        <Card title='Security'>
          <Button type='primary' onClick={() => setChangePwVisible(true)}>
            Change Password
          </Button>
        </Card>
      )}

      <Modal
        title='Change Password'
        visible={changePwVisible}
        onOk={() => void handleChangePassword()}
        onCancel={() => {
          setChangePwVisible(false);
          setCurrentPw('');
          setNewPw('');
          setConfirmPw('');
        }}
        confirmLoading={saving}
        autoFocus={false}
        style={{ maxWidth: 400 }}
      >
        <div className='flex flex-col gap-12px'>
          <div>
            <div className='mb-4px font-medium text-sm'>Current Password</div>
            <Input.Password value={currentPw} onChange={setCurrentPw} placeholder='Enter current password' />
          </div>
          <div>
            <div className='mb-4px font-medium text-sm'>New Password</div>
            <Input.Password value={newPw} onChange={setNewPw} placeholder='At least 8 characters' />
          </div>
          <div>
            <div className='mb-4px font-medium text-sm'>Confirm New Password</div>
            <Input.Password value={confirmPw} onChange={setConfirmPw} placeholder='Re-enter new password' />
          </div>
        </div>
      </Modal>
    </SettingsPageWrapper>
  );
};

export default ProfilePage;
