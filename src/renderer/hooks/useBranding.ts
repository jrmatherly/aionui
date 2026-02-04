/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrandingConfig } from '@/common/branding';
import { ipcBridge } from '@/common';
import { isWebMode } from '@/renderer/utils/platform';
import { useEffect, useState } from 'react';

// Defaults for initial render (before IPC/API resolves)
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
    allowGeminiYolo: false,
  },
};

/**
 * Fetch branding config from REST API (web mode) or IPC (Electron mode).
 *
 * In web mode, we use the /api/branding endpoint which reads env vars directly
 * from the server process. This is more reliable than WebSocket IPC since it
 * doesn't require an authenticated WebSocket connection.
 */
export function useBranding(): BrandingConfig {
  const [config, setConfig] = useState<BrandingConfig>(DEFAULTS);

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        if (isWebMode()) {
          // Web mode: use REST API (works without auth, before WebSocket is established)
          const response = await fetch('/api/branding');
          if (response.ok) {
            const data = await response.json();
            setConfig(data);
            return;
          }
        }
        // Electron mode or REST API failed: use IPC bridge
        const cfg = await ipcBridge.branding.getConfig.invoke();
        if (cfg) setConfig(cfg);
      } catch {
        // Use defaults on error
      }
    };

    void fetchBranding();
  }, []);

  return config;
}
