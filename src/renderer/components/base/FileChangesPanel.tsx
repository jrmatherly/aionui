/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { Down, PreviewOpen } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * File change item data
 */
export interface FileChangeItem {
  /** File name */
  fileName: string;
  /** Full path */
  fullPath: string;
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
}

/**
 * File changes panel props
 */
export interface FileChangesPanelProps {
  /** Panel title */
  title: string;
  /** File changes list */
  files: FileChangeItem[];
  /** Default expanded state */
  defaultExpanded?: boolean;
  /** Callback when file is clicked */
  onFileClick?: (file: FileChangeItem) => void;
  /** Additional class name */
  className?: string;
}

/**
 * File changes panel component
 *
 * Used to display generated/modified files in conversation, supports expand/collapse
 */
const FileChangesPanel: React.FC<FileChangesPanelProps> = ({ title, files, defaultExpanded = true, onFileClick, className }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (files.length === 0) {
    return null;
  }

  return (
    <div className={classNames('w-full box-border rounded-8px overflow-hidden border border-solid border-[var(--aou-2)]', className)} style={{ width: '100%' }}>
      {/* Header */}
      <div className='flex items-center justify-between px-16px py-12px cursor-pointer select-none' onClick={() => setExpanded(!expanded)}>
        <div className='flex items-center gap-8px'>
          {/* Green dot */}
          <span className='w-8px h-8px rounded-full bg-[#52c41a] shrink-0'></span>
          {/* Title */}
          <span className='text-14px text-t-primary font-medium'>{title}</span>
        </div>
        {/* Expand/collapse arrow */}
        <Down theme='outline' size='16' fill={iconColors.secondary} className={classNames('transition-transform duration-200', expanded && 'rotate-180')} />
      </div>

      {/* File list */}
      {expanded && (
        <div className='w-full bg-2'>
          {files.map((file, index) => (
            <div key={`${file.fullPath}-${index}`} className={classNames('group flex items-center justify-between px-16px py-12px cursor-pointer hover:bg-3 transition-colors')} onClick={() => onFileClick?.(file)}>
              <div className='flex items-center'>
                {/* File name */}
                <span className='text-14px text-t-primary truncate'>{file.fileName}</span>
              </div>
              {/* Change statistics */}
              <div className='flex items-center gap-8px shrink-0'>
                {file.insertions > 0 && <span className='text-14px text-[#52c41a] font-medium'>+{file.insertions}</span>}
                {file.deletions > 0 && <span className='text-14px text-[#ff4d4f] font-medium'>-{file.deletions}</span>}
                {/* Preview button - show on hover */}
                <span className='group-hover:opacity-100 transition-opacity shrink-0 ml-8px flex items-center gap-4px text-12px text-t-secondary'>
                  <PreviewOpen className='line-height-8px' theme='outline' size='14' fill={iconColors.secondary} />
                  {t('preview.preview')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileChangesPanel;
