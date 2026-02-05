/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/channels/types';
import { channel } from '@/common/ipcBridge';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import { Button, Dropdown, Empty, Input, Menu, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Down, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
/**
 * Get available primary models for a provider (supports function calling)
 */
const getAvailableModels = (provider: IProvider): string[] => {
  const result: string[] = [];
  for (const modelName of provider.model || []) {
    const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
    const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');

    if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
      result.push(modelName);
    }
  }
  return result;
};

/**
 * Preference row component
 */
const PreferenceRow: React.FC<{
  label: string;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, description, extra, required, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <div className='flex items-center gap-8px'>
        <span className='text-14px text-t-primary'>
          {label}
          {required && <span className='text-red-500 ml-2px'>*</span>}
        </span>
        {extra}
      </div>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center'>{children}</div>
  </div>
);

/**
 * Section header component
 */
const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className='flex items-center justify-between mb-12px'>
    <h3 className='text-14px font-500 text-t-primary m-0'>{title}</h3>
    {action}
  </div>
);

interface LarkConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelList: IProvider[];
  selectedModel: TProviderWithModel | null;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
  onModelChange: (model: TProviderWithModel | null) => void;
}

const LarkConfigForm: React.FC<LarkConfigFormProps> = ({ pluginStatus, modelList, selectedModel, onStatusChange, onModelChange }) => {
  // Lark credentials
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [encryptKey, setEncryptKey] = useState('');
  const [verificationToken, setVerificationToken] = useState('');

  const [testLoading, setTestLoading] = useState(false);
  const [credentialsTested, setCredentialsTested] = useState(false);
  const [touched, setTouched] = useState({ appId: false, appSecret: false });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const result = await channel.getPendingPairings.invoke();
      if (result.success && result.data) {
        // Filter for Lark platform only
        setPendingPairings(result.data.filter((p) => p.platformType === 'lark'));
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, []);

  // Load authorized users
  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await channel.getAuthorizedUsers.invoke();
      if (result.success && result.data) {
        // Filter for Lark platform only
        setAuthorizedUsers(result.data.filter((u) => u.platformType === 'lark'));
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadPendingPairings, loadAuthorizedUsers]);

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'lark') return;
      setPendingPairings((prev) => {
        const exists = prev.some((p) => p.code === request.code);
        if (exists) return prev;
        return [request, ...prev];
      });
    });
    return () => unsubscribe();
  }, []);

  // Listen for user authorization
  useEffect(() => {
    const unsubscribe = channel.userAuthorized.on((user) => {
      if (user.platformType !== 'lark') return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

  // Test Lark connection
  const handleTestConnection = async () => {
    // Mark fields as touched to show validation errors
    setTouched({ appId: true, appSecret: true });

    if (!appId.trim() || !appSecret.trim()) {
      Message.warning('Please enter App ID and App Secret');
      return;
    }

    setTestLoading(true);
    setCredentialsTested(false);
    try {
      const result = await channel.testPlugin.invoke({
        pluginId: 'lark_default',
        token: '', // Not used for Lark
        extraConfig: {
          appId: appId.trim(),
          appSecret: appSecret.trim(),
        },
      });

      if (result.success && result.data?.success) {
        setCredentialsTested(true);
        Message.success('Connected to Lark API!');

        // Auto-enable bot after successful test
        await handleAutoEnable();
      } else {
        setCredentialsTested(false);
        Message.error(result.data?.error || 'Connection failed');
      }
    } catch (error: any) {
      setCredentialsTested(false);
      Message.error(error.message || 'Connection failed');
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-enable plugin after successful test
  const handleAutoEnable = async () => {
    try {
      console.log('[LarkConfig] Auto-enabling plugin with credentials...');
      const result = await channel.enablePlugin.invoke({
        pluginId: 'lark_default',
        config: {
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          encryptKey: encryptKey.trim() || undefined,
          verificationToken: verificationToken.trim() || undefined,
        },
      });

      console.log('[LarkConfig] enablePlugin result:', result);

      if (result.success) {
        Message.success('Lark bot enabled');
        const statusResult = await channel.getPluginStatus.invoke();
        console.log('[LarkConfig] getPluginStatus result:', statusResult);
        if (statusResult.success && statusResult.data) {
          const larkPlugin = statusResult.data.find((p) => p.type === 'lark');
          console.log('[LarkConfig] Lark plugin status:', larkPlugin);
          onStatusChange(larkPlugin || null);
        }
      } else {
        // Show error to user when enable fails
        console.error('[LarkConfig] enablePlugin failed:', result.msg);
        Message.error(result.msg || 'Failed to enable Lark plugin');
      }
    } catch (error: any) {
      console.error('[LarkConfig] Auto-enable failed:', error);
      Message.error(error.message || 'Failed to enable Lark plugin');
    }
  };

  // Reset credentials tested state when credentials change
  const handleCredentialsChange = () => {
    setCredentialsTested(false);
  };

  // Save model selection
  const handleModelSelect = async (provider: IProvider, modelName: string) => {
    const newModel: TProviderWithModel = { ...provider, useModel: modelName };
    onModelChange(newModel);
    try {
      await ConfigStorage.set('assistant.lark.defaultModel', {
        id: provider.id,
        useModel: modelName,
      });
      Message.success('Model saved');
    } catch (error) {
      console.error('[LarkConfig] Failed to save model:', error);
      Message.error('Failed to save model');
    }
  };

  // Approve pairing
  const handleApprovePairing = async (code: string) => {
    try {
      const result = await channel.approvePairing.invoke({ code });
      if (result.success) {
        Message.success('Pairing approved');
        await loadPendingPairings();
        await loadAuthorizedUsers();
      } else {
        Message.error(result.msg || 'Failed to approve pairing');
      }
    } catch (error: any) {
      Message.error(error.message);
    }
  };

  // Reject pairing
  const handleRejectPairing = async (code: string) => {
    try {
      const result = await channel.rejectPairing.invoke({ code });
      if (result.success) {
        Message.info('Pairing rejected');
        await loadPendingPairings();
      } else {
        Message.error(result.msg || 'Failed to reject pairing');
      }
    } catch (error: any) {
      Message.error(error.message);
    }
  };

  // Revoke user
  const handleRevokeUser = async (userId: string) => {
    try {
      const result = await channel.revokeUser.invoke({ userId });
      if (result.success) {
        Message.success('User access revoked');
        await loadAuthorizedUsers();
      } else {
        Message.error(result.msg || 'Failed to revoke user');
      }
    } catch (error: any) {
      Message.error(error.message);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success('Copied to clipboard');
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate remaining time
  const getRemainingTime = (expiresAt: number) => {
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000 / 60));
    return `${remaining} min`;
  };

  const hasExistingUsers = authorizedUsers.length > 0;

  return (
    <div className='flex flex-col gap-24px'>
      {/* App ID */}
      <PreferenceRow label={'App ID'} description={'Open Feishu Developer Console to get your App ID'} required>
        <Input
          value={appId}
          onChange={(value) => {
            setAppId(value);
            handleCredentialsChange();
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, appId: true }))}
          placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'cli_xxxxxxxxxx'}
          style={{ width: 240 }}
          status={touched.appId && !appId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
          disabled={hasExistingUsers}
        />
      </PreferenceRow>

      {/* App Secret */}
      <PreferenceRow label={'App Secret'} description={'App Secret from Feishu Developer Console'} required>
        <Input.Password
          value={appSecret}
          onChange={(value) => {
            setAppSecret(value);
            handleCredentialsChange();
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, appSecret: true }))}
          placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
          style={{ width: 240 }}
          status={touched.appSecret && !appSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
          visibilityToggle
          disabled={hasExistingUsers}
        />
      </PreferenceRow>

      {/* Encrypt Key (Optional) */}
      <PreferenceRow label={'Encrypt Key'} description={'Optional: For event encryption (from Event Subscription settings)'}>
        <Input.Password
          value={encryptKey}
          onChange={(value) => {
            setEncryptKey(value);
            handleCredentialsChange();
          }}
          placeholder={'Optional'}
          style={{ width: 240 }}
          visibilityToggle
          disabled={hasExistingUsers}
        />
      </PreferenceRow>

      {/* Verification Token (Optional) */}
      <PreferenceRow label={'Verification Token'} description={'Optional: For event verification (from Event Subscription settings)'}>
        <Input.Password
          value={verificationToken}
          onChange={(value) => {
            setVerificationToken(value);
            handleCredentialsChange();
          }}
          placeholder={'Optional'}
          style={{ width: 240 }}
          visibilityToggle
          disabled={hasExistingUsers}
        />
      </PreferenceRow>

      {/* Test Connection Button - only show when not connected or no existing users */}
      {!hasExistingUsers && !pluginStatus?.connected && (
        <div className='flex justify-end'>
          {pluginStatus?.hasToken && !appId.trim() && !appSecret.trim() ? (
            // Credentials already saved but not entered in UI - show info message
            <span className='text-12px text-t-tertiary mr-12px self-center'>{'Credentials already configured. Enter new values to update.'}</span>
          ) : null}
          <Button type='primary' loading={testLoading} onClick={handleTestConnection} disabled={pluginStatus?.hasToken && !appId.trim() && !appSecret.trim()}>
            {'Test & Connect'}
          </Button>
        </div>
      )}

      {/* Default Model Selection */}
      <PreferenceRow label={'Default Model'} description={'Model used for Lark conversations'}>
        <Dropdown
          trigger='click'
          position='br'
          droplist={
            <Menu selectedKeys={selectedModel ? [selectedModel.id + selectedModel.useModel] : []}>
              {!modelList || modelList.length === 0 ? (
                <Menu.Item key='no-models' className='px-12px py-12px text-t-secondary text-14px text-center' disabled>
                  {'No available models configured'}
                </Menu.Item>
              ) : (
                modelList.map((provider) => {
                  const availableModels = getAvailableModels(provider);
                  if (availableModels.length === 0) return null;
                  return (
                    <Menu.ItemGroup title={provider.name} key={provider.id}>
                      {availableModels.map((modelName) => (
                        <Menu.Item
                          key={provider.id + modelName}
                          className={selectedModel?.id + selectedModel?.useModel === provider.id + modelName ? '!bg-fill-2' : ''}
                          onClick={() => {
                            handleModelSelect(provider, modelName).catch((error) => {
                              console.error('Failed to select model:', error);
                            });
                          }}
                        >
                          {modelName}
                        </Menu.Item>
                      ))}
                    </Menu.ItemGroup>
                  );
                })
              )}
            </Menu>
          }
        >
          <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
            <span className='truncate'>{selectedModel?.useModel || 'Select Model'}</span>
            <Down theme='outline' size={14} />
          </Button>
        </Dropdown>
      </PreferenceRow>

      {/* Connection Status - show when bot is enabled */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className={`rd-12px p-16px border ${pluginStatus?.connected ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : pluginStatus?.error ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
          <SectionHeader title={'Connection Status'} action={<span className={`text-12px px-8px py-2px rd-4px ${pluginStatus?.connected ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : pluginStatus?.error ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}`}>{pluginStatus?.connected ? '✅ Connected' : pluginStatus?.error ? '❌ Error' : '⏳ Connecting...'}</span>} />
          {pluginStatus?.error && <div className='text-14px text-red-600 dark:text-red-400 mb-12px'>{pluginStatus.error}</div>}
          {pluginStatus?.connected && (
            <div className='text-14px text-t-secondary space-y-8px'>
              <p className='m-0 font-500'>{'Next Steps'}:</p>
              <p className='m-0'>
                <strong>1.</strong> {'Open Feishu/Lark and find your bot application'}
              </p>
              <p className='m-0'>
                <strong>2.</strong> {'Send any message to initiate pairing'}
              </p>
              <p className='m-0'>
                <strong>3.</strong> A pairing request will appear below. Click &quot;Approve&quot; to authorize the user.
              </p>
              <p className='m-0'>
                <strong>4.</strong> {'Once approved, you can start chatting with the AI assistant through Lark!'}
              </p>
            </div>
          )}
          {!pluginStatus?.connected && !pluginStatus?.error && <div className='text-14px text-t-secondary'>{'WebSocket connection is being established. Please wait...'}</div>}
        </div>
      )}

      {/* Pending Pairings */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className='bg-fill-1 rd-12px pt-16px pr-16px pb-16px pl-0'>
          <SectionHeader
            title={'Pending Pairing Requests'}
            action={
              <Button size='mini' type='text' icon={<Refresh size={14} />} loading={pairingLoading} onClick={loadPendingPairings}>
                {'Refresh'}
              </Button>
            }
          />

          {pairingLoading ? (
            <div className='flex justify-center py-24px'>
              <Spin />
            </div>
          ) : pendingPairings.length === 0 ? (
            <Empty description={'No pending pairing requests'} />
          ) : (
            <div className='flex flex-col gap-12px'>
              {pendingPairings.map((pairing) => (
                <div key={pairing.code} className='flex items-center justify-between bg-fill-2 rd-8px p-12px'>
                  <div className='flex-1'>
                    <div className='flex items-center gap-8px'>
                      <span className='text-14px font-500 text-t-primary'>{pairing.displayName || 'Unknown User'}</span>
                      <Tooltip content={'Copy pairing code'}>
                        <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={() => copyToClipboard(pairing.code)}>
                          <Copy size={14} />
                        </button>
                      </Tooltip>
                    </div>
                    <div className='text-12px text-t-tertiary mt-4px'>
                      {'Code'}: <code className='bg-fill-3 px-4px rd-2px'>{pairing.code}</code>
                      <span className='mx-8px'>|</span>
                      {'Expires in'}: {getRemainingTime(pairing.expiresAt)}
                    </div>
                  </div>
                  <div className='flex items-center gap-8px'>
                    <Button type='primary' size='small' icon={<CheckOne size={14} />} onClick={() => handleApprovePairing(pairing.code)}>
                      {'Approve'}
                    </Button>
                    <Button type='secondary' size='small' status='danger' icon={<CloseOne size={14} />} onClick={() => handleRejectPairing(pairing.code)}>
                      {'Reject'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Authorized Users */}
      {authorizedUsers.length > 0 && (
        <div className='bg-fill-1 rd-12px pt-16px pr-16px pb-16px pl-0'>
          <SectionHeader
            title={'Authorized Users'}
            action={
              <Button size='mini' type='text' icon={<Refresh size={14} />} loading={usersLoading} onClick={loadAuthorizedUsers}>
                {'Refresh'}
              </Button>
            }
          />

          {usersLoading ? (
            <div className='flex justify-center py-24px'>
              <Spin />
            </div>
          ) : authorizedUsers.length === 0 ? (
            <Empty description={'No authorized users yet'} />
          ) : (
            <div className='flex flex-col gap-12px'>
              {authorizedUsers.map((user) => (
                <div key={user.id} className='flex items-center justify-between bg-fill-2 rd-8px p-12px'>
                  <div className='flex-1'>
                    <div className='text-14px font-500 text-t-primary'>{user.displayName || 'Unknown User'}</div>
                    <div className='text-12px text-t-tertiary mt-4px'>
                      {'Platform'}: Lark
                      <span className='mx-8px'>|</span>
                      {'Authorized'}: {formatTime(user.authorizedAt)}
                    </div>
                  </div>
                  <Tooltip content={'Revoke access'}>
                    <Button type='text' status='danger' size='small' icon={<Delete size={16} />} onClick={() => handleRevokeUser(user.id)} />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LarkConfigForm;
