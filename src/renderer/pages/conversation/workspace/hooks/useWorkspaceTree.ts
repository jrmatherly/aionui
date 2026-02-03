/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import { emitter } from '@/renderer/utils/emitter';
import { dispatchWorkspaceHasFilesEvent } from '@/renderer/utils/workspaceEvents';
import { useCallback, useRef, useState } from 'react';
import type { SelectedNodeRef } from '../types';
import { getFirstLevelKeys } from '../utils/treeHelpers';

interface UseWorkspaceTreeOptions {
  workspace: string;
  conversation_id: string;
  eventPrefix: 'gemini' | 'acp' | 'codex';
}

/**
 * useWorkspaceTree - Merge tree state management and selection logic
 */
export function useWorkspaceTree({ workspace, conversation_id, eventPrefix }: UseWorkspaceTreeOptions) {
  // Tree state
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [treeKey, setTreeKey] = useState(Math.random());
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Selection state
  const [selected, setSelected] = useState<string[]>([]);

  // Track if this is the first load (to distinguish initialization from subsequent refreshes)
  const isFirstLoadRef = useRef(true);
  const selectedKeysRef = useRef<string[]>([]);
  const selectedNodeRef = useRef<SelectedNodeRef | null>(null);

  // Loading time tracker
  const lastLoadingTime = useRef(Date.now());

  /**
   * Set loading state with debounce to avoid icon flickering
   */
  const setLoadingHandler = useCallback((newState: boolean) => {
    if (newState) {
      lastLoadingTime.current = Date.now();
      setLoading(true);
    } else {
      // Ensure loading animation lasts at least 1 second
      if (Date.now() - lastLoadingTime.current > 1000) {
        setLoading(false);
      } else {
        setTimeout(() => {
          setLoading(false);
        }, 1000);
      }
    }
  }, []);

  /**
   * Load workspace file tree
   */
  const loadWorkspace = useCallback(
    (path: string, search?: string) => {
      setLoadingHandler(true);
      return ipcBridge.conversation.getWorkspace
        .invoke({ path, workspace, conversation_id, search: search || '' })
        .then((res) => {
          setFiles(res);
          // Only reset Tree key when searching, otherwise keep selection state
          if (search) {
            setTreeKey(Math.random());
          }

          // Only expand first level folders (root node)
          setExpandedKeys(getFirstLevelKeys(res));

          // Determine workspace panel expand/collapse state based on files
          const hasFiles = res.length > 0 && (res[0]?.children?.length ?? 0) > 0;

          if (isFirstLoadRef.current) {
            // First load (switch or open conversation): expand if has files, collapse if not
            dispatchWorkspaceHasFilesEvent(hasFiles, conversation_id);
            isFirstLoadRef.current = false;
          } else {
            // Subsequent refresh (agent generates files, etc.): expand if has files, never collapse
            if (hasFiles) {
              dispatchWorkspaceHasFilesEvent(true, conversation_id);
            }
          }

          return res;
        })
        .finally(() => {
          setLoadingHandler(false);
        });
    },
    [conversation_id, workspace, setLoadingHandler]
  );

  /**
   * Refresh workspace
   */
  const refreshWorkspace = useCallback(() => {
    return loadWorkspace(workspace);
  }, [workspace, loadWorkspace]);

  /**
   * Ensure node is selected and optionally emit event
   */
  const ensureNodeSelected = useCallback(
    (nodeData: IDirOrFile, options?: { emit?: boolean }) => {
      const key = nodeData.relativePath;
      const shouldEmit = Boolean(options?.emit);

      if (!key) {
        setSelected([]);
        selectedKeysRef.current = [];
        if (!nodeData.isFile && nodeData.fullPath) {
          // Remember the latest selected folder
          selectedNodeRef.current = {
            relativePath: key ?? '',
            fullPath: nodeData.fullPath,
          };
        }
        if (shouldEmit && nodeData.fullPath) {
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: nodeData.isFile,
              relativePath: nodeData.relativePath,
            },
          ]);
        } else if (shouldEmit) {
          emitter.emit(`${eventPrefix}.selected.file`, []);
        }
        return;
      }

      setSelected([key]);
      selectedKeysRef.current = [key];

      if (!nodeData.isFile) {
        selectedNodeRef.current = {
          relativePath: key,
          fullPath: nodeData.fullPath,
        };
        if (shouldEmit && nodeData.fullPath) {
          // Emit folder object to send box
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: false,
              relativePath: nodeData.relativePath,
            },
          ]);
        }
      } else if (nodeData.fullPath) {
        selectedNodeRef.current = null;
        if (shouldEmit) {
          // Broadcast file info when selected
          emitter.emit(`${eventPrefix}.selected.file`, [
            {
              path: nodeData.fullPath,
              name: nodeData.name,
              isFile: true,
              relativePath: nodeData.relativePath,
            },
          ]);
        }
      }
    },
    [eventPrefix]
  );

  /**
   * Clear selection state
   */
  const clearSelection = useCallback(() => {
    setSelected([]);
    selectedKeysRef.current = [];
    selectedNodeRef.current = null;
  }, []);

  return {
    // State
    files,
    loading,
    treeKey,
    expandedKeys,
    selected,
    selectedKeysRef,
    selectedNodeRef,

    // Actions
    setFiles,
    setTreeKey,
    setExpandedKeys,
    setSelected,
    loadWorkspace,
    refreshWorkspace,
    ensureNodeSelected,
    clearSelection,
  };
}
