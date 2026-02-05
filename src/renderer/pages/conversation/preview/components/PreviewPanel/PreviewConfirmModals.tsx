/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Modal } from '@arco-design/web-react';
import type React from 'react';
/**
 * Close tab confirmation state
 */
export interface CloseTabConfirmState {
  /**
   * Whether to show confirmation dialog
   */
  show: boolean;

  /**
   * Tab ID to close
   */
  tabId: string | null;
}

/**
 * PreviewConfirmModals component props
 */
interface PreviewConfirmModalsProps {
  /**
   * Whether to show exit edit confirmation dialog
   */
  showExitConfirm: boolean;

  /**
   * Close tab confirmation state
   */
  closeTabConfirm: CloseTabConfirmState;

  /**
   * Confirm exit edit
   */
  onConfirmExit: () => void;

  /**
   * Cancel exit edit
   */
  onCancelExit: () => void;

  /**
   * Save and close tab
   */
  onSaveAndCloseTab: () => void;

  /**
   * Close tab without saving
   */
  onCloseWithoutSave: () => void;

  /**
   * Cancel close tab
   */
  onCancelCloseTab: () => void;
}

/**
 * Preview panel confirmation modals component
 *
 * Contains exit edit confirmation and close tab confirmation dialogs
 */
const PreviewConfirmModals: React.FC<PreviewConfirmModalsProps> = ({ showExitConfirm, closeTabConfirm, onConfirmExit, onCancelExit, onSaveAndCloseTab, onCloseWithoutSave, onCancelCloseTab }) => {
  return (
    <>
      {/* Exit edit confirmation modal */}
      <Modal visible={showExitConfirm} title={'Unsaved Changes'} onCancel={onCancelExit} onOk={onConfirmExit} okText={'Confirm Exit'} cancelText={'Continue Editing'} style={{ borderRadius: '12px' }} alignCenter getPopupContainer={() => document.body}>
        <div className='text-14px text-t-secondary'>{'You have unsaved changes. Are you sure you want to exit editing?'}</div>
      </Modal>

      {/* Close tab confirmation modal */}
      <Modal
        visible={closeTabConfirm.show}
        title={'Close Tab'}
        onCancel={onCancelCloseTab}
        onOk={onSaveAndCloseTab}
        okText={'Save and Close'}
        cancelText={'Cancel'}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
        footer={
          <div className='flex justify-end gap-8px'>
            <button className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary' onClick={onCancelCloseTab}>
              {'Cancel'}
            </button>
            <button className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary' onClick={onCloseWithoutSave}>
              {"Don't Save"}
            </button>
            <button className='px-16px py-6px cursor-pointer border-none bg-primary text-white hover:opacity-80 transition-opacity text-14px' onClick={onSaveAndCloseTab}>
              {'Save and Close'}
            </button>
          </div>
        }
      >
        <div className='text-14px text-t-secondary'>{'The current content has not been saved. Do you want to save before closing?'}</div>
      </Modal>
    </>
  );
};

export default PreviewConfirmModals;
