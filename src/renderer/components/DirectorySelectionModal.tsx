/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Message, Modal, Spin } from '@arco-design/web-react';
import { IconFile, IconFolder, IconUp, IconUpload } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('DirectorySelectionModal');
interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
}

interface DirectoryData {
  items: DirectoryItem[];
  canGoUp: boolean;
  parentPath?: string;
}

interface DirectorySelectionModalProps {
  visible: boolean;
  isFileMode?: boolean;
  onConfirm: (paths: string[] | undefined) => void;
  onCancel: () => void;
}

const DirectorySelectionModal: React.FC<DirectorySelectionModalProps> = ({ visible, isFileMode = false, onConfirm, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [directoryData, setDirectoryData] = useState<DirectoryData>({ items: [], canGoUp: false });
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDirectory = useCallback(
    async (path = '') => {
      setLoading(true);
      try {
        const showFiles = isFileMode ? 'true' : 'false';
        const response = await fetch(`/api/directory/browse?path=${encodeURIComponent(path)}&showFiles=${showFiles}`, {
          method: 'GET',
          credentials: 'include',
        });
        const data = await response.json();
        setDirectoryData(data);
        setCurrentPath(path);
      } catch (error) {
        log.error({ err: error }, 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [isFileMode]
  );

  useEffect(() => {
    if (visible) {
      setSelectedPath('');
      loadDirectory('').catch((error) => log.error({ err: error }, 'Failed to load initial directory'));
    }
  }, [visible, loadDirectory]);

  const handleItemClick = (item: DirectoryItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path).catch((error) => log.error({ err: error }, 'Failed to load directory'));
    }
  };

  // Double-click behavior removed - single click now handles directory navigation
  const handleItemDoubleClick = (_item: DirectoryItem) => {
    // No-op: single click already handles navigation
  };

  const handleSelect = (path: string) => {
    setSelectedPath(path);
  };

  const handleGoUp = () => {
    if (directoryData.parentPath !== undefined) {
      loadDirectory(directoryData.parentPath).catch((error) => log.error({ err: error }, 'Failed to load parent directory'));
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedPaths: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Strip the data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = result.split(',')[1] || result;
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const response = await fetch('/api/directory/upload', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            content: base64,
            targetDir: currentPath || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(errorData.error || `Failed to upload ${file.name}`);
        }

        const result = await response.json();
        uploadedPaths.push(result.path);
      }

      // Refresh directory listing to show uploaded files
      await loadDirectory(currentPath);

      // Auto-select the last uploaded file
      if (uploadedPaths.length > 0) {
        setSelectedPath(uploadedPaths[uploadedPaths.length - 1]);
      }

      Message.success(`Uploaded ${uploadedPaths.length} file(s)`);
    } catch (error) {
      log.error({ err: error }, 'Upload failed');
      Message.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onConfirm([selectedPath]);
    }
  };

  const canSelect = (item: DirectoryItem) => {
    return isFileMode ? item.isFile : item.isDirectory;
  };

  return (
    <Modal
      visible={visible}
      title={isFileMode ? '📄 ' + 'Select File' : '📁 ' + 'Select Directory'}
      onCancel={onCancel}
      onOk={handleConfirm}
      okButtonProps={{ disabled: !selectedPath }}
      className='w-[90vw] md:w-[600px]'
      style={{ width: 'min(600px, 90vw)' }}
      wrapStyle={{ zIndex: 3000 }}
      maskStyle={{ zIndex: 2990 }}
      footer={
        <div className='w-full flex justify-between items-center'>
          <div className='text-t-secondary text-14px overflow-hidden text-ellipsis whitespace-nowrap max-w-[70vw]' title={selectedPath || currentPath}>
            {selectedPath || currentPath || (isFileMode ? 'Please select a file' : 'Please select a directory')}
          </div>
          <div className='flex gap-10px'>
            <Button onClick={onCancel}>{'Cancel'}</Button>
            <Button type='primary' onClick={handleConfirm} disabled={!selectedPath}>
              {'Confirm'}
            </Button>
          </div>
        </div>
      }
    >
      {/* Hidden file input for uploads */}
      {isFileMode && (
        <input
          ref={fileInputRef}
          type='file'
          multiple
          className='hidden'
          onChange={(e) => {
            handleFileChange(e).catch((err) => log.error({ err }, 'Failed to handle file change'));
          }}
        />
      )}

      {/* Upload button for file mode */}
      {isFileMode && (
        <div className='mb-12px'>
          <Button type='outline' icon={<IconUpload />} loading={uploading} onClick={handleUploadClick} className='w-full'>
            {uploading ? 'Please wait...' : 'Upload from your device'}
          </Button>
        </div>
      )}

      <Spin loading={loading} className='w-full'>
        <div className='w-full border border-b-base rd-4px overflow-hidden' style={{ height: 'min(400px, 60vh)' }}>
          <div className='h-full overflow-y-auto'>
            {directoryData.canGoUp && (
              <div className='flex items-center p-10px border-b border-b-light cursor-pointer hover:bg-hover transition' onClick={handleGoUp}>
                <IconUp className='mr-10px text-t-secondary' />
                <span>..</span>
              </div>
            )}
            {directoryData.items.map((item, index) => (
              <div key={index} className='flex items-center justify-between p-10px border-b border-b-light cursor-pointer hover:bg-hover transition' style={selectedPath === item.path ? { background: 'var(--brand-light)' } : {}} onClick={() => handleItemClick(item)} onDoubleClick={() => handleItemDoubleClick(item)}>
                <div className='flex items-center flex-1 min-w-0'>
                  {item.isDirectory ? <IconFolder className='mr-10px text-warning shrink-0' /> : <IconFile className='mr-10px text-primary shrink-0' />}
                  <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{item.name}</span>
                </div>
                {canSelect(item) && (
                  <Button
                    type='primary'
                    size='mini'
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(item.path);
                    }}
                  >
                    {'Select'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Spin>
    </Modal>
  );
};

export default DirectorySelectionModal;
