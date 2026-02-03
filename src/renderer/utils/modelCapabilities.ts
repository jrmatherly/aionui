/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, ModelType } from '@/common/storage';

// Capability detection cache
const modelCapabilitiesCache = new Map<string, boolean | undefined>();

/**
 * Regex patterns for capability matching - referenced from Cherry Studio's approach
 */
const CAPABILITY_PATTERNS: Record<ModelType, RegExp> = {
  text: /gpt|claude|gemini|qwen|llama|mistral|deepseek/i,
  vision: /4o|claude-3|gemini-.*-pro|gemini-.*-flash|gemini-2\.0|qwen-vl|llava|vision/i,
  function_calling: /gpt-4|claude-3|gemini|qwen|deepseek/i,
  image_generation: /flux|diffusion|stabilityai|sd-|dall|cogview|janus|midjourney|mj-|imagen/i,
  web_search: /search|perplexity/i,
  reasoning: /o1-|reasoning|think/i,
  embedding: /(?:^text-|embed|bge-|e5-|LLM2Vec|retrieval|uae-|gte-|jina-clip|jina-embeddings|voyage-)/i,
  rerank: /(?:rerank|re-rank|re-ranker|re-ranking|retrieval|retriever)/i,
  excludeFromPrimary: /dall-e|flux|stable-diffusion|midjourney|flash-image|embed|rerank/i, // Models to exclude from primary
};

/**
 * Models that explicitly do not support certain capabilities - blacklist
 */
const CAPABILITY_EXCLUSIONS: Record<ModelType, RegExp[]> = {
  text: [],
  vision: [/embed|rerank|dall-e|flux|stable-diffusion/i],
  function_calling: [/aqa(?:-[\\w-]+)?/i, /imagen(?:-[\\w-]+)?/i, /o1-mini/i, /o1-preview/i, /gemini-1(?:\\.[\\w-]+)?/i, /dall-e/i, /embed/i, /rerank/i],
  image_generation: [],
  web_search: [],
  reasoning: [],
  embedding: [],
  rerank: [],
  excludeFromPrimary: [],
};

/**
 * Capability rules for specific providers
 */
const PROVIDER_CAPABILITY_RULES: Record<string, Record<ModelType, boolean | null>> = {
  anthropic: {
    text: true,
    vision: true,
    function_calling: true,
    image_generation: false,
    web_search: false,
    reasoning: false,
    embedding: false,
    rerank: false,
    excludeFromPrimary: false,
  },
  deepseek: {
    text: true,
    vision: null,
    function_calling: true,
    image_generation: false,
    web_search: false,
    reasoning: null,
    embedding: false,
    rerank: false,
    excludeFromPrimary: false,
  },
};

/**
 * Get the lowercase base version of a model name (for matching)
 * @param modelName - Original model name
 * @returns Cleaned lowercase model name
 */
const getBaseModelName = (modelName: string): string => {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9./-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * Check if user has manually configured a capability type
 * @param model - Model object
 * @param type - Capability type
 * @returns true/false if user has explicit configuration, undefined if not configured
 */
const getUserSelectedCapability = (model: IProvider, type: ModelType): boolean | undefined => {
  const capability = model.capabilities?.find((cap) => cap.type === type);
  return capability?.isUserSelected;
};

/**
 * Get capability rules for a specific provider
 * @param provider - Provider name
 * @param type - Capability type
 * @returns true/false/null (null means use default logic)
 */
const getProviderCapabilityRule = (provider: string, type: ModelType): boolean | null => {
  const rules = PROVIDER_CAPABILITY_RULES[provider?.toLowerCase()];
  return rules?.[type] ?? null;
};

/**
 * Check if a model has a specific capability - uses three-tier logic referenced from Cherry Studio
 * @param model - Model object
 * @param type - Capability type
 * @returns true=supported, false=not supported, undefined=unknown
 */
export const hasModelCapability = (model: IProvider, type: ModelType): boolean | undefined => {
  // Generate cache key (includes capabilities version to avoid stale cache)
  const capabilitiesHash = model.capabilities ? JSON.stringify(model.capabilities) : '';
  const cacheKey = `${model.id}-${model.platform}-${type}-${capabilitiesHash}`;

  // Check cache
  if (modelCapabilitiesCache.has(cacheKey)) {
    return modelCapabilitiesCache.get(cacheKey);
  }

  let result: boolean | undefined;

  // 1. Priority 1: User manual configuration
  const userSelected = getUserSelectedCapability(model, type);
  if (userSelected !== undefined) {
    result = userSelected;
  } else {
    // 2. Priority 2: Specific provider rules
    const providerRule = getProviderCapabilityRule(model.platform, type);
    if (providerRule !== null) {
      result = providerRule;
    } else {
      // 3. Priority 3: Regex pattern matching
      // Check if any model under the platform supports the capability
      const modelNames = model.model || [];

      // Unified logic to handle all capability types
      // Check if any model supports the capability
      const exclusions = CAPABILITY_EXCLUSIONS[type];
      const pattern = CAPABILITY_PATTERNS[type];

      const hasSupport = modelNames.some((modelName) => {
        const baseModelName = getBaseModelName(modelName);

        // Check blacklist
        const isExcluded = exclusions.some((excludePattern) => excludePattern.test(baseModelName));
        if (isExcluded) return false;

        // Check whitelist
        return pattern.test(baseModelName);
      });

      result = hasSupport ? true : undefined;
    }
  }

  // Cache result
  modelCapabilitiesCache.set(cacheKey, result);
  return result;
};

/**
 * Check if a specific model under a platform has a certain capability
 * @param platformModel - Platform configuration
 * @param modelName - Specific model name
 * @param type - Capability type
 */
export const hasSpecificModelCapability = (platformModel: IProvider, modelName: string, type: ModelType): boolean | undefined => {
  const baseModelName = getBaseModelName(modelName);
  const exclusions = CAPABILITY_EXCLUSIONS[type];
  const pattern = CAPABILITY_PATTERNS[type];

  // Unified logic: check blacklist first, then whitelist
  const isExcluded = exclusions.some((excludePattern) => excludePattern.test(baseModelName));
  if (isExcluded) return false;

  // Check whitelist
  return pattern.test(baseModelName) ? true : undefined;
};

/**
 * Clear capability detection cache
 */
export const clearModelCapabilitiesCache = (): void => {
  modelCapabilitiesCache.clear();
};
