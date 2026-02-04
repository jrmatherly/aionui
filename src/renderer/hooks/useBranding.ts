/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrandingConfig } from '@/common/branding';
import { ipcBridge } from '@/common';
import { useEffect, useState } from 'react';

// Defaults for initial render (before IPC resolves)
const DEFAULTS: BrandingConfig = {
  brandName: 'AionUi',
  githubRepo: 'jrmatherly/aionui',
  websiteUrl: 'https://github.com/jrmatherly/aionui',
  contactUrl: 'https://github.com/jrmatherly',
  feedbackUrl: 'https://github.com/jrmatherly/aionui/discussions',
  github: {
    repo: 'https://github.com/jrmatherly/aionui',
    wiki: 'https://github.com/jrmatherly/aionui/wiki',
    releases: 'https://github.com/jrmatherly/aionui/releases',
    issues: 'https://github.com/jrmatherly/aionui/issues',
  },
  docs: {
    index: 'https://github.com/jrmatherly/aionui/wiki',
    llmConfig: 'https://github.com/jrmatherly/aionui/wiki/LLM-Configuration',
    imageGeneration: 'https://github.com/jrmatherly/aionui/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide',
    remoteAccess: 'https://github.com/jrmatherly/aionui/wiki/Remote-Internet-Access-Guide',
  },
  features: {
    allowClaudeYolo: false,
  },
};

export function useBranding(): BrandingConfig {
  const [config, setConfig] = useState<BrandingConfig>(DEFAULTS);

  useEffect(() => {
    ipcBridge.branding.getConfig
      .invoke()
      .then((cfg) => {
        if (cfg) setConfig(cfg);
      })
      .catch(() => {}); // Use defaults on error
  }, []);

  return config;
}
