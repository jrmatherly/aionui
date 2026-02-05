/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('FileService');
// Simple formatBytes implementation moved from deleted updateConfig
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ===== File type support configuration =====
// Note: Current architecture is pre-designed to support all file types
// The following constants are reserved for future file type filtering functionality

/** Supported image file extensions */
export const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

/** Supported document file extensions */
export const documentExts = ['.pdf', '.doc', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods'];

/** Supported text file extensions */
export const textExts = ['.txt', '.md', '.json', '.xml', '.csv', '.log', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.yml', '.yaml', '.toml', '.ini', '.conf', '.config'];

/** All supported file extensions (pre-designed, currently accepts all file types) */
export const allSupportedExts = [...imageExts, ...documentExts, ...textExts];

// File metadata interface
export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
}

/**
 * Check if file is supported
 * Note: Current implementation is pre-designed architecture that supports all file types
 * supportedExts parameter is reserved for future file type filtering functionality
 *
 * @param _fileName File name (reserved parameter)
 * @param _supportedExts Array of supported file extensions (reserved parameter)
 * @returns Always returns true, indicating all file types are supported
 */
export function isSupportedFile(_fileName: string, _supportedExts: string[]): boolean {
  return true; // Pre-designed: currently supports all file types
}

// Get file extension
export function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > -1 ? fileName.substring(lastDotIndex).toLowerCase() : '';
}

import { AIONUI_TIMESTAMP_REGEX } from '@/common/constants';

// Clean AionUI timestamp suffix, return original filename
export function cleanAionUITimestamp(fileName: string): string {
  return fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
}

// Get cleaned filename from file path (for UI display)
export function getCleanFileName(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() || '';
  return cleanAionUITimestamp(fileName);
}

// Get cleaned filenames array from file paths array (for message formatting)
export function getCleanFileNames(filePaths: string[]): string[] {
  return filePaths.map(getCleanFileName);
}

/**
 * Filter supported files
 * Note: Since isSupportedFile currently always returns true, this function actually doesn't filter any files
 * This is pre-designed architecture reserved for future file type filtering functionality
 *
 * @param files File metadata array
 * @param supportedExts Array of supported file extensions (reserved parameter)
 * @returns Currently returns all files without filtering
 */
export function filterSupportedFiles(files: FileMetadata[], supportedExts: string[]): FileMetadata[] {
  return files.filter((file) => isSupportedFile(file.name, supportedExts));
}

// Extract files from drag event (pure utility function, no business logic)
export function getFilesFromDropEvent(event: DragEvent): FileMetadata[] {
  const files: FileMetadata[] = [];

  if (!event.dataTransfer?.files) {
    return files;
  }

  for (let i = 0; i < event.dataTransfer.files.length; i++) {
    const file = event.dataTransfer.files[i];
    // In Electron environment, dragged files have additional path property
    const electronFile = file as File & { path?: string };

    files.push({
      name: file.name,
      path: electronFile.path || '', // Original path, may be empty
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  return files;
}

// Extract text from drag event
export function getTextFromDropEvent(event: DragEvent): string {
  return event.dataTransfer?.getData('text/plain') || '';
}

// Format file size (using unified formatBytes implementation)
export function formatFileSize(bytes: number): string {
  return formatBytes(bytes, 2); // Keep 2 decimal places for backward compatibility
}

/**
 * Check if file is an image
 * Note: Since isSupportedFile currently always returns true, this function actually always returns true
 * Pre-designed architecture reserved for future file type checking functionality
 * Currently unused, kept for future extension
 */
export function isImageFile(fileName: string): boolean {
  return isSupportedFile(fileName, imageExts);
}

/**
 * Check if file is a document
 * Note: Since isSupportedFile currently always returns true, this function actually always returns true
 * Pre-designed architecture reserved for future file type checking functionality
 * Currently unused, kept for future extension
 */
export function isDocumentFile(fileName: string): boolean {
  return isSupportedFile(fileName, documentExts);
}

/**
 * Check if file is a text file
 * Note: Since isSupportedFile currently always returns true, this function actually always returns true
 * Pre-designed architecture reserved for future file type checking functionality
 * Currently unused, kept for future extension
 */
export function isTextFile(fileName: string): boolean {
  return isSupportedFile(fileName, textExts);
}

class FileServiceClass {
  /**
   * Process files from drag and drop events, creating temporary files for files without valid paths
   */
  async processDroppedFiles(files: FileList): Promise<FileMetadata[]> {
    const processedFiles: FileMetadata[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // In Electron environment, dragged files have additional path property
      const electronFile = file as File & { path?: string };

      let filePath = electronFile.path || '';

      // If no valid path (some dragged files may not have paths), create temporary file
      if (!filePath) {
        try {
          // Read file content
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Create temporary file
          const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName: file.name });
          if (tempPath) {
            await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });
            filePath = tempPath;
          }
        } catch (error) {
          log.error({ err: error, fileName: file.name }, 'Failed to create temp file for dragged file');
          // Skip failed files instead of using invalid paths
          continue;
        }
      }

      processedFiles.push({
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
    }

    return processedFiles;
  }
}

export const FileService = new FileServiceClass();
