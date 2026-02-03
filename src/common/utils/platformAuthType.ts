/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';

/**
 * Get the corresponding authentication type based on platform name
 * @param platform Platform name
 * @returns Corresponding AuthType
 */
export function getAuthTypeFromPlatform(platform: string): AuthType {
  const platformLower = platform?.toLowerCase() || '';

  // Gemini related platforms
  if (platformLower.includes('gemini-with-google-auth')) {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (platformLower.includes('gemini-vertex-ai') || platformLower.includes('vertex-ai')) {
    return AuthType.USE_VERTEX_AI;
  }
  if (platformLower.includes('gemini') || platformLower.includes('google')) {
    return AuthType.USE_GEMINI;
  }

  // Anthropic/Claude related platforms
  if (platformLower.includes('anthropic') || platformLower.includes('claude')) {
    return AuthType.USE_ANTHROPIC;
  }

  // All other platforms default to OpenAI compatible protocol
  // Including: OpenRouter, OpenAI, DeepSeek, etc.
  return AuthType.USE_OPENAI;
}

/**
 * Get provider's authentication type, prioritizing explicitly specified authType, otherwise infer from platform
 * @param provider Provider configuration containing platform and optional authType
 * @returns Authentication type
 */
export function getProviderAuthType(provider: { platform: string; authType?: AuthType }): AuthType {
  // If authType is explicitly specified, use it directly
  if (provider.authType) {
    return provider.authType;
  }

  // Otherwise infer from platform
  return getAuthTypeFromPlatform(provider.platform);
}
