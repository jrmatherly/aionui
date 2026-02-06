/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import MarkdownPreview from './MarkdownViewer';

interface WordPreviewProps {
  filePath?: string;
  content?: string; // Base64 or ArrayBuffer
  hideToolbar?: boolean;
}

/**
 * Word document preview component
 *
 * Core workflow:
 * 1. Word → Markdown (mammoth + turndown)
 * 2. Use MarkdownPreview to render preview
 * 3. Click "Open in Word" to edit with system default application
 */
const WordPreview: React.FC<WordPreviewProps> = ({ filePath, hideToolbar = false }) => {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;

  const messageApiRef = useRef(messageApi);
  useEffect(() => {
    messageApiRef.current = messageApi;
  }, [messageApi]);

  /**
   * Load Word document and convert to Markdown
   */
  useEffect(() => {
    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!filePath) {
          throw new Error('File path is missing');
        }

        // Use backend conversion service
        // Request conversion via unified document.convert IPC
        const response = await ipcBridge.document.convert.invoke({ filePath, to: 'markdown' });

        if (response.to !== 'markdown') {
          throw new Error('Conversion failed');
        }

        if (response.result.success && response.result.data) {
          setMarkdown(response.result.data);
        } else {
          throw new Error(response.result.error || 'Conversion failed');
        }
      } catch (err) {
        const defaultMessage = 'Failed to load Word document';
        const errorMessage = err instanceof Error ? err.message : defaultMessage;
        setError(`${errorMessage}\n${'Path'}: ${filePath}`);
        messageApiRef.current?.error?.(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    void loadDocument();
  }, [filePath]);

  /**
   * Open Word document in system default application
   */
  const handleOpenInSystem = useCallback(async () => {
    if (!filePath) {
      messageApi.error('Unable to open: file path is not provided');
      return;
    }

    try {
      await ipcBridge.shell.openFile.invoke(filePath);
      messageApi.info('Opened in system default app');
    } catch (err) {
      messageApi.error('Failed to open with system app');
    }
  }, [filePath, messageApi]);

  // Set toolbar extras (must be called before any conditional returns)
  useEffect(() => {
    if (!usePortalToolbar || !toolbarExtrasContext || loading || error) return;
    toolbarExtrasContext.setExtras({
      left: (
        <div className='flex items-center gap-8px'>
          <span className='text-13px text-t-secondary'>📄 {'Word Document'}</span>
        </div>
      ),
      right: null,
    });
    return () => toolbarExtrasContext.setExtras(null);
  }, [usePortalToolbar, toolbarExtrasContext, loading, error]);

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>{'Loading Word document...'}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>{'Please confirm the file is a valid Word document'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className='h-full w-full flex flex-col bg-bg-1'>
      {messageContextHolder}

      {/* Toolbar */}
      {!usePortalToolbar && !hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📄 {'Word Document'}</span>
          </div>

          {/* "Open in system" disabled for web deployment */}
        </div>
      )}

      {/* Content area */}
      <div className='flex-1 overflow-hidden'>
        <MarkdownPreview content={markdown} hideToolbar />
      </div>
    </div>
  );
};

export default WordPreview;
