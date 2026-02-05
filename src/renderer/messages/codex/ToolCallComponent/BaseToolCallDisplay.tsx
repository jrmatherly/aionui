/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card, Tag } from '@arco-design/web-react';
import type { ReactNode } from 'react';
import React from 'react';
export const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const getTagProps = () => {
    switch (status) {
      case 'pending':
        return { color: 'blue', text: 'Pending' };
      case 'executing':
        return { color: 'orange', text: 'Executing' };
      case 'success':
        return { color: 'green', text: 'Success' };
      case 'error':
        return { color: 'red', text: 'Error' };
      case 'canceled':
        return { color: 'gray', text: 'Canceled' };
      default:
        return { color: 'gray', text: status };
    }
  };

  const { color, text } = getTagProps();
  return <Tag color={color}>{text}</Tag>;
};

interface BaseToolCallDisplayProps {
  toolCallId: string;
  title: string;
  status: string;
  description?: string | ReactNode;
  icon: string;
  additionalTags?: ReactNode; // Additional tags like exit code, duration, etc.
  children?: ReactNode; // Detailed content for specific tools
}

const BaseToolCallDisplay: React.FC<BaseToolCallDisplayProps> = ({ toolCallId, title, status, description, icon, additionalTags, children }) => {
  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-lg'>{icon}</span>
            <span className='font-medium text-t-primary'>{title}</span>
            <StatusTag status={status} />
            {additionalTags}
          </div>

          {description && <div className='text-sm text-t-secondary mb-2 overflow-hidden'>{description}</div>}

          {/* Detailed info for specific tools */}
          {children}

          <div className='text-xs text-t-secondary mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default BaseToolCallDisplay;
