/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionSelect from '@/renderer/components/base/AionSelect';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import React from 'react';
/**
 * Theme switcher component
 *
 * Provides light/dark mode switching functionality
 */
export const ThemeSwitcher = () => {
  const { theme, setTheme } = useThemeContext();
  return (
    <div className='flex items-center gap-8px'>
      {/* Light/Dark mode selector */}
      <AionSelect value={theme} onChange={setTheme} className='w-160px'>
        <AionSelect.Option value='light'>{'Light'}</AionSelect.Option>
        <AionSelect.Option value='dark'>{'Dark'}</AionSelect.Option>
      </AionSelect>
    </div>
  );
};
