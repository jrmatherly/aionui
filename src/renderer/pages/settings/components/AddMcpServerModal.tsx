import { acpConversation } from '@/common/ipcBridge';
import type { IMcpServer } from '@/common/storage';
import { createLogger } from '@/renderer/utils/logger';
import React, { useEffect, useState } from 'react';
import JsonImportModal from './JsonImportModal';
import OneClickImportModal from './OneClickImportModal';

const log = createLogger('AddMcpServerModal');

interface AddMcpServerModalProps {
  visible: boolean;
  server?: IMcpServer;
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onBatchImport?: (servers: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
  importMode?: 'json' | 'oneclick';
}

const AddMcpServerModal: React.FC<AddMcpServerModalProps> = ({ visible, server, onCancel, onSubmit, onBatchImport, importMode = 'json' }) => {
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [showOneClickModal, setShowOneClickModal] = useState(false);

  useEffect(() => {
    if (visible && !server) {
      // Detect available agents on initialization
      const loadAgents = async () => {
        try {
          const response = await acpConversation.getAvailableAgents.invoke();

          if (response.success && response.data) {
            const agents = response.data.map((agent) => ({ backend: agent.backend, name: agent.name }));

            // Determine which modal to show based on detected agents count and importMode
            if (agents.length === 0) {
              setShowJsonModal(true);
            } else if (importMode === 'json') {
              setShowJsonModal(true);
            } else if (importMode === 'oneclick') {
              setShowOneClickModal(true);
            }
          } else {
            setShowJsonModal(true);
          }
        } catch (error) {
          log.error({ err: error }, 'Failed to load agents');
          setShowJsonModal(true);
        }
      };
      void loadAgents();
    } else if (visible && server) {
      // Show JSON modal directly when editing existing server
      setShowJsonModal(true);
    } else if (!visible) {
      // Reset state when modal closes
      setShowJsonModal(false);
      setShowOneClickModal(false);
    }
  }, [visible, server, importMode]);

  const handleModalCancel = () => {
    setShowJsonModal(false);
    setShowOneClickModal(false);
    onCancel();
  };

  if (!visible) return null;

  return (
    <>
      <JsonImportModal visible={showJsonModal} server={server} onCancel={handleModalCancel} onSubmit={onSubmit} onBatchImport={onBatchImport} />
      <OneClickImportModal visible={showOneClickModal} onCancel={handleModalCancel} onBatchImport={onBatchImport} />
    </>
  );
};

export default AddMcpServerModal;
