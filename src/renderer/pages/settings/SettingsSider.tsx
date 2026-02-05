import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { createLogger } from '@/renderer/utils/logger';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Tooltip } from '@arco-design/web-react';
import { Computer, Earth, Gemini, Info, Key, LinkCloud, Robot, System, Toolkit } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const log = createLogger('SettingsSider');

const SettingsSider: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  const menus = useMemo(() => {
    const items = [
      {
        label: 'Gemini',
        icon: <Gemini />,
        path: 'gemini',
      },
      {
        label: 'Model',
        icon: <LinkCloud />,
        path: 'model',
      },
      {
        label: 'Assistants',
        icon: <Robot />,
        path: 'agent',
      },
      {
        label: 'Tools',
        icon: <Toolkit />,
        path: 'tools',
      },
      {
        label: 'Display',
        icon: <Computer />,
        path: 'display',
      },
      {
        label: 'API Keys',
        icon: <Key />,
        path: 'apikeys',
      },
    ];

    // Only add WebUI option on desktop (includes Assistant config)
    if (isDesktop) {
      items.push({
        label: 'WebUI',
        icon: <Earth />,
        path: 'webui',
      });
    }

    items.push(
      {
        label: 'System',
        icon: <System />,
        path: 'system',
      },
      {
        label: 'About',
        icon: <Info />,
        path: 'about',
      }
    );

    return items;
  }, [isDesktop]);
  return (
    <div className={classNames('flex-1 settings-sider flex flex-col gap-2px', { 'settings-sider--collapsed': collapsed })}>
      {menus.map((item) => {
        const isSelected = pathname.includes(item.path);
        return (
          <Tooltip key={item.path} disabled={!collapsed} content={item.label} position='right'>
            <div
              className={classNames('settings-sider__item hover:bg-aou-1 px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px', {
                '!bg-aou-2 ': isSelected,
              })}
              onClick={() => {
                Promise.resolve(navigate(`/settings/${item.path}`, { replace: true })).catch((error) => {
                  log.error({ err: error, path: item.path }, 'Navigation failed');
                });
              }}
            >
              {React.cloneElement(item.icon, {
                theme: 'outline',
                size: '20',
                className: 'mt-2px ml-2px mr-8px flex',
              })}
              <FlexFullContainer className='h-24px'>
                <div className='settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px lh-24px whitespace-nowrap text-t-primary'>{item.label}</div>
              </FlexFullContainer>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default SettingsSider;
