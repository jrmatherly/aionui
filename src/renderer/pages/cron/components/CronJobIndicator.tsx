/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { Tooltip } from '@arco-design/web-react';
import { AlarmClock, Attention, PauseOne } from '@icon-park/react';
import React from 'react';
export type CronJobStatus = 'none' | 'active' | 'paused' | 'error' | 'unread' | 'unconfigured';

interface CronJobIndicatorProps {
  status: CronJobStatus;
  size?: number;
  className?: string;
}

/**
 * Simple indicator icon for conversations with cron jobs
 * Used in ChatHistory to distinguish conversations with scheduled tasks
 */
const CronJobIndicator: React.FC<CronJobIndicatorProps> = ({ status, size = 14, className = '' }) => {
  if (status === 'none') {
    return null;
  }

  const getIcon = () => {
    switch (status) {
      case 'unread':
        // Show alarm clock with red dot overlay for unread executions
        return (
          <span className='relative inline-flex'>
            <AlarmClock theme='outline' size={size} className='flex items-center' />
            <span
              className='absolute rounded-full bg-red-500'
              style={{
                width: Math.max(6, size * 0.4),
                height: Math.max(6, size * 0.4),
                top: -1,
                right: -1,
              }}
            />
          </span>
        );
      case 'active':
        return <AlarmClock theme='outline' size={size} className='flex items-center' />;
      case 'paused':
        return <PauseOne theme='outline' size={size} className='flex items-center' />;
      case 'error':
        return <Attention theme='outline' size={size} className='flex items-center' />;
      case 'unconfigured':
        return <AlarmClock theme='outline' size={size} className='flex items-center' />;
      default:
        return null;
    }
  };

  const getTooltip = () => {
    switch (status) {
      case 'unread':
        return 'New execution';
      case 'active':
        return 'Active';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      case 'unconfigured':
        return 'No scheduled task';
      default:
        return '';
    }
  };

  return (
    <Tooltip content={getTooltip()} mini>
      <span className={`inline-flex items-center justify-center ${className}`}>{getIcon()}</span>
    </Tooltip>
  );
};

export default CronJobIndicator;
