/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup } from '@/common/chatLib';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Image, Message, Radio, Tag, Tooltip } from '@arco-design/web-react';
import { Copy, Download, LoadingOne } from '@icon-park/react';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import CollapsibleContent from '../components/CollapsibleContent';
import Diff2Html from '../components/Diff2Html';
import LocalImageView from '../components/LocalImageView';
import MarkdownView from '../components/Markdown';
import { ToolConfirmationOutcome } from '../types/tool-confirmation';
import { ImagePreviewContext } from './MessageList';
import MessageFileChanges from './codex/MessageFileChanges';
import { COLLAPSE_CONFIG, TEXT_CONFIG } from './constants';
import type { ImageGenerationResult, WriteFileResult } from './types';

// Alert component style constant
// Top-align icon and content to avoid vertical centering when text wraps to multiple lines
const ALERT_CLASSES = '!items-start !rd-8px !px-8px [&_.arco-alert-icon]:flex [&_.arco-alert-icon]:items-start [&_.arco-alert-content-wrapper]:flex [&_.arco-alert-content-wrapper]:items-start [&_.arco-alert-content-wrapper]:w-full [&_.arco-alert-content]:flex-1';

// CollapsibleContent height constants
const RESULT_MAX_HEIGHT = COLLAPSE_CONFIG.MAX_HEIGHT;

interface IMessageToolGroupProps {
  message: IMessageToolGroup;
}

