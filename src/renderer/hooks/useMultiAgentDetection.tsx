/**
 * Hook for detecting multi-agent mode on application startup
 */

import { ipcBridge } from '@/common';
import { Message } from '@arco-design/web-react';
import { useEffect } from 'react';
export const useMultiAgentDetection = () => {
  const [message, contextHolder] = Message.useMessage();

  useEffect(() => {
    const checkMultiAgentMode = async () => {
      try {
        const response = await ipcBridge.acpConversation.getAvailableAgents.invoke();
        if (response && response.success && response.data) {
          // Detect if there are multiple ACP agents (excluding built-in Gemini)
          const acpAgents = response.data.filter((agent: { backend: string; name: string; cliPath?: string }) => agent.backend !== 'gemini');
          if (acpAgents.length > 1) {
            // message.success({
            //   content: (
            //     <div style={{ lineHeight: '1.5' }}>
            //       <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{'Entering multi-agent mode'}</div>
            //     </div>
            //   ),
            //   duration: 3000,
            //   showIcon: false,
            //   className: 'multi-agent-message',
            // });
            message.success('Entering multi-agent mode');
          }
        }
      } catch (error) {
        // Silently handle errors to avoid affecting application startup
        console.log('Multi-agent detection failed:', error);
      }
    };

    checkMultiAgentMode().catch((error) => {
      console.error('Multi-agent detection failed:', error);
    });
  }, []); // Empty dependency array ensures this runs only once on component initialization

  return { contextHolder };
};
