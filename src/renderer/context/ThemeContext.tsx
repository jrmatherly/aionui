/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// context/ThemeContext.tsx - Unified Theme Management Context
import type { PropsWithChildren } from 'react';
import React, { createContext, useContext } from 'react';
import type { ColorScheme } from '../hooks/useColorScheme';
import useColorScheme from '../hooks/useColorScheme';
import useFontScale from '../hooks/useFontScale';
import type { Theme } from '../hooks/useTheme';
import useTheme from '../hooks/useTheme';

/**
 * Theme context value interface
 * Separates light/dark mode from color schemes
 */
interface ThemeContextValue {
  // Light/Dark mode
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;

  // Color scheme
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;

  // Font scaling
  fontScale: number;
  setFontScale: (scale: number) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theme provider component
 * Manages both light/dark mode and color schemes
 */
export const ThemeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [theme, setTheme] = useTheme();
  const [colorScheme, setColorScheme] = useColorScheme();
  const [fontScale, setFontScale] = useFontScale();

  return <ThemeContext.Provider value={{ theme, setTheme, colorScheme, setColorScheme, fontScale, setFontScale }}>{children}</ThemeContext.Provider>;
};

/**
 * Hook to access theme context
 * @throws {Error} If used outside of ThemeProvider
 */
export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
};
