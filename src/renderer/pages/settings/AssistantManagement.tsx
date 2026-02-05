import { ipcBridge } from '@/common';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import { ConfigStorage } from '@/common/storage';
import coworkSvg from '@/renderer/assets/cowork.svg';
import EmojiPicker from '@/renderer/components/EmojiPicker';
import MarkdownView from '@/renderer/components/Markdown';
import type { AcpBackendConfig, PresetAgentType } from '@/types/acpTypes';
import type { Message } from '@arco-design/web-react';
import { Avatar, Button, Checkbox, Collapse, Drawer, Input, Modal, Select, Switch, Typography } from '@arco-design/web-react';
import { Close, Delete, FolderOpen, Plus, Robot, SettingOne } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

// Skill info type
interface SkillInfo {
  name: string;
  description: string;
  location: string;
  isCustom: boolean;
}

// Check if builtin assistant has skills config (defaultEnabledSkills or skillFiles)
const hasBuiltinSkills = (assistantId: string): boolean => {
  if (!assistantId.startsWith('builtin-')) return false;
  const presetId = assistantId.replace('builtin-', '');
  const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return false;
  // Has defaultEnabledSkills or skillFiles config
  const hasDefaultSkills = preset.defaultEnabledSkills && preset.defaultEnabledSkills.length > 0;
  const hasSkillFiles = preset.skillFiles && Object.keys(preset.skillFiles).length > 0;
  return hasDefaultSkills || hasSkillFiles;
};

// Pending skill to import
interface PendingSkill {
  path: string; // Original path
  name: string;
  description: string;
}

interface AssistantManagementProps {
  message: ReturnType<typeof Message.useMessage>[0];
}

