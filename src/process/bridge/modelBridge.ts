/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/storage';
import { uuid } from '@/common/utils';
import { getProtocolDisplayName, guessProtocolFromKey, guessProtocolFromUrl, maskApiKey, normalizeBaseUrl, parseApiKeys, removeApiPathSuffix, type MultiKeyTestResult, type ProtocolDetectionRequest, type ProtocolDetectionResponse, type ProtocolType } from '@/common/utils/protocolDetector';
import { isGoogleApisHost } from '@/common/utils/urlValidation';
import OpenAI from 'openai';
import { ipcBridge } from '../../common';
import { ProcessConfig } from '../initStorage';

/**
 * Common path patterns for OpenAI-compatible APIs
 *
 * Used to auto-fix user-provided base URLs, easy to maintain and extend
 */
const API_PATH_PATTERNS = [
  '/v1', // Standard: OpenAI, DeepSeek, Moonshot, Mistral, SiliconFlow, iFlytek Spark, Tencent Hunyuan
  '/api/v1', // Proxy: OpenRouter
  '/openai/v1', // Groq
  '/compatible-mode/v1', // Alibaba Cloud DashScope
  '/compatibility/v1', // Cohere
  '/v2', // Baidu Qianfan
  '/api/v3', // Volcengine Ark
  '/api/paas/v4', // Zhipu
];

