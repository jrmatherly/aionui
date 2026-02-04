/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

import { userApiKeys } from '@/common/ipcBridge';
import { getUserApiKeyService, PROVIDER_ENV_MAP } from '@/common/UserApiKeyService';

export function initUserApiKeysBridge(): void {
  userApiKeys.set.provider(async ({ provider, apiKey, __webUiUserId }: { provider: string; apiKey: string; __webUiUserId?: string }) => {
    if (!__webUiUserId) throw new Error('Authentication required');
    if (!PROVIDER_ENV_MAP[provider]) throw new Error(`Unknown provider: ${provider}`);

    const service = getUserApiKeyService();
    service.setKey(__webUiUserId, provider, apiKey);
  });

  userApiKeys.get.provider(async ({ __webUiUserId }: { __webUiUserId?: string }) => {
    if (!__webUiUserId) throw new Error('Authentication required');

    const service = getUserApiKeyService();
    return service.getKeys(__webUiUserId);
  });

  userApiKeys.delete.provider(async ({ provider, __webUiUserId }: { provider: string; __webUiUserId?: string }) => {
    if (!__webUiUserId) throw new Error('Authentication required');

    const service = getUserApiKeyService();
    return service.deleteKey(__webUiUserId, provider);
  });
}
