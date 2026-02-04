import { ConfigStorage } from '@/common/storage';
import { STORAGE_KEYS } from '@/common/storageKeys';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { useResizableSplit } from '@/renderer/hooks/useResizableSplit';
import ConversationTabs from '@/renderer/pages/conversation/ConversationTabs';
import { useConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/preview';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight, Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import GitHubLogo from '@/renderer/assets/logos/github.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import OpenCodeLogo from '@/renderer/assets/logos/opencode.svg';
import QoderLogo from '@/renderer/assets/logos/qoder.png';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import type { AcpBackend } from '@/types/acpTypes';

// Agent Logo Map
const AGENT_LOGO_MAP: Partial<Record<AcpBackend, string>> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  codex: CodexLogo,
  iflow: IflowLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpenCodeLogo,
  copilot: GitHubLogo,
  qoder: QoderLogo,
};

import { iconColors } from '@/renderer/theme/colors';
import { WORKSPACE_HAS_FILES_EVENT, WORKSPACE_TOGGLE_EVENT, dispatchWorkspaceStateEvent, dispatchWorkspaceToggleEvent, type WorkspaceHasFilesDetail } from '@/renderer/utils/workspaceEvents';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';

const MIN_CHAT_RATIO = 25;
const MIN_WORKSPACE_RATIO = 12;
const MIN_PREVIEW_RATIO = 20;
const WORKSPACE_HEADER_HEIGHT = 32;

const isMacEnvironment = () => {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.userAgent);
};

const isWindowsEnvironment = () => {
  if (typeof navigator === 'undefined') return false;
  return /win/i.test(navigator.userAgent);
};

interface WorkspaceHeaderProps {
  children?: React.ReactNode;
  showToggle?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  togglePlacement?: 'left' | 'right';
}

