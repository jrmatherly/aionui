/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage, type ICssTheme } from '@/common/storage';
import { uuid } from '@/common/utils';
import { Button, Message, Modal } from '@arco-design/web-react';
import { CheckOne, EditTwo, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import CssThemeModal from './CssThemeModal';
import { BACKGROUND_BLOCK_START, injectBackgroundCssBlock } from './backgroundUtils';
import { DEFAULT_THEME_ID, PRESET_THEMES } from './presets';

const ensureBackgroundCss = <T extends { id?: string; cover?: string; css: string }>(theme: T): T => {
  // Skip Default theme, do not inject background CSS
  if (theme.id === DEFAULT_THEME_ID) {
    return theme;
  }
  if (theme.cover && theme.css && !theme.css.includes(BACKGROUND_BLOCK_START)) {
    return { ...theme, css: injectBackgroundCssBlock(theme.css, theme.cover) };
  }
  return theme;
};

const normalizeUserThemes = (themes: ICssTheme[]): { normalized: ICssTheme[]; updated: boolean } => {
  let updated = false;
  const normalized = themes.map((theme) => {
    const nextTheme = ensureBackgroundCss(theme);
    if (nextTheme !== theme) {
      updated = true;
    }
    return nextTheme;
  });
  return { normalized, updated };
};

/**
 * CSS Theme Settings Component
 * For managing and switching CSS skin themes
 */
const CssThemeSettings: React.FC = () => {
  const [themes, setThemes] = useState<ICssTheme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ICssTheme | null>(null);
  const [hoveredThemeId, setHoveredThemeId] = useState<string | null>(null);

  // Load theme list and active state
  useEffect(() => {
    const loadThemes = async () => {
      try {
        const savedThemes = (await ConfigStorage.get('css.themes')) || [];
        const { normalized, updated } = normalizeUserThemes(savedThemes);
        const activeId = await ConfigStorage.get('css.activeThemeId');

        if (updated) {
          await ConfigStorage.set(
            'css.themes',
            normalized.filter((t) => !t.isPreset)
          );
        }

        // Apply background CSS processing to preset themes as well
        const normalizedPresets = PRESET_THEMES.map((theme) => ensureBackgroundCss(theme));

        // Merge preset themes with user themes
        const allThemes = [...normalizedPresets, ...normalized.filter((t) => !t.isPreset)];

        setThemes(allThemes);
        // Default to default-theme if no saved theme ID
        setActiveThemeId(activeId || DEFAULT_THEME_ID);
      } catch (error) {
        console.error('Failed to load CSS themes:', error);
      }
    };
    void loadThemes();
  }, []);

  /**
   * Apply theme CSS
   */
  const applyThemeCss = useCallback((css: string) => {
    // Update customCss storage and dispatch event
    void ConfigStorage.set('customCss', css).catch((err) => {
      console.error('Failed to save custom CSS:', err);
    });
    window.dispatchEvent(
      new CustomEvent('custom-css-updated', {
        detail: { customCss: css },
      })
    );
  }, []);

  /**
   * Select theme
   */
  const handleSelectTheme = useCallback(
    async (theme: ICssTheme) => {
      try {
        setActiveThemeId(theme.id);
        await ConfigStorage.set('css.activeThemeId', theme.id);
        applyThemeCss(theme.css);
        Message.success(`Applied theme: ${theme.name}`);
      } catch (error) {
        console.error('Failed to apply theme:', error);
        Message.error('Failed to apply theme');
      }
    },
    [applyThemeCss]
  );

  /**
   * Open add theme modal
   */
  const handleAddTheme = useCallback(() => {
    setEditingTheme(null);
    setModalVisible(true);
  }, []);

  /**
   * Open edit theme modal
   */
  const handleEditTheme = useCallback((theme: ICssTheme, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTheme(theme);
    setModalVisible(true);
  }, []);

  /**
   * Save theme
   */
  const handleSaveTheme = useCallback(
    async (themeData: Omit<ICssTheme, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => {
      try {
        const now = Date.now();
        let updatedThemes: ICssTheme[];
        const normalizedThemeData = ensureBackgroundCss(themeData);

        if (editingTheme && !editingTheme.isPreset) {
          // Update existing user theme
          updatedThemes = themes.map((t) => (t.id === editingTheme.id ? { ...t, ...normalizedThemeData, updatedAt: now } : t));
        } else {
          // Add new theme (including copy from preset)
          const newTheme: ICssTheme = {
            id: uuid(),
            ...normalizedThemeData,
            isPreset: false,
            createdAt: now,
            updatedAt: now,
          };
          updatedThemes = [...themes, newTheme];
        }

        // Only save user themes
        const userThemes = updatedThemes.filter((t) => !t.isPreset);
        await ConfigStorage.set('css.themes', userThemes);

        setThemes(updatedThemes);
        setModalVisible(false);
        setEditingTheme(null);
        Message.success('Saved successfully');
      } catch (error) {
        console.error('Failed to save theme:', error);
        Message.error('Failed to save');
      }
    },
    [editingTheme, themes]
  );

  /**
   * Delete theme
   */
  const handleDeleteTheme = useCallback(
    (themeId: string) => {
      Modal.confirm({
        title: 'Confirm Delete',
        content: 'Are you sure you want to delete this theme? This action cannot be undone.',
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            const updatedThemes = themes.filter((t) => t.id !== themeId);
            const userThemes = updatedThemes.filter((t) => !t.isPreset);
            await ConfigStorage.set('css.themes', userThemes);

            // If deleting active theme, clear active state
            if (activeThemeId === themeId) {
              await ConfigStorage.set('css.activeThemeId', '');
              setActiveThemeId('');
              applyThemeCss('');
            }

            setThemes(updatedThemes);
            setModalVisible(false);
            setEditingTheme(null);
            Message.success('Deleted successfully');
          } catch (error) {
            console.error('Failed to delete theme:', error);
            Message.error('Failed to delete');
          }
        },
      });
    },
    [themes, activeThemeId, applyThemeCss]
  );

  return (
    <div className='space-y-16px'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <span className='text-14px text-t-secondary'>{'Select preset theme or custom CSS'}</span>
        <Button type='outline' size='small' className='rd-20px' icon={<Plus theme='outline' size='14' />} onClick={handleAddTheme}>
          {'Add Manually'}
        </Button>
      </div>

      {/* Theme card list */}
      <div className='flex flex-wrap gap-10px'>
        {themes.map((theme) => (
          <div key={theme.id} className={`relative cursor-pointer rounded-12px overflow-hidden border-2 transition-all duration-200 w-180px h-112px ${activeThemeId === theme.id ? 'border-[var(--color-primary)]' : 'border-transparent hover:border-border-2'}`} style={theme.cover ? { backgroundImage: `url(${theme.cover})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: 'var(--fill-1)' } : { backgroundColor: 'var(--fill-1)' }} onClick={() => handleSelectTheme(theme)} onMouseEnter={() => setHoveredThemeId(theme.id)} onMouseLeave={() => setHoveredThemeId(null)}>
            {/* Show name placeholder when no cover */}
            {!theme.cover && (
              <div className='absolute inset-0 flex items-center justify-center'>
                <span className='text-t-secondary text-14px'>{theme.name}</span>
              </div>
            )}

            {/* Bottom gradient overlay with name and edit button */}
            <div className='absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between p-8px'>
              <span className='text-13px text-white truncate flex-1'>{theme.name}</span>
              {/* Edit button */}
              {hoveredThemeId === theme.id && (
                <div className='p-4px rounded-6px bg-white/20 cursor-pointer hover:bg-white/40 transition-colors ml-8px' onClick={(e) => handleEditTheme(theme, e)}>
                  <EditTwo theme='outline' size='16' fill='#fff' />
                </div>
              )}
            </div>

            {/* Selected indicator */}
            {activeThemeId === theme.id && (
              <div className='absolute top-8px right-8px'>
                <CheckOne theme='filled' size='20' fill='var(--color-primary)' />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Theme edit modal */}
      <CssThemeModal
        visible={modalVisible}
        theme={editingTheme}
        onClose={() => {
          setModalVisible(false);
          setEditingTheme(null);
        }}
        onSave={handleSaveTheme}
        onDelete={editingTheme && !editingTheme.isPreset ? () => handleDeleteTheme(editingTheme.id) : undefined}
      />
    </div>
  );
};

export default CssThemeSettings;
