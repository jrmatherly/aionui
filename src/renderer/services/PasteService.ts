/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileMetadata } from './FileService';
import { getFileExtension } from './FileService';

type PasteHandler = (event: React.ClipboardEvent | ClipboardEvent) => Promise<boolean>;

// MIME type to file extension mapping
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
  };
  return mimeMap[mimeType] || '.png'; // Default to .png
}

class PasteServiceClass {
  private handlers: Map<string, PasteHandler> = new Map();
  private lastFocusedComponent: string | null = null;
  private isInitialized = false;

  // Initialize global paste listener
  init() {
    if (this.isInitialized) return;

    document.addEventListener('paste', this.handleGlobalPaste);
    this.isInitialized = true;
  }

  // Register component's paste handler
  registerHandler(componentId: string, handler: PasteHandler) {
    this.handlers.set(componentId, handler);
  }

  // Unregister component's paste handler
  unregisterHandler(componentId: string) {
    this.handlers.delete(componentId);
  }

  // Set current focused component
  setLastFocusedComponent(componentId: string) {
    this.lastFocusedComponent = componentId;
  }

  // Global paste event handler
  private handleGlobalPaste = async (event: ClipboardEvent) => {
    // When paste target is an editable element (input/textarea/contentEditable), let browser handle it natively to avoid intercepting other input fields
    if (this.shouldAllowNativePaste(event)) {
      return;
    }

    if (!this.lastFocusedComponent) return;

    const handler = this.handlers.get(this.lastFocusedComponent);
    if (handler) {
      const handled = await handler(event);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  private shouldAllowNativePaste(event: ClipboardEvent): boolean {
    const target = event.target;
    if (!target || !(target instanceof Element)) {
      return false;
    }

    const editableElement = target.closest('input, textarea, [contenteditable]');
    if (!editableElement) {
      return false;
    }

    if (editableElement instanceof HTMLInputElement || editableElement instanceof HTMLTextAreaElement) {
      return true;
    }

    if (editableElement instanceof HTMLElement) {
      if (editableElement.isContentEditable) {
        return true;
      }
      const attr = editableElement.getAttribute('contenteditable');
      return !!attr && attr.toLowerCase() !== 'false';
    }

    return false;
  }

  // Common paste handling logic
  async handlePaste(event: React.ClipboardEvent | ClipboardEvent, supportedExts: string[], onFilesAdded: (files: FileMetadata[]) => void, onTextPaste?: (text: string) => void): Promise<boolean> {
    // Stop event propagation immediately to avoid duplicate processing by global listener
    event.stopPropagation();
    const clipboardText = event.clipboardData?.getData('text');
    const files = event.clipboardData?.files;
    // If caller passes an empty array, treat it as "allow all file types"
    const allowAll = !supportedExts || supportedExts.length === 0;

    // Prioritize checking for files; if files exist, ignore text (avoid inserting filename when pasting files)
    if (files && files.length > 0) {
      // Process files, skip text handling
      const fileList: FileMetadata[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as File & { path?: string }).path;

        // Check if file path exists (File object in Electron environment has additional path property)

        if (!filePath && file.type.startsWith('image/')) {
          // Clipboard image, need to check if this type is supported
          const fileExt = getFileExtension(file.name) || getExtensionFromMimeType(file.type);

          if (allowAll || supportedExts.includes(fileExt)) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // Generate concise filename; if clipboard image has strange default name, replace with concise name
              const now = new Date();
              const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

              // If filename looks system-generated (contains timestamp format), use our naming
              const isSystemGenerated = file.name && /^[a-zA-Z]?_?\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(file.name);
              const fileName = file.name && !isSystemGenerated ? file.name : `pasted_image_${timeStr}${fileExt}`;

              // Create temporary file and write data
              const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName });
              if (tempPath) {
                await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });
              }

              if (tempPath) {
                fileList.push({
                  name: fileName,
                  path: tempPath,
                  size: file.size,
                  type: file.type,
                  lastModified: Date.now(),
                });
              }
            } catch (error) {
              console.error('Failed to create temporary file:', error);
            }
          } else {
            // Unsupported file type, skip without error (let subsequent filtering handle it)
            console.warn(`Unsupported image type: ${file.type}, extension: ${fileExt}`);
          }
        } else if (filePath) {
          // File with file path (dragged from file manager)
          // Check if file type is supported
          const fileExt = getFileExtension(file.name);

          if (allowAll || supportedExts.includes(fileExt)) {
            fileList.push({
              name: file.name,
              path: filePath,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
            });
          } else {
            // Unsupported file type
            console.warn(`Unsupported file type: ${file.name}, extension: ${fileExt}`);
          }
        } else if (!file.type.startsWith('image/')) {
          // Non-image file without file path (copy-pasted from file manager)
          const fileExt = getFileExtension(file.name);

          if (allowAll || supportedExts.includes(fileExt)) {
            // For copy-pasted files, we need to create temporary file
            try {
              const arrayBuffer = await file.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // Use original filename
              const fileName = file.name;

              // Create temporary file and write data
              const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName });
              if (tempPath) {
                await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });

                fileList.push({
                  name: fileName,
                  path: tempPath,
                  size: file.size,
                  type: file.type,
                  lastModified: Date.now(),
                });
              }
            } catch (error) {
              console.error('Failed to create temporary file:', error);
            }
          } else {
            console.warn(`Unsupported file type: ${file.name}, extension: ${fileExt}`);
          }
        }
      }

      // After processing files, always return true (prevent text insertion)
      if (fileList.length > 0) {
        onFilesAdded(fileList);
      }
      return true; // Prevent default behavior, don't insert filename text
    }

    // Handle plain text paste (only when no files)
    if (clipboardText && (!files || files.length === 0)) {
      // On iOS, let Safari handle plain text paste natively to avoid paste menu/keyboard jitter issues
      const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);
      if (isIOS) {
        return false;
      }
      if (onTextPaste) {
        // Clean extra newlines from text, especially trailing newlines
        const cleanedText = clipboardText.replace(/\n\s*$/, '');
        onTextPaste(cleanedText);
        return true; // Handled, prevent default behavior
      }
      return false; // If no callback, allow default behavior
    }

    return false;
  }

  // Cleanup resources
  destroy() {
    if (this.isInitialized) {
      document.removeEventListener('paste', this.handleGlobalPaste);
      this.handlers.clear();
      this.lastFocusedComponent = null;
      this.isInitialized = false;
    }
  }
}

// Export singleton instance
export const PasteService = new PasteServiceClass();
