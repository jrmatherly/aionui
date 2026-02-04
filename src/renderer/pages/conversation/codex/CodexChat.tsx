/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from '@/renderer/context/AuthContext';
import { ConversationProvider } from '@/renderer/context/ConversationContext';
import type { MessageAvatarInfo } from '@renderer/messages/MessageAvatarContext';
import { MessageAvatarProvider } from '@renderer/messages/MessageAvatarContext';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React, { useEffect, useMemo } from 'react';
import LocalImageView from '../../../components/LocalImageView';
import ConversationChatConfirm from '../components/ConversationChatConfirm';
import CodexSendBox from './CodexSendBox';
import type { ChatAvatarProps } from '../gemini/GeminiChat';

const CodexChat: React.FC<{
  conversation_id: string;
  workspace: string;
  avatarProps?: ChatAvatarProps;
}> = ({ conversation_id, workspace, avatarProps }) => {
  useMessageLstCache(conversation_id);
  const { user } = useAuth();
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);

  // Build avatar context from user auth + agent props
  const avatarValue = useMemo<MessageAvatarInfo>(() => {
    return {
      userAvatarUrl: user?.avatarUrl,
      userDisplayName: user?.displayName || user?.username,
      agentAvatar: avatarProps?.agentAvatar,
      agentAvatarIsEmoji: avatarProps?.agentAvatarIsEmoji,
      agentName: avatarProps?.agentName,
    };
  }, [user, avatarProps]);

  return (
    <ConversationProvider value={{ conversationId: conversation_id, workspace, type: 'codex' }}>
      <MessageAvatarProvider value={avatarValue}>
        <div className='flex-1 flex flex-col px-20px'>
          <FlexFullContainer>
            <MessageList className='flex-1'></MessageList>
          </FlexFullContainer>
          <ConversationChatConfirm conversation_id={conversation_id}>
            <CodexSendBox conversation_id={conversation_id} />
          </ConversationChatConfirm>
        </div>
      </MessageAvatarProvider>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(CodexChat);
