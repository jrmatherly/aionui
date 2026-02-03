import { ipcBridge } from '@/common';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { Spin } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import ChatConversation from './ChatConversation';
import { useConversationTabs } from './context/ConversationTabsContext';

const ChatConversationIndex: React.FC = () => {
  const { id } = useParams();
  const { closePreview } = usePreviewContext();
  const { openTab } = useConversationTabs();
  const previousConversationIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!id) return;

    // Ensure preview panel closes when switching conversations to avoid cross-conversation residue
    if (previousConversationIdRef.current && previousConversationIdRef.current !== id) {
      closePreview();
    }

    previousConversationIdRef.current = id;
  }, [id, closePreview]);

  const { data, isLoading } = useSWR(`conversation/${id}`, () => {
    return ipcBridge.conversation.get.invoke({ id });
  });

  // Automatically open tab when conversation data is loaded
  useEffect(() => {
    if (data) {
      openTab(data);
    }
  }, [data, openTab]);

  if (isLoading) return <Spin loading></Spin>;
  return <ChatConversation conversation={data}></ChatConversation>;
};

export default ChatConversationIndex;
