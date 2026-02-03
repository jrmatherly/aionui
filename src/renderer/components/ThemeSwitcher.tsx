/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionSelect from '@/renderer/components/base/AionSelect';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Theme switcher component
 *
 * Provides light/dark mode switching functionality
 */
export const ThemeSwitcher = () => {
  const { theme, setTheme } = useThemeContext();
  const { t } = useTranslation();

  return (
    <div className='flex items-center gap-8px'>
      {/* Light/Dark mode selector */}
      <AionSelect value={theme} onChange={setTheme} className='w-160px'>
        <AionSelect.Option value='light'>{t('settings.lightMode')}</AionSelect.Option>
        <AionSelect.Option value='dark'>{t('settings.darkMode')}</AionSelect.Option>
      </AionSelect>
    </div>
  );
};