export function initModelBridge(): void {
  ipcBridge.mode.fetchModelList.provider(async function fetchModelList({ base_url, api_key, try_fix, platform, custom_headers }): Promise<{ success: boolean; msg?: string; data?: { mode: Array<string>; fix_base_url?: string } }> {
    // If multiple keys (comma or newline separated), use only the first one
    let actualApiKey = api_key;
    if (api_key && (api_key.includes(',') || api_key.includes('\n'))) {
      actualApiKey = api_key.split(/[,\n]/)[0].trim();
    }

    // For Vertex AI platform, return the supported model list directly
    if (platform?.includes('vertex-ai')) {
      console.log('Using Vertex AI model list');
      const vertexAIModels = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3-pro-preview'];
      return { success: true, data: { mode: vertexAIModels } };
    }

    // For Anthropic/Claude platform, return the supported model list directly
    if (platform?.includes('anthropic') || platform?.includes('claude')) {
      const anthropicModels = ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'];
      return { success: true, data: { mode: anthropicModels } };
    }

    // For Gemini platform, use Gemini API protocol
    if (platform?.includes('gemini')) {
      try {
        // Use custom base_url or default Gemini endpoint
        const geminiUrl = base_url ? `${base_url}/models?key=${encodeURIComponent(actualApiKey)}` : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(actualApiKey)}`;

        const response = await fetch(geminiUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.models || !Array.isArray(data.models)) {
          throw new Error('Invalid response format');
        }

        // Extract model names, remove "models/" prefix
        const modelList = data.models.map((model: { name: string }) => {
          const name = model.name;
          return name.startsWith('models/') ? name.substring(7) : name;
        });

        return { success: true, data: { mode: modelList } };
      } catch (e: any) {
        // For Gemini platform, fall back to default model list on API failure
        if (platform?.includes('gemini')) {
          console.warn('Failed to fetch Gemini models via API, falling back to default list:', e.message);
          const defaultGeminiModels = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3-pro-preview'];
          return { success: true, data: { mode: defaultGeminiModels } };
        }
        return { success: false, msg: e.message || e.toString() };
      }
    }

    const openai = new OpenAI({
      baseURL: base_url,
      apiKey: actualApiKey,
      // Use custom User-Agent to avoid some API proxies (like packyapi) blocking OpenAI SDK's default User-Agent
      defaultHeaders: {
        'User-Agent': 'AionUI/1.0',
        ...(custom_headers || {}),
      },
    });

    try {
      const res = await openai.models.list();
      // Check if response data is valid, LM Studio returns empty data on failure
      if (res.data?.length === 0) {
        throw new Error('Invalid response: empty data');
      }
      return { success: true, data: { mode: res.data.map((v) => v.id) } };
    } catch (e) {
      const errRes = { success: false, msg: e.message || e.toString() };

      if (!try_fix) return errRes;

      // If it's a clear API key issue, return error directly without trying to fix URL
      // Note: 403 could be URL error (missing /v1) or permission issue, need to check error message
      const isAuthError = e.status === 401 || e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('Invalid API key');
      const isPermissionError = e.message?.includes('disabled') || e.message?.includes('quota') || e.message?.includes('rate limit');
      if (isAuthError || isPermissionError) {
        return errRes;
      }

      // User's URL request failed, try multiple possible URL formats with priority
      const url = new URL(base_url);
      const pathname = url.pathname.replace(/\/+$/, ''); // Remove trailing slashes
      const base = `${url.protocol}//${url.host}`;

      // Build prioritized candidate URL list
      // Priority 1: User path variants
      const userPathUrls = new Set<string>();
      // Priority 2: Standard API path patterns
      const standardUrls = new Set<string>();

      // 1. User path + common suffixes (for proxy scenarios)
      if (pathname && pathname !== '/') {
        userPathUrls.add(`${base}${pathname}/v1`);
        // Also try user's path itself (might just be missing trailing slash)
        userPathUrls.add(`${base}${pathname}`);
      }

      // 2. Try all known API path patterns
      API_PATH_PATTERNS.forEach((pattern) => standardUrls.add(`${base}${pattern}`));

      // Remove original URL (already tried)
      userPathUrls.delete(base_url);
      standardUrls.delete(base_url);

      const tryFetch = (candidateUrl: string) =>
        fetchModelList({ base_url: candidateUrl, api_key: api_key, try_fix: false }).then((res) => {
          if (res.success) {
            return { ...res, data: { mode: res.data.mode, fix_base_url: candidateUrl } };
          }
          return Promise.reject(res);
        });

      // Implement Promise.any: resolve on first success, reject only if all fail
      const promiseAny = <T>(promises: Promise<T>[]): Promise<T> =>
        new Promise((resolve, reject) => {
          let rejectCount = 0;
          if (promises.length === 0) {
            reject(new Error('No promises to try'));
            return;
          }
          promises.forEach((p) =>
            p.then(resolve).catch(() => {
              rejectCount++;
              if (rejectCount === promises.length) reject(new Error('All promises rejected'));
            })
          );
        });

      // Try in priority order: user path variants first, then standard patterns
      try {
        // Priority 1: Try user path variants in parallel
        if (userPathUrls.size > 0) {
          try {
            return await promiseAny([...userPathUrls].map(tryFetch));
          } catch {
            // User path variants all failed, continue to standard patterns
          }
        }

        // Priority 2: Try standard API path patterns in parallel
        if (standardUrls.size > 0) {
          return await promiseAny([...standardUrls].map(tryFetch));
        }

        return errRes;
      } catch {
        // All attempts failed, return original error
        return errRes;
      }
    }
  });

  ipcBridge.mode.saveModelConfig.provider((models) => {
    return ProcessConfig.set('model.config', models)
      .then(() => {
        return { success: true };
      })
      .catch((e) => {
        return { success: false, msg: e.message || e.toString() };
      });
  });

  ipcBridge.mode.getModelConfig.provider(() => {
    return ProcessConfig.get('model.config')
      .then((data) => {
        if (!data) return [];

        // Handle migration from old IModel format to new IProvider format
        return data.map((v: any, _index: number) => {
          // Check if this is old format (has 'selectedModel' field) vs new format (has 'useModel')
          if ('selectedModel' in v && !('useModel' in v)) {
            // Migrate from old format
            return {
              ...v,
              useModel: v.selectedModel, // Rename selectedModel to useModel
              id: v.id || uuid(),
              capabilities: v.capabilities || [], // Add missing capabilities field
              contextLimit: v.contextLimit, // Keep existing contextLimit if present
            };
            // Note: we don't delete selectedModel here as this is read-only migration
          }

          // Already in new format or unknown format, just ensure ID exists
          return {
            ...v,
            id: v.id || uuid(),
            useModel: v.useModel || v.selectedModel || '', // Fallback for edge cases
          };
        });
      })
      .catch(() => {
        return [] as IProvider[];
      });
  });

  // Protocol detection implementation
  ipcBridge.mode.detectProtocol.provider(async function detectProtocol(request: ProtocolDetectionRequest): Promise<{ success: boolean; msg?: string; data?: ProtocolDetectionResponse }> {
    const { baseUrl: rawBaseUrl, apiKey: apiKeyString, timeout = 10000, testAllKeys = false, preferredProtocol } = request;

    const baseUrl = normalizeBaseUrl(rawBaseUrl);
    const baseUrlCandidates = buildBaseUrlCandidates(baseUrl);
    const apiKeys = parseApiKeys(apiKeyString);

    if (!baseUrl) {
      return {
        success: false,
        msg: 'Base URL is required',
        data: {
          success: false,
          protocol: 'unknown',
          confidence: 0,
          error: 'Base URL is required',
        },
      };
    }

    if (apiKeys.length === 0) {
      return {
        success: false,
        msg: 'API Key is required',
        data: {
          success: false,
          protocol: 'unknown',
          confidence: 0,
          error: 'API Key is required',
        },
      };
    }

    const firstKey = apiKeys[0];

    // Smart prediction: guess protocol from URL and key format
    const urlGuess = guessProtocolFromUrl(baseUrl);
    const keyGuess = guessProtocolFromKey(firstKey);

    // Determine test order: prioritize guessed protocols
    const protocolsToTest: ProtocolType[] = [];

    if (preferredProtocol && preferredProtocol !== 'unknown') {
      protocolsToTest.push(preferredProtocol);
    }
    if (urlGuess && !protocolsToTest.includes(urlGuess)) {
      protocolsToTest.push(urlGuess);
    }
    if (keyGuess && !protocolsToTest.includes(keyGuess)) {
      protocolsToTest.push(keyGuess);
    }
    // Add remaining protocols
    for (const p of ['gemini', 'openai', 'anthropic'] as ProtocolType[]) {
      if (!protocolsToTest.includes(p)) {
        protocolsToTest.push(p);
      }
    }

    let detectedProtocol: ProtocolType = 'unknown';
    let confidence = 0;
    let models: string[] = [];
    let detectionError: string | undefined;
    let fixedBaseUrl: string | undefined;
    let detectedBaseUrl: string | undefined;

    // Test each protocol in order
    for (const protocol of protocolsToTest) {
      for (const candidateBaseUrl of baseUrlCandidates) {
        const result = await testProtocol(candidateBaseUrl, firstKey, protocol, timeout);

        if (result.success) {
          detectedProtocol = protocol;
          confidence = result.confidence;
          models = result.models || [];
          fixedBaseUrl = result.fixedBaseUrl;
          detectedBaseUrl = candidateBaseUrl;
          break;
        } else if (!detectionError) {
          detectionError = result.error;
        }
      }
      if (detectedProtocol !== 'unknown') {
        break;
      }
    }

    // Multi-key testing
    let multiKeyResult: MultiKeyTestResult | undefined;
    const baseUrlForTesting = detectedBaseUrl || baseUrlCandidates[0] || baseUrl;
    if (testAllKeys && apiKeys.length > 1 && detectedProtocol !== 'unknown') {
      multiKeyResult = await testMultipleKeys(baseUrlForTesting, apiKeys, detectedProtocol, timeout);
    }

    // Generate suggestion
    const suggestion = generateSuggestion(detectedProtocol, confidence, baseUrlForTesting, detectionError);

    const response: ProtocolDetectionResponse = {
      success: detectedProtocol !== 'unknown',
      protocol: detectedProtocol,
      confidence,
      error: detectedProtocol === 'unknown' ? detectionError : undefined,
      fixedBaseUrl,
      suggestion,
      multiKeyResult,
      models,
    };

    return {
      success: true,
      data: response,
    };
  });
}

