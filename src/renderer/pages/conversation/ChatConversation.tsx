/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import addChatIcon from '@/renderer/assets/add-chat.svg';
import { usePresetAssistantInfo } from '@/renderer/hooks/usePresetAssistantInfo';
import { CronJobManager } from '@/renderer/pages/cron';
import { iconColors } from '@/renderer/theme/colors';
import { Button, Dropdown, Menu, Tooltip, Typography } from '@arco-design/web-react';
import { History } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { emitter } from '../../utils/emitter';
import ChatLayout from './ChatLayout';
import ChatSider from './ChatSider';
import AcpChat from './acp/AcpChat';
import CodexChat from './codex/CodexChat';
import GeminiChat from './gemini/GeminiChat';
import GeminiModelSelector from './gemini/GeminiModelSelector';
import { useGeminiModelSelection } from './gemini/useGeminiModelSelection';
// import SkillRuleGenerator from './components/SkillRuleGenerator'; // Temporarily hidden

const _AssociatedConversation: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { data } = useSWR(['getAssociateConversation', conversation_id], () => ipcBridge.conversation.getAssociateConversation.invoke({ conversation_id }));
  const navigate = useNavigate();
  const list = useMemo(() => {
    if (!data?.length) return [];
    return data.filter((conversation) => conversation.id !== conversation_id);
  }, [data]);
  if (!list.length) return null;
  return (
    <Dropdown
      droplist={
        <Menu
          onClickMenuItem={(key) => {
            Promise.resolve(navigate(`/conversation/${key}`)).catch((error) => {
              console.error('Navigation failed:', error);
            });
          }}
        >
          {list.map((conversation) => {
            return (
              <Menu.Item key={conversation.id}>
                <Typography.Ellipsis className={'max-w-300px'}>{conversation.name}</Typography.Ellipsis>
              </Menu.Item>
            );
          })}
        </Menu>
      }
      trigger={['click']}
    >
      <Button size='mini' icon={<History theme='filled' size='14' fill={iconColors.primary} strokeWidth={2} strokeLinejoin='miter' strokeLinecap='square' />}></Button>
    </Dropdown>
  );
};

const _AddNewConversation: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const navigate = useNavigate();
  if (!conversation.extra?.workspace) return null;
  return (
    <Tooltip content={'Create new chat in current workspace'}>
      <Button
        size='mini'
        icon={<img src={addChatIcon} alt='Add chat' className='w-14px h-14px block m-auto' />}
        onClick={() => {
          const id = uuid();
          ipcBridge.conversation.createWithConversation
            .invoke({ conversation: { ...conversation, id, createTime: Date.now(), modifyTime: Date.now() } })
            .then(() => {
              Promise.resolve(navigate(`/conversation/${id}`)).catch((error) => {
                console.error('Navigation failed:', error);
              });
              emitter.emit('chat.history.refresh');
            })
            .catch((error) => {
              console.error('Failed to create conversation:', error);
            });
        }}
      />
    </Tooltip>
  );
};

// Narrow to Gemini conversations so model field is always available
type GeminiConversation = Extract<TChatConversation, { type: 'gemini' }>;

const GeminiConversationPanel: React.FC<{ conversation: GeminiConversation; sliderTitle: React.ReactNode }> = ({ conversation, sliderTitle }) => {
  // Share model selection state between header and send box
  const modelSelection = useGeminiModelSelection(conversation.id, conversation.model);
  const workspaceEnabled = Boolean(conversation.extra?.workspace);

  // Use unified hook for preset assistant info
  const presetAssistantInfo = usePresetAssistantInfo(conversation);

  const chatLayoutProps = {
    title: conversation.name,
    siderTitle: sliderTitle,
    sider: <ChatSider conversation={conversation} />,
    headerLeft: <GeminiModelSelector selection={modelSelection} />,
    headerExtra: <CronJobManager conversationId={conversation.id} />,
    workspaceEnabled,
    // Pass preset assistant info
    agentName: presetAssistantInfo?.name,
    agentLogo: presetAssistantInfo?.logo,
    agentLogoIsEmoji: presetAssistantInfo?.isEmoji,
  };

  // Avatar props for message rendering
  const avatarProps = presetAssistantInfo
    ? {
        agentAvatar: presetAssistantInfo.logo,
        agentAvatarIsEmoji: presetAssistantInfo.isEmoji,
        agentName: presetAssistantInfo.name,
      }
    : undefined;

  return (
    <ChatLayout {...chatLayoutProps}>
      <GeminiChat conversation_id={conversation.id} workspace={conversation.extra.workspace} modelSelection={modelSelection} avatarProps={avatarProps} />
    </ChatLayout>
  );
};

const ChatConversation: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  const workspaceEnabled = Boolean(conversation?.extra?.workspace);

  const isGeminiConversation = conversation?.type === 'gemini';

  // Use unified hook for preset assistant info (ACP/Codex conversations)
  const presetAssistantInfo = usePresetAssistantInfo(isGeminiConversation ? undefined : conversation);

  // Avatar props for ACP/Codex message rendering
  const acpCodexAvatarProps = presetAssistantInfo
    ? {
        agentAvatar: presetAssistantInfo.logo,
        agentAvatarIsEmoji: presetAssistantInfo.isEmoji,
        agentName: presetAssistantInfo.name,
      }
    : undefined;

  const conversationNode = useMemo(() => {
    if (!conversation || isGeminiConversation) return null;
    switch (conversation.type) {
      case 'acp':
        return <AcpChat key={conversation.id} conversation_id={conversation.id} workspace={conversation.extra?.workspace} backend={conversation.extra?.backend || 'claude'} avatarProps={acpCodexAvatarProps}></AcpChat>;
      case 'codex':
        return <CodexChat key={conversation.id} conversation_id={conversation.id} workspace={conversation.extra?.workspace} avatarProps={acpCodexAvatarProps} />;
      default:
        return null;
    }
  }, [conversation, isGeminiConversation, acpCodexAvatarProps]);

  const sliderTitle = useMemo(() => {
    return (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{'Workspace'}</span>
      </div>
    );
  }, []);

  if (conversation && conversation.type === 'gemini') {
    // Render Gemini layout with dedicated top-right model selector
    return <GeminiConversationPanel conversation={conversation} sliderTitle={sliderTitle} />;
  }

  // If preset assistant info exists, use preset logo/name; otherwise use backend logo
  const chatLayoutProps = presetAssistantInfo
    ? {
        agentName: presetAssistantInfo.name,
        agentLogo: presetAssistantInfo.logo,
        agentLogoIsEmoji: presetAssistantInfo.isEmoji,
      }
    : {
        backend: conversation?.type === 'acp' ? conversation?.extra?.backend : conversation?.type === 'codex' ? 'codex' : undefined,
        agentName: (conversation?.extra as { agentName?: string })?.agentName,
      };

  return (
    <ChatLayout title={conversation?.name} {...chatLayoutProps} headerExtra={conversation ? <CronJobManager conversationId={conversation.id} /> : undefined} siderTitle={sliderTitle} sider={<ChatSider conversation={conversation} />} workspaceEnabled={workspaceEnabled}>
      {conversationNode}
    </ChatLayout>
  );
};

export default ChatConversation;