const useConfirmationButtons = (confirmationDetails: IMessageToolGroupProps['message']['content'][number]['confirmationDetails']) => {
  return useMemo(() => {
    if (!confirmationDetails) return {};
    let question: string;
    const options: Array<{ label: string; value: ToolConfirmationOutcome }> = [];
    switch (confirmationDetails.type) {
      case 'edit':
        {
          question = 'Apply this change?';
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'exec':
        {
          question = 'Allow execution?';
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'info':
        {
          question = 'Do you want to proceed?';
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      default: {
        const mcpProps = confirmationDetails;
        question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
        options.push(
          {
            label: 'Yes, allow once',
            value: ToolConfirmationOutcome.ProceedOnce,
          },
          {
            label: `Yes, always allow tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"`,
            value: ToolConfirmationOutcome.ProceedAlwaysTool,
          },
          {
            label: `Yes, always allow all tools from server "${mcpProps.serverName}"`,
            value: ToolConfirmationOutcome.ProceedAlwaysServer,
          },
          { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
        );
      }
    }
    return {
      question,
      options,
    };
  }, [confirmationDetails]);
};

const ConfirmationDetails: React.FC<{
  content: IMessageToolGroupProps['message']['content'][number];
  onConfirm: (outcome: ToolConfirmationOutcome) => void;
}> = ({ content, onConfirm }) => {
  const { confirmationDetails } = content;
  if (!confirmationDetails) return;
  const node = useMemo(() => {
    if (!confirmationDetails) return null;
    const isConfirm = content.status === 'Confirming';
    switch (confirmationDetails.type) {
      case 'edit':
        return (
          <div>
            <Diff2Html title={isConfirm ? confirmationDetails.title : content.description} diff={confirmationDetails?.fileDiff || ''} filePath={confirmationDetails.fileName}></Diff2Html>
          </div>
        );
      case 'exec': {
        const bashSnippet = `\`\`\`bash\n${confirmationDetails.command}\n\`\`\``;
        return (
          <div className='w-full max-w-100% min-w-0'>
            <MarkdownView codeStyle={{ marginTop: 4, marginBottom: 4 }}>{bashSnippet}</MarkdownView>
          </div>
        );
      }
      case 'info':
        return <span className='text-t-primary'>{confirmationDetails.prompt}</span>;
      case 'mcp':
        return <span className='text-t-primary'>{confirmationDetails.toolDisplayName}</span>;
    }
  }, [confirmationDetails, content]);

  const { question = '', options = [] } = useConfirmationButtons(confirmationDetails);

  const [selected, setSelected] = useState<ToolConfirmationOutcome | null>(null);

  return (
    <div>
      {node}
      {content.status === 'Confirming' && (
        <>
          <div className='mt-10px text-t-primary'>{question}</div>
          <Radio.Group direction='vertical' size='mini' value={selected} onChange={setSelected}>
            {options.map((item) => {
              return (
                <Radio key={item.value} value={item.value}>
                  {item.label}
                </Radio>
              );
            })}
          </Radio.Group>
          <div className='flex justify-start pl-20px'>
            <Button type='primary' size='mini' disabled={!selected} onClick={() => onConfirm(selected)}>
              {'Confirm'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// ImageDisplay: Image generation result display component
const ImageDisplay: React.FC<{
  imgUrl: string;
  relativePath?: string;
}> = ({ imgUrl, relativePath }) => {
  const [messageApi, messageContext] = Message.useMessage();
  const [imageUrl, setImageUrl] = useState<string>(imgUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { inPreviewGroup } = useContext(ImagePreviewContext);

  // Load local paths as base64
  React.useEffect(() => {
    if (imgUrl.startsWith('data:') || imgUrl.startsWith('http')) {
      setImageUrl(imgUrl);
      setLoading(false);
    } else {
      setLoading(true);
      setError(false);
      ipcBridge.fs.getImageBase64
        .invoke({ path: imgUrl })
        .then((base64) => {
          setImageUrl(base64);
          setLoading(false);
        })
        .catch((error) => {
          console.error('Failed to load image:', error);
          setError(true);
          setLoading(false);
        });
    }
  }, [imgUrl]);

  // Get image blob (reusable logic)
  const getImageBlob = useCallback(async (): Promise<Blob> => {
    const response = await fetch(imageUrl);
    return await response.blob();
  }, [imageUrl]);

  const handleCopy = useCallback(async () => {
    try {
      const blob = await getImageBlob();

      // Try using Clipboard API with blob
      if (navigator.clipboard && typeof navigator.clipboard.write === 'function') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ]);
          messageApi.success('Copied successfully');
          return;
        } catch (clipboardError) {
          console.warn('[ImageDisplay] Clipboard API failed, trying fallback:', clipboardError);
        }
      }

      // Fallback: Use canvas to copy image for browsers/Electron that don't support ClipboardItem with images
      const img = document.createElement('img');
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      ctx.drawImage(img, 0, 0);
      canvas.toBlob(async (canvasBlob) => {
        if (!canvasBlob) {
          messageApi.error('Failed to copy');
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': canvasBlob,
            }),
          ]);
          messageApi.success('Copied successfully');
        } catch (canvasError) {
          console.error('[ImageDisplay] Canvas fallback also failed:', canvasError);
          messageApi.error('Failed to copy');
        }
      }, 'image/png');
    } catch (error) {
      console.error('Failed to copy image:', error);
      messageApi.error('Failed to copy');
    }
  }, [getImageBlob, imageUrl, messageApi]);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await getImageBlob();
      const fileName = relativePath?.split(/[\\/]/).pop() || 'image.png';

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      messageApi.success('Download successful');
    } catch (error) {
      console.error('Failed to download image:', error);
      messageApi.error('Failed to download');
    }
  }, [getImageBlob, relativePath, messageApi]);

  // Loading state
  if (loading) {
    return (
      <div className='flex items-center gap-8px my-8px'>
        <LoadingOne className='loading' theme='outline' size='14' fill={iconColors.primary} />
        <span className='text-t-secondary text-sm'>{'Please wait...'}</span>
      </div>
    );
  }

  // Error state
  if (error || !imageUrl) {
    return (
      <div className='flex items-center gap-8px my-8px text-t-secondary text-sm'>
        <span>{'Failed to load image'}</span>
      </div>
    );
  }

  // Image element
  const imageElement = (
    <Image
      src={imageUrl}
      alt={relativePath || 'Generated image'}
      width={197}
      style={{
        maxHeight: '320px',
        objectFit: 'contain',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    />
  );

  return (
    <>
      {messageContext}
      <div className='flex flex-col gap-8px my-8px' style={{ maxWidth: '197px' }}>
        {/* Image preview - if already in PreviewGroup render directly, otherwise wrap with PreviewGroup */}
        {inPreviewGroup ? imageElement : <Image.PreviewGroup>{imageElement}</Image.PreviewGroup>}
        {/* Action buttons */}
        <div className='flex gap-8px'>
          <Tooltip content={'Copy'}>
            <Button type='secondary' size='small' shape='circle' icon={<Copy theme='outline' size='14' fill={iconColors.primary} />} onClick={handleCopy} />
          </Tooltip>
          <Tooltip content={'Download'}>
            <Button type='secondary' size='small' shape='circle' icon={<Download theme='outline' size='14' fill={iconColors.primary} />} onClick={handleDownload} />
          </Tooltip>
        </div>
      </div>
    </>
  );
};

const ToolResultDisplay: React.FC<{
  content: IMessageToolGroupProps['message']['content'][number];
}> = ({ content }) => {
  const { resultDisplay, name } = content;

  // Special handling for image generation
  if (name === 'ImageGeneration' && typeof resultDisplay === 'object') {
    const result = resultDisplay as ImageGenerationResult;
    // Only display image if img_url exists, otherwise show error message
    if (result.img_url) {
      return <LocalImageView src={result.img_url} alt={result.relative_path || result.img_url} className='max-w-100% max-h-100%' />;
    }
    // If error, continue to JSON display logic below
  }

  // Convert result to string
  const display = typeof resultDisplay === 'string' ? resultDisplay : JSON.stringify(resultDisplay, null, 2);

  // Wrap long content with CollapsibleContent
  return (
    <CollapsibleContent maxHeight={RESULT_MAX_HEIGHT} defaultCollapsed={true} useMask={false}>
      <pre className='text-t-primary whitespace-pre-wrap break-words m-0' style={{ fontSize: `${TEXT_CONFIG.FONT_SIZE}px`, lineHeight: TEXT_CONFIG.LINE_HEIGHT }}>
        {display}
      </pre>
    </CollapsibleContent>
  );
};

const MessageToolGroup: React.FC<IMessageToolGroupProps> = ({ message }) => {
  // Collect all WriteFile results for summary display
  const writeFileResults = useMemo(() => {
    return message.content.filter((item) => item.name === 'WriteFile' && item.resultDisplay && typeof item.resultDisplay === 'object' && 'fileDiff' in item.resultDisplay).map((item) => item.resultDisplay as WriteFileResult);
  }, [message.content]);

  // Find the index of first WriteFile
  const firstWriteFileIndex = useMemo(() => {
    return message.content.findIndex((item) => item.name === 'WriteFile' && item.resultDisplay && typeof item.resultDisplay === 'object' && 'fileDiff' in item.resultDisplay);
  }, [message.content]);

  return (
    <div>
      {message.content.map((content, index) => {
        const { status, callId, name, description, resultDisplay, confirmationDetails } = content;
        const isLoading = status !== 'Success' && status !== 'Error' && status !== 'Canceled';
        // status === "Confirming" &&
        if (confirmationDetails) {
          return (
            <ConfirmationDetails
              key={callId}
              content={content}
              onConfirm={(outcome) => {
                ipcBridge.geminiConversation.confirmMessage
                  .invoke({
                    confirmKey: outcome,
                    msg_id: message.id,
                    callId: callId,
                    conversation_id: message.conversation_id,
                  })
                  .then((res) => {
                    console.log('------onConfirm.res>:', res);
                  })
                  .catch((error) => {
                    console.error('Failed to confirm message:', error);
                  });
              }}
            ></ConfirmationDetails>
          );
        }

        // WriteFile special handling: use MessageFileChanges for summary display
        if (name === 'WriteFile' && typeof resultDisplay !== 'string') {
          if (resultDisplay && typeof resultDisplay === 'object' && 'fileDiff' in resultDisplay) {
            // Only show summary component at first WriteFile position
            if (index === firstWriteFileIndex && writeFileResults.length > 0) {
              return (
                <div className='w-full min-w-0' key={callId}>
                  <MessageFileChanges writeFileChanges={writeFileResults} />
                </div>
              );
            }
            // Skip other WriteFile
            return null;
          }
        }

        // Special handling for ImageGeneration: display image separately without Alert wrapper
        if (name === 'ImageGeneration' && typeof resultDisplay === 'object') {
          const result = resultDisplay as ImageGenerationResult;
          if (result.img_url) {
            return <ImageDisplay key={callId} imgUrl={result.img_url} relativePath={result.relative_path} />;
          }
        }

        // Generic tool call display
        // Place expandable long content below Alert, keeping Alert for header info only
        return (
          <div key={callId}>
            <Alert
              className={ALERT_CLASSES}
              type={status === 'Error' ? 'error' : status === 'Success' ? 'success' : status === 'Canceled' ? 'warning' : 'info'}
              icon={isLoading && <LoadingOne theme='outline' size='12' fill={iconColors.primary} className='loading lh-[1] flex' />}
              content={
                <div>
                  <Tag className={'mr-4px'}>
                    {name}
                    {status === 'Canceled' ? `(${'Execution canceled'})` : ''}
                  </Tag>
                </div>
              }
            />

            {(description || resultDisplay) && (
              <div className='mt-8px'>
                {description && <div className='text-12px text-t-secondary truncate mb-2'>{description}</div>}
                {resultDisplay && (
                  <div>
                    {/* Display full result outside Alert */}
                    {/* ToolResultDisplay already contains CollapsibleContent internally, avoid nesting */}
                    <ToolResultDisplay content={content} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MessageToolGroup;