const WorkspacePanelHeader: React.FC<WorkspaceHeaderProps> = ({ children, showToggle = false, collapsed, onToggle, togglePlacement = 'right' }) => (
  <div className='workspace-panel-header flex items-center justify-start px-12px py-4px gap-12px border-b border-[var(--bg-3)]' style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}>
    {showToggle && togglePlacement === 'left' && (
      <button type='button' className='workspace-header__toggle mr-4px' aria-label='Toggle workspace' onClick={onToggle}>
        {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
      </button>
    )}
    <div className='flex-1 truncate'>{children}</div>
    {showToggle && togglePlacement === 'right' && (
      <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={onToggle}>
        {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
      </button>
    )}
  </div>
);

// headerExtra allows injecting custom actions (e.g., model picker) into the header's right area
const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
  agentName?: string;
  /** Custom agent logo (can be SVG path or emoji string) */
  agentLogo?: string;
  /** Whether the logo is an emoji */
  agentLogoIsEmoji?: boolean;
  headerExtra?: React.ReactNode;
  headerLeft?: React.ReactNode;
  workspaceEnabled?: boolean;
}> = (props) => {
  // Workspace panel collapse state - globally persisted
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.WORKSPACE_PANEL_COLLAPSE);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch {
      // 忽略错误
    }
    return true; // Default collapsed
  });
  // Current active conversation ID (for recording user manual operation preference)
  const currentConversationIdRef = useRef<string | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  const { backend, agentName, agentLogo, agentLogoIsEmoji, workspaceEnabled = true } = props;
  const layout = useLayoutContext();
  const isMacRuntime = isMacEnvironment();
  const isWindowsRuntime = isWindowsEnvironment();
  // Mirror ref for collapse state
  const rightCollapsedRef = useRef(rightSiderCollapsed);
  const previousWorkspaceCollapsedRef = useRef<boolean | null>(null);
  const previousSiderCollapsedRef = useRef<boolean | null>(null);
  const previousPreviewOpenRef = useRef(false);

  // Preview panel state
  const { isOpen: isPreviewOpen } = usePreviewContext();

  // Fetch custom agents config as fallback when agentName is not provided
  const { data: customAgents } = useSWR(backend === 'custom' && !agentName ? 'acp.customAgents' : null, () => ConfigStorage.get('acp.customAgents'));

  // Compute display name with fallback chain (use first custom agent as fallback for backward compatibility)
  const displayName = agentName || (backend === 'custom' && customAgents?.[0]?.name) || ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name || backend;

  // Get tabs state, hide conversation title when tabs exist
  const { openTabs } = useConversationTabs();
  const hasTabs = openTabs.length > 0;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleWorkspaceToggle = () => {
      if (!workspaceEnabled) {
        return;
      }
      setRightSiderCollapsed((prev) => {
        const newState = !prev;
        // Record user manual operation preference
        const conversationId = currentConversationIdRef.current;
        if (conversationId) {
          try {
            localStorage.setItem(`workspace-preference-${conversationId}`, newState ? 'collapsed' : 'expanded');
          } catch {
            // 忽略错误
          }
        }
        return newState;
      });
    };
    window.addEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    return () => {
      window.removeEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    };
  }, [workspaceEnabled]);

  // Auto expand/collapse workspace panel based on files state (user preference takes priority)
  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceEnabled) {
      return undefined;
    }
    const handleHasFiles = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHasFilesDetail>).detail;
      const conversationId = detail.conversationId;

      // Update current conversation ID
      currentConversationIdRef.current = conversationId;

      // Check if user has manual preference
      let userPreference: 'expanded' | 'collapsed' | null = null;
      if (conversationId) {
        try {
          const stored = localStorage.getItem(`workspace-preference-${conversationId}`);
          if (stored === 'expanded' || stored === 'collapsed') {
            userPreference = stored;
          }
        } catch {
          // 忽略错误
        }
      }

      // If user has preference, use it; otherwise decide by file state
      if (userPreference) {
        const shouldCollapse = userPreference === 'collapsed';
        if (shouldCollapse !== rightSiderCollapsed) {
          setRightSiderCollapsed(shouldCollapse);
        }
      } else {
        // No user preference: expand if has files, collapse if not
        if (detail.hasFiles && rightSiderCollapsed) {
          setRightSiderCollapsed(false);
        } else if (!detail.hasFiles && !rightSiderCollapsed) {
          setRightSiderCollapsed(true);
        }
      }
    };
    window.addEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    return () => {
      window.removeEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    };
  }, [workspaceEnabled, rightSiderCollapsed]);

  useEffect(() => {
    if (!workspaceEnabled) {
      dispatchWorkspaceStateEvent(true);
      return;
    }
    dispatchWorkspaceStateEvent(rightSiderCollapsed);
  }, [rightSiderCollapsed, workspaceEnabled]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      setContainerWidth(typeof window === 'undefined' ? 0 : window.innerWidth);
      return;
    }
    setContainerWidth(element.offsetWidth);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      if (!entries.length) return;
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    rightCollapsedRef.current = rightSiderCollapsed;
  }, [rightSiderCollapsed]);

  // Persist workspace panel collapse state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSPACE_PANEL_COLLAPSE, String(rightSiderCollapsed));
    } catch {
      // 忽略错误
    }
  }, [rightSiderCollapsed]);

  useEffect(() => {
    if (!workspaceEnabled) {
      setRightSiderCollapsed(true);
    }
  }, [workspaceEnabled]);

  useEffect(() => {
    if (!workspaceEnabled || !layout?.isMobile || rightCollapsedRef.current) {
      return;
    }
    setRightSiderCollapsed(true);
  }, [layout?.isMobile, workspaceEnabled]);

  const {
    splitRatio: chatSplitRatio,
    setSplitRatio: setChatSplitRatio,
    createDragHandle: createPreviewDragHandle,
  } = useResizableSplit({
    defaultWidth: 60,
    minWidth: MIN_CHAT_RATIO,
    maxWidth: 80,
    storageKey: 'chat-preview-split-ratio',
  });
  const {
    splitRatio: workspaceSplitRatio,
    setSplitRatio: setWorkspaceSplitRatio,
    createDragHandle: createWorkspaceDragHandle,
  } = useResizableSplit({
    defaultWidth: 20,
    minWidth: MIN_WORKSPACE_RATIO,
    maxWidth: 40,
    storageKey: 'chat-workspace-split-ratio',
  });

  const isDesktop = !layout?.isMobile;
  const effectiveWorkspaceRatio = workspaceEnabled && isDesktop && !rightSiderCollapsed ? workspaceSplitRatio : 0;
  const chatFlex = isDesktop ? (isPreviewOpen ? chatSplitRatio : 100 - effectiveWorkspaceRatio) : 100;
  const workspaceFlex = effectiveWorkspaceRatio;
  const viewportWidth = containerWidth || (typeof window === 'undefined' ? 0 : window.innerWidth);
  const workspaceWidthPx = workspaceEnabled ? Math.min(500, Math.max(200, (workspaceSplitRatio / 100) * (viewportWidth || 0))) : 0;

  useEffect(() => {
    if (!workspaceEnabled || !isPreviewOpen || !isDesktop || rightSiderCollapsed) {
      return;
    }
    const maxWorkspace = Math.max(MIN_WORKSPACE_RATIO, Math.min(40, 100 - chatSplitRatio - MIN_PREVIEW_RATIO));
    if (workspaceSplitRatio > maxWorkspace) {
      setWorkspaceSplitRatio(maxWorkspace);
    }
    // Intentionally exclude workspaceSplitRatio from deps to prevent extra effects when dragging workspace
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setWorkspaceSplitRatio, workspaceEnabled]);

  useEffect(() => {
    if (!workspaceEnabled || !isPreviewOpen || !isDesktop) {
      return;
    }
    const activeWorkspaceRatio = rightSiderCollapsed ? 0 : workspaceSplitRatio;
    const maxChat = Math.max(MIN_CHAT_RATIO, Math.min(80, 100 - activeWorkspaceRatio - MIN_PREVIEW_RATIO));
    if (chatSplitRatio > maxChat) {
      setChatSplitRatio(maxChat);
    }
    // Intentionally exclude workspaceSplitRatio from deps to prevent affecting chat panel when dragging workspace
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setChatSplitRatio, workspaceEnabled]);

  // Auto-collapse sidebar and workspace when preview opens
  useEffect(() => {
    if (!workspaceEnabled || !isDesktop) {
      previousPreviewOpenRef.current = false;
      return;
    }

    if (isPreviewOpen && !previousPreviewOpenRef.current) {
      if (previousWorkspaceCollapsedRef.current === null) {
        previousWorkspaceCollapsedRef.current = rightSiderCollapsed;
      }
      if (previousSiderCollapsedRef.current === null && typeof layout?.siderCollapsed !== 'undefined') {
        previousSiderCollapsedRef.current = layout.siderCollapsed;
      }
      setRightSiderCollapsed(true);
      layout?.setSiderCollapsed?.(true);
    } else if (!isPreviewOpen && previousPreviewOpenRef.current) {
      if (previousWorkspaceCollapsedRef.current !== null) {
        setRightSiderCollapsed(previousWorkspaceCollapsedRef.current);
        previousWorkspaceCollapsedRef.current = null;
      }
      if (previousSiderCollapsedRef.current !== null && layout?.setSiderCollapsed) {
        layout.setSiderCollapsed(previousSiderCollapsedRef.current);
        previousSiderCollapsedRef.current = null;
      }
    }

    previousPreviewOpenRef.current = isPreviewOpen;
  }, [isPreviewOpen, isDesktop, layout, rightSiderCollapsed, workspaceEnabled]);

  const mobileHandle =
    workspaceEnabled && layout?.isMobile
      ? createWorkspaceDragHandle({
          className: 'absolute left-0 top-0 bottom-0',
          style: { borderRight: 'none', borderLeft: '1px solid var(--bg-3)' },
          reverse: true,
        })
      : null;

  return (
    <ArcoLayout
      className='size-full color-black '
      style={
        {
          // fontFamily: `cursive,"anthropicSans","anthropicSans Fallback",system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif`,
        }
      }
    >
      {/* Main content area: chat + workspace + preview */}
      <div ref={containerRef} className='flex flex-1 relative w-full overflow-hidden'>
        {/* Chat panel (with drag handle) */}
        <div
          className='flex flex-col relative'
          style={{
            // Use flexBasis for width to avoid conflict with width property
            flexGrow: isPreviewOpen && isDesktop ? 0 : chatFlex,
            flexShrink: 0,
            flexBasis: isPreviewOpen && isDesktop ? `${chatFlex}%` : 0,
            display: isPreviewOpen && layout?.isMobile ? 'none' : 'flex',
            minWidth: isDesktop ? '240px' : '100%',
          }}
        >
          <ArcoLayout.Content
            className='flex flex-col h-full'
            onClick={() => {
              const isMobile = window.innerWidth < 768;
              if (isMobile && !rightSiderCollapsed) {
                setRightSiderCollapsed(true);
              }
            }}
          >
            {/* Conversation tabs bar */}
            <ConversationTabs />
            <ArcoLayout.Header className={classNames('h-36px flex items-center justify-between p-16px gap-16px !bg-1 chat-layout-header')}>
              <div>{props.headerLeft}</div>
              <FlexFullContainer className='h-full' containerClassName='flex items-center gap-16px'>
                {!hasTabs && <span className='font-bold text-16px text-t-primary inline-block overflow-hidden text-ellipsis whitespace-nowrap shrink-0 max-w-[50%]'>{props.title}</span>}
              </FlexFullContainer>
              <div className='flex items-center gap-12px'>
                {/* headerExtra renders at top-right for items like model switchers */}
                {props.headerExtra}
                {(backend || agentLogo) && (
                  <div className='ml-16px flex items-center gap-2 bg-2 w-fit rounded-full px-[8px] py-[2px]'>
                    {agentLogo ? agentLogoIsEmoji ? <span className='text-sm'>{agentLogo}</span> : <img src={agentLogo} alt={`${agentName || 'agent'} logo`} width={16} height={16} style={{ objectFit: 'contain' }} /> : AGENT_LOGO_MAP[backend as AcpBackend] ? <img src={AGENT_LOGO_MAP[backend as AcpBackend]} alt={`${backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} /> : <Robot theme='outline' size={16} fill={iconColors.primary} />}
                    <span className='text-sm'>{displayName}</span>
                  </div>
                )}
                {isWindowsRuntime && workspaceEnabled && (
                  <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={() => dispatchWorkspaceToggleEvent()}>
                    {rightSiderCollapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
                  </button>
                )}
              </div>
            </ArcoLayout.Header>
            <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>{props.children}</ArcoLayout.Content>
          </ArcoLayout.Content>

          {/* Chat right drag handle: resize chat vs preview in desktop mode */}
          {isPreviewOpen &&
            !layout?.isMobile &&
            createPreviewDragHandle({
              className: 'absolute right-0 top-0 bottom-0',
              style: {},
            })}
        </div>

        {/* Preview panel (moved to middle position) */}
        {isPreviewOpen && (
          <div
            className='preview-panel flex flex-col relative my-[12px] mr-[12px] ml-[8px] rounded-[15px]'
            style={{
              // Use flexGrow: 1 to fill remaining space (chat and workspace use fixed flexBasis)
              flexGrow: layout?.isMobile ? 0 : 1,
              flexShrink: layout?.isMobile ? 0 : 1,
              flexBasis: layout?.isMobile ? '100%' : 0,
              border: '1px solid var(--bg-3)',
              minWidth: layout?.isMobile ? '100%' : '260px',
            }}
          >
            <PreviewPanel />
          </div>
        )}

        {/* Workspace panel (moved to rightmost position) */}
        {workspaceEnabled && !layout?.isMobile && (
          <div
            className={classNames('!bg-1 relative chat-layout-right-sider layout-sider')}
            style={{
              // Use flexBasis for width to avoid conflict with width property
              flexGrow: isPreviewOpen ? 0 : workspaceFlex,
              flexShrink: 0,
              flexBasis: rightSiderCollapsed ? '0px' : isPreviewOpen ? `${workspaceFlex}%` : 0,
              minWidth: rightSiderCollapsed ? '0px' : '220px',
              overflow: 'hidden',
              borderLeft: rightSiderCollapsed ? 'none' : '1px solid var(--bg-3)',
            }}
          >
            {isDesktop &&
              !rightSiderCollapsed &&
              createWorkspaceDragHandle({
                className: 'absolute left-0 top-0 bottom-0',
                style: {},
                reverse: true,
              })}
            <WorkspacePanelHeader showToggle={!isMacRuntime && !isWindowsRuntime} collapsed={rightSiderCollapsed} onToggle={() => dispatchWorkspaceToggleEvent()} togglePlacement={layout?.isMobile ? 'left' : 'right'}>
              {props.siderTitle}
            </WorkspacePanelHeader>
            <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>{props.sider}</ArcoLayout.Content>
          </div>
        )}

        {/* Mobile workspace backdrop */}
        {workspaceEnabled && layout?.isMobile && !rightSiderCollapsed && <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setRightSiderCollapsed(true)} aria-hidden='true' />}

        {/* Mobile workspace (keep original fixed positioning) */}
        {workspaceEnabled && layout?.isMobile && (
          <div
            className='!bg-1 relative chat-layout-right-sider'
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              height: '100vh',
              width: `${Math.round(workspaceWidthPx)}px`,
              zIndex: 100,
              transform: rightSiderCollapsed ? 'translateX(100%)' : 'translateX(0)',
              transition: 'none',
              pointerEvents: rightSiderCollapsed ? 'none' : 'auto',
            }}
          >
            {mobileHandle}
            <WorkspacePanelHeader showToggle collapsed={rightSiderCollapsed} onToggle={() => dispatchWorkspaceToggleEvent()} togglePlacement='left'>
              {props.siderTitle}
            </WorkspacePanelHeader>
            <ArcoLayout.Content className='bg-1' style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
              {props.sider}
            </ArcoLayout.Content>
          </div>
        )}

        {!isMacRuntime && !isWindowsRuntime && workspaceEnabled && rightSiderCollapsed && !layout?.isMobile && (
          <button type='button' className='workspace-toggle-floating workspace-header__toggle absolute top-1/2 right-2 z-10' style={{ transform: 'translateY(-50%)' }} onClick={() => dispatchWorkspaceToggleEvent()} aria-label='Expand workspace'>
            <ExpandLeft size={16} />
          </button>
        )}
      </div>
    </ArcoLayout>
  );
};

export default ChatLayout;