/**
 * Build candidate URL list
 *
 * Strategy:
 * 1. Try user's original URL first
 * 2. If original URL contains known API path suffix, add suffix-removed version as fallback
 * 3. Use whichever succeeds first
 */
function buildBaseUrlCandidates(baseUrl: string): string[] {
  if (!baseUrl) return [];

  const candidates: string[] = [];

  // Handle protocol prefix
  const hasProtocol = /^https?:\/\//i.test(baseUrl);
  const urlsToProcess = hasProtocol ? [baseUrl] : [`https://${baseUrl}`, `http://${baseUrl}`];

  for (const url of urlsToProcess) {
    // 1. Original URL first
    candidates.push(url);

    // 2. If contains known path suffix, add suffix-removed version
    const strippedUrl = removeApiPathSuffix(url);
    if (strippedUrl && strippedUrl !== url && !candidates.includes(strippedUrl)) {
      candidates.push(strippedUrl);
    }
  }

  return candidates;
}

/**
 * Test a single protocol
 */
async function testProtocol(
  baseUrl: string,
  apiKey: string,
  protocol: ProtocolType,
  timeout: number
): Promise<{
  success: boolean;
  confidence: number;
  error?: string;
  models?: string[];
  fixedBaseUrl?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    switch (protocol) {
      case 'gemini':
        return await testGeminiProtocol(baseUrl, apiKey, controller.signal);
      case 'openai':
        return await testOpenAIProtocol(baseUrl, apiKey, controller.signal);
      case 'anthropic':
        return await testAnthropicProtocol(baseUrl, apiKey, controller.signal);
      default:
        return { success: false, confidence: 0, error: 'Unknown protocol' };
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, confidence: 0, error: 'Request timeout' };
    }
    return { success: false, confidence: 0, error: error.message || String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Test Gemini protocol
 */
async function testGeminiProtocol(baseUrl: string, apiKey: string, signal: AbortSignal): Promise<{ success: boolean; confidence: number; error?: string; models?: string[]; fixedBaseUrl?: string }> {
  // Gemini API Key format: AIza...
  // Try multiple possible endpoints
  const endpoints = [
    { url: `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`, version: 'v1beta' },
    { url: `${baseUrl}/v1/models?key=${encodeURIComponent(apiKey)}`, version: 'v1' },
    { url: `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`, version: 'root' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'GET',
        signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          const models = data.models.map((m: any) => {
            const name = m.name || '';
            return name.startsWith('models/') ? name.substring(7) : name;
          });
          return {
            success: true,
            confidence: 95,
            models,
            fixedBaseUrl: endpoint.version !== 'v1beta' ? baseUrl : undefined,
          };
        }
      }

      // Check for specific Gemini error response
      if (response.status === 400 || response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error?.message?.includes('API key')) {
          // API key format error but confirmed Gemini protocol
          return { success: false, confidence: 80, error: 'Invalid API key format for Gemini' };
        }
      }
    } catch (e) {
      // Continue trying next endpoint
    }
  }

  return { success: false, confidence: 0, error: 'Not a Gemini API endpoint' };
}

