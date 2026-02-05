/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/theme/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Tabs } from '@arco-design/web-react';
import { Computer, Earth, Gemini, Info, LinkCloud, Toolkit } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AboutModalContent from './contents/AboutModalContent';
import AgentModalContent from './contents/AgentModalContent';
import GeminiModalContent from './contents/GeminiModalContent';
import ModelModalContent from './contents/ModelModalContent';
import SystemModalContent from './contents/SystemModalContent';
import ToolsModalContent from './contents/ToolsModalContent';
import WebuiModalContent from './contents/WebuiModalContent';
import { SettingsViewModeProvider } from './settingsViewContext';

// ==================== Constants ====================

/** Mobile breakpoint (px) */
const MOBILE_BREAKPOINT = 768;

/** Sidebar width (px) */
const SIDEBAR_WIDTH = 200;

/** Modal width configuration */
const MODAL_WIDTH = {
  mobile: 560,
  desktop: 880,
} as const;

/** Modal height configuration */
const MODAL_HEIGHT = {
  mobile: '90vh',
  mobileContent: 'calc(90vh - 80px)',
  desktop: 459,
} as const;

/** Resize event debounce delay (ms) */
const RESIZE_DEBOUNCE_DELAY = 150;

// ==================== Type Definitions ====================

/**
 * Settings tab type
 */
export type SettingTab = 'gemini' | 'model' | 'agent' | 'tools' | 'webui' | 'system' | 'about';

/**
 * Settings modal component props
 */
interface SettingsModalProps {
  /** Modal visibility state */
  visible: boolean;
  /** Close callback */
  onCancel: () => void;
  /** Default selected tab */
  defaultTab?: SettingTab;
}

/**
 * Secondary modal component props
 */
interface SubModalProps {
  /** Modal visibility state */
  visible: boolean;
  /** Close callback */
  onCancel: () => void;
  /** Modal title */
  title?: string;
  /** Children elements */
  children: React.ReactNode;
}

/**
 * Secondary modal component
 * Used for secondary dialogs in settings page
 *
 * @example
 * ```tsx
 * <SubModal visible={showModal} onCancel={handleClose} title="Details">
 *   <div>Modal content</div>
 * </SubModal>
 * ```
 */
export const SubModal: React.FC<SubModalProps> = ({ visible, onCancel, title, children }) => {
  return (
    <AionModal visible={visible} onCancel={onCancel} footer={null} className='settings-sub-modal' size='medium' title={title}>
      <AionScrollArea className='h-full px-20px pb-16px text-14px text-t-primary'>{children}</AionScrollArea>
    </AionModal>
  );
};

