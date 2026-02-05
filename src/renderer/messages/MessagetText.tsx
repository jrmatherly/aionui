/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/constants';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Tooltip } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import CollapsibleContent from '../components/CollapsibleContent';
import FilePreview from '../components/FilePreview';
import HorizontalFileList from '../components/HorizontalFileList';
import MarkdownView from '../components/Markdown';
import MessageAvatar from './MessageAvatar';
import { useMessageAvatars } from './MessageAvatarContext';
import { createLogger } from '@/renderer/utils/logger';

const log = createLogger('MessagetText');

const parseFileMarker = (content: string) => {
  const markerIndex = content.indexOf(AIONUI_FILES_MARKER);
  if (markerIndex === -1) {
    return { text: content, files: [] as string[] };
  }
  const text = content.slice(0, markerIndex).trimEnd();
  const afterMarker = content.slice(markerIndex + AIONUI_FILES_MARKER.length).trim();
  const files = afterMarker
    ? afterMarker
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return { text, files };
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageText: React.FC<{ message: IMessageText }> = ({ message }) => {
  const { text, files } = parseFileMarker(message.content.content);
  const { data, json } = useFormatContent(text);
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const isUserMessage = message.position === 'right';
  const avatars = useMessageAvatars();

  // Check if avatars are available (context provided)
  const showAvatars = Boolean(avatars.userDisplayName || avatars.agentAvatar || avatars.userAvatarUrl);

  // Filter empty content to avoid rendering empty DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const handleCopy = () => {
    const baseText = json ? JSON.stringify(data, null, 2) : text;
    const fileList = files.length ? `Files:\n${files.map((path) => `- ${path}`).join('\n')}\n\n` : '';
    const textToCopy = fileList + baseText;
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch((error) => {
        log.error({ err: error }, 'Copy failed:');
      });
  };

  const copyButton = (
    <Tooltip content={'Copy'}>
      <div className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto' onClick={handleCopy} style={{ lineHeight: 0 }}>
        <Copy theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  );

  // Message content (shared between avatar and non-avatar layouts)
  const messageContent = (
    <div className={classNames('flex flex-col', isUserMessage ? 'items-end' : 'items-start')}>
      {files.length > 0 && (
        <div className={classNames('mt-6px mb-4px', { 'self-end': isUserMessage })}>
          {files.length === 1 ? (
            <div className='flex items-center'>
              <FilePreview path={files[0]} onRemove={() => undefined} readonly />
            </div>
          ) : (
            <HorizontalFileList>
              {files.map((path) => (
                <FilePreview key={path} path={path} onRemove={() => undefined} readonly />
              ))}
            </HorizontalFileList>
          )}
        </div>
      )}
      <div
        className={classNames('rd-12px [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px md:max-w-680px', {
          'bg-aou-2 p-12px rd-tr-4px': isUserMessage,
          'rd-tl-4px': !isUserMessage,
        })}
      >
        {/* Use CollapsibleContent for JSON content */}
        {json ? (
          <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
            <MarkdownView codeStyle={{ marginTop: 4, marginBlock: 4 }}>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
          </CollapsibleContent>
        ) : (
          <MarkdownView codeStyle={{ marginTop: 4, marginBlock: 4 }}>{data}</MarkdownView>
        )}
      </div>
      <div
        className={classNames('h-28px flex items-center mt-2px', {
          'justify-end': isUserMessage,
          'justify-start': !isUserMessage,
        })}
      >
        {copyButton}
      </div>
    </div>
  );

  return (
    <>
      <div className={classNames('flex group gap-12px', isUserMessage ? 'flex-row-reverse' : 'flex-row')}>
        {/* Avatar */}
        {showAvatars && (
          <div className='flex-shrink-0 mt-2px'>
            <MessageAvatar type={isUserMessage ? 'user' : 'agent'} size={32} />
          </div>
        )}

        {/* Message content */}
        {messageContent}
      </div>
      {showCopyAlert && <Alert type='success' content={'Copied successfully'} showIcon className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]' style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }} closable={false} />}
    </>
  );
};

export default MessageText;