/**
 * Test OpenAI protocol
 */
async function testOpenAIProtocol(baseUrl: string, apiKey: string, signal: AbortSignal): Promise<{ success: boolean; confidence: number; error?: string; models?: string[]; fixedBaseUrl?: string }> {
  // Try multiple possible endpoints
  const endpoints = [
    { url: `${baseUrl}/models`, path: '' },
    { url: `${baseUrl}/v1/models`, path: '/v1' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'GET',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          const models = data.data.map((m: any) => m.id);
          return {
            success: true,
            confidence: 95,
            models,
            fixedBaseUrl: endpoint.path ? `${baseUrl}${endpoint.path}` : undefined,
          };
        }
        // Some OpenAI-compatible APIs return models instead of data
        if (data.models && Array.isArray(data.models)) {
          const models = data.models.map((m: any) => m.id || m.name);
          return {
            success: true,
            confidence: 85,
            models,
            fixedBaseUrl: endpoint.path ? `${baseUrl}${endpoint.path}` : undefined,
          };
        }
      }

      // 401 error indicates OpenAI protocol but invalid key
      if (response.status === 401) {
        return { success: false, confidence: 70, error: 'Invalid API key for OpenAI protocol' };
      }
    } catch (e) {
      // Continue trying next endpoint
    }
  }

  return { success: false, confidence: 0, error: 'Not an OpenAI-compatible API endpoint' };
}

