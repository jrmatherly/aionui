/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef } from 'react';
import { SCROLL_SYNC_DEBOUNCE } from '../constants';

/**
 * Scroll sync hook configuration
 */
interface UseScrollSyncOptions {
  /**
   * Whether to enable scroll sync
   */
  enabled: boolean;

  /**
   * Editor container ref
   */
  editorContainerRef: React.RefObject<HTMLDivElement>;

  /**
   * Preview container ref
   */
  previewContainerRef: React.RefObject<HTMLDivElement>;
}

/**
 * Scroll sync hook return value
 */
interface UseScrollSyncReturn {
  /**
   * Handle editor scroll event
   */
  handleEditorScroll: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;

  /**
   * Handle preview scroll event
   */
  handlePreviewScroll: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
}

/**
 * Scroll synchronization hook for split-screen mode
 *
 * Synchronizes scroll position between editor and preview based on scroll percentage
 *
 * Uses debounce mechanism to avoid circular triggers and performance issues
 *
 * TODO: Consider using requestAnimationFrame instead of setTimeout for better performance
 *
 * @param options - Scroll sync configuration
 * @returns Scroll event handlers
 */
export const useScrollSync = ({ enabled, editorContainerRef, previewContainerRef }: UseScrollSyncOptions): UseScrollSyncReturn => {
  const isSyncingRef = useRef(false);

  const handleEditorScroll = useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      if (!enabled || isSyncingRef.current) return;

      isSyncingRef.current = true;
      const previewContainer = previewContainerRef.current;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight || 1);
      if (previewContainer) {
        // Use data attribute to pass target scroll percentage, each component handles it
        previewContainer.dataset.targetScrollPercent = String(scrollPercentage);
        // Also try to set scrollTop directly (for components that support it)
        const targetScroll = scrollPercentage * (previewContainer.scrollHeight - previewContainer.clientHeight);
        previewContainer.scrollTop = targetScroll;
      }

      setTimeout(() => {
        isSyncingRef.current = false;
      }, SCROLL_SYNC_DEBOUNCE);
    },
    [enabled, previewContainerRef]
  );

  const handlePreviewScroll = useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      if (!enabled || isSyncingRef.current) return;

      isSyncingRef.current = true;
      const editorContainer = editorContainerRef.current;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight || 1);
      if (editorContainer) {
        // Use data attribute to pass target scroll percentage, each component handles it
        editorContainer.dataset.targetScrollPercent = String(scrollPercentage);
        // Also try to set scrollTop directly (for components that support it)
        const targetScroll = scrollPercentage * (editorContainer.scrollHeight - editorContainer.clientHeight);
        editorContainer.scrollTop = targetScroll;
      }

      setTimeout(() => {
        isSyncingRef.current = false;
      }, SCROLL_SYNC_DEBOUNCE);
    },
    [enabled, editorContainerRef]
  );

  return {
    handleEditorScroll,
    handlePreviewScroll,
  };
};
