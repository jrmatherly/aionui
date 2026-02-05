/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageTips } from '@/common/chatLib';
import { Attention, CheckOne } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import CollapsibleContent from '../components/CollapsibleContent';
import MarkdownView from '../components/Markdown';
const icon = {
  success: <CheckOne theme='filled' size='16' fill={theme.Color.FunctionalColor.success} className='m-t-2px' />,
  warning: <Attention theme='filled' size='16' strokeLinejoin='bevel' className='m-t-2px' fill={theme.Color.FunctionalColor.warn} />,
  error: <Attention theme='filled' size='16' strokeLinejoin='bevel' className='m-t-2px' fill={theme.Color.FunctionalColor.error} />,
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      return {
        json: true,
        data: json,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageTips: React.FC<{ message: IMessageTips }> = ({ message }) => {
  const { content, type } = message.content;
  const { json, data } = useFormatContent(content);
  // Handle structured error messages with error codes
  const getDisplayContent = (content: string): string => {
    if (content.startsWith('ERROR_')) {
      const parts = content.split(': ');
      const originalMessage = parts[1] || content;
      return originalMessage;
    }
    return content;
  };

  const displayContent = getDisplayContent(content);

  if (json)
    return (
      <div className=' p-x-12px p-y-8px w-full max-w-100% min-w-0'>
        <CollapsibleContent maxHeight={300} defaultCollapsed={true}>
          <MarkdownView>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
        </CollapsibleContent>
      </div>
    );
  return (
    <div className={classNames('bg-message-tips rd-8px  p-x-12px p-y-8px flex items-start gap-4px')}>
      {icon[type] || icon.warning}
      <CollapsibleContent maxHeight={200} defaultCollapsed={true} className='flex-1' useMask={true}>
        <span
          className='whitespace-break-spaces text-t-primary [word-break:break-word]'
          dangerouslySetInnerHTML={{
            __html: displayContent,
          }}
        ></span>
      </CollapsibleContent>
    </div>
  );
};

export default MessageTips;