/**
 * Check if response is in Anthropic format
 *
 * Anthropic response/error format characteristics:
 * - Success response: { id: "msg_...", type: "message", ... }
 * - Error response: { type: "error", error: { type: "...", message: "..." } }
 */
function isAnthropicResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  // Success response format
  if (obj.type === 'message' && typeof obj.id === 'string' && obj.id.startsWith('msg_')) {
    return true;
  }

  // Error response format
  if (obj.type === 'error' && obj.error && typeof obj.error === 'object') {
    const errorObj = obj.error as Record<string, unknown>;
    // Anthropic error types: invalid_request_error, authentication_error, etc.
    if (typeof errorObj.type === 'string' && typeof errorObj.message === 'string') {
      return true;
    }
  }

  return false;
}

/**
 * Test Anthropic protocol
 */
async function testAnthropicProtocol(baseUrl: string, apiKey: string, signal: AbortSignal): Promise<{ success: boolean; confidence: number; error?: string; models?: string[]; fixedBaseUrl?: string }> {
  // Anthropic doesn't have a models endpoint, need to use messages endpoint for testing
  // Send a minimal request to verify authentication
  const endpoints = [
    { url: `${baseUrl}/v1/messages`, path: '/v1' },
    { url: `${baseUrl}/messages`, path: '' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      // Try to parse response body
      let responseData: unknown;
      try {
        responseData = await response.json();
      } catch {
        // Cannot parse JSON, not Anthropic protocol
        continue;
      }

      // 200 indicates success
      if (response.ok && isAnthropicResponse(responseData)) {
        const models = ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'];
        return {
          success: true,
          confidence: 95,
          models,
          fixedBaseUrl: endpoint.path ? `${baseUrl}${endpoint.path}` : undefined,
        };
      }

      // 400/401 need to verify if it's Anthropic format error response
      if ((response.status === 400 || response.status === 401) && isAnthropicResponse(responseData)) {
        if (response.status === 401) {
          return { success: false, confidence: 70, error: 'Invalid API key for Anthropic protocol' };
        }
        // 400 parameter error but authentication succeeded (Anthropic format verified)
        const models = ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'];
        return {
          success: true,
          confidence: 90,
          models,
          fixedBaseUrl: endpoint.path ? `${baseUrl}${endpoint.path}` : undefined,
        };
      }
    } catch (e) {
      // Continue trying next endpoint
    }
  }

  return { success: false, confidence: 0, error: 'Not an Anthropic API endpoint' };
}

/**
 * Test connectivity for multiple keys (concurrent execution)
 *
 * Reference GPT-Load design, use concurrent testing for efficiency
 */
