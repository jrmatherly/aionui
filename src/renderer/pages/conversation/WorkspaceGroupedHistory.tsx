/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { CronJobIndicator, useCronJobsMap } from '@/renderer/pages/cron';
import { addEventListener, emitter } from '@/renderer/utils/emitter';
import { getActivityTime, getTimelineLabel } from '@/renderer/utils/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspaceHistory';
import { Empty, Input, Popconfirm, Tooltip } from '@arco-design/web-react';
import { DeleteOne, EditOne, MessageOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import WorkspaceCollapse from './WorkspaceCollapse';
import { useConversationTabs } from './context/ConversationTabsContext';

interface WorkspaceGroup {
  workspace: string; // Full path
  displayName: string; // Display name
  conversations: TChatConversation[];
}

// Unified timeline item, can be a workspace group or standalone conversation
interface TimelineItem {
  type: 'workspace' | 'conversation';
  time: number; // Time used for sorting
  workspaceGroup?: WorkspaceGroup; // Has value when type === 'workspace'
  conversation?: TChatConversation; // Has value when type === 'conversation'
}

interface TimelineSection {
  timeline: string; // Timeline title
  items: TimelineItem[]; // Items sorted by time after merging
}

// Helper to get timeline label for a conversation
const getConversationTimelineLabel = (conversation: TChatConversation): string => {
  const time = getActivityTime(conversation);
  return getTimelineLabel(time, Date.now());
};

// Group by timeline and workspace
const timelineLabels: Record<string, string> = {
  'conversation.history.today': 'Today',
  'conversation.history.yesterday': 'Yesterday',
  'conversation.history.recent7Days': 'Last 7 Days',
  'conversation.history.earlier': 'Earlier',
};

const groupConversationsByTimelineAndWorkspace = (conversations: TChatConversation[]): TimelineSection[] => {
  // Step 1: Group all conversations by workspace first
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];

  conversations.forEach((conv) => {
    const workspace = conv.extra?.workspace;
    const customWorkspace = conv.extra?.customWorkspace;

    if (customWorkspace && workspace) {
      if (!allWorkspaceGroups.has(workspace)) {
        allWorkspaceGroups.set(workspace, []);
      }
      allWorkspaceGroups.get(workspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  // Step 2: Determine which timeline each workspace group should appear in (using the most recent conversation's time)
  const workspaceGroupsByTimeline = new Map<string, WorkspaceGroup[]>();

  allWorkspaceGroups.forEach((convList, workspace) => {
    // Sort conversations by time
    const sortedConvs = convList.sort((a, b) => getActivityTime(b) - getActivityTime(a));
    // Use the most recent conversation's timeline
    const latestConv = sortedConvs[0];
    const timeline = getConversationTimelineLabel(latestConv);

    if (!workspaceGroupsByTimeline.has(timeline)) {
      workspaceGroupsByTimeline.set(timeline, []);
    }

    workspaceGroupsByTimeline.get(timeline)!.push({
      workspace,
      displayName: getWorkspaceDisplayName(workspace),
      conversations: sortedConvs,
    });
  });

  // Step 3: Group conversations without workspace by timeline
  const withoutWorkspaceByTimeline = new Map<string, TChatConversation[]>();

  withoutWorkspaceConvs.forEach((conv) => {
    const timeline = getConversationTimelineLabel(conv);
    if (!withoutWorkspaceByTimeline.has(timeline)) {
      withoutWorkspaceByTimeline.set(timeline, []);
    }
    withoutWorkspaceByTimeline.get(timeline)!.push(conv);
  });

  // Step 4: Build sections in timeline order
  const timelineOrder = ['conversation.history.today', 'conversation.history.yesterday', 'conversation.history.recent7Days', 'conversation.history.earlier'];
  const sections: TimelineSection[] = [];

  timelineOrder.forEach((timelineKey) => {
    const timeline = timelineLabels[timelineKey] || timelineKey;
    const withWorkspace = workspaceGroupsByTimeline.get(timeline) || [];
    const withoutWorkspace = withoutWorkspaceByTimeline.get(timeline) || [];

    // Only add section when this timeline has conversations
    if (withWorkspace.length === 0 && withoutWorkspace.length === 0) return;

    // Merge workspace groups and standalone conversations into a unified items array
    const items: TimelineItem[] = [];

    // Add workspace group items
    withWorkspace.forEach((group) => {
      const updateTime = getWorkspaceUpdateTime(group.workspace);
      const time = updateTime > 0 ? updateTime : getActivityTime(group.conversations[0]);
      items.push({
        type: 'workspace',
        time,
        workspaceGroup: group,
      });
    });

    // Add standalone conversation items
    withoutWorkspace.forEach((conv) => {
      items.push({
        type: 'conversation',
        time: getActivityTime(conv),
        conversation: conv,
      });
    });

    // Sort uniformly by time (most recent first)
    items.sort((a, b) => b.time - a.time);

    sections.push({
      timeline,
      items,
    });
  });

  return sections;
};

const EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion';

const WorkspaceGroupedHistory: React.FC<{ onSessionClick?: () => void; collapsed?: boolean }> = ({ onSessionClick, collapsed = false }) => {
  const [conversations, setConversations] = useState<TChatConversation[]>([]);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>(() => {
    // Restore expansion state from localStorage
    try {
      const stored = localStorage.getItem(EXPANSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // Ignore errors
    }
    return [];
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const { id } = useParams();
  const navigate = useNavigate();
  const { openTab, closeAllTabs, activeTab, updateTabName } = useConversationTabs();
  const { getJobStatus, markAsRead } = useCronJobsMap();

  // Load conversation list
  useEffect(() => {
    const refresh = () => {
      ipcBridge.database.getUserConversations
        .invoke({ page: 0, pageSize: 10000 })
        .then((data) => {
          if (data && Array.isArray(data)) {
            setConversations(data);
          } else {
            setConversations([]);
          }
        })
        .catch((error) => {
          console.error('[WorkspaceGroupedHistory] Failed to load conversations:', error);
          setConversations([]);
        });
    };
    refresh();
    return addEventListener('chat.history.refresh', refresh);
  }, []);

  // Scroll to active conversation when route changes
  useEffect(() => {
    if (!id) return;
    // Use requestAnimationFrame to ensure DOM is updated
    const rafId = requestAnimationFrame(() => {
      const element = document.getElementById('c-' + id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [id]);

  // Persist expansion state
  useEffect(() => {
    try {
      localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(expandedWorkspaces));
    } catch {
      // Ignore errors
    }
  }, [expandedWorkspaces]);

  // Group by timeline and workspace
  const timelineSections = useMemo(() => {
    return groupConversationsByTimelineAndWorkspace(conversations);
  }, [conversations]);

  // Expand all workspaces by default (only execute once when expansion state is not yet recorded)
  useEffect(() => {
    if (expandedWorkspaces.length > 0) return;
    const allWorkspaces: string[] = [];
    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          allWorkspaces.push(item.workspaceGroup.workspace);
        }
      });
    });
    if (allWorkspaces.length > 0) {
      setExpandedWorkspaces(allWorkspaces);
    }
  }, [timelineSections, expandedWorkspaces.length]);

  const handleConversationClick = useCallback(
    (conv: TChatConversation) => {
      const customWorkspace = conv.extra?.customWorkspace;
      const newWorkspace = conv.extra?.workspace;

      // Mark conversation as read (clear unread cron execution indicator)
      markAsRead(conv.id);

      // If clicking a non-custom workspace conversation, close all tabs
      if (!customWorkspace) {
        closeAllTabs();
        void navigate(`/conversation/${conv.id}`);
        if (onSessionClick) {
          onSessionClick();
        }
        return;
      }

      // If clicking a custom workspace conversation
      // Check if current active tab's workspace differs from new conversation's workspace
      const currentWorkspace = activeTab?.workspace;

      // If no active tab or workspace differs, close all tabs before opening new tab
      if (!currentWorkspace || currentWorkspace !== newWorkspace) {
        closeAllTabs();
      }

      // Open new conversation's tab
      openTab(conv);
      void navigate(`/conversation/${conv.id}`);
      if (onSessionClick) {
        onSessionClick();
      }
    },
    [openTab, closeAllTabs, activeTab, navigate, onSessionClick, markAsRead]
  );

  // Toggle workspace expand/collapse state
  const handleToggleWorkspace = useCallback((workspace: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.includes(workspace)) {
        return prev.filter((w) => w !== workspace);
      } else {
        return [...prev, workspace];
      }
    });
  }, []);

  const handleRemoveConversation = useCallback(
    (convId: string) => {
      void ipcBridge.conversation.remove
        .invoke({ id: convId })
        .then((success) => {
          if (success) {
            // Trigger conversation deletion event to close corresponding tab
            emitter.emit('conversation.deleted', convId);
            // Refresh conversation list
            emitter.emit('chat.history.refresh');
            if (id === convId) {
              void navigate('/');
            }
          }
        })
        .catch((error) => {
          console.error('Failed to remove conversation:', error);
        });
    },
    [id, navigate]
  );

  const handleEditStart = useCallback((conversation: TChatConversation) => {
    setEditingId(conversation.id);
    setEditingName(conversation.name);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingId || !editingName.trim()) return;

    try {
      const success = await ipcBridge.conversation.update.invoke({
        id: editingId,
        updates: { name: editingName.trim() },
      });

      if (success) {
        updateTabName(editingId, editingName.trim());
        emitter.emit('chat.history.refresh');
      }
    } catch (error) {
      console.error('Failed to update conversation name:', error);
    } finally {
      setEditingId(null);
      setEditingName('');
    }
  }, [editingId, editingName, updateTabName]);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleEditSave();
      } else if (e.key === 'Escape') {
        handleEditCancel();
      }
    },
    [handleEditSave, handleEditCancel]
  );

  const renderConversation = useCallback(
    (conversation: TChatConversation) => {
      const isSelected = id === conversation.id;
      const isEditing = editingId === conversation.id;
      const cronStatus = getJobStatus(conversation.id);

      return (
        <Tooltip key={conversation.id} disabled={!collapsed} content={conversation.name || 'New Chat'} position='right'>
          <div
            id={'c-' + conversation.id}
            className={classNames('chat-history__item hover:bg-hover px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0', {
              '!bg-active': isSelected,
            })}
            onClick={() => handleConversationClick(conversation)}
          >
            {cronStatus !== 'none' ? <CronJobIndicator status={cronStatus} size={20} className='flex-shrink-0' /> : <MessageOne theme='outline' size='20' className='line-height-0 flex-shrink-0' />}
            <FlexFullContainer className='h-24px min-w-0 flex-1 collapsed-hidden ml-10px'>{isEditing ? <Input className='chat-history__item-editor text-14px lh-24px h-24px w-full' value={editingName} onChange={setEditingName} onKeyDown={handleEditKeyDown} onBlur={handleEditSave} autoFocus size='small' /> : <div className='chat-history__item-name overflow-hidden text-ellipsis inline-block flex-1 text-14px lh-24px whitespace-nowrap min-w-0'>{conversation.name}</div>}</FlexFullContainer>
            {!isEditing && (
              <div
                className={classNames('absolute right-0px top-0px h-full w-70px items-center justify-end hidden group-hover:flex !collapsed-hidden pr-12px')}
                style={{
                  backgroundImage: isSelected ? `linear-gradient(to right, transparent, var(--aou-2) 50%)` : `linear-gradient(to right, transparent, var(--aou-1) 50%)`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <span
                  className='flex-center mr-8px'
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEditStart(conversation);
                  }}
                >
                  <EditOne theme='outline' size='20' className='flex' />
                </span>
                <Popconfirm
                  title={'Delete chat'}
                  content={'Are you sure you want to delete this chat?'}
                  okText={'Yes'}
                  cancelText={'No'}
                  onOk={(event) => {
                    event.stopPropagation();
                    handleRemoveConversation(conversation.id);
                  }}
                  onCancel={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <span
                    className='flex-center'
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <DeleteOne theme='outline' size='20' className='flex' />
                  </span>
                </Popconfirm>
              </div>
            )}
          </div>
        </Tooltip>
      );
    },
    [id, collapsed, editingId, editingName, handleConversationClick, handleEditStart, handleEditKeyDown, handleEditSave, handleRemoveConversation, getJobStatus]
  );

  // If no conversations, show empty state
  if (timelineSections.length === 0) {
    return (
      <FlexFullContainer>
        <div className='flex-center'>
          <Empty description={'No chat history'} />
        </div>
      </FlexFullContainer>
    );
  }

  return (
    <FlexFullContainer>
      <div className='size-full overflow-y-auto overflow-x-hidden'>
        {timelineSections.map((section) => (
          <div key={section.timeline} className='mb-8px min-w-0'>
            {/* Timeline title */}
            {!collapsed && <div className='chat-history__section px-12px py-8px text-13px text-t-secondary font-bold'>{section.timeline}</div>}

            {/* Render all items sorted by time uniformly (workspace groups and standalone conversations mixed) */}
            {section.items.map((item) => {
              if (item.type === 'workspace' && item.workspaceGroup) {
                const group = item.workspaceGroup;
                return (
                  <div key={group.workspace} className={classNames('min-w-0', { 'px-8px': !collapsed })}>
                    <WorkspaceCollapse
                      expanded={expandedWorkspaces.includes(group.workspace)}
                      onToggle={() => handleToggleWorkspace(group.workspace)}
                      siderCollapsed={collapsed}
                      header={
                        <div className='flex items-center gap-8px text-14px min-w-0'>
                          <span className='font-medium truncate flex-1 text-t-primary min-w-0'>{group.displayName}</span>
                        </div>
                      }
                    >
                      <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-4px': !collapsed })}>{group.conversations.map((conv) => renderConversation(conv))}</div>
                    </WorkspaceCollapse>
                  </div>
                );
              } else if (item.type === 'conversation' && item.conversation) {
                return renderConversation(item.conversation);
              }
              return null;
            })}
          </div>
        ))}
      </div>
    </FlexFullContainer>
  );
};

export default WorkspaceGroupedHistory;
