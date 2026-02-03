/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProtocolDetectionResponse, ProtocolType } from '@/common/utils/protocolDetector';
import { Loading } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Protocol Detection Status Component
 *
 * Display protocol detection status, result, and suggestions
 */
interface ProtocolDetectionStatusProps {
  /** Whether detecting */
  isDetecting: boolean;
  /** Detection result */
  result: ProtocolDetectionResponse | null;
  /** Currently selected platform */
  currentPlatform?: string;
  /** Switch platform callback */
  onSwitchPlatform?: (platform: string) => void;
}

/**
 * Protocol icon configurations
 */
const PROTOCOL_ICONS: Record<ProtocolType, { color: string; bgColor: string }> = {
  openai: { color: '#10A37F', bgColor: 'rgba(16, 163, 127, 0.1)' },
  gemini: { color: '#4285F4', bgColor: 'rgba(66, 133, 244, 0.1)' },
  anthropic: { color: '#D97757', bgColor: 'rgba(217, 119, 87, 0.1)' },
  unknown: { color: '#9CA3AF', bgColor: 'rgba(156, 163, 175, 0.1)' },
};

/**
 * Get translated suggestion message
 */
const getSuggestionMessage = (suggestion: ProtocolDetectionResponse['suggestion'], t: (key: string, params?: Record<string, string>) => string): string => {
  if (!suggestion) return '';

  // Prefer using i18n key for translation
  if (suggestion.i18nKey) {
    const translated = t(suggestion.i18nKey, suggestion.i18nParams);
    // If translation result equals key, translation failed, fallback to message
    if (translated !== suggestion.i18nKey) {
      return translated;
    }
  }

  // Fallback to original message
  return suggestion.message;
};

const ProtocolDetectionStatus: React.FC<ProtocolDetectionStatusProps> = ({ isDetecting, result, currentPlatform, onSwitchPlatform }) => {
  const { t } = useTranslation();

  // Detecting in progress
  if (isDetecting) {
    return (
      <div className='flex items-center gap-6px text-12px text-t-secondary py-4px'>
        <Loading theme='outline' size={14} className='animate-spin' />
        <span>{t('settings.protocolDetecting')}</span>
      </div>
    );
  }

  // No detection result
  if (!result) {
    return null;
  }

  const { protocol, success, suggestion, multiKeyResult } = result;
  const iconConfig = PROTOCOL_ICONS[protocol] || PROTOCOL_ICONS.unknown;

  // Detection successful
  if (success && suggestion) {
    const showSwitchButton = suggestion.type === 'switch_platform' && suggestion.suggestedPlatform && suggestion.suggestedPlatform !== currentPlatform;

    return (
      <div className='flex flex-col gap-4px py-4px'>
        <div className='flex items-start gap-8px text-12px'>
          <div className='flex items-center gap-6px flex-1 min-w-0'>
            <div
              className='flex items-center justify-center w-16px h-16px rounded-4px shrink-0'
              style={{
                backgroundColor: iconConfig.bgColor,
              }}
            >
              <span
                className='text-10px font-medium'
                style={{
                  color: iconConfig.color,
                }}
              >
                {protocol === 'openai' ? 'O' : protocol === 'gemini' ? 'G' : protocol === 'anthropic' ? 'A' : '?'}
              </span>
            </div>
            <span className='text-t-secondary truncate'>{getSuggestionMessage(suggestion, t)}</span>
          </div>

          {showSwitchButton && onSwitchPlatform && (
            <button
              type='button'
              className='shrink-0 px-8px py-2px rounded-4px text-11px font-medium transition-colors'
              style={{
                backgroundColor: iconConfig.bgColor,
                color: iconConfig.color,
              }}
              onClick={() => onSwitchPlatform(suggestion.suggestedPlatform!)}
            >
              {t('settings.switchPlatform')}
            </button>
          )}
        </div>

        {/* Multi-key test result */}
        {multiKeyResult && multiKeyResult.total > 1 && (
          <div className='flex items-center gap-6px text-11px text-t-tertiary pl-22px'>
            <span>{multiKeyResult.invalid === 0 ? t('settings.multiKeyAllValid', { total: String(multiKeyResult.total) }) : multiKeyResult.valid === 0 ? t('settings.multiKeyAllInvalid', { total: String(multiKeyResult.total) }) : t('settings.multiKeyPartialValid', { valid: String(multiKeyResult.valid), invalid: String(multiKeyResult.invalid) })}</span>
          </div>
        )}
      </div>
    );
  }

  // Detection failed
  if (!success && result.error) {
    return (
      <div className='flex items-center gap-6px text-12px text-warning py-4px'>
        <div className='flex items-center justify-center w-16px h-16px rounded-4px bg-warning/10 shrink-0'>
          <span className='text-10px font-medium'>!</span>
        </div>
        <span className='truncate'>{suggestion ? getSuggestionMessage(suggestion, t) : result.error}</span>
      </div>
    );
  }

  return null;
};

export default ProtocolDetectionStatus;
