/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { ipcBridge } from '@/common';
import type { FileChange } from '@/common/codex/types';
import { uuid } from '@/common/utils';
import fs from 'fs/promises';
import path from 'path';

export interface FileOperation {
  method: string;
  path: string;
  filename?: string;
  content?: string;
  action?: 'create' | 'write' | 'delete' | 'read';
  metadata?: Record<string, unknown>;
}

/**
 * CodexFileOperationHandler - Based on ACP's file operation capabilities
 * Provides unified file read/write, permission management and operation feedback
 */
export class CodexFileOperationHandler {
  private readonly pendingOperations = new Map<string, { resolve: (result: unknown) => void; reject: (error: unknown) => void }>();
  private readonly workingDirectory: string;

  constructor(
    workingDirectory: string,
    private conversation_id: string,
    private messageEmitter: ICodexMessageEmitter
  ) {
    this.workingDirectory = path.resolve(workingDirectory);
  }

  /**
   * Handle file operation request - Based on ACP's handleFileOperation
   */
  async handleFileOperation(operation: FileOperation): Promise<unknown> {
    // Validate inputs
    if (!operation.filename && !operation.path) {
      throw new Error('File operation requires either filename or path');
    }

    try {
      switch (operation.method) {
        case 'fs/write_text_file':
        case 'file_write':
          return await this.handleFileWrite(operation);
        case 'fs/read_text_file':
        case 'file_read':
          return await this.handleFileRead(operation);
        case 'fs/delete_file':
        case 'file_delete':
          return await this.handleFileDelete(operation);
        default:
          return this.handleGenericFileOperation(operation);
      }
    } catch (error) {
      this.emitErrorMessage(`File operation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Handle file write operation
   */
  private async handleFileWrite(operation: FileOperation): Promise<void> {
    const fullPath = this.resolveFilePath(operation.path);
    const content = operation.content || '';

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');

    // Send streaming content update to preview panel (for real-time updates)
    try {
      const eventData = {
        filePath: fullPath,
        content: content,
        workspace: this.workingDirectory,
        relativePath: operation.path,
        operation: 'write' as const,
      };

      ipcBridge.fileStream.contentUpdate.emit(eventData);
    } catch (error) {
      console.error('[CodexFileOperationHandler] ❌ Failed to emit file stream update:', error);
    }

    // Send operation feedback message
    this.emitFileOperationMessage({
      method: 'fs/write_text_file',
      path: operation.path,
      content: content,
    });
  }

  /**
   * Handle file read operation
   */
  private async handleFileRead(operation: FileOperation): Promise<string> {
    const fullPath = this.resolveFilePath(operation.path);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      // Send operation feedback message
      this.emitFileOperationMessage({
        method: 'fs/read_text_file',
        path: operation.path,
      });

      return content;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${operation.path}`);
      }
      throw error;
    }
  }

  /**
   * Handle file delete operation
   */
  private async handleFileDelete(operation: FileOperation): Promise<void> {
    const fullPath = this.resolveFilePath(operation.path);

    try {
      await fs.unlink(fullPath);

      // Send streaming delete event to preview panel (to close preview)
      try {
        ipcBridge.fileStream.contentUpdate.emit({
          filePath: fullPath,
          content: '',
          workspace: this.workingDirectory,
          relativePath: operation.path,
          operation: 'delete',
        });
      } catch (error) {
        console.error('[CodexFileOperationHandler] Failed to emit file stream delete:', error);
      }

      // Send operation feedback message
      this.emitFileOperationMessage({
        method: 'fs/delete_file',
        path: operation.path,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return; // File doesn't exist, treat as success
      }
      throw error;
    }
  }

  /**
   * Handle generic file operation
   */
  private handleGenericFileOperation(operation: FileOperation): Promise<void> {
    // Send generic operation feedback message
    this.emitFileOperationMessage(operation);
    return Promise.resolve();
  }

  /**
   * Resolve file path - Based on ACP's path handling logic
   */
  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.workingDirectory, filePath);
  }

  /**
   * Process smart file references - Based on ACP's @filename handling
   */
  processFileReferences(content: string, files?: string[]): string {
    if (!files || files.length === 0 || !content.includes('@')) {
      return content;
    }

    let processedContent = content;

    // Get actual filenames
    const actualFilenames = files.map((filePath) => {
      return filePath.split('/').pop() || filePath;
    });

    // Replace @actualFilename with actualFilename
    actualFilenames.forEach((filename) => {
      const atFilename = `@${filename}`;
      if (processedContent.includes(atFilename)) {
        processedContent = processedContent.replace(new RegExp(atFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), filename);
      }
    });

    return processedContent;
  }

  /**
   * Send file operation message to UI - Based on ACP's formatFileOperationMessage
   */
  private emitFileOperationMessage(operation: FileOperation): void {
    const formattedMessage = this.formatFileOperationMessage(operation);

    this.messageEmitter.emitAndPersistMessage({
      type: 'content',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: formattedMessage,
    });
  }

  /**
   * Format file operation message - Based on ACP's implementation
   */
  private formatFileOperationMessage(operation: FileOperation): string {
    switch (operation.method) {
      case 'fs/write_text_file':
      case 'file_write': {
        const content = operation.content || '';
        const previewContent = content.length > 500 ? content.substring(0, 500) + '\n... (truncated)' : content;
        return `📝 **File written:** \`${operation.path}\`\n\n\`\`\`\n${previewContent}\n\`\`\``;
      }
      case 'fs/read_text_file':
      case 'file_read':
        return `📖 **File read:** \`${operation.path}\``;
      case 'fs/delete_file':
      case 'file_delete':
        return `🗑️ **File deleted:** \`${operation.path}\``;
      default:
        return `🔧 **File operation:** \`${operation.path}\` (${operation.method})`;
    }
  }

  /**
   * Send error message
   */
  private emitErrorMessage(error: string): void {
    this.messageEmitter.emitAndPersistMessage({
      type: 'error',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: error,
    });
  }

  /**
   * Apply batch file changes - Based on ACP and current CodexAgentManager's applyPatchChanges
   */
  async applyBatchChanges(changes: Record<string, FileChange>): Promise<void> {
    const operations: Promise<void>[] = [];

    for (const [filePath, change] of Object.entries(changes)) {
      if (typeof change === 'object' && change !== null) {
        const action = this.getChangeAction(change);
        const content = this.getChangeContent(change);
        const operation: FileOperation = {
          method: action === 'delete' ? 'fs/delete_file' : 'fs/write_text_file',
          path: filePath,
          content,
          action,
        };
        operations.push(this.handleFileOperation(operation).then((): void => void 0));
      }
    }

    await Promise.all(operations);
  }

  private getChangeAction(change: FileChange): 'create' | 'write' | 'delete' {
    // Modern FileChange structure check
    if (typeof change === 'object' && change !== null && 'type' in change) {
      const type = change.type;
      if (type === 'add') return 'create';
      if (type === 'delete') return 'delete';
      if (type === 'update') return 'write';
    }

    // Backward compatibility with old format - type-safe check
    if (typeof change === 'object' && change !== null && 'action' in change) {
      const action = change.action;
      if (action === 'create' || action === 'modify' || action === 'delete' || action === 'rename') {
        return action === 'create' ? 'create' : action === 'delete' ? 'delete' : 'write';
      }
    }

    return 'write';
  }

  private getChangeContent(change: FileChange): string {
    if (typeof change === 'object' && change !== null && 'content' in change && typeof change.content === 'string') {
      return change.content;
    }
    return '';
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // Reject all pending operations
    for (const [_operationId, { reject }] of this.pendingOperations) {
      reject(new Error('File operation handler is being cleaned up'));
    }
    this.pendingOperations.clear();
  }
}
