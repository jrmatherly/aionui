/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Timeline utility functions for conversation history grouping
 */

import type { TChatConversation } from '@/common/storage';

/**
 * Calculate the difference in days between two timestamps
 */
export const diffDay = (time1: number, time2: number): number => {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  const ymd1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const ymd2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  const diff = Math.abs(ymd2.getTime() - ymd1.getTime());
  return diff / (1000 * 60 * 60 * 24);
};

/**
 * Get the activity time (most recent) from a conversation
 */
export const getActivityTime = (conversation: TChatConversation): number => {
  return conversation.modifyTime || conversation.createTime || 0;
};

/**
 * Get the timeline label for a given timestamp
 *
 * @param time - The timestamp to check
 * @param currentTime - The current timestamp (usually Date.now())
 * @returns Timeline label string ('Today', 'Yesterday', 'Last 7 Days', or 'Earlier')
 */
export const getTimelineLabel = (time: number, currentTime: number): string => {
  const daysDiff = diffDay(currentTime, time);

  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Yesterday';
  if (daysDiff < 7) return 'Last 7 Days';
  return 'Earlier';
};

/**
 * Create a timeline group function that deduplicates consecutive same-label items
 *
 * @returns A function that returns the timeline label or empty string if same as previous
 */
export const createTimelineGrouper = () => {
  const current = Date.now();
  let prevTime: number;

  const format = (time: number) => {
    if (diffDay(current, time) === 0) return 'Today';
    if (diffDay(current, time) === 1) return 'Yesterday';
    if (diffDay(current, time) < 7) return 'Last 7 Days';
    return 'Earlier';
  };

  return (conversation: TChatConversation) => {
    const time = getActivityTime(conversation);
    const formatStr = format(time);
    const prevFormatStr = prevTime !== undefined ? format(prevTime) : undefined;
    prevTime = time;
    // Only return label if different from previous (for grouping headers)
    return formatStr !== prevFormatStr ? formatStr : '';
  };
};
