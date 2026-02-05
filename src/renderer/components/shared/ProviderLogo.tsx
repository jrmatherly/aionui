/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared provider logo components for model platform UI.
 * Single source of truth — used by settings, admin, and any future provider displays.
 */

import { MODEL_PLATFORMS, type PlatformConfig } from '@/renderer/config/modelPlatforms';
import { LinkCloud } from '@icon-park/react';
import React from 'react';

/**
 * Displays a provider logo image with a fallback icon.
 */
export const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 20 }) => {
  if (logo) {
    return <img src={logo} alt={name} className='object-contain shrink-0' style={{ width: size, height: size }} />;
  }
  return <LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />;
};

/**
 * Renders a platform option row with logo + name (for Select dropdowns).
 */
export const renderPlatformOption = (platform: PlatformConfig, logoSize = 18) => {
  return (
    <div className='flex items-center gap-8px'>
      <ProviderLogo logo={platform.logo} name={platform.name} size={logoSize} />
      <span>{platform.name}</span>
    </div>
  );
};

/**
 * Resolve a provider logo by name, baseUrl, or platform type.
 * Searches MODEL_PLATFORMS — no separate config needed.
 *
 * Priority: platform match → exact name → case-insensitive name → URL domain match
 */
export const getProviderLogo = (name?: string, baseUrl?: string, platform?: string): string | null => {
  if (!name && !baseUrl && !platform) return null;

  // Match by platform type (Gemini series, etc.)
  if (platform) {
    const byPlatform = MODEL_PLATFORMS.find((p) => p.platform === platform);
    if (byPlatform?.logo) return byPlatform.logo;
  }

  // Match by exact value or name
  if (name) {
    const byValue = MODEL_PLATFORMS.find((p) => p.value === name || p.name === name);
    if (byValue?.logo) return byValue.logo;

    // Case-insensitive fallback
    const byNameLower = MODEL_PLATFORMS.find((p) => p.name.toLowerCase() === name.toLowerCase() || p.value.toLowerCase() === name.toLowerCase());
    if (byNameLower?.logo) return byNameLower.logo;
  }

  // Match by URL domain
  if (baseUrl) {
    const byUrl = MODEL_PLATFORMS.find((p) => {
      if (!p.baseUrl) return false;
      const configDomain = p.baseUrl.replace('https://', '').replace('http://', '').split('/')[0];
      return baseUrl.includes(configDomain);
    });
    if (byUrl?.logo) return byUrl.logo;
  }

  return null;
};

export default ProviderLogo;
