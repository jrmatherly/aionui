/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission } from '@/common/chatLib';
import { conversation } from '@/common/ipcBridge';
import { Button, Card, Radio, Typography } from '@arco-design/web-react';
import React, { useState } from 'react';
const { Text } = Typography;

interface MessageAcpPermissionProps {
  message: IMessageAcpPermission;
}

const MessageAcpPermission: React.FC<MessageAcpPermissionProps> = React.memo(({ message }) => {
  const { options = [], toolCall } = message.content || {};
  // Generate display info based on actual data
  const getToolInfo = () => {
    if (!toolCall) {
      return {
        title: 'Permission Request',
        description: 'The agent is requesting permission.',
        icon: '🔐',
      };
    }

    // Use actual data from toolCall directly
    const displayTitle = toolCall.title || toolCall.rawInput?.description || 'Permission Request';

    // Simple icon mapping
    const kindIcons: Record<string, string> = {
      edit: '✏️',
      read: '📖',
      fetch: '🌐',
      execute: '⚡',
    };

    return {
      title: displayTitle,
      icon: kindIcons[toolCall.kind || 'execute'] || '⚡',
    };
  };
  const { title, icon } = getToolInfo();
  const [selected, setSelected] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  const handleConfirm = async () => {
    if (hasResponded || !selected) return;

    setIsResponding(true);
    try {
      const invokeData = {
        confirmKey: selected,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        callId: toolCall?.toolCallId || message.id, // Use toolCallId or message.id as fallback
      };

      const result = await conversation.confirmMessage.invoke(invokeData);

      if (result.success) {
        setHasResponded(true);
      } else {
        // Handle failure case - could add error display here
        console.error('Failed to confirm permission:', result);
      }
    } catch (error) {
      // Handle error case - could add error logging here
      console.error('Error confirming permission:', error);
    } finally {
      setIsResponding(false);
    }
  };

  if (!toolCall) {
    return null;
  }

  return (
    <Card className='mb-4' bordered={false} style={{ background: 'var(--bg-1)' }}>
      <div className='space-y-4'>
        {/* Header with icon and title */}
        <div className='flex items-center space-x-2'>
          <span className='text-2xl'>{icon}</span>
          <Text className='block'>{title}</Text>
        </div>
        {(toolCall.rawInput?.command || toolCall.title) && (
          <div>
            <Text className='text-xs text-t-secondary mb-1'>{'Command:'}</Text>
            <code className='text-xs bg-1 p-2 rounded block text-t-primary break-all'>{toolCall.rawInput?.command || toolCall.title}</code>
          </div>
        )}
        {!hasResponded && (
          <>
            <div className='mt-10px'>{'Choose an action:'}</div>
            <Radio.Group direction='vertical' size='mini' value={selected} onChange={setSelected}>
              {options && options.length > 0 ? (
                options.map((option, index) => {
                  const optionName = option?.name || `${'Option'} ${index + 1}`;
                  const optionId = option?.optionId || `option_${index}`;
                  return (
                    <Radio key={optionId} value={optionId}>
                      {optionName}
                    </Radio>
                  );
                })
              ) : (
                <Text type='secondary'>{'No options available'}</Text>
              )}
            </Radio.Group>
            <div className='flex justify-start pl-20px'>
              <Button type='primary' size='mini' disabled={!selected || isResponding} onClick={handleConfirm}>
                {isResponding ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </>
        )}

        {hasResponded && (
          <div className='mt-10px p-2 rounded-md border' style={{ backgroundColor: 'var(--color-success-light-1)', borderColor: 'rgb(var(--success-3))' }}>
            <Text className='text-sm' style={{ color: 'rgb(var(--success-6))' }}>
              ✓ {'Response sent successfully'}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
});

export default MessageAcpPermission;