async function testMultipleKeys(
  baseUrl: string,
  apiKeys: string[],
  protocol: ProtocolType,
  timeout: number,
  concurrency: number = 5 // Max concurrency to avoid rate limiting
): Promise<MultiKeyTestResult> {
  const results: MultiKeyTestResult['details'] = [];

  // Execute in batches concurrently
  for (let batchStart = 0; batchStart < apiKeys.length; batchStart += concurrency) {
    const batchEnd = Math.min(batchStart + concurrency, apiKeys.length);
    const batch = apiKeys.slice(batchStart, batchEnd);

    const batchPromises = batch.map(async (key, batchIndex) => {
      const globalIndex = batchStart + batchIndex;
      const startTime = Date.now();

      try {
        const result = await testProtocol(baseUrl, key, protocol, timeout);
        return {
          index: globalIndex,
          maskedKey: maskApiKey(key),
          valid: result.success,
          error: result.error,
          latency: Date.now() - startTime,
        };
      } catch (e: unknown) {
        return {
          index: globalIndex,
          maskedKey: maskApiKey(key),
          valid: false,
          error: e instanceof Error ? e.message : String(e),
          latency: Date.now() - startTime,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  // Sort by original index
  results.sort((a, b) => a.index - b.index);

  return {
    total: apiKeys.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    details: results,
  };
}

/**
 * Check if it's PackyAPI proxy service
 *
 * Use URL parsing to ensure only real packyapi.com domain matches, preventing URL injection attacks
 */
function isPackyAPI(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();
    // Exact match packyapi.com or its subdomains
    return hostname === 'packyapi.com' || hostname.endsWith('.packyapi.com');
  } catch {
    return false;
  }
}

/**
 * Generate suggestion for protocol detection results.
 *
 * Note: i18nKey and i18nParams fields are vestigial from when this project
 * supported multiple languages. The `message` field now contains the final
 * English text directly.
 */
function generateSuggestion(protocol: ProtocolType, _confidence: number, baseUrl: string, error?: string): ProtocolDetectionResponse['suggestion'] {
  if (protocol === 'unknown') {
    if (error?.includes('timeout') || error?.includes('Timeout')) {
      return {
        type: 'check_key',
        message: 'Connection timeout, please check network or API URL',
        i18nKey: 'settings.protocolTimeout',
      };
    }
    if (error?.includes('API key') || error?.includes('401') || error?.includes('Unauthorized')) {
      return {
        type: 'check_key',
        message: 'Invalid API Key, please check your key',
        i18nKey: 'settings.protocolInvalidKey',
      };
    }
    return {
      type: 'check_key',
      message: 'Unable to identify API protocol, please check configuration',
      i18nKey: 'settings.protocolCheckConfig',
    };
  }

  const displayName = getProtocolDisplayName(protocol);

  // Special handling for PackyAPI
  // PackyAPI supports two protocol formats via different URLs
  if (isPackyAPI(baseUrl)) {
    if (protocol === 'openai' && baseUrl.includes('/v1')) {
      // Detected OpenAI format (with /v1), suggest Claude format (without /v1) is also available
      return {
        type: 'none',
        message: 'PackyAPI: Detected OpenAI format. For Claude format, use URL without /v1 and select Anthropic platform',
        i18nKey: 'settings.packyapiOpenAIDetected',
      };
    }
    if (protocol === 'anthropic') {
      // Detected Anthropic format (without /v1), suggest OpenAI format (with /v1) is also available
      return {
        type: 'none',
        message: 'PackyAPI: Detected Claude format. For OpenAI format, add /v1 to URL and select OpenAI/Custom platform',
        i18nKey: 'settings.packyapiAnthropicDetected',
      };
    }
  }

  // Detected Gemini protocol but user may have selected a different platform
  if (protocol === 'gemini' && !isGoogleApisHost(baseUrl)) {
    return {
      type: 'switch_platform',
      message: `Detected ${displayName} protocol, consider switching to Gemini for better support`,
      suggestedPlatform: 'gemini',
      i18nKey: 'settings.protocolSwitchSuggestion',
      i18nParams: { protocol: displayName, platform: 'Gemini' },
    };
  }

  // Detected Anthropic protocol
  if (protocol === 'anthropic') {
    return {
      type: 'switch_platform',
      message: `Detected ${displayName} protocol, using custom mode`,
      suggestedPlatform: 'Anthropic',
      i18nKey: 'settings.protocolSwitchSuggestion',
      i18nParams: { protocol: displayName, platform: 'Anthropic' },
    };
  }

  // OpenAI protocol is supported by default
  if (protocol === 'openai') {
    return {
      type: 'none',
      message: `Detected ${displayName}-compatible protocol, configuration is correct`,
      i18nKey: 'settings.protocolOpenAICompatible',
    };
  }

  return {
    type: 'none',
    message: `Identified as ${displayName} protocol`,
    i18nKey: 'settings.protocolDetected',
    i18nParams: { protocol: displayName },
  };
}
