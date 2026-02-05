/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Form, Modal, Tooltip } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useSettingsViewMode } from '../settingsViewContext';
import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('SystemModalContent');

/**
 * Directory selection input component
 * Used for selecting and displaying system directory paths
 */
const DirInputItem: React.FC<{
  /** Label text */
  label: string;
  /** Form field name */
  field: string;
}> = ({ label, field }) => {
  return (
    <Form.Item label={label} field={field}>
      {(value, form) => {
        const currentValue = form.getFieldValue(field) || '';

        const handlePick = () => {
          ipcBridge.dialog.showOpen
            .invoke({
              defaultPath: currentValue,
              properties: ['openDirectory', 'createDirectory'],
            })
            .then((data) => {
              if (data?.[0]) {
                form.setFieldValue(field, data[0]);
              }
            })
            .catch((error) => {
              log.error({ err: error }, 'Failed to open directory dialog');
            });
        };

        return (
          <div className='aion-dir-input h-[32px] flex items-center rounded-8px border border-solid border-transparent pl-14px bg-[var(--fill-0)]'>
            <Tooltip content={currentValue || 'Not configured yet'} position='top'>
              <div className='flex-1 min-w-0 text-13px text-t-primary truncate '>{currentValue || 'Not configured yet'}</div>
            </Tooltip>
            <Button
              type='text'
              style={{ borderLeft: '1px solid var(--color-border-2)', borderRadius: '0 8px 8px 0' }}
              icon={<FolderOpen theme='outline' size='18' fill={iconColors.primary} />}
              onClick={(e) => {
                e.stopPropagation();
                handlePick();
              }}
            />
          </div>
        );
      }}
    </Form.Item>
  );
};

/**
 * Preference row component
 * Used for displaying labels and corresponding controls in a unified horizontal layout
 */
const PreferenceRow: React.FC<{
  /** Label text */
  label: string;
  /** Control element */
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='text-14px text-2'>{label}</div>
    <div className='flex-1 flex justify-end'>{children}</div>
  </div>
);

/**
 * System settings content component
 *
 * Provides system-level configuration options including language and directory config
 *
 * @features
 * - Language setting
 * - Advanced: cache directory, work directory configuration
 * - Auto-save on configuration changes
 */
interface SystemModalContentProps {
  /** Close settings modal */
  onRequestClose?: () => void;
}

const SystemModalContent: React.FC<SystemModalContentProps> = ({ onRequestClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // Get system directory info
  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  // Initialize form data
  useEffect(() => {
    if (systemInfo) {
      form.setFieldValue('cacheDir', systemInfo.cacheDir);
      form.setFieldValue('workDir', systemInfo.workDir);
    }
  }, [systemInfo, form]);

  // Preference items configuration (language switcher hidden — English-only for now)
  const preferenceItems: { key: string; label: string; component: React.ReactNode }[] = [];

  // Directory configuration save confirmation
  const saveDirConfigValidate = (_values: { cacheDir: string; workDir: string }): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: 'Confirm Changes',
        content: 'Changes will restart the application. Continue?',
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  /**
   * Save directory configuration
   * If directories are changed, will prompt user for confirmation and restart the app
   */
  const onSubmit = async () => {
    let shouldClose = false;
    try {
      const values = await form.validate();
      const { cacheDir, workDir } = values;
      setLoading(true);
      setError(null);

      // Check if directories are modified
      const needsRestart = cacheDir !== systemInfo?.cacheDir || workDir !== systemInfo?.workDir;

      if (needsRestart) {
        try {
          await saveDirConfigValidate(values);
          const result = await ipcBridge.application.updateSystemInfo.invoke({ cacheDir, workDir });
          if (result.success) {
            await ipcBridge.application.restart.invoke();
            shouldClose = true;
          } else {
            setError(result.msg || 'Failed to update system info');
          }
        } catch (caughtError: unknown) {
          if (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
          }
        }
      } else {
        shouldClose = true;
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setLoading(false);
      if (shouldClose) {
        onRequestClose?.();
      }
    }
  };

  // Reset form to initial values
  const onReset = () => {
    if (systemInfo) {
      form.setFieldValue('cacheDir', systemInfo.cacheDir);
      form.setFieldValue('workDir', systemInfo.workDir);
    }
    setError(null);
  };

  const handleCancel = () => {
    onReset();
    onRequestClose?.();
  };

  return (
    <div className='flex flex-col h-full w-full'>
      {modalContextHolder}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* Combined preferences and advanced settings */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
            <Form form={form} layout='vertical' className='space-y-16px'>
              <DirInputItem label={'Cache Directory'} field='cacheDir' />
              <DirInputItem label={'Work Directory'} field='workDir' />
              {error && <Alert className='mt-16px' type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
            </Form>
          </div>
        </div>
      </AionScrollArea>

      {/* Footer with action buttons */}
      <div className={classNames('flex-shrink-0 flex gap-10px border-t border-border-2 px-24px pt-10px', isPageMode ? 'border-none px-0 pt-10px flex-col md:flex-row md:justify-end' : 'justify-end')}>
        <Button className={classNames('rd-100px', isPageMode && 'w-full md:w-auto')} onClick={handleCancel}>
          {'Cancel'}
        </Button>
        <Button type='primary' loading={loading} onClick={onSubmit} className={classNames('rd-100px', isPageMode && 'w-full md:w-auto')}>
          {'Save'}
        </Button>
      </div>
    </div>
  );
};

export default SystemModalContent;
