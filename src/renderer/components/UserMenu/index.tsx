/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from '@/renderer/context/AuthContext';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import { getAvatarColor, getInitials } from '@/renderer/utils/avatar';
import { Dropdown, Menu, Tag, Tooltip } from '@arco-design/web-react';
import { Logout, Moon, People, Server, Sun, User } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface UserMenuProps {
  collapsed?: boolean;
}

const roleTagColor: Record<string, string> = {
  admin: 'arcoblue',
  user: 'green',
  viewer: 'gray',
};

const UserMenu: React.FC<UserMenuProps> = ({ collapsed = false }) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useThemeContext();
  const navigate = useNavigate();

  const initials = useMemo(() => getInitials(user?.displayName, user?.username), [user]);
  const avatarBg = useMemo(() => getAvatarColor(user?.id ?? 'default'), [user?.id]);

  // Desktop runtime has no user object
  if (!user) return null;

  const displayLabel = user.displayName || user.username;
  const isDark = theme === 'dark';

  const handleMenuClick = (key: string) => {
    switch (key) {
      case 'profile':
        void navigate('/profile');
        break;
      case 'admin-users':
        void navigate('/admin/users');
        break;
      case 'admin-models':
        void navigate('/admin/models');
        break;
      case 'theme':
        void setTheme(isDark ? 'light' : 'dark');
        break;
      case 'logout':
        void logout();
        break;
    }
  };

  const dropdownMenu = (
    <Menu onClickMenuItem={handleMenuClick} style={{ minWidth: 200, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      {/* User info header */}
      <div className='flex items-center gap-10px px-12px py-8px border-b border-gray-2 mb-4px'>
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={displayLabel} className='shrink-0 size-36px rd-full object-cover' />
        ) : (
          <div className='shrink-0 size-36px rd-full flex items-center justify-center text-white text-14px font-600' style={{ backgroundColor: avatarBg }}>
            {initials}
          </div>
        )}
        <div className='flex-1 min-w-0'>
          <div className='font-600 text-14px text-t-primary truncate'>{displayLabel}</div>
          {user.email && <div className='text-12px color-gray-5 truncate'>{user.email}</div>}
          <Tag size='small' color={roleTagColor[user.role || 'user']} className='mt-4px'>
            {user.role || 'user'}
          </Tag>
        </div>
      </div>

      <Menu.Item key='profile'>
        <div className='flex items-center gap-8px'>
          <User theme='outline' size='16' fill='currentColor' />
          <span>Profile</span>
        </div>
      </Menu.Item>

      {user.role === 'admin' && (
        <>
          <Menu.Item key='admin-users'>
            <div className='flex items-center gap-8px'>
              <People theme='outline' size='16' fill='currentColor' />
              <span>User Management</span>
            </div>
          </Menu.Item>
          <Menu.Item key='admin-models'>
            <div className='flex items-center gap-8px'>
              <Server theme='outline' size='16' fill='currentColor' />
              <span>Global Models</span>
            </div>
          </Menu.Item>
        </>
      )}

      <Menu.Item key='theme'>
        <div className='flex items-center gap-8px'>
          {isDark ? <Sun theme='outline' size='16' fill='currentColor' /> : <Moon theme='outline' size='16' fill='currentColor' />}
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </div>
      </Menu.Item>

      <hr className='my-4px border-0 border-t border-gray-2' />

      <Menu.Item key='logout'>
        <div className='flex items-center gap-8px color-red-6'>
          <Logout theme='outline' size='16' fill='currentColor' />
          <span>Sign Out</span>
        </div>
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown droplist={dropdownMenu} trigger='click' position='tr'>
      <Tooltip disabled={!collapsed} content={displayLabel} position='right'>
        <div className='flex items-center gap-10px px-12px py-8px hover:bg-hover rd-0.5rem cursor-pointer select-none'>
          {/* Avatar circle */}
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={displayLabel} className='shrink-0 size-24px rd-full object-cover' />
          ) : (
            <div className='shrink-0 size-24px rd-full flex items-center justify-center text-white text-11px font-600' style={{ backgroundColor: avatarBg }}>
              {initials}
            </div>
          )}
          {/* Name + role (hidden when collapsed) */}
          <div className='collapsed-hidden flex-1 min-w-0'>
            <div className='text-13px text-t-primary truncate leading-tight'>{displayLabel}</div>
          </div>
        </div>
      </Tooltip>
    </Dropdown>
  );
};

export default UserMenu;
