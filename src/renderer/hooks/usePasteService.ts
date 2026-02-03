import type { FileMetadata } from '@/renderer/services/FileService';
import { PasteService } from '@/renderer/services/PasteService';
import { useCallback, useEffect, useRef } from 'react';
import { uuid } from '../utils/common';

interface UsePasteServiceProps {
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  onTextPaste?: (text: string) => void;
}

/**
 * Generic PasteService integration hook
 * Provides unified paste handling functionality for all components
 */
export const usePasteService = ({ supportedExts, onFilesAdded, onTextPaste }: UsePasteServiceProps) => {
  const componentId = useRef('paste-service-' + uuid(4)).current;
  // Unified paste event handling
  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      // Check if there are files, if so prevent default behavior immediately
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        event.stopPropagation();
      }

      const handled = await PasteService.handlePaste(event, supportedExts, onFilesAdded || (() => {}), onTextPaste);
      if (handled && (!files || files.length === 0)) {
        // If not a file paste but was handled (e.g., plain text paste), also prevent default behavior
        event.preventDefault();
        event.stopPropagation();
      }
      return handled;
    },
    [supportedExts, onFilesAdded, onTextPaste]
  );

  // Focus handling
  const handleFocus = useCallback(() => {
    PasteService.setLastFocusedComponent(componentId);
  }, [componentId]);

  // Register paste handler
  useEffect(() => {
    PasteService.init();
    PasteService.registerHandler(componentId, handlePaste);

    return () => {
      PasteService.unregisterHandler(componentId);
    };
  }, [componentId, handlePaste]);

  return {
    onFocus: handleFocus,
    onPaste: handlePaste,
  };
};
