/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// hooks/useColorScheme.ts - Color Scheme Management Hook
import { ConfigStorage } from '@/common/storage';
import { useCallback, useEffect, useState } from 'react';

// Supported color schemes
export type ColorScheme = 'default';

const DEFAULT_COLOR_SCHEME: ColorScheme = 'default';

/**
 * Initialize color scheme immediately when module loads
 * to avoid page flicker
 */
const initColorScheme = async () => {
  try {
    const scheme = (await ConfigStorage.get('colorScheme')) as ColorScheme;
    const initialScheme = scheme || DEFAULT_COLOR_SCHEME;
    document.documentElement.setAttribute('data-color-scheme', initialScheme);
    return initialScheme;
  } catch (error) {
    console.error('Failed to load initial color scheme:', error);
    document.documentElement.setAttribute('data-color-scheme', DEFAULT_COLOR_SCHEME);
    return DEFAULT_COLOR_SCHEME;
  }
};

// Run color scheme initialization immediately
let initialColorSchemePromise: Promise<ColorScheme> | null = null;
if (typeof window !== 'undefined') {
  initialColorSchemePromise = initColorScheme();
}

/**
 * Color scheme management hook
 * @returns [colorScheme, setColorScheme] - Current color scheme and setter function
 */
const useColorScheme = (): [ColorScheme, (scheme: ColorScheme) => Promise<void>] => {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(DEFAULT_COLOR_SCHEME);

  /**
   * Apply color scheme to DOM
   * Switch CSS variables by setting data-color-scheme attribute
   */
  const applyColorScheme = useCallback((newScheme: ColorScheme) => {
    document.documentElement.setAttribute('data-color-scheme', newScheme);
  }, []);

  /**
   * Set color scheme with persistence
   * Updates state, DOM attribute and local storage
   */
  const setColorScheme = useCallback(
    async (newScheme: ColorScheme) => {
      try {
        setColorSchemeState(newScheme);
        applyColorScheme(newScheme);
        await ConfigStorage.set('colorScheme', newScheme);
      } catch (error) {
        console.error('Failed to save color scheme:', error);
        // Revert on error
        setColorSchemeState(colorScheme);
        applyColorScheme(colorScheme);
      }
    },
    [colorScheme, applyColorScheme]
  );

  /**
   * Initialize color scheme state from early initialization
   * Ensures correct value is obtained when component mounts
   */
  useEffect(() => {
    if (initialColorSchemePromise) {
      initialColorSchemePromise
        .then((initialScheme) => {
          setColorSchemeState(initialScheme);
        })
        .catch((error) => {
          console.error('Failed to initialize color scheme:', error);
        });
    }
  }, []);

  return [colorScheme, setColorScheme];
};

export default useColorScheme;
