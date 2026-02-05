/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createLogger } from '@/renderer/utils/logger';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef, useState } from 'react';
import type { FileMetadata } from '../services/FileService';
import { FileService, isSupportedFile } from '../services/FileService';

const log = createLogger('useDragUpload');

export interface UseDragUploadOptions {
  supportedExts?: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
}

export const useDragUpload = ({ supportedExts = [], onFilesAdded }: UseDragUploadOptions) => {
  const [isFileDragging, setIsFileDragging] = useState(false);

  // Drag counter to prevent state flickering
  const dragCounter = useRef(0);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isFileDragging) {
        setIsFileDragging(true);
        dragCounter.current += 1;
      }
    },
    [isFileDragging]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current += 1;
    setIsFileDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current -= 1;

    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsFileDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Reset state
      dragCounter.current = 0;
      setIsFileDragging(false);

      if (!onFilesAdded) return;

      try {
        const droppedFiles = e.nativeEvent.dataTransfer!.files;

        // Step 1: Validate file types first, filter out supported files
        const validFiles: File[] = [];

        for (let i = 0; i < droppedFiles.length; i++) {
          const file = droppedFiles[i];
          if (supportedExts.length === 0 || isSupportedFile(file.name, supportedExts)) {
            validFiles.push(file);
          }
          // Note: Unsupported files are silently filtered, consistent with original logic
        }

        // Step 2: Only process validated files
        if (validFiles.length > 0) {
          // Create FileList object for processDroppedFiles
          const validFileList = Object.assign(validFiles, {
            length: validFiles.length,
            item: (index: number) => validFiles[index] || null,
          }) as unknown as FileList;
          const processedFiles = await FileService.processDroppedFiles(validFileList);

          if (processedFiles.length > 0) {
            onFilesAdded(processedFiles);
          }
        }
      } catch (err) {
        log.error({ err }, 'Failed to process dropped files');
        Message.error('Failed to process dropped files');
      }
    },
    [onFilesAdded, supportedExts]
  );

  const dragHandlers = {
    onDragOver: handleDragOver,
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return {
    isFileDragging,
    dragHandlers,
  };
};