const AssistantManagement: React.FC<AssistantManagementProps> = ({ message }) => {
  const [assistants, setAssistants] = useState<AcpBackendConfig[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editAgent, setEditAgent] = useState<PresetAgentType>('gemini');
  const [editSkills, setEditSkills] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [promptViewMode, setPromptViewMode] = useState<'edit' | 'preview'>('preview');
  const [drawerWidth, setDrawerWidth] = useState(500);
  // Skills selection mode states
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]); // Skill names added via Add Skills
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]); // Enabled skills (checkbox state)
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [skillPath, setSkillPath] = useState(''); // Skill folder path input
  const [commonPaths, setCommonPaths] = useState<Array<{ name: string; path: string }>>([]); // Common skill paths detected
  const [pendingSkills, setPendingSkills] = useState<PendingSkill[]>([]); // Pending skills to import
  const [deletePendingSkillName, setDeletePendingSkillName] = useState<string | null>(null); // Pending skill name to delete
  const [deleteCustomSkillName, setDeleteCustomSkillName] = useState<string | null>(null); // Custom skill to remove from assistant
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const localeKey = 'en-US';
  const avatarImageMap: Record<string, string> = {
    'cowork.svg': coworkSvg,
    '🛠️': coworkSvg,
  };

  // Auto focus textarea when drawer opens
  useEffect(() => {
    if (editVisible && promptViewMode === 'edit') {
      // Small delay to ensure the drawer animation is complete
      const timer = setTimeout(() => {
        const textarea = textareaWrapperRef.current?.querySelector('textarea');
        textarea?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editVisible, promptViewMode]);

  useEffect(() => {
    const updateDrawerWidth = () => {
      if (typeof window === 'undefined') return;
      const nextWidth = Math.min(500, Math.max(320, Math.floor(window.innerWidth - 32)));
      setDrawerWidth(nextWidth);
    };

    updateDrawerWidth();
    window.addEventListener('resize', updateDrawerWidth);
    return () => window.removeEventListener('resize', updateDrawerWidth);
  }, []);

  // Detect common skill paths when modal opens
  useEffect(() => {
    if (skillsModalVisible) {
      void (async () => {
        try {
          const response = await ipcBridge.fs.detectCommonSkillPaths.invoke();
          if (response.success && response.data) {
            setCommonPaths(response.data);
          }
        } catch (error) {
          console.error('Failed to detect common paths:', error);
        }
      })();
    }
  }, [skillsModalVisible]);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // ignore
    }
  }, []);

  // Load assistant rule content from file
  const loadAssistantContext = useCallback(
    async (assistantId: string): Promise<string> => {
      try {
        const content = await ipcBridge.fs.readAssistantRule.invoke({ assistantId, locale: localeKey });
        return content || '';
      } catch (error) {
        console.error(`Failed to load rule for ${assistantId}:`, error);
        return '';
      }
    },
    [localeKey]
  );

  // Load assistant skill content from file
  const loadAssistantSkills = useCallback(
    async (assistantId: string): Promise<string> => {
      try {
        const content = await ipcBridge.fs.readAssistantSkill.invoke({ assistantId, locale: localeKey });
        return content || '';
      } catch (error) {
        console.error(`Failed to load skills for ${assistantId}:`, error);
        return '';
      }
    },
    [localeKey]
  );

  const loadAssistants = useCallback(async () => {
    try {
      // Read stored assistants from config (includes builtin and user-defined)
      const allAgents: AcpBackendConfig[] = (await ConfigStorage.get('acp.customAgents')) || [];
      const presetOrder = ASSISTANT_PRESETS.map((preset) => `builtin-${preset.id}`);

      // Filter assistants (agents with isPreset = true)
      const presetAssistants = allAgents
        .filter((agent) => agent.isPreset)
        .sort((a, b) => {
          const indexA = presetOrder.indexOf(a.id);
          const indexB = presetOrder.indexOf(b.id);
          if (indexA !== -1 || indexB !== -1) {
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          }
          return 0;
        });

      setAssistants(presetAssistants);
      setActiveAssistantId((prev) => prev || presetAssistants[0]?.id || null);
    } catch (error) {
      console.error('Failed to load assistant presets:', error);
    }
  }, []);

  useEffect(() => {
    void loadAssistants();
  }, [loadAssistants]);

  const activeAssistant = assistants.find((assistant) => assistant.id === activeAssistantId) || null;

  // Check if string is an emoji (simple check for common emoji patterns)
  const isEmoji = useCallback((str: string) => {
    if (!str) return false;
    // Check if it's a single emoji or emoji sequence
    const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
    return emojiRegex.test(str);
  }, []);

  const renderAvatarGroup = useCallback(
    (assistant: AcpBackendConfig, size = 32) => {
      const resolvedAvatar = assistant.avatar?.trim();
      const hasEmojiAvatar = resolvedAvatar && isEmoji(resolvedAvatar);
      const avatarImage = resolvedAvatar ? avatarImageMap[resolvedAvatar] : undefined;
      const iconSize = Math.floor(size * 0.5);
      const emojiSize = Math.floor(size * 0.6);

      return (
        <Avatar.Group size={size}>
          <Avatar className='border-none' shape='square' style={{ backgroundColor: 'var(--color-fill-2)', border: 'none' }}>
            {avatarImage ? <img src={avatarImage} alt='' width={emojiSize} height={emojiSize} style={{ objectFit: 'contain' }} /> : hasEmojiAvatar ? <span style={{ fontSize: emojiSize }}>{resolvedAvatar}</span> : <Robot theme='outline' size={iconSize} />}
          </Avatar>
        </Avatar.Group>
      );
    },
    [avatarImageMap, isEmoji]
  );

  const handleEdit = async (assistant: AcpBackendConfig) => {
    setIsCreating(false);
    setActiveAssistantId(assistant.id);
    setEditName(assistant.name || '');
    setEditDescription(assistant.description || '');
    setEditAvatar(assistant.avatar || '');
    setEditAgent(assistant.presetAgentType || 'gemini');
    setEditVisible(true);

    // Load rules, skills content
    try {
      const [context, skills] = await Promise.all([loadAssistantContext(assistant.id), loadAssistantSkills(assistant.id)]);
      setEditContext(context);
      setEditSkills(skills);

      // Load skills list for builtin assistants with skillFiles and all custom assistants
      if (hasBuiltinSkills(assistant.id) || !assistant.isBuiltin) {
        const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
        setAvailableSkills(skillsList);
        // selectedSkills: Enabled skills
        setSelectedSkills(assistant.enabledSkills || []);
        // customSkills: Skills added via Add Skills
        setCustomSkills(assistant.customSkillNames || []);
      } else {
        setAvailableSkills([]);
        setSelectedSkills([]);
        setCustomSkills([]);
      }
    } catch (error) {
      console.error('Failed to load assistant content:', error);
      setEditContext('');
      setEditSkills('');
      setAvailableSkills([]);
      setSelectedSkills([]);
    }
  };

  // Create assistant function
  const handleCreate = async () => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName('');
    setEditDescription('');
    setEditContext('');
    setEditAvatar('🤖');
    setEditAgent('gemini');
    setEditSkills('');
    setSelectedSkills([]); // No enabled skills
    setCustomSkills([]); // No skills added via Add Skills
    setPromptViewMode('edit'); // Default to edit mode when creating
    setEditVisible(true);

    // Load available skills list
    try {
      const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
      setAvailableSkills(skillsList);
    } catch (error) {
      console.error('Failed to load skills:', error);
      setAvailableSkills([]);
    }
  };

  // Duplicate assistant function
  const handleDuplicate = async (assistant: AcpBackendConfig) => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName(`${assistant.nameI18n?.[localeKey] || assistant.name} (Copy)`);
    setEditDescription(assistant.descriptionI18n?.[localeKey] || assistant.description || '');
    setEditAvatar(assistant.avatar || '🤖');
    setEditAgent(assistant.presetAgentType || 'gemini');
    setPromptViewMode('edit');
    setEditVisible(true);

    // Load original assistant's rules and skills
    try {
      const [context, skills, skillsList] = await Promise.all([loadAssistantContext(assistant.id), loadAssistantSkills(assistant.id), ipcBridge.fs.listAvailableSkills.invoke()]);
      setEditContext(context);
      setEditSkills(skills);
      setAvailableSkills(skillsList);
      setSelectedSkills(assistant.enabledSkills || []);
      setCustomSkills(assistant.customSkillNames || []);
    } catch (error) {
      console.error('Failed to load assistant content for duplication:', error);
      setEditContext('');
      setEditSkills('');
      setAvailableSkills([]);
      setSelectedSkills([]);
      setCustomSkills([]);
    }
  };

  const handleSave = async () => {
    try {
      // Validate required fields
      if (!editName.trim()) {
        message.error('Name is required');
        return;
      }

      // Import pending skills (skip existing ones)
      if (pendingSkills.length > 0) {
        // Filter out skills that actually need to be imported (not in availableSkills)
        const skillsToImport = pendingSkills.filter((pending) => !availableSkills.some((available) => available.name === pending.name));

        if (skillsToImport.length > 0) {
          for (const pendingSkill of skillsToImport) {
            try {
              const response = await ipcBridge.fs.importSkill.invoke({ skillPath: pendingSkill.path });
              if (!response.success) {
                message.error(`Failed to import skill "${pendingSkill.name}": ${response.msg}`);
                return;
              }
            } catch (error) {
              console.error(`Failed to import skill "${pendingSkill.name}":`, error);
              message.error(`Failed to import skill "${pendingSkill.name}"`);
              return;
            }
          }
          // Reload skills list after successful import
          const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
          setAvailableSkills(skillsList);
        }
      }

      const agents = (await ConfigStorage.get('acp.customAgents')) || [];

      // Calculate final customSkills: merge existing + pending
      const pendingSkillNames = pendingSkills.map((s) => s.name);
      const finalCustomSkills = Array.from(new Set([...customSkills, ...pendingSkillNames]));

      if (isCreating) {
        // Create new assistant
        const newId = `custom-${Date.now()}`;
        const newAssistant: AcpBackendConfig = {
          id: newId,
          name: editName,
          description: editDescription,
          avatar: editAvatar,
          isPreset: true,
          isBuiltin: false,
          presetAgentType: editAgent,
          enabled: true,
          enabledSkills: selectedSkills,
          customSkillNames: finalCustomSkills,
        };

        // Save rule file
        if (editContext.trim()) {
          await ipcBridge.fs.writeAssistantRule.invoke({
            assistantId: newId,
            locale: localeKey,
            content: editContext,
          });
        }

        const updatedAgents = [...agents, newAssistant];
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setAssistants(updatedAgents.filter((agent) => agent.isPreset));
        setActiveAssistantId(newId);
        message.success('Created successfully');
      } else {
        // Update existing assistant
        if (!activeAssistant) return;

        const updatedAgent: AcpBackendConfig = {
          ...activeAssistant,
          name: editName,
          description: editDescription,
          avatar: editAvatar,
          presetAgentType: editAgent,
          enabledSkills: selectedSkills,
          customSkillNames: finalCustomSkills,
        };

        // Save rule file (if changed)
        if (editContext.trim()) {
          await ipcBridge.fs.writeAssistantRule.invoke({
            assistantId: activeAssistant.id,
            locale: localeKey,
            content: editContext,
          });
        }

        const updatedAgents = agents.map((agent) => (agent.id === activeAssistant.id ? updatedAgent : agent));
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setAssistants(updatedAgents.filter((agent) => agent.isPreset));
        message.success('Saved successfully');
      }

      setEditVisible(false);
      setPendingSkills([]); // Clear pending skills list
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to save assistant:', error);
      message.error('Failed');
    }
  };

  const handleDeleteClick = () => {
    if (!activeAssistant) return;
    // Cannot delete builtin assistants
    if (activeAssistant.isBuiltin) {
      message.warning('Cannot delete builtin assistants');
      return;
    }
    setDeleteConfirmVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeAssistant) return;
    try {
      // 1. Delete rule and skill files
      await Promise.all([ipcBridge.fs.deleteAssistantRule.invoke({ assistantId: activeAssistant.id }), ipcBridge.fs.deleteAssistantSkill.invoke({ assistantId: activeAssistant.id })]);

      // 2. Remove assistant from config
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.filter((agent) => agent.id !== activeAssistant.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((agent) => agent.isPreset));
      setActiveAssistantId(updatedAgents.find((agent) => agent.isPreset)?.id || null);
      setDeleteConfirmVisible(false);
      setEditVisible(false);
      message.success('Success');
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to delete assistant:', error);
      message.error('Failed');
    }
  };

  // Toggle assistant enabled state
  const handleToggleEnabled = async (assistant: AcpBackendConfig, enabled: boolean) => {
    try {
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.map((agent) => (agent.id === assistant.id ? { ...agent, enabled } : agent));
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((agent) => agent.isPreset));
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to toggle assistant:', error);
      message.error('Failed');
    }
  };

  return (
    <div>
      <Collapse.Item
        header={
          <div className='flex items-center justify-between w-full'>
            <span>{'Assistants'}</span>
          </div>
        }
        name='smart-assistants'
        extra={
          <Button
            type='text'
            size='small'
            style={{ color: 'var(--text-primary)' }}
            icon={<Plus size={14} fill='currentColor' />}
            onClick={(e) => {
              e.stopPropagation();
              void handleCreate();
            }}
          >
            {'Create Assistant'}
          </Button>
        }
      >
        <div className='py-2'>
          <div className='bg-fill-2 rounded-2xl p-20px'>
            <div className='text-14px text-t-secondary mb-12px'>{'Available assistants'}</div>
            {assistants.length > 0 ? (
              <div className='space-y-12px'>
                {assistants.map((assistant) => (
                  <div
                    key={assistant.id}
                    className='group bg-fill-0 rounded-lg px-16px py-12px flex items-center justify-between cursor-pointer hover:bg-fill-1 transition-colors'
                    onClick={() => {
                      setActiveAssistantId(assistant.id);
                      void handleEdit(assistant);
                    }}
                  >
                    <div className='flex items-center gap-12px min-w-0'>
                      {renderAvatarGroup(assistant, 28)}
                      <div className='min-w-0'>
                        <div className='font-medium text-t-primary truncate'>{assistant.nameI18n?.[localeKey] || assistant.name}</div>
                        <div className='text-12px text-t-secondary truncate'>{assistant.descriptionI18n?.[localeKey] || assistant.description || ''}</div>
                      </div>
                    </div>
                    <div className='flex items-center gap-12px text-t-secondary'>
                      <span
                        className='invisible group-hover:visible text-12px text-primary cursor-pointer hover:underline transition-all'
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDuplicate(assistant);
                        }}
                      >
                        {'Duplicate'}
                      </span>
                      <Switch
                        size='small'
                        checked={assistant.enabled !== false}
                        onChange={(checked) => {
                          void handleToggleEnabled(assistant, checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type='text'
                        size='small'
                        icon={<SettingOne size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleEdit(assistant);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center text-t-secondary py-12px'>{'No assistants configured.'}</div>
            )}
          </div>
        </div>
      </Collapse.Item>

      <Drawer
        title={
          <>
            <span>{isCreating ? 'Create Assistant' : 'Assistant Details'}</span>
            <div
              onClick={(e) => {
                e.stopPropagation();
                setEditVisible(false);
              }}
              className='absolute right-4 top-2 cursor-pointer text-t-secondary hover:text-t-primary transition-colors p-1'
              style={{ zIndex: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Close size={18} />
            </div>
          </>
        }
        closable={false}
        visible={editVisible}
        placement='right'
        width={drawerWidth}
        zIndex={1200}
        autoFocus={false}
        onCancel={() => {
          setEditVisible(false);
        }}
        headerStyle={{ background: 'var(--color-bg-1)' }}
        bodyStyle={{ background: 'var(--color-bg-1)' }}
        footer={
          <div className='flex items-center justify-between w-full'>
            <div className='flex items-center gap-8px'>
              <Button type='primary' onClick={handleSave} className='w-[100px] rounded-[100px]'>
                {isCreating ? 'Create' : 'Save'}
              </Button>
              <Button
                onClick={() => {
                  setEditVisible(false);
                }}
                className='w-[100px] rounded-[100px] bg-fill-2'
              >
                {'Cancel'}
              </Button>
            </div>
            {!isCreating && !activeAssistant?.isBuiltin && (
              <Button status='danger' onClick={handleDeleteClick} className='rounded-[100px]' style={{ backgroundColor: 'rgb(var(--danger-1))' }}>
                {'Delete'}
              </Button>
            )}
          </div>
        }
      >
        <div className='flex flex-col h-full overflow-hidden'>
          <div className='flex flex-col flex-1 gap-16px bg-fill-2 rounded-16px p-20px overflow-y-auto'>
            <div className='flex-shrink-0'>
              <Typography.Text bold>
                <span className='text-red-500'>*</span> {'Name & Avatar'}
              </Typography.Text>
              <div className='mt-10px flex items-center gap-12px'>
                {activeAssistant?.isBuiltin ? (
                  <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px'>
                    {editAvatar && avatarImageMap[editAvatar.trim()] ? <img src={avatarImageMap[editAvatar.trim()]} alt='' width={24} height={24} style={{ objectFit: 'contain' }} /> : editAvatar ? <span className='text-24px'>{editAvatar}</span> : <Robot theme='outline' size={20} />}
                  </Avatar>
                ) : (
                  <EmojiPicker value={editAvatar} onChange={(emoji) => setEditAvatar(emoji)} placement='br'>
                    <div className='cursor-pointer'>
                      <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px hover:bg-fill-2 transition-colors'>
                        {editAvatar && avatarImageMap[editAvatar.trim()] ? <img src={avatarImageMap[editAvatar.trim()]} alt='' width={24} height={24} style={{ objectFit: 'contain' }} /> : editAvatar ? <span className='text-24px'>{editAvatar}</span> : <Robot theme='outline' size={20} />}
                      </Avatar>
                    </div>
                  </EmojiPicker>
                )}
                <Input value={editName} onChange={(value) => setEditName(value)} disabled={activeAssistant?.isBuiltin} placeholder={'Enter a name for this agent'} className='flex-1 rounded-4px bg-bg-1' />
              </div>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>{'Assistant Description'}</Typography.Text>
              <Input className='mt-10px rounded-4px bg-bg-1' value={editDescription} onChange={(value) => setEditDescription(value)} disabled={activeAssistant?.isBuiltin} placeholder={'What can this assistant help with?'} />
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>{'Main Agent'}</Typography.Text>
              <Select className='mt-10px w-full rounded-4px' value={editAgent} onChange={(value) => setEditAgent(value as PresetAgentType)}>
                <Select.Option value='gemini'>Gemini</Select.Option>
                <Select.Option value='claude'>Claude</Select.Option>
                <Select.Option value='codex'>Codex</Select.Option>
              </Select>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold className='flex-shrink-0'>
                {'Rules'}
              </Typography.Text>
              {/* Prompt Edit/Preview Tabs */}
              <div className='mt-10px border border-border-2 overflow-hidden rounded-4px' style={{ height: '300px' }}>
                {!activeAssistant?.isBuiltin && (
                  <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                    <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setPromptViewMode('edit')}>
                      {'Edit'}
                    </div>
                    <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setPromptViewMode('preview')}>
                      {'Preview'}
                    </div>
                  </div>
                )}
                <div className='bg-fill-2' style={{ height: activeAssistant?.isBuiltin ? '100%' : 'calc(100% - 36px)', overflow: 'auto' }}>
                  {promptViewMode === 'edit' && !activeAssistant?.isBuiltin ? (
                    <div ref={textareaWrapperRef} className='h-full'>
                      <Input.TextArea value={editContext} onChange={(value) => setEditContext(value)} placeholder={'Enter rules in Markdown format...'} autoSize={false} className='border-none rounded-none bg-transparent h-full resize-none' />
                    </div>
                  ) : (
                    <div className='p-16px'>{editContext ? <MarkdownView hiddenCodeCopyButton>{editContext}</MarkdownView> : <div className='text-t-secondary text-center py-32px'>{'No content to preview'}</div>}</div>
                  )}
                </div>
              </div>
            </div>
            {/* Show skills selection when creating or editing builtin assistants with skillFiles/custom assistants */}
            {(isCreating || (activeAssistantId && hasBuiltinSkills(activeAssistantId)) || (activeAssistant && !activeAssistant.isBuiltin)) && (
              <div className='flex-shrink-0 mt-16px'>
                <div className='flex items-center justify-between mb-12px'>
                  <Typography.Text bold>{'Skills'}</Typography.Text>
                  <Button size='small' type='outline' icon={<Plus size={14} />} onClick={() => setSkillsModalVisible(true)} className='rounded-[100px]'>
                    {'Add Skills'}
                  </Button>
                </div>

                {/* Skills Collapse */}
                <Collapse defaultActiveKey={['custom-skills']}>
                  {/* Custom Skills (Pending + Imported) */}
                  <Collapse.Item header={<span className='text-13px font-medium'>{'Custom Skills'}</span>} name='custom-skills' className='mb-8px' extra={<span className='text-12px text-t-secondary'>{pendingSkills.length + availableSkills.filter((skill) => skill.isCustom).length}</span>}>
                    <div className='space-y-4px'>
                      {/* Pending skills (not yet imported) */}
                      {pendingSkills.map((skill) => (
                        <div key={`pending-${skill.name}`} className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'>
                          <Checkbox
                            checked={selectedSkills.includes(skill.name)}
                            className='mt-2px cursor-pointer'
                            onChange={() => {
                              if (selectedSkills.includes(skill.name)) {
                                setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.name]);
                              }
                            }}
                          />
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-4px'>
                              <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                              <span className='text-10px px-4px py-1px bg-primary-1 text-primary rounded'>Pending</span>
                            </div>
                            {skill.description && <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>}
                          </div>
                          <button
                            className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePendingSkillName(skill.name);
                            }}
                            title='Remove'
                          >
                            <Delete size={16} fill='var(--color-text-3)' />
                          </button>
                        </div>
                      ))}
                      {/* All imported custom skills */}
                      {availableSkills
                        .filter((skill) => skill.isCustom)
                        .map((skill) => (
                          <div key={`custom-${skill.name}`} className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'>
                            <Checkbox
                              checked={selectedSkills.includes(skill.name)}
                              className='mt-2px cursor-pointer'
                              onChange={() => {
                                if (selectedSkills.includes(skill.name)) {
                                  setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                                } else {
                                  setSelectedSkills([...selectedSkills, skill.name]);
                                }
                              }}
                            />
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center gap-4px'>
                                <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                                <span className='text-10px px-4px py-1px bg-orange-100 text-orange-600 rounded border border-orange-200 uppercase' style={{ fontSize: '9px', fontWeight: 'bold' }}>
                                  Custom
                                </span>
                              </div>
                              {skill.description && <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>}
                            </div>
                            <button
                              className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteCustomSkillName(skill.name);
                              }}
                              title={'Remove from assistant'}
                            >
                              <Delete size={16} fill='var(--color-text-3)' />
                            </button>
                          </div>
                        ))}
                      {pendingSkills.length === 0 && availableSkills.filter((skill) => skill.isCustom).length === 0 && <div className='text-center text-t-secondary text-12px py-16px'>{'No custom skills added'}</div>}
                    </div>
                  </Collapse.Item>

                  {/* Builtin Skills */}
                  <Collapse.Item header={<span className='text-13px font-medium'>{'Builtin Skills'}</span>} name='builtin-skills' extra={<span className='text-12px text-t-secondary'>{availableSkills.filter((skill) => !skill.isCustom).length}</span>}>
                    {availableSkills.filter((skill) => !skill.isCustom).length > 0 ? (
                      <div className='space-y-4px'>
                        {availableSkills
                          .filter((skill) => !skill.isCustom)
                          .map((skill) => (
                            <div key={skill.name} className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px'>
                              <Checkbox
                                checked={selectedSkills.includes(skill.name)}
                                className='mt-2px cursor-pointer'
                                onChange={() => {
                                  if (selectedSkills.includes(skill.name)) {
                                    setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                                  } else {
                                    setSelectedSkills([...selectedSkills, skill.name]);
                                  }
                                }}
                              />
                              <div className='flex-1 min-w-0'>
                                <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                                {skill.description && <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className='text-center text-t-secondary text-12px py-16px'>{'No builtin skills available'}</div>
                    )}
                  </Collapse.Item>
                </Collapse>
              </div>
            )}
          </div>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal title={'Delete Assistant'} visible={deleteConfirmVisible} onCancel={() => setDeleteConfirmVisible(false)} onOk={handleDeleteConfirm} okButtonProps={{ status: 'danger' }} okText={'Delete'} cancelText={'Cancel'} className='w-[90vw] md:w-[400px]' wrapStyle={{ zIndex: 10000 }} maskStyle={{ zIndex: 9999 }}>
        <p>{'Are you sure you want to delete this assistant? This action cannot be undone.'}</p>
        {activeAssistant && (
          <div className='mt-12px p-12px bg-fill-2 rounded-lg flex items-center gap-12px'>
            {renderAvatarGroup(activeAssistant, 32)}
            <div>
              <div className='font-medium'>{activeAssistant.name}</div>
              <div className='text-12px text-t-secondary'>{activeAssistant.description}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Skills Modal - Simplified */}
      <Modal
        visible={skillsModalVisible}
        onCancel={() => {
          setSkillsModalVisible(false);
          setSkillPath('');
        }}
        onOk={async () => {
          if (!skillPath.trim()) {
            message.warning('Please select a skill folder path');
            return;
          }

          const currentPath = skillPath.trim();
          setSkillPath(''); // Clear immediately to prevent multiple clicks issue

          try {
            const paths = currentPath
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean);
            const allFoundSkills: Array<{ name: string; description: string; path: string }> = [];

            for (const p of paths) {
              // Scan directory for skills
              const response = await ipcBridge.fs.scanForSkills.invoke({ folderPath: p });
              if (response.success && response.data) {
                allFoundSkills.push(...response.data);
              }
            }

            if (allFoundSkills.length > 0) {
              const newPendingSkills: PendingSkill[] = [];
              const newCustomSkillNames: string[] = [];
              const newSelectedSkills: string[] = [];

              let addedCount = 0;
              let skippedCount = 0;

              for (const skill of allFoundSkills) {
                const { name, description, path: sPath } = skill;

                // Check if already in this assistant's list
                const alreadyInAssistant = customSkills.includes(name) || newCustomSkillNames.includes(name);

                if (alreadyInAssistant) {
                  skippedCount++;
                  continue;
                }

                // Check if already exists in system
                const existsInAvailable = availableSkills.some((s) => s.name === name);
                const existsInPending = pendingSkills.some((s) => s.name === name);

                if (!existsInAvailable && !existsInPending) {
                  // Only add to pending if not in system
                  newPendingSkills.push({ path: sPath, name, description });
                }

                newCustomSkillNames.push(name);
                newSelectedSkills.push(name);
                addedCount++;
              }

              if (addedCount > 0) {
                setPendingSkills([...pendingSkills, ...newPendingSkills]);
                setCustomSkills([...customSkills, ...newCustomSkillNames]);
                setSelectedSkills([...selectedSkills, ...newSelectedSkills]);
                const skippedCountText = skippedCount > 0 ? ` (${skippedCount} skipped)` : '';
                message.success(`${addedCount} skills added and selected${skippedCountText}`);
              } else if (skippedCount > 0) {
                message.warning('All found skills already exist');
              }

              setSkillsModalVisible(false);
            } else {
              message.warning('No valid skills found in the selected path(s)');
              setSkillsModalVisible(false);
            }
          } catch (error) {
            console.error('Failed to scan skills:', error);
            message.error('Failed to scan skills');
            setSkillsModalVisible(false);
          }
        }}
        title={'Add Skills'}
        okText={'Confirm'}
        cancelText={'Cancel'}
        className='w-[90vw] md:w-[500px]'
        wrapStyle={{ zIndex: 2500 }}
        maskStyle={{ zIndex: 2490 }}
      >
        <div className='space-y-16px'>
          {commonPaths.length > 0 && (
            <div>
              <div className='text-12px text-t-secondary mb-8px'>{'Quick Scan Common Paths'}</div>
              <div className='flex flex-wrap gap-8px'>
                {commonPaths.map((cp) => (
                  <Button
                    key={cp.path}
                    size='small'
                    type='secondary'
                    className='rounded-[100px] bg-fill-2 hover:bg-fill-3'
                    onClick={() => {
                      if (skillPath.includes(cp.path)) return;
                      setSkillPath(skillPath ? `${skillPath}, ${cp.path}` : cp.path);
                    }}
                  >
                    {cp.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className='space-y-12px'>
            <Typography.Text>{'Skill Folder Path'}</Typography.Text>
            <Input.Group className='flex items-center gap-8px'>
              <Input value={skillPath} onChange={(value) => setSkillPath(value)} placeholder={'Enter or browse skill folder path(s), separated by comma'} className='flex-1' />
              <Button
                type='outline'
                icon={<FolderOpen size={16} />}
                onClick={async () => {
                  try {
                    const result = await ipcBridge.dialog.showOpen.invoke({
                      properties: ['openDirectory', 'multiSelections'],
                    });
                    if (result && result.length > 0) {
                      setSkillPath(result.join(', '));
                    }
                  } catch (error) {
                    console.error('Failed to open directory dialog:', error);
                  }
                }}
              >
                {'Browse'}
              </Button>
            </Input.Group>
          </div>
        </div>
      </Modal>

      {/* Delete Pending Skill Confirmation Modal */}
      <Modal
        visible={deletePendingSkillName !== null}
        onCancel={() => setDeletePendingSkillName(null)}
        title={'Delete Pending Skill'}
        okButtonProps={{ status: 'danger' }}
        okText={'Delete'}
        cancelText={'Cancel'}
        onOk={() => {
          if (deletePendingSkillName) {
            // Remove from pendingSkills and customSkills
            setPendingSkills(pendingSkills.filter((s) => s.name !== deletePendingSkillName));
            setCustomSkills(customSkills.filter((s) => s !== deletePendingSkillName));
            // Also remove from selectedSkills if selected
            setSelectedSkills(selectedSkills.filter((s) => s !== deletePendingSkillName));
            setDeletePendingSkillName(null);
            message.success('Skill removed from pending list');
          }
        }}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>{`Are you sure you want to remove "${deletePendingSkillName}"? This skill has not been imported yet.`}</p>
        <div className='mt-12px text-12px text-t-secondary bg-fill-2 p-12px rounded-lg'>{`This will only remove the skill from the pending list. You can add it again using the "Add Skills" feature.`}</div>
      </Modal>

      {/* Remove Custom Skill from Assistant Modal */}
      <Modal
        visible={deleteCustomSkillName !== null}
        onCancel={() => setDeleteCustomSkillName(null)}
        title={'Remove Skill from Assistant'}
        okButtonProps={{ status: 'danger' }}
        okText={'Remove'}
        cancelText={'Cancel'}
        onOk={() => {
          if (deleteCustomSkillName) {
            // Remove from customSkills
            setCustomSkills(customSkills.filter((s) => s !== deleteCustomSkillName));
            // Also remove from selectedSkills if selected
            setSelectedSkills(selectedSkills.filter((s) => s !== deleteCustomSkillName));
            setDeleteCustomSkillName(null);
            message.success('Skill removed from this assistant');
          }
        }}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>{`Are you sure you want to remove "${deleteCustomSkillName}" from this assistant?`}</p>
        <div className='mt-12px text-12px text-t-secondary bg-fill-2 p-12px rounded-lg'>{'This will only remove the skill from this assistant. The skill will remain in the builtin skills and can be added back later.'}</div>
      </Modal>
    </div>
  );
};

export default AssistantManagement;
