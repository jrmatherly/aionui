/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAgentStatus } from '@/common/chatLib';
import { Badge, Typography } from '@arco-design/web-react';
import React from 'react';
const { Text } = Typography;

interface MessageAgentStatusProps {
  message: IMessageAgentStatus;
}

/**
 * Unified agent status message component for all ACP-based agents (Claude, Qwen, Codex, etc.)
 */
const MessageAgentStatus: React.FC<MessageAgentStatusProps> = ({ message }) => {
  const { backend, status } = message.content;

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge status='processing' text={`Connecting to ${backend}...`} />;
      case 'connected':
        return <Badge status='success' text={`Connected to ${backend}`} />;
      case 'authenticated':
        return <Badge status='success' text={`Authenticated with ${backend}`} />;
      case 'session_active':
        return <Badge status='success' text={`Active session with ${backend}`} />;
      case 'disconnected':
        return <Badge status='default' text={`Disconnected from ${backend}`} />;
      case 'error':
        return <Badge status='error' text={'Connection error'} />;
      default:
        return <Badge status='default' text={'Unknown status'} />;
    }
  };

  const isError = status === 'error';
  const isSuccess = status === 'connected' || status === 'authenticated' || status === 'session_active';

  return (
    <div
      className='agent-status-message flex items-center gap-3 p-3 rounded-lg border'
      style={{
        backgroundColor: isError ? 'var(--color-danger-light-1)' : isSuccess ? 'var(--color-success-light-1)' : 'var(--color-primary-light-1)',
        borderColor: isError ? 'rgb(var(--danger-3))' : isSuccess ? 'rgb(var(--success-3))' : 'rgb(var(--primary-3))',
        color: isError ? 'rgb(var(--danger-6))' : isSuccess ? 'rgb(var(--success-6))' : 'rgb(var(--primary-6))',
      }}
    >
      <div className='flex items-center gap-2'>
        <Text style={{ fontWeight: 'bold' }} className='capitalize'>
          {backend.charAt(0).toUpperCase() + backend.slice(1)}
        </Text>
      </div>

      <div className='flex-1'>{getStatusBadge()}</div>
    </div>
  );
};

export default MessageAgentStatus;
