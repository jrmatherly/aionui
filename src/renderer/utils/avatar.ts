/**
 * @author Jason Matherly
 * @modified 2026-02-03
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Avatar utility functions
 * Shared helpers for displaying user avatars
 */

/**
 * Extract initials from display name or username (max 2 chars).
 */
export function getInitials(displayName?: string, username?: string): string {
  const name = displayName || username || '?';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Pick a deterministic colour from the user ID for the avatar background.
 */
export function getAvatarColor(id: string): string {
  const colours = ['#3370ff', '#0fc6c2', '#ff7d00', '#f53f3f', '#722ed1', '#eb2f96', '#00b42a', '#fadb14'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return colours[Math.abs(hash) % colours.length];
}
