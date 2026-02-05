import { ipcBridge } from '@/common';
import { useConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback } from 'react';
export const useAutoTitle = () => {
  const { updateTabName } = useConversationTabs();

  const checkAndUpdateTitle = useCallback(
    async (conversationId: string, messageContent: string) => {
      const defaultTitle = 'New Chat';
      try {
        const conversation = await ipcBridge.conversation.get.invoke({ id: conversationId });
        // Only update if current name matches the default "New Chat" name
        if (conversation && conversation.name === defaultTitle) {
          // Create title from message: take first 50 chars, remove newlines
          const newTitle = messageContent.split('\n')[0].substring(0, 50).trim();
          if (!newTitle) return; // Don't update if empty

          await ipcBridge.conversation.update.invoke({
            id: conversationId,
            updates: { name: newTitle },
          });

          updateTabName(conversationId, newTitle);
          emitter.emit('chat.history.refresh');
        }
      } catch (error) {
        console.error('Failed to auto-update conversation title:', error);
      }
    },
    [updateTabName]
  );

  return { checkAndUpdateTitle };
};
