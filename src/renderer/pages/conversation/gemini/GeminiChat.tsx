/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from '@/renderer/context/AuthContext';
import type { ConversationContextValue } from '@/renderer/context/ConversationContext';
import { ConversationProvider } from '@/renderer/context/ConversationContext';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import type { MessageAvatarInfo } from '@renderer/messages/MessageAvatarContext';
import { MessageAvatarProvider } from '@renderer/messages/MessageAvatarContext';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React, { useEffect, useMemo } from 'react';
import LocalImageView from '../../../components/LocalImageView';
import ConversationChatConfirm from '../components/ConversationChatConfirm';
import GeminiSendBox from './GeminiSendBox';
import type { GeminiModelSelection } from './useGeminiModelSelection';

export interface ChatAvatarProps {
  agentAvatar?: string;
  agentAvatarIsEmoji?: boolean;
  agentName?: string;
}

// GeminiChat consumes shared model selection state to avoid duplicate logic
const GeminiChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: GeminiModelSelection;
  avatarProps?: ChatAvatarProps;
}> = ({ conversation_id, workspace, modelSelection, avatarProps }) => {
  useMessageLstCache(conversation_id);
  const { user } = useAuth();
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return { conversationId: conversation_id, workspace, type: 'gemini' };
  }, [conversation_id, workspace]);

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
    <ConversationProvider value={conversationValue}>
      <MessageAvatarProvider value={avatarValue}>
        <div className='flex-1 flex flex-col px-20px'>
          <FlexFullContainer>
            <MessageList className='flex-1'></MessageList>
          </FlexFullContainer>
          <ConversationChatConfirm conversation_id={conversation_id}>
            <GeminiSendBox conversation_id={conversation_id} modelSelection={modelSelection}></GeminiSendBox>
          </ConversationChatConfirm>
        </div>
      </MessageAvatarProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(GeminiChat);