/**
 * Main settings modal component
 *
 * Provides global settings interface with multiple tabs including Gemini, Model, Tools, System and About
 *
 * @features
 * - Responsive design with dropdown on mobile and sidebar on desktop
 * - Debounced window resize listener
 * - Tab state management
 *
 * @example
 * ```tsx
 * const { openSettings, settingsModal } = useSettingsModal();
 * // Open settings modal and navigate to system tab
 * openSettings('system');
 * ```
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onCancel, defaultTab = 'gemini' }) => {
  const [activeTab, setActiveTab] = useState<SettingTab>(defaultTab);
  const [isMobile, setIsMobile] = useState(false);
  const resizeTimerRef = useRef<number | undefined>(undefined);

  /**
   * Handle window resize and update mobile state
   */
  const handleResize = useCallback(() => {
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
  }, []);

  // Listen to window resize (with debounce)
  useEffect(() => {
    // Initialize mobile state
    handleResize();

    // Debounced resize handler
    const debouncedResize = () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(handleResize, RESIZE_DEBOUNCE_DELAY);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, [handleResize]);

  // Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  // Menu items configuration
  // WebUI option only shown on desktop to prevent unauthorized access
  const menuItems = useMemo((): Array<{ key: SettingTab; label: string; icon: React.ReactNode }> => {
    const items: Array<{ key: SettingTab; label: string; icon: React.ReactNode }> = [
      {
        key: 'gemini',
        label: 'Gemini',
        icon: <Gemini theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'model',
        label: 'Model',
        icon: <LinkCloud theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'tools',
        label: 'Tools',
        icon: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      },
    ];

    // Only add WebUI option on desktop (includes Assistant config)
    if (isDesktop) {
      items.push({
        key: 'webui',
        label: 'WebUI',
        icon: <Earth theme='outline' size='20' fill={iconColors.secondary} />,
      });
    }

    items.push(
      {
        key: 'system',
        label: 'System',
        icon: <Computer theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'about',
        label: 'About',
        icon: <Info theme='outline' size='20' fill={iconColors.secondary} />,
      }
    );

    return items;
  }, [isDesktop]);

  console.log('%c [  ]-211', 'font-size:13px; background:pink; color:#bf2c9f;', isDesktop, menuItems);

  // Render current selected settings content
  const renderContent = () => {
    switch (activeTab) {
      case 'gemini':
        return <GeminiModalContent onRequestClose={onCancel} />;
      case 'model':
        return <ModelModalContent />;
      case 'agent':
        return <AgentModalContent />;
      case 'tools':
        return <ToolsModalContent />;
      case 'webui':
        return <WebuiModalContent />;
      case 'system':
        return <SystemModalContent onRequestClose={onCancel} />;
      case 'about':
        return <AboutModalContent />;
      default:
        return null;
    }
  };

  /**
   * Switch tab
   * @param tab - Target tab
   */
  const handleTabChange = useCallback((tab: SettingTab) => {
    setActiveTab(tab);
  }, []);

  // Mobile menu (Tabs)
  const mobileMenu = (
    <div className='mt-16px mb-20px'>
      <Tabs activeTab={activeTab} onChange={handleTabChange} type='line' size='default' className='settings-mobile-tabs [&_.arco-tabs-nav]:border-b-0'>
        {menuItems.map((item) => (
          <Tabs.TabPane key={item.key} title={item.label} />
        ))}
      </Tabs>
    </div>
  );

  // Desktop menu (sidebar)
  const desktopMenu = (
    <AionScrollArea className='flex-shrink-0 b-color-border-2 scrollbar-hide' style={{ width: `${SIDEBAR_WIDTH}px` }}>
      <div className='flex flex-col gap-2px'>
        {menuItems.map((item) => (
          <div
            key={item.key}
            className={classNames('flex items-center px-14px py-10px rd-8px cursor-pointer transition-all duration-150 select-none', {
              'bg-aou-2 text-t-primary': activeTab === item.key,
              'text-t-secondary hover:bg-fill-1': activeTab !== item.key,
            })}
            onClick={() => setActiveTab(item.key)}
          >
            <span className='mr-12px text-16px line-height-[10px]'>{item.icon}</span>
            <span className='text-14px font-500 flex-1 lh-22px'>{item.label}</span>
          </div>
        ))}
      </div>
    </AionScrollArea>
  );

  return (
    <SettingsViewModeProvider value='modal'>
      <AionModal
        visible={visible}
        onCancel={onCancel}
        footer={null}
        className='settings-modal'
        style={{
          width: isMobile ? `clamp(var(--app-min-width, 360px), 100vw, ${MODAL_WIDTH.mobile}px)` : `clamp(var(--app-min-width, 360px), 100vw, ${MODAL_WIDTH.desktop}px)`,
          minWidth: 'var(--app-min-width, 360px)',
          maxHeight: isMobile ? MODAL_HEIGHT.mobile : undefined,
          borderRadius: '16px',
        }}
        contentStyle={{ padding: isMobile ? '16px' : '24px 24px 32px' }}
        title={'Settings'}
      >
        <div
          className={classNames('overflow-hidden gap-0', isMobile ? 'flex flex-col min-h-0' : 'flex mt-20px')}
          style={{
            height: isMobile ? MODAL_HEIGHT.mobileContent : `${MODAL_HEIGHT.desktop}px`,
          }}
        >
          {isMobile ? mobileMenu : desktopMenu}

          <AionScrollArea className={classNames('flex-1 min-h-0', isMobile ? 'overflow-y-auto' : 'flex flex-col pl-24px gap-16px')}>{renderContent()}</AionScrollArea>
        </div>
      </AionModal>
    </SettingsViewModeProvider>
  );
};

export default SettingsModal;
