/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import { usePasteService } from '@/renderer/hooks/usePasteService';
import { useCallback, useState } from 'react';
import type { MessageApi, PasteConfirmState, SelectedNodeRef } from '../types';
import { getTargetFolderPath } from '../utils/treeHelpers';

interface UseWorkspacePasteOptions {
  workspace: string;
  messageApi: MessageApi;
  t: (key: string) => string;

  // Dependencies from useWorkspaceTree
  files: IDirOrFile[];
  selected: string[];
  selectedNodeRef: React.MutableRefObject<SelectedNodeRef | null>;
  refreshWorkspace: () => void;

  // Dependencies from useWorkspaceModals
  pasteConfirm: PasteConfirmState;
  setPasteConfirm: React.Dispatch<React.SetStateAction<PasteConfirmState>>;
  closePasteConfirm: () => void;
}

/**
 * useWorkspacePaste - Handle file paste and add logic
 */
export function useWorkspacePaste(options: UseWorkspacePasteOptions) {
  const { workspace, messageApi, t, files, selected, selectedNodeRef, refreshWorkspace, pasteConfirm, setPasteConfirm, closePasteConfirm } = options;

  // Track paste target folder (for visual feedback)
  const [pasteTargetFolder, setPasteTargetFolder] = useState<string | null>(null);

  /**
   * Add files (from file system picker)
   */
  const handleAddFiles = useCallback(() => {
    ipcBridge.dialog.showOpen
      .invoke({
        properties: ['openFile', 'multiSelections'],
        defaultPath: workspace,
      })
      .then((selectedFiles) => {
        if (selectedFiles && selectedFiles.length > 0) {
          return ipcBridge.fs.copyFilesToWorkspace.invoke({ filePaths: selectedFiles, workspace }).then((result) => {
            const copiedFiles = result.data?.copiedFiles ?? [];
            const failedFiles = result.data?.failedFiles ?? [];

            if (copiedFiles.length > 0) {
              setTimeout(() => {
                refreshWorkspace();
              }, 300);
            }

            if (!result.success || failedFiles.length > 0) {
              // Surface warning when any copy operation fails
              const fallback = failedFiles.length > 0 ? 'Some files failed to copy' : result.msg;
              messageApi.warning(fallback || t('messages.unknownError') || 'Copy failed');
            }
          });
        }
      })
      .catch(() => {
        // Silently ignore errors
      });
  }, [workspace, refreshWorkspace, messageApi, t]);

  /**
   * Handle files to add (from paste service)
   */
  const handleFilesToAdd = useCallback(
    async (filesMeta: { name: string; path: string }[]) => {
      if (!filesMeta || filesMeta.length === 0) return;

      // Use utility function to get target folder path
      const targetFolder = getTargetFolderPath(selectedNodeRef.current, selected, files, workspace);
      const targetFolderPath = targetFolder.fullPath;
      const targetFolderKey = targetFolder.relativePath;

      // Set paste target folder for visual feedback
      if (targetFolderKey) {
        setPasteTargetFolder(targetFolderKey);
      }

      // If user has disabled confirmation, perform copy directly
      const skipConfirm = await ConfigStorage.get('workspace.pasteConfirm');
      if (skipConfirm) {
        try {
          const filePaths = filesMeta.map((f) => f.path);
          const res = await ipcBridge.fs.copyFilesToWorkspace.invoke({ filePaths, workspace: targetFolderPath });
          const copiedFiles = res.data?.copiedFiles ?? [];
          const failedFiles = res.data?.failedFiles ?? [];

          if (copiedFiles.length > 0) {
            messageApi.success(t('messages.responseSentSuccessfully') || 'Pasted');
            setTimeout(() => refreshWorkspace(), 300);
          }

          if (!res.success || failedFiles.length > 0) {
            // Notify user when any paste fails
            const fallback = failedFiles.length > 0 ? 'Some files failed to copy' : res.msg;
            messageApi.warning(fallback || t('messages.unknownError') || 'Paste failed');
          }
        } catch (error) {
          messageApi.error(t('messages.unknownError') || 'Paste failed');
        } finally {
          // Reset paste target folder after operation completes (success or failure)
          setPasteTargetFolder(null);
        }
        return;
      }

      // Otherwise show confirmation modal
      setPasteConfirm({
        visible: true,
        fileName: filesMeta[0].name,
        filesToPaste: filesMeta.map((f) => ({ path: f.path, name: f.name })),
        doNotAsk: false,
        targetFolder: targetFolderKey,
      });
    },
    [workspace, refreshWorkspace, t, messageApi, files, selected, selectedNodeRef, setPasteConfirm]
  );

  /**
   * Confirm paste operation
   */
  const handlePasteConfirm = useCallback(async () => {
    if (!pasteConfirm.filesToPaste || pasteConfirm.filesToPaste.length === 0) return;

    try {
      // Save preference if user checked "do not ask again"
      if (pasteConfirm.doNotAsk) {
        await ConfigStorage.set('workspace.pasteConfirm', true);
      }

      // Get target folder path
      const targetFolder = getTargetFolderPath(selectedNodeRef.current, selected, files, workspace);
      const targetFolderPath = targetFolder.fullPath;

      const filePaths = pasteConfirm.filesToPaste.map((f) => f.path);
      const res = await ipcBridge.fs.copyFilesToWorkspace.invoke({ filePaths, workspace: targetFolderPath });
      const copiedFiles = res.data?.copiedFiles ?? [];
      const failedFiles = res.data?.failedFiles ?? [];

      if (copiedFiles.length > 0) {
        messageApi.success(t('messages.responseSentSuccessfully') || 'Pasted');
        setTimeout(() => refreshWorkspace(), 300);
      }

      if (!res.success || failedFiles.length > 0) {
        const fallback = failedFiles.length > 0 ? 'Some files failed to copy' : res.msg;
        messageApi.warning(fallback || t('messages.unknownError') || 'Paste failed');
      }

      closePasteConfirm();
    } catch (error) {
      messageApi.error(t('messages.unknownError') || 'Paste failed');
    } finally {
      setPasteTargetFolder(null);
    }
  }, [pasteConfirm, closePasteConfirm, messageApi, t, files, selected, selectedNodeRef, workspace, refreshWorkspace]);

  // Register paste service to catch global paste events when workspace component is focused
  const { onFocus } = usePasteService({
    // Pass empty array to indicate "allow all file types"
    supportedExts: [],
    onFilesAdded: (files) => {
      // files are FileMetadata from PasteService; map to simple shape
      const meta = files.map((f) => ({ name: f.name, path: f.path }));
      void handleFilesToAdd(meta);
    },
  });

  return {
    pasteTargetFolder,
    handleAddFiles,
    handleFilesToAdd,
    handlePasteConfirm,
    onFocusPaste: onFocus,
  };
}
