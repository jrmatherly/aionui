/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useInputFocusRing } from '@/renderer/hooks/useInputFocusRing';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { Button, Input, Message, Tag } from '@arco-design/web-react';
import { ArrowUp, CloseSmall } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCompositionInput } from '../hooks/useCompositionInput';
import { useDragUpload } from '../hooks/useDragUpload';
import { useLatestRef } from '../hooks/useLatestRef';
import { usePasteService } from '../hooks/usePasteService';
import type { FileMetadata } from '../services/FileService';
import { allSupportedExts } from '../services/FileService';

const constVoid = (): void => undefined;
// Threshold: switch to multi-line mode directly when character count exceeds this value to avoid heavy layout work
const MAX_SINGLE_LINE_CHARACTERS = 800;

const SendBox: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  onSend: (message: string) => Promise<void>;
  onStop?: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  tools?: React.ReactNode;
  prefix?: React.ReactNode;
  placeholder?: string;
  onFilesAdded?: (files: FileMetadata[]) => void;
  supportedExts?: string[];
  defaultMultiLine?: boolean;
  lockMultiLine?: boolean;
  sendButtonPrefix?: React.ReactNode;
}> = ({ onSend, onStop, prefix, className, loading, tools, disabled, placeholder, value: input = '', onChange: setInput = constVoid, onFilesAdded, supportedExts = allSupportedExts, defaultMultiLine = false, lockMultiLine = false, sendButtonPrefix }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSingleLine, setIsSingleLine] = useState(!defaultMultiLine);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const isInputActive = isInputFocused;
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();
  const containerRef = useRef<HTMLDivElement>(null);
  const singleLineWidthRef = useRef<number>(0);
  const measurementCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestInputRef = useLatestRef(input);
  const setInputRef = useLatestRef(setInput);

  // Integrate preview panel's "Add to chat" functionality
  const { setSendBoxHandler, domSnippets, removeDomSnippet, clearDomSnippets } = usePreviewContext();

  // Register handler to receive text from preview panel
  useEffect(() => {
    const handler = (text: string) => {
      const base = latestInputRef.current;
      const newValue = base ? `${base}\n\n${text}` : text;
      setInputRef.current(newValue);
    };
    setSendBoxHandler(handler);
    return () => {
      setSendBoxHandler(null);
    };
  }, [setSendBoxHandler]);

  // Initialize and get the available width of single-line input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current && singleLineWidthRef.current === 0) {
        const textarea = containerRef.current.querySelector('textarea');
        if (textarea) {
          // Save the available width in single-line mode as a fixed baseline
          singleLineWidthRef.current = textarea.offsetWidth;
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Detect whether to use single-line or multi-line mode
  useEffect(() => {
    // Switch to multi-line mode if newline character exists
    if (input.includes('\n')) {
      setIsSingleLine(false);
      return;
    }

    // Skip detection if baseline width is not yet obtained
    if (singleLineWidthRef.current === 0) {
      return;
    }

    // Skip measurement for long text and switch to multi-line immediately to avoid expensive layout caused by extra-wide DOM
    if (input.length >= MAX_SINGLE_LINE_CHARACTERS) {
      setIsSingleLine(false);
      return;
    }

    // Detect content width
    const frame = requestAnimationFrame(() => {
      const textarea = containerRef.current?.querySelector('textarea');
      if (!textarea) {
        return;
      }

      // Reuse a single offscreen canvas to avoid creating/destroying DOM nodes repeatedly
      const canvas = measurementCanvasRef.current ?? document.createElement('canvas');
      if (!measurementCanvasRef.current) {
        measurementCanvasRef.current = canvas;
      }
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      const textareaStyle = getComputedStyle(textarea);
      const fallbackFontSize = textareaStyle.fontSize || '14px';
      const fallbackFontFamily = textareaStyle.fontFamily || 'sans-serif';
      context.font = textareaStyle.font || `${fallbackFontSize} ${fallbackFontFamily}`.trim();

      const textWidth = context.measureText(input || '').width;

      // Use the fixed baseline width saved during initialization
      const baseWidth = singleLineWidthRef.current;

      // Switch to multi-line when text width exceeds baseline width
      if (textWidth >= baseWidth) {
        setIsSingleLine(false);
      } else if (textWidth < baseWidth - 30 && !lockMultiLine) {
        // Switch back to single-line when text width is less than baseline minus 30px, leaving a small buffer to avoid flickering at the threshold
        // If lockMultiLine is true, do not switch back to single-line
        setIsSingleLine(true);
      }
      // Maintain current state between (baseWidth-30) and baseWidth
    });

    return () => cancelAnimationFrame(frame);
  }, [input, lockMultiLine]);

  // Use drag upload hook
  const { isFileDragging, dragHandlers } = useDragUpload({
    supportedExts,
    onFilesAdded,
  });

  const [message, context] = Message.useMessage();

  // Use shared composition input handling
  const { compositionHandlers, createKeyDownHandler } = useCompositionInput();

  // Use shared PasteService integration
  const { onPaste, onFocus: handlePasteFocus } = usePasteService({
    supportedExts,
    onFilesAdded,
    onTextPaste: (text: string) => {
      // Handle sanitized text paste, insert text at cursor position instead of replacing entire content
      const textarea = document.activeElement as HTMLTextAreaElement;
      if (textarea && textarea.tagName === 'TEXTAREA') {
        const cursorPosition = textarea.selectionStart;
        const currentValue = textarea.value;
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const newValue = currentValue.slice(0, start) + text + currentValue.slice(end);
        setInput(newValue);
        // Set cursor position after inserted text
        setTimeout(() => {
          textarea.setSelectionRange(cursorPosition + text.length, cursorPosition + text.length);
        }, 0);
      } else {
        // If cursor position is not available, fall back to appending to the end
        setInput(text);
      }
    },
  });
  const handleInputFocus = useCallback(() => {
    handlePasteFocus();
    setIsInputFocused(true);
  }, [handlePasteFocus]);
  const handleInputBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  const sendMessageHandler = () => {
    if (loading || isLoading) {
      message.warning(t('messages.conversationInProgress'));
      return;
    }
    if (!input.trim() && domSnippets.length === 0) {
      return;
    }
    setIsLoading(true);

    // Build message: if has DOM snippets, append full HTML
    let finalMessage = input;
    if (domSnippets.length > 0) {
      const snippetsHtml = domSnippets.map((s) => `\n\n---\nDOM Snippet (${s.tag}):\n\`\`\`html\n${s.html}\n\`\`\``).join('');
      finalMessage = input + snippetsHtml;
    }

    onSend(finalMessage)
      .then(() => {
        setInput('');
        clearDomSnippets(); // Clear DOM snippets after sending
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  };

  const stopHandler = async () => {
    if (!onStop) return;
    try {
      await onStop();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={`relative p-16px border-3 b bg-dialog-fill-0 b-solid rd-20px flex flex-col overflow-hidden ${isFileDragging ? 'b-dashed' : ''}`}
        style={{
          transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
          ...(isFileDragging
            ? {
                backgroundColor: 'var(--color-primary-light-1)',
                borderColor: 'rgb(var(--primary-3))',
                borderWidth: '1px',
              }
            : {
                borderWidth: '1px',
                borderColor: isInputActive ? activeBorderColor : inactiveBorderColor,
                boxShadow: isInputActive ? activeShadow : 'none',
              }),
        }}
        {...dragHandlers}
      >
        <div style={{ width: '100%' }}>
          {prefix}
          {context}
          {/* DOM snippet tags */}
          {domSnippets.length > 0 && (
            <div className='flex flex-wrap gap-6px mb-8px'>
              {domSnippets.map((snippet) => (
                <Tag key={snippet.id} closable closeIcon={<CloseSmall theme='outline' size='12' />} onClose={() => removeDomSnippet(snippet.id)} className='text-12px bg-fill-2 b-1 b-solid b-border-2 rd-4px'>
                  {snippet.tag}
                </Tag>
              ))}
            </div>
          )}
        </div>
        <div className={isSingleLine ? 'flex items-center gap-2 w-full min-w-0 overflow-hidden' : 'w-full overflow-hidden'}>
          {isSingleLine && <div className='flex-shrink-0 sendbox-tools'>{tools}</div>}
          <Input.TextArea
            autoFocus
            disabled={disabled}
            value={input}
            placeholder={placeholder}
            className='pl-0 pr-0 !b-none focus:shadow-none m-0 !bg-transparent !focus:bg-transparent !hover:bg-transparent lh-[20px] !resize-none text-14px'
            style={{
              width: isSingleLine ? 'auto' : '100%',
              flex: isSingleLine ? 1 : 'none',
              minWidth: 0,
              maxWidth: '100%',
              marginLeft: 0,
              marginRight: 0,
              marginBottom: isSingleLine ? 0 : '8px',
              height: isSingleLine ? '20px' : 'auto',
              minHeight: isSingleLine ? '20px' : '80px',
              overflowY: isSingleLine ? 'hidden' : 'auto',
              overflowX: 'hidden',
              whiteSpace: isSingleLine ? 'nowrap' : 'pre-wrap',
              textOverflow: isSingleLine ? 'ellipsis' : 'clip',
              wordBreak: isSingleLine ? 'normal' : 'break-word',
              overflowWrap: 'break-word',
            }}
            onChange={(v) => {
              setInput(v);
            }}
            onPaste={onPaste}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            {...compositionHandlers}
            autoSize={isSingleLine ? false : { minRows: 1, maxRows: 10 }}
            onKeyDown={createKeyDownHandler(sendMessageHandler)}
          ></Input.TextArea>
          {isSingleLine && (
            <div className='flex items-center gap-2'>
              {sendButtonPrefix}
              {isLoading || loading ? (
                <Button shape='circle' type='secondary' className='bg-animate' icon={<div className='mx-auto size-12px bg-6'></div>} onClick={stopHandler}></Button>
              ) : (
                <Button
                  shape='circle'
                  type='primary'
                  icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />}
                  onClick={() => {
                    sendMessageHandler();
                  }}
                />
              )}
            </div>
          )}
        </div>
        {!isSingleLine && (
          <div className='flex items-center justify-between gap-2 w-full'>
            <div className='sendbox-tools'>{tools}</div>
            <div className='flex items-center gap-2'>
              {sendButtonPrefix}
              {isLoading || loading ? (
                <Button shape='circle' type='secondary' className='bg-animate' icon={<div className='mx-auto size-12px bg-6'></div>} onClick={stopHandler}></Button>
              ) : (
                <Button
                  shape='circle'
                  type='primary'
                  icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />}
                  onClick={() => {
                    sendMessageHandler();
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SendBox;
