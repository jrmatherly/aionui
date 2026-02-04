/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message Avatar Context
 *
 * Provides avatar information for rendering in chat messages.
 * Purely frontend - no impact on LLM tokens/context.
 */

import React, { createContext, useContext } from 'react';

export interface MessageAvatarInfo {
  /** User's avatar URL (from OIDC profile) */
  userAvatarUrl?: string;
  /** User's display name for fallback initials */
  userDisplayName?: string;
  /** Agent/bot avatar (emoji or image URL) */
  agentAvatar?: string;
  /** Whether agent avatar is an emoji (vs image) */
  agentAvatarIsEmoji?: boolean;
  /** Agent name for alt text */
  agentName?: string;
}

const MessageAvatarContext = createContext<MessageAvatarInfo>({});

export const MessageAvatarProvider: React.FC<{
  children: React.ReactNode;
  value: MessageAvatarInfo;
}> = ({ children, value }) => {
  return <MessageAvatarContext.Provider value={value}>{children}</MessageAvatarContext.Provider>;
};

export const useMessageAvatars = (): MessageAvatarInfo => {
  return useContext(MessageAvatarContext);
};

/**
 * Get initials from a display name
 * "Jason Matherly" → "JM"
 * "admin" → "A"
 */
export function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
