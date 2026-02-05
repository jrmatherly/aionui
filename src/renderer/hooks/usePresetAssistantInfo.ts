/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import type { TChatConversation } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import CoworkLogo from '@/renderer/assets/cowork.svg';
import { useMemo } from 'react';
import useSWR from 'swr';

export interface PresetAssistantInfo {
  name: string;
  logo: string;
  isEmoji: boolean;
}

/**
 * Resolve preset assistant ID from conversation extra
 *
 * Handles backward compatibility:
 * - presetAssistantId: new format 'builtin-xxx'
 * - customAgentId: old format for ACP conversations
 * - enabledSkills: old format for Gemini Cowork conversations
 */
function resolvePresetId(conversation: TChatConversation): string | null {
  const extra = conversation.extra as {
    presetAssistantId?: string;
    customAgentId?: string;
    enabledSkills?: string[];
  };

  // Priority: use presetAssistantId (new conversations)
  if (extra?.presetAssistantId && extra.presetAssistantId.trim()) {
    const resolved = extra.presetAssistantId.replace('builtin-', '');
    return resolved;
  }

  // Backward compatible: customAgentId (ACP/Codex old conversations)
  if (extra?.customAgentId && extra.customAgentId.trim()) {
    const resolved = extra.customAgentId.replace('builtin-', '');
    return resolved;
  }

  // Backward compatible: enabledSkills means Cowork conversation (Gemini old conversations)
  // Only use this logic when both presetAssistantId and customAgentId are absent (including empty strings)
  if (conversation.type === 'gemini' && !extra?.presetAssistantId?.trim() && !extra?.customAgentId?.trim() && extra?.enabledSkills && extra.enabledSkills.length > 0) {
    return 'cowork';
  }

  return null;
}

/**
 * Build assistant info from preset (English-only)
 */
function buildPresetInfo(presetId: string): PresetAssistantInfo | null {
  const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;

  const name = preset.nameI18n['en-US'] || preset.id;

  // avatar can be emoji or svg filename
  const isEmoji = !preset.avatar.endsWith('.svg');
  let logo: string;

  if (isEmoji) {
    logo = preset.avatar;
  } else if (preset.id === 'cowork') {
    logo = CoworkLogo;
  } else {
    // Other svg need dynamic import, use emoji fallback for now
    logo = '🤖';
  }

  return { name, logo, isEmoji };
}

/**
 * Hook to get preset assistant info from conversation
 *
 * @param conversation - Conversation object
 * @returns Preset assistant info or null
 */
export function usePresetAssistantInfo(conversation: TChatConversation | undefined): PresetAssistantInfo | null {
  // Fetch custom agents to support custom preset assistants
  const { data: customAgents } = useSWR('acp.customAgents', () => ConfigStorage.get('acp.customAgents'));

  return useMemo(() => {
    if (!conversation) return null;

    const presetId = resolvePresetId(conversation);
    if (!presetId) return null;

    // First try to find in built-in presets
    const builtinInfo = buildPresetInfo(presetId);
    if (builtinInfo) {
      return builtinInfo;
    }

    // If not found in built-in presets, try to find in custom agents
    if (customAgents && Array.isArray(customAgents)) {
      const customAgent = customAgents.find((agent) => agent.id === presetId || agent.id === `builtin-${presetId}`);
      if (customAgent) {
        // Handle avatar: could be emoji or svg filename
        let logo = customAgent.avatar || '🤖';
        let isEmoji = true;

        if (customAgent.avatar) {
          if (customAgent.avatar.endsWith('.svg')) {
            isEmoji = false;
            // For cowork.svg, use the imported logo; for others, use emoji fallback
            if (customAgent.avatar === 'cowork.svg') {
              logo = CoworkLogo;
            } else {
              // Other svgs not yet supported, fallback to emoji
              logo = '🤖';
              isEmoji = true;
            }
          } else {
            // It's an emoji
            logo = customAgent.avatar;
          }
        }

        return {
          name: customAgent.nameI18n?.['en-US'] || customAgent.name || presetId,
          logo,
          isEmoji,
        };
      }
    }

    return null;
  }, [conversation, customAgents]);
}
