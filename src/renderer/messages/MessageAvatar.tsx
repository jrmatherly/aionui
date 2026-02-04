/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message Avatar Component
 *
 * Renders user or agent avatar for chat messages.
 */

import { Avatar } from '@arco-design/web-react';
import { Robot } from '@icon-park/react';
import React from 'react';
import { getInitials, useMessageAvatars } from './MessageAvatarContext';

interface MessageAvatarProps {
  /** 'user' for human messages, 'agent' for bot messages */
  type: 'user' | 'agent';
  /** Avatar size in pixels */
  size?: number;
}

const MessageAvatar: React.FC<MessageAvatarProps> = ({ type, size = 32 }) => {
  const avatars = useMessageAvatars();

  if (type === 'user') {
    // User avatar
    const { userAvatarUrl, userDisplayName } = avatars;
    const initials = getInitials(userDisplayName);

    return (
      <Avatar
        size={size}
        className='flex-shrink-0'
        style={{
          backgroundColor: userAvatarUrl ? 'transparent' : 'var(--aou-6)',
          color: 'var(--text-white)',
          fontSize: size * 0.4,
          fontWeight: 600,
        }}
      >
        {userAvatarUrl ? (
          <img
            src={userAvatarUrl}
            alt={userDisplayName || 'User'}
            className='w-full h-full object-cover'
            onError={(e) => {
              // On error, hide img and show initials
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          initials
        )}
      </Avatar>
    );
  }

  // Agent avatar
  const { agentAvatar, agentAvatarIsEmoji, agentName } = avatars;
  const iconSize = Math.floor(size * 0.5);
  const emojiSize = Math.floor(size * 0.6);

  return (
    <Avatar
      size={size}
      shape='square'
      className='flex-shrink-0'
      style={{
        backgroundColor: 'var(--bg-2)',
        borderRadius: 8,
      }}
    >
      {agentAvatar ? agentAvatarIsEmoji ? <span style={{ fontSize: emojiSize, lineHeight: 1 }}>{agentAvatar}</span> : <img src={agentAvatar} alt={agentName || 'Agent'} style={{ width: emojiSize, height: emojiSize, objectFit: 'contain' }} /> : <Robot theme='outline' size={iconSize} fill='var(--text-secondary)' />}
    </Avatar>
  );
};

export default MessageAvatar;
