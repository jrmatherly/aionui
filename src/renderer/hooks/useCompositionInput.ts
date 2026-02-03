import { useRef } from 'react';

/**
 * Shared IME composition event handling hook
 * Eliminates duplicate IME handling code in SendBox component and GUID page
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);

  const compositionHandlers = {
    onCompositionStartCapture: () => {
      isComposing.current = true;
    },
    onCompositionEndCapture: () => {
      isComposing.current = false;
    },
  };

  const createKeyDownHandler = (onEnterPress: () => void) => {
    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnterPress();
      }
    };
  };

  return {
    isComposing,
    compositionHandlers,
    createKeyDownHandler,
  };
};
