/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell, webui, type IWebUIStatus } from '@/common/ipcBridge';
import AionModal from '@/renderer/components/base/AionModal';
import { useBranding } from '@/renderer/hooks/useBranding';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Form, Input, Message, Switch, Tooltip } from '@arco-design/web-react';
import { Copy, Refresh } from '@icon-park/react';
import { QRCodeSVG } from 'qrcode.react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsViewMode } from '../settingsViewContext';
import ChannelModalContent from './ChannelModalContent';
import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('WebuiModalContent');

/**
 * Preference row component
 */
const PreferenceRow: React.FC<{ label: string; description?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }> = ({ label, description, extra, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <div className='flex items-center gap-8px'>
        <span className='text-14px text-t-primary'>{label}</span>
        {extra}
      </div>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center'>{children}</div>
  </div>
);

/**
 * Info row component (for login info display)
 */
const InfoRow: React.FC<{ label: string; value: string; onCopy?: () => void; showCopy?: boolean }> = ({ label, value, onCopy, showCopy = true }) => (
  <div className='flex items-center justify-between py-12px'>
    <span className='text-14px text-t-secondary'>{label}</span>
    <div className='flex items-center gap-8px'>
      <span className='text-14px text-t-primary'>{value}</span>
      {showCopy && onCopy && (
        <Tooltip content='Copy'>
          <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={onCopy}>
            <Copy size={16} />
          </button>
        </Tooltip>
      )}
    </div>
  </div>
);

/**
 * WebUI settings content component
 */
const WebuiModalContent: React.FC = () => {
  const branding = useBranding();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  const [status, setStatus] = useState<IWebUIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [port] = useState(25808);
  const [allowRemote, setAllowRemote] = useState(false);
  const [cachedIP, setCachedIP] = useState<string | null>(null);
  const [cachedPassword, setCachedPassword] = useState<string | null>(null);
  // Flag for plaintext password display (first startup and not copied)
  const [canShowPlainPassword, setCanShowPlainPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  // Set new password modal
  const [setPasswordModalVisible, setSetPasswordModalVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [form] = Form.useForm();

  // QR code login related state
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const qrRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load status
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      let result: { success: boolean; data?: IWebUIStatus } | null = null;

      // Prefer direct IPC (Electron environment)
      if (window.electronAPI?.webuiGetStatus) {
        result = await window.electronAPI.webuiGetStatus();
      } else {
        // Fallback: use bridge (reduced timeout)
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
        result = await Promise.race([webui.getStatus.invoke(), timeoutPromise]);
      }

      if (result && result.success && result.data) {
        setStatus(result.data);
        setAllowRemote(result.data.allowRemote);
        if (result.data.lanIP) {
          setCachedIP(result.data.lanIP);
        } else if (result.data.networkUrl) {
          const match = result.data.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) {
            setCachedIP(match[1]);
          }
        }
        if (result.data.initialPassword) {
          setCachedPassword(result.data.initialPassword);
          // Having initial password means can show plaintext
          setCanShowPlainPassword(true);
        }
        // Note: If running but no password, auto-reset will be triggered in the useEffect below
      } else {
        setStatus(
          (prev) =>
            prev || {
              running: false,
              port: 25808,
              allowRemote: false,
              localUrl: 'http://localhost:25808',
              adminUsername: 'admin',
            }
        );
      }
    } catch (error) {
      log.error({ err: error }, 'Failed to load WebUI status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Listen to status change events
  useEffect(() => {
    const unsubscribe = webui.statusChanged.on((data) => {
      if (data.running) {
        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port: data.port ?? prev?.port ?? 25808,
          allowRemote: prev?.allowRemote ?? false,
          localUrl: data.localUrl ?? `http://localhost:${data.port ?? 25808}`,
          networkUrl: data.networkUrl,
          lanIP: prev?.lanIP,
          initialPassword: prev?.initialPassword,
        }));
        if (data.networkUrl) {
          const match = data.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) setCachedIP(match[1]);
        }
      } else {
        setStatus((prev) => (prev ? { ...prev, running: false } : null));
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to password reset result events (Web environment fallback)
  useEffect(() => {
    const unsubscribe = webui.resetPasswordResult.on((data) => {
      if (data.success && data.newPassword) {
        setCachedPassword(data.newPassword);
        setStatus((prev) => (prev ? { ...prev, initialPassword: data.newPassword } : null));
        setCanShowPlainPassword(true);
      }
      setResetLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Note: No longer auto-reset password, user already has password stored in database
  // If user forgets password, they can manually click reset button
  useEffect(() => {
    // Only when component first loads and password hasn't been shown, mark as hidden
    if (status?.running && !status?.initialPassword && !cachedPassword && !loading) {
      // Don't auto-reset, just ensure password shows as ******
      setCanShowPlainPassword(false);
    }
  }, [status?.running, status?.initialPassword, cachedPassword, loading]);

  // Get current IP
  const getLocalIP = useCallback(() => {
    if (status?.lanIP) return status.lanIP;
    if (cachedIP) return cachedIP;
    if (status?.networkUrl) {
      const match = status.networkUrl.match(/http:\/\/([^:]+):/);
      if (match) return match[1];
    }
    return null;
  }, [status?.lanIP, cachedIP, status?.networkUrl]);

  // Get display URL
  const getDisplayUrl = useCallback(() => {
    const currentIP = getLocalIP();
    const currentPort = status?.port || port;
    if (allowRemote && currentIP) {
      return `http://${currentIP}:${currentPort}`;
    }
    return `http://localhost:${currentPort}`;
  }, [allowRemote, getLocalIP, status?.port, port]);

  // Start/Stop WebUI
  const handleToggle = async (enabled: boolean) => {
    // Use cached IP, no longer block to fetch
    const currentIP = getLocalIP();

    // Immediately show loading
    setStartLoading(true);

    try {
      if (enabled) {
        const localUrl = `http://localhost:${port}`;

        // Reduce start timeout to 3s (server starts quickly)
        const startResult = await Promise.race([webui.start.invoke({ port, allowRemote }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);

        if (startResult && startResult.success && startResult.data) {
          const responseIP = startResult.data.lanIP || currentIP;
          const responsePassword = startResult.data.initialPassword;

          if (responseIP) setCachedIP(responseIP);
          if (responsePassword) {
            setCachedPassword(responsePassword);
            setCanShowPlainPassword(true);
          }

          setStatus((prev) => ({
            ...(prev || { adminUsername: 'admin' }),
            running: true,
            port,
            allowRemote,
            localUrl,
            networkUrl: allowRemote && responseIP ? `http://${responseIP}:${port}` : undefined,
            lanIP: responseIP,
            initialPassword: responsePassword || cachedPassword || prev?.initialPassword,
          }));
        } else {
          setStatus((prev) => ({
            ...(prev || { adminUsername: 'admin' }),
            running: true,
            port,
            allowRemote,
            localUrl,
            lanIP: currentIP || prev?.lanIP,
            networkUrl: allowRemote && currentIP ? `http://${currentIP}:${port}` : undefined,
            initialPassword: cachedPassword || prev?.initialPassword,
          }));
        }

        Message.success('WebUI started successfully');
        // Start result contains all needed data, no need for delayed status fetch
      } else {
        // Update UI immediately, stop server async
        setStatus((prev) => (prev ? { ...prev, running: false } : null));
        Message.success('WebUI stopped');
        webui.stop.invoke().catch((err) => log.error({ err }, 'WebUI stop error'));
      }
    } catch (error) {
      log.error({ err: error }, 'Toggle WebUI error');
      Message.error('Operation failed');
    } finally {
      setStartLoading(false);
    }
  };

  // Handle allow remote toggle
  // Need to restart server to change binding address
  const handleAllowRemoteChange = async (checked: boolean) => {
    const wasRunning = status?.running;

    // If server is running, need to restart to apply new binding settings
    if (wasRunning) {
      setStartLoading(true);
      try {
        // 1. First stop the server
        try {
          await Promise.race([webui.stop.invoke(), new Promise((resolve) => setTimeout(resolve, 1500))]);
        } catch (err) {
          log.error({ err }, 'WebUI stop error');
        }

        // 2. Restart immediately (server stops quickly)
        const startResult = await Promise.race([webui.start.invoke({ port, allowRemote: checked }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);

        if (startResult && startResult.success && startResult.data) {
          const responseIP = startResult.data.lanIP;
          const responsePassword = startResult.data.initialPassword;

          if (responseIP) setCachedIP(responseIP);
          if (responsePassword) setCachedPassword(responsePassword);

          setAllowRemote(checked);
          setStatus((prev) => ({
            ...(prev || { adminUsername: 'admin' }),
            running: true,
            port,
            allowRemote: checked,
            localUrl: `http://localhost:${port}`,
            networkUrl: checked && responseIP ? `http://${responseIP}:${port}` : undefined,
            lanIP: responseIP,
            initialPassword: responsePassword || cachedPassword || prev?.initialPassword,
          }));

          Message.success('WebUI restarted');
        } else {
          // Response is null or failed, but server might have started, check status
          let statusResult: { success: boolean; data?: IWebUIStatus } | null = null;
          if (window.electronAPI?.webuiGetStatus) {
            statusResult = await window.electronAPI.webuiGetStatus();
          } else {
            statusResult = await Promise.race([webui.getStatus.invoke(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))]);
          }

          if (statusResult?.success && statusResult?.data?.running) {
            // Server actually started
            const responseIP = statusResult.data.lanIP;
            if (responseIP) setCachedIP(responseIP);

            setAllowRemote(checked);
            setStatus(statusResult.data);
            Message.success('WebUI restarted');
          } else {
            // Really failed to start
            Message.error('Operation failed');
            setStatus((prev) => (prev ? { ...prev, running: false } : null));
          }
        }
      } catch (error) {
        log.error({ err: error }, 'Restart error');
        Message.error('Operation failed');
      } finally {
        setStartLoading(false);
      }
    } else {
      // Server not running, just update state
      setAllowRemote(checked);

      // Get IP for display
      let newIP: string | undefined;
      try {
        if (window.electronAPI?.webuiGetStatus) {
          const result = await window.electronAPI.webuiGetStatus();
          if (result?.success && result?.data?.lanIP) {
            newIP = result.data.lanIP;
            setCachedIP(newIP);
          }
        }
      } catch {
        // ignore
      }

      const existingIP = newIP || cachedIP || status?.lanIP;
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              allowRemote: checked,
              lanIP: existingIP || prev.lanIP,
              networkUrl: checked && existingIP ? `http://${existingIP}:${port}` : undefined,
            }
          : null
      );
    }
  };

  // Copy content
  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success('Copied');
  };

  // Copy password (immediately hide after copying)
  const handleCopyPassword = async () => {
    const password = status?.initialPassword || cachedPassword;
    if (password) {
      void navigator.clipboard.writeText(password);
      Message.success('Copied');
      // Hide plaintext immediately after copying, icon changes to reset
      setCanShowPlainPassword(false);
    }
  };

  // Open set new password modal
  const handleResetPassword = () => {
    form.resetFields();
    setSetPasswordModalVisible(true);
  };

  // Submit new password
  const handleSetNewPassword = async () => {
    try {
      const values = await form.validate();
      setPasswordLoading(true);

      let result: { success: boolean; msg?: string };

      // Prefer direct IPC (Electron environment)
      if (window.electronAPI?.webuiChangePassword) {
        result = await window.electronAPI.webuiChangePassword(values.newPassword);
      } else {
        // Fallback: use bridge
        result = await webui.changePassword.invoke({
          newPassword: values.newPassword,
        });
      }

      if (result.success) {
        Message.success('Password changed successfully');
        setSetPasswordModalVisible(false);
        form.resetFields();
        // Update cached password, no longer show plaintext
        setCachedPassword(values.newPassword);
        setCanShowPlainPassword(false);
        setStatus((prev) => (prev ? { ...prev, initialPassword: undefined } : null));
      } else {
        Message.error(result.msg || 'Failed to change password');
      }
    } catch (error) {
      log.error({ err: error }, 'Set new password error');
      Message.error('Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Generate QR code
  const generateQRCode = useCallback(async () => {
    if (!status?.running) return;

    setQrLoading(true);
    try {
      // Prefer direct IPC (Electron environment)
      let result: { success: boolean; data?: { token: string; expiresAt: number; qrUrl: string }; msg?: string } | null = null;

      if (window.electronAPI?.webuiGenerateQRToken) {
        result = await window.electronAPI.webuiGenerateQRToken();
      } else {
        // Fallback: use bridge
        result = await webui.generateQRToken.invoke();
      }

      if (result && result.success && result.data) {
        setQrUrl(result.data.qrUrl);
        setQrExpiresAt(result.data.expiresAt);

        // Set auto-refresh timer (refresh after 4 minutes, as token expires in 5 minutes)
        if (qrRefreshTimerRef.current) {
          clearTimeout(qrRefreshTimerRef.current);
        }
        qrRefreshTimerRef.current = setTimeout(
          () => {
            void generateQRCode();
          },
          4 * 60 * 1000
        );
      } else {
        log.error({ msg: result?.msg }, 'Generate QR code failed');
        Message.error('Failed to generate QR code');
      }
    } catch (error) {
      log.error({ err: error }, 'Generate QR code error');
      Message.error('Failed to generate QR code');
    } finally {
      setQrLoading(false);
    }
  }, [status?.running]);

  // Auto-generate QR code when server starts and remote access is allowed
  useEffect(() => {
    if (status?.running && allowRemote && !qrUrl) {
      void generateQRCode();
    }
    // Cleanup timer
    return () => {
      if (qrRefreshTimerRef.current) {
        clearTimeout(qrRefreshTimerRef.current);
      }
    };
  }, [status?.running, allowRemote, generateQRCode, qrUrl]);

  // Clear QR code when server stops or remote access is disabled
  useEffect(() => {
    if (!status?.running || !allowRemote) {
      setQrUrl(null);
      setQrExpiresAt(null);
      if (qrRefreshTimerRef.current) {
        clearTimeout(qrRefreshTimerRef.current);
        qrRefreshTimerRef.current = null;
      }
    }
  }, [status?.running, allowRemote]);

  // Format expiration time
  const formatExpiresAt = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  // Get actual password
  const actualPassword = status?.initialPassword || cachedPassword;
  // Get display password
  // Password shows *** by default, only show plaintext on first startup
  // Show loading state when resetting
  const getDisplayPassword = () => {
    if (resetLoading) return 'Please wait...';
    // Show plaintext when allowed and has password
    if (canShowPlainPassword && actualPassword) return actualPassword;
    // Otherwise show ******
    return '******';
  };
  const displayPassword = getDisplayPassword();

  // Don't show WebUI settings in browser for security reasons
  if (!isDesktop) {
    return (
      <div className='flex flex-col h-full w-full'>
        <div className='flex flex-col items-center justify-center h-200px px-32px text-center'>
          <div className='text-16px font-500 text-t-primary mb-8px'>{'WebUI settings not available in browser'}</div>
          <div className='text-14px text-t-secondary'>{'For security reasons, WebUI settings can only be managed in the desktop application. Please open the settings panel in AionUi desktop app to configure.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col h-full w-full'>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* Title */}
          <h2 className='text-20px font-500 text-t-primary m-0'>WebUI</h2>

          {/* Description */}
          <div className='p-16px bg-fill-2 rd-12px border border-line text-13px text-t-secondary leading-relaxed'>
            <p className='m-0'>{'Use AionUi as your "24/7 Remote Assistant" - arrange tasks from any remote device, anytime, anywhere.'}</p>
            <p className='m-0 mt-4px'>{'Step 1. Turn on WebUI; Step 2. Copy the access URL; Step 3. Open in remote browser'}</p>
          </div>

          {/* WebUI Service Card */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
            {/* Enable WebUI */}
            <PreferenceRow label={'Enable WebUI'} extra={startLoading ? <span className='text-12px text-warning'>{'Starting…'}</span> : status?.running ? <span className='text-12px text-green-500'>✓ {'Running'}</span> : null}>
              <Switch checked={status?.running || startLoading} loading={startLoading} onChange={handleToggle} />
            </PreferenceRow>

            {/* Access URL (only when running) */}
            {status?.running && (
              <PreferenceRow label={'Access URL'}>
                <div className='flex items-center gap-8px'>
                  <button className='text-14px text-primary font-mono hover:underline cursor-pointer bg-transparent border-none p-0' onClick={() => shell.openExternal.invoke(getDisplayUrl()).catch((err) => log.error({ err }, 'Failed to open URL'))}>
                    {getDisplayUrl()}
                  </button>
                  <Tooltip content={'Copy'}>
                    <button className='p-4px text-t-tertiary hover:text-t-primary cursor-pointer bg-transparent border-none' onClick={() => handleCopy(getDisplayUrl())}>
                      <Copy size={16} />
                    </button>
                  </Tooltip>
                </div>
              </PreferenceRow>
            )}

            {/* Allow LAN Access */}
            <PreferenceRow
              label={'Allow Remote Access'}
              description={
                <>
                  {'Use remote software/server for secure remote access'}
                  {'  '}
                  <button className='text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-12px' onClick={() => shell.openExternal.invoke(branding.docs.remoteAccess).catch((err) => log.error({ err }, 'Failed to open docs'))}>
                    {'View Guide'}
                  </button>
                </>
              }
            >
              <Switch checked={allowRemote} onChange={handleAllowRemoteChange} />
            </PreferenceRow>
          </div>

          {/* Login Info Card */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
            <div className='text-14px font-500 mb-8px text-t-primary'>{'Login Info'}</div>

            {/* Username */}
            <InfoRow label='Username:' value={status?.adminUsername || 'admin'} onCopy={() => handleCopy(status?.adminUsername || 'admin')} />

            {/* Password */}
            <div className='flex items-center justify-between py-12px'>
              <span className='text-14px text-t-secondary'>Password:</span>
              <div className='flex items-center gap-8px'>
                <span className='text-14px text-t-primary'>{displayPassword}</span>
                {canShowPlainPassword && actualPassword ? (
                  // Show copy icon when plaintext is visible
                  <Tooltip content={'Click to copy password'}>
                    <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={handleCopyPassword}>
                      <Copy size={16} />
                    </button>
                  </Tooltip>
                ) : (
                  // Show reset icon when password is hidden
                  <Tooltip content={'Forgot password? Click to set a new one (no current password required)'}>
                    <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={handleResetPassword} disabled={resetLoading}>
                      <Refresh size={16} className={resetLoading ? 'animate-spin' : ''} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* QR Code Login (only when server running and remote access allowed) */}
            {status?.running && allowRemote && (
              <>
                <div className='border-t border-line my-12px' />
                <div className='text-14px font-500 mb-4px text-t-primary'>{'QR Code Login'}</div>
                <div className='text-12px text-t-tertiary mb-12px'>{'Scan the QR code with your phone to log in automatically on mobile browser'}</div>

                <div className='flex flex-col items-center gap-12px'>
                  {/* QR Code display area */}
                  <div className='p-12px bg-white rd-10px'>
                    {qrLoading ? (
                      <div className='w-140px h-140px flex items-center justify-center'>
                        <span className='text-14px text-t-tertiary'>{'Please wait...'}</span>
                      </div>
                    ) : qrUrl ? (
                      <QRCodeSVG value={qrUrl} size={140} level='M' />
                    ) : (
                      <div className='w-140px h-140px flex items-center justify-center'>
                        <span className='text-14px text-t-tertiary'>{'Failed to generate QR code'}</span>
                      </div>
                    )}
                  </div>

                  {/* Expiration time and refresh button */}
                  <div className='flex items-center gap-8px'>
                    {qrExpiresAt && <span className='text-12px text-t-tertiary'>{`Expires at ${formatExpiresAt(qrExpiresAt)}`}</span>}
                    <Tooltip content={'Refresh QR Code'}>
                      <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={() => void generateQRCode()} disabled={qrLoading}>
                        <Refresh size={16} className={qrLoading ? 'animate-spin' : ''} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Channels Configuration */}
          <div className='mt-24px'>
            <h2 className='text-20px font-500 text-t-primary m-0 mb-16px'>{'Channels'}</h2>
            <ChannelModalContent />
          </div>
        </div>
      </AionScrollArea>

      {/* Set New Password Modal */}
      <AionModal visible={setPasswordModalVisible} onCancel={() => setSetPasswordModalVisible(false)} onOk={handleSetNewPassword} confirmLoading={passwordLoading} title={'Set New Password'} size='small'>
        <Form form={form} layout='vertical' className='pt-16px'>
          <Form.Item
            label={'New Password'}
            field='newPassword'
            rules={[
              { required: true, message: 'Please enter new password' },
              { minLength: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password placeholder={'Enter new password (at least 8 characters)'} />
          </Form.Item>
          <Form.Item
            label={'Confirm Password'}
            field='confirmPassword'
            rules={[
              { required: true, message: 'Please confirm new password' },
              {
                validator: (value, callback) => {
                  if (value !== form.getFieldValue('newPassword')) {
                    callback('Passwords do not match');
                  } else {
                    callback();
                  }
                },
              },
            ]}
          >
            <Input.Password placeholder={'Enter new password again'} />
          </Form.Item>
        </Form>
      </AionModal>
    </div>
  );
};

export default WebuiModalContent;
