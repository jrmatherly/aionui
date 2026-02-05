import { acpConversation } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import type { AcpBackendConfig } from '@/types/acpTypes';
import type { Message } from '@arco-design/web-react';
import { Button, Collapse, Input, Modal, Typography } from '@arco-design/web-react';
import { markdown } from '@codemirror/lang-markdown';
import { Delete, EditTwo, Lightning } from '@icon-park/react';
import CodeMirror from '@uiw/react-codemirror';
import React, { useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';

interface PresetManagementProps {
  message: ReturnType<typeof Message.useMessage>[0];
}

const PresetManagement: React.FC<PresetManagementProps> = ({ message }) => {
  const { theme } = useThemeContext();
  const [presets, setPresets] = useState<AcpBackendConfig[]>([]);
  const [editingPreset, setEditingAgent] = useState<AcpBackendConfig | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<AcpBackendConfig | null>(null);

  // Form state
  const [editName, setEditName] = useState('');
  const [editContext, setEditContext] = useState('');

  const loadPresets = useCallback(async () => {
    try {
      const agents = await ConfigStorage.get('acp.customAgents');
      if (agents && Array.isArray(agents)) {
        setPresets(agents.filter((a) => a.isPreset));
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // ignore
    }
  }, []);

  const handleEdit = (preset: AcpBackendConfig) => {
    setEditingAgent(preset);
    setEditName(preset.name);
    setEditContext(preset.context || '');
    setEditVisible(true);
  };

  const handleSave = async () => {
    if (!editingPreset) return;
    try {
      const allAgents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = allAgents.map((a) => (a.id === editingPreset.id ? { ...a, name: editName, context: editContext } : a));
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setEditVisible(false);
      message.success('Success');
      void loadPresets();
      void refreshAgentDetection();
    } catch (error) {
      message.error('Failed');
    }
  };

  const handleDelete = async () => {
    if (!presetToDelete) return;
    try {
      const allAgents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = allAgents.filter((a) => a.id !== presetToDelete.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setDeleteVisible(false);
      message.success('Success');
      void loadPresets();
      void refreshAgentDetection();
    } catch (error) {
      message.error('Failed');
    }
  };

  return (
    <div>
      <Collapse.Item header={<div className='flex items-center justify-between'>{'Custom Presets (Rules)'}</div>} name='preset-management'>
        <div className='py-2'>
          {presets.length === 0 ? (
            <div className='text-center py-4 text-t-secondary'>{'No custom presets generated yet.'}</div>
          ) : (
            <div className='space-y-2'>
              {presets.map((preset) => (
                <div key={preset.id} className='p-4 bg-fill-2 rounded-lg'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Lightning theme='filled' fill='var(--color-primary-6)' />
                      <div className='font-medium'>{preset.name}</div>
                    </div>
                    <div className='flex gap-2'>
                      <Button type='text' size='small' icon={<EditTwo size={'14'} />} onClick={() => handleEdit(preset)} />
                      <Button
                        type='text'
                        size='small'
                        status='danger'
                        icon={<Delete size={'14'} />}
                        onClick={() => {
                          setPresetToDelete(preset);
                          setDeleteVisible(true);
                        }}
                      />
                    </div>
                  </div>
                  <div className='text-xs text-t-secondary mt-2 truncate max-w-[400px]'>{preset.context?.substring(0, 100)}...</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Collapse.Item>

      {/* Edit Modal */}
      <Modal title={'Edit Preset'} visible={editVisible} onOk={handleSave} onCancel={() => setEditVisible(false)} style={{ width: 600 }}>
        <div className='space-y-4'>
          <div>
            <Typography.Text bold>{'Agent Name'}</Typography.Text>
            <Input className='mt-2' value={editName} onChange={setEditName} />
          </div>
          <div>
            <Typography.Text bold>{'Rule Content / Instructions'}</Typography.Text>
            <div className='mt-2 border rounded overflow-hidden'>
              <CodeMirror value={editContext} height='300px' theme={theme} extensions={[markdown()]} onChange={setEditContext} />
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal title={'Confirm'} visible={deleteVisible} onOk={handleDelete} onCancel={() => setDeleteVisible(false)} okButtonProps={{ status: 'danger' }}>
        <p>{'Are you sure you want to delete this preset?'}</p>
        <Typography.Text bold>{presetToDelete?.name}</Typography.Text>
      </Modal>
    </div>
  );
};

export default PresetManagement;
