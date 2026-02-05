/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { IconShrink } from '@arco-design/web-react/icon';
import { Close } from '@icon-park/react';
import type React from 'react';
import type { TabFadeState } from '../../hooks/useTabOverflow';

/**
 * Tab information
 */
export interface PreviewTab {
  /**
   * Tab ID
   */
  id: string;

  /**
   * Tab title
   */
  title: string;

  /**
   * Whether there are unsaved changes
   */
  isDirty?: boolean;
}

/**
 * PreviewTabs component props
 */
interface PreviewTabsProps {
  /**
   * Tabs list
   */
  tabs: PreviewTab[];

  /**
   * Current active tab ID
   */
  activeTabId: string | null;

  /**
   * Tab fade state (left/right overflow indicators)
   */
  tabFadeState: TabFadeState;

  /**
   * Tabs container ref
   */
  tabsContainerRef: React.RefObject<HTMLDivElement>;

  /**
   * Switch tab callback
   */
  onSwitchTab: (tabId: string) => void;

  /**
   * Close tab callback
   */
  onCloseTab: (tabId: string) => void;

  /**
   * Tab context menu callback
   */
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;

  /**
   * Close preview panel callback
   */
  onClosePanel?: () => void;
}

/**
 * Preview panel tabs bar component
 *
 * Displays multiple tabs, supports switching, closing, and context menu
 *
 * Includes left/right gradient indicators to prompt users that more tabs can be scrolled
 */
const PreviewTabs: React.FC<PreviewTabsProps> = ({ tabs, activeTabId, tabFadeState, tabsContainerRef, onSwitchTab, onCloseTab, onContextMenu, onClosePanel }) => {
  const { left: showLeftFade, right: showRightFade } = tabFadeState;

  return (
    <div
      className='relative flex-shrink-0 bg-bg-2'
      style={{
        minHeight: '40px',
        borderBottom: '1px solid var(--border-base)',
      }}
    >
      <div className='flex items-center h-40px w-full'>
        {/* Tabs scroll area */}
        <div ref={tabsContainerRef} className='flex items-center h-full flex-1 overflow-x-auto'>
          {tabs.length > 0 ? (
            tabs.map((tab) => (
              <div key={tab.id} className={`flex items-center gap-8px px-12px h-full cursor-pointer transition-colors flex-shrink-0 ${tab.id === activeTabId ? 'bg-bg-1 text-t-primary' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => onSwitchTab(tab.id)} onContextMenu={(e) => onContextMenu(e, tab.id)}>
                <span className='text-12px whitespace-nowrap flex items-center gap-4px'>
                  {tab.title}
                  {/* Unsaved indicator */}
                  {tab.isDirty && <span className='w-6px h-6px rd-full bg-primary' title={'Unsaved Changes'} />}
                </span>
                <Close
                  theme='outline'
                  size='14'
                  fill={iconColors.secondary}
                  className='hover:fill-primary'
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                />
              </div>
            ))
          ) : (
            <div className='text-12px text-t-tertiary px-12px'>{'No tabs open'}</div>
          )}
        </div>

        {/* Collapse panel button */}
        {onClosePanel && (
          <div className='flex items-center h-full px-12px flex-shrink-0 rounded-tr-[16px]'>
            <div className='flex items-center justify-center w-24px h-24px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={onClosePanel} title={'Collapse panel'}>
              <IconShrink style={{ fontSize: 16, color: iconColors.secondary }} />
            </div>
          </div>
        )}
      </div>

      {/* Left gradient indicator */}
      {showLeftFade && (
        <div
          className='pointer-events-none absolute left-0 top-0 bottom-0 w-32px rounded-tl-[16px]'
          style={{
            background: 'linear-gradient(90deg, var(--bg-2) 0%, transparent 100%)',
          }}
        />
      )}

      {/* Right gradient indicator */}
      {showRightFade && (
        <div
          className='pointer-events-none absolute right-0 top-0 bottom-0 w-32px rounded-tr-[16px]'
          style={{
            background: 'linear-gradient(270deg, var(--bg-2) 0%, transparent 100%)',
          }}
        />
      )}
    </div>
  );
};

export default PreviewTabs;
