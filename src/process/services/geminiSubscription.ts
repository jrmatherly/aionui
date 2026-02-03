/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UserTierId } from '@office-ai/aioncli-core';
import { getOauthInfoWithCache } from '@office-ai/aioncli-core';

export interface GeminiSubscriptionStatus {
  isSubscriber: boolean;
  tier?: UserTierId | 'unknown';
  lastChecked: number;
  message?: string;
}

// Use short-term cache to avoid frequent CLI OAuth calls
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

type CacheEntry = {
  status: GeminiSubscriptionStatus;
  expiresAt: number;
};

// statusCache: stores subscription status per proxy; pendingRequests: deduplicates concurrent requests
const statusCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<GeminiSubscriptionStatus>>();

// Check subscription status without triggering login flow.
// Note: Since setupUser requires interactive OAuth client, we can only check for valid cached credentials.
// For complete subscription status check, users need to login through the settings page first.
async function fetchSubscriptionStatus(proxy?: string): Promise<GeminiSubscriptionStatus> {
  try {
    // Only use cached credentials, do not trigger login flow
    const oauthInfo = await getOauthInfoWithCache(proxy);

    if (!oauthInfo) {
      // No valid cached credentials, return unknown status
      return {
        isSubscriber: false,
        tier: 'unknown',
        lastChecked: Date.now(),
        message: 'No valid cached credentials',
      };
    }

    // Has valid credentials, but we can't check actual subscription without triggering login
    // For now, assume users with valid credentials are standard users (can be set properly during login)
    return {
      isSubscriber: false,
      tier: 'unknown',
      lastChecked: Date.now(),
    };
  } catch (error) {
    return {
      isSubscriber: false,
      tier: 'unknown',
      lastChecked: Date.now(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// Public helper: automatically reuses cache and deduplicates concurrent requests
export async function getGeminiSubscriptionStatus(proxy?: string): Promise<GeminiSubscriptionStatus> {
  const cacheKey = proxy || 'default';
  const cached = statusCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.status;
  }

  if (pendingRequests.has(cacheKey)) {
    return await pendingRequests.get(cacheKey)!;
  }

  const request = fetchSubscriptionStatus(proxy)
    .then((status) => {
      statusCache.set(cacheKey, {
        status,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return status;
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, request);
  return await request;
}
