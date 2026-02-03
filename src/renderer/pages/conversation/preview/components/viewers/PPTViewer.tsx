/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface PPTPreviewProps {
  /**
   * PPT file path (absolute path on disk)
   */
  filePath?: string;
  /**
   * PPT content (not used, kept for compatibility)
   */
  content?: string;
}

/**
 * PPT presentation preview component
 *
 * Due to the complexity of the PPT format, it cannot be rendered perfectly in pure JavaScript,
 * so this component guides users to open the file in a system application (PowerPoint/Keynote/WPS)
 */
const PPTPreview: React.FC<PPTPreviewProps> = ({ filePath }) => {
  const { t } = useTranslation();
  const handleOpenExternal = async () => {
    if (!filePath) return;
    try {
      await ipcBridge.shell.openFile.invoke(filePath);
    } catch (err) {
      // Silently handle error
    }
  };

  const handleShowInFolder = async () => {
    if (!filePath) return;
    try {
      await ipcBridge.shell.showItemInFolder.invoke(filePath);
    } catch (err) {
      // Silently handle error
    }
  };

  return (
    <div className='h-full w-full bg-bg-1 flex items-center justify-center'>
      <div className='text-center max-w-400px'>
        <div className='text-48px mb-16px'>📊</div>
        <div className='text-16px text-t-primary font-medium mb-8px'>{t('preview.pptTitle')}</div>
        <div className='text-13px text-t-secondary mb-24px'>{t('preview.pptOpenHint')}</div>

        {filePath && (
          <div className='flex items-center justify-center gap-12px'>
            <Button size='small' onClick={handleOpenExternal}>
              <span>{t('preview.pptOpenFile')}</span>
            </Button>
            <Button size='small' onClick={handleShowInFolder}>
              {t('preview.pptShowLocation')}
            </Button>
          </div>
        )}

        <div className='text-11px text-t-tertiary mt-16px'>{t('preview.pptSystemAppHint')}</div>
      </div>
    </div>
  );
};

export default PPTPreview;
