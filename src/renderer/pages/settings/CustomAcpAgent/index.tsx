import { acpConversation } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import type { AcpBackendConfig } from '@/types/acpTypes';
import { Button, Collapse, Modal } from '@arco-design/web-react';
import { Delete, EditTwo, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';
import CustomAcpAgentModal from './CustomAcpAgentModal';

interface CustomAcpAgentProps {
  message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0];
}

const CustomAcpAgent: React.FC<CustomAcpAgentProps> = ({ message }) => {
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AcpBackendConfig | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AcpBackendConfig | null>(null);

  /**
   * Refresh agent detection results
   * Called after config changes to update available agents list
   */
  const refreshAgentDetection = useCallback(async () => {
    try {
      await acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // Refresh failed - UI will update on next page load
    }
  }, []);

  /**
   * Load custom agents config on mount, with migration from old single-agent format
   */
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // First check for new array format
        const agents = await ConfigStorage.get('acp.customAgents');
        if (agents && Array.isArray(agents) && agents.length > 0) {
          setCustomAgents(agents.filter((a) => !a.isPreset));
          return;
        }

        // Check for old single-agent format and migrate if exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacyAgent = await (ConfigStorage as any).get('acp.customAgent');
        if (legacyAgent && typeof legacyAgent === 'object' && legacyAgent.defaultCliPath) {
          // Migrate: ensure it has a UUID
          const migratedAgent: AcpBackendConfig = {
            ...legacyAgent,
            id: legacyAgent.id && legacyAgent.id !== 'custom' ? legacyAgent.id : `migrated-${Date.now()}`,
          };
          const migratedAgents = [migratedAgent];

          // Save to new format
          await ConfigStorage.set('acp.customAgents', migratedAgents);
          // Remove old format
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ConfigStorage as any).remove('acp.customAgent');

          setCustomAgents(migratedAgents);
          console.log('[CustomAcpAgent] Migrated legacy single agent to new array format');

          // Refresh detection with new data
          await refreshAgentDetection();
        }
      } catch (error) {
        console.error('Failed to load custom agents config:', error);
      }
    };
    void loadConfig();
  }, [refreshAgentDetection]);

  /**
   * Save agent config (create or update)
   */
  const handleSaveAgent = useCallback(
    async (agentData: AcpBackendConfig) => {
      try {
        let updatedAgents: AcpBackendConfig[];

        if (editingAgent) {
          // Update existing agent
          updatedAgents = customAgents.map((agent) => (agent.id === editingAgent.id ? agentData : agent));
        } else {
          // Add new agent
          updatedAgents = [...customAgents, agentData];
        }

        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents);
        setShowModal(false);
        setEditingAgent(null);
        message.success('Custom agent saved');

        await refreshAgentDetection();
      } catch (error) {
        console.error('Failed to save custom agent config:', error);
        message.error('Failed to save custom agent');
      }
    },
    [customAgents, editingAgent, message, refreshAgentDetection]
  );

  /**
   * Delete agent config
   */
  const handleDeleteAgent = useCallback(async () => {
    if (!agentToDelete) return;

    try {
      // Filter out the agent to delete
      const updatedAgents = customAgents.filter((agent) => agent.id !== agentToDelete.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setCustomAgents(updatedAgents);
      setDeleteConfirmVisible(false);
      setAgentToDelete(null);
      message.success('Custom agent deleted');

      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to delete custom agent config:', error);
      message.error('Failed to delete custom agent');
    }
  }, [agentToDelete, customAgents, message, refreshAgentDetection]);

  const handleAddNew = useCallback(() => {
    setEditingAgent(null);
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((agent: AcpBackendConfig) => {
    setEditingAgent(agent);
    setShowModal(true);
  }, []);

  const handleConfirmDelete = useCallback((agent: AcpBackendConfig) => {
    setAgentToDelete(agent);
    setDeleteConfirmVisible(true);
  }, []);

  return (
    <div>
      <Collapse.Item
        className={' [&_div.arco-collapse-item-header-title]:flex-1'}
        header={
          <div className='flex items-center justify-between'>
            {'Custom ACP Agents'}
            <Button
              type='outline'
              icon={<Plus size={'14'} />}
              shape='round'
              onClick={(e) => {
                e.stopPropagation();
                handleAddNew();
              }}
            >
              {'Add'}
            </Button>
          </div>
        }
        name={'custom-acp-agent'}
      >
        <div className='py-2'>
          {customAgents.length === 0 ? (
            <div className='text-center py-4 text-t-secondary'>{'No custom agents configured'}</div>
          ) : (
            <div className='space-y-2'>
              {customAgents.map((agent) => (
                <div key={agent.id} className='p-4 bg-fill-2 rounded-lg'>
                  <div className='flex items-center justify-between mb-2'>
                    <div className='font-medium'>{agent.name}</div>
                    <div className='flex gap-2'>
                      <Button type='text' size='small' icon={<EditTwo size={'14'} />} onClick={() => handleEdit(agent)} />
                      <Button type='text' size='small' status='danger' icon={<Delete size={'14'} />} onClick={() => handleConfirmDelete(agent)} />
                    </div>
                  </div>
                  <div className='text-sm text-t-secondary'>
                    <div>
                      <span className='font-medium'>{'TODO_MISSING_TRANSLATION_SETTINGS_CLIPATH'}:</span> {agent.defaultCliPath}
                    </div>
                    {agent.env && Object.keys(agent.env).length > 0 && (
                      <div>
                        <span className='font-medium'>{'Env'}:</span> {Object.keys(agent.env).length} variable(s)
                      </div>
                    )}
                    {!agent.enabled && <div className='text-warning'>{'Disabled'}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Collapse.Item>

      <CustomAcpAgentModal visible={showModal} agent={editingAgent} onCancel={() => setShowModal(false)} onSubmit={handleSaveAgent} />

      <Modal title={'Delete Custom Agent'} visible={deleteConfirmVisible} onCancel={() => setDeleteConfirmVisible(false)} onOk={handleDeleteAgent} okButtonProps={{ status: 'danger' }} okText={'Confirm'} cancelText={'Cancel'}>
        <p>
          {'Are you sure you want to delete this custom agent?'}
          {agentToDelete && <strong className='block mt-2'>{agentToDelete.name}</strong>}
        </p>
      </Modal>
    </div>
  );
};

export default CustomAcpAgent;
