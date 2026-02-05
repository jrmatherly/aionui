/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model Platform Configuration Module
 *
 * Centralized management of all model platform configurations for extensibility and maintainability
 */

// Provider Logo imports
import AgentGatewayLogo from '@/renderer/assets/logos/agentgateway.svg';
import AnthropicLogo from '@/renderer/assets/logos/anthropic.svg';
import AzureLogo from '@/renderer/assets/logos/azure.svg';
import EnvoyLogo from '@/renderer/assets/logos/envoy.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import KongLogo from '@/renderer/assets/logos/kong.svg';
import LiteLLMLogo from '@/renderer/assets/logos/litellm.svg';
import OpenAILogo from '@/renderer/assets/logos/openai.svg';
import OpenRouterLogo from '@/renderer/assets/logos/openrouter.svg';
import PortkeyLogo from '@/renderer/assets/logos/portkey.svg';
import XaiLogo from '@/renderer/assets/logos/xai.svg';

// Hidden provider logos (kept for reference, uncomment to re-enable)
// import BaiduLogo from '@/renderer/assets/logos/baidu.svg';
// import CtyunLogo from '@/renderer/assets/logos/ctyun.svg';
// import DeepSeekLogo from '@/renderer/assets/logos/deepseek.svg';
// import InfiniAILogo from '@/renderer/assets/logos/infiniai.svg';
// import KimiLogo from '@/renderer/assets/logos/kimi.svg';
// import LingyiLogo from '@/renderer/assets/logos/lingyiwanwu.svg';
// import ModelScopeLogo from '@/renderer/assets/logos/modelscope.svg';
// import PoeLogo from '@/renderer/assets/logos/poe.svg';
// import QwenLogo from '@/renderer/assets/logos/qwen.svg';
// import SiliconFlowLogo from '@/renderer/assets/logos/siliconflow.svg';
// import StepFunLogo from '@/renderer/assets/logos/stepfun.svg';
// import TencentLogo from '@/renderer/assets/logos/tencent.svg';
// import VolcengineLogo from '@/renderer/assets/logos/volcengine.svg';
// import ZhipuLogo from '@/renderer/assets/logos/zhipu.svg';

/**
 * Platform type — determines which API protocol and auth method to use
 */
export type PlatformType = 'gemini' | 'gemini-vertex-ai' | 'anthropic' | 'custom';

/**
 * Model Platform Configuration Interface
 */
export interface PlatformConfig {
  /** Platform display name */
  name: string;
  /** Platform value (used in form submission) */
  value: string;
  /** Logo path (null shows default icon) */
  logo: string | null;
  /** Platform identifier — determines API protocol */
  platform: PlatformType;
  /** Preset base URL for the provider */
  baseUrl?: string;
  /** @deprecated Vestigial i18n key (project is now English-only, use `name` directly) */
  i18nKey?: string;
  /** Help URL for provider documentation */
  helpUrl?: string;
  /** Whether this provider requires a user-provided base URL (no usable preset) */
  requiresBaseUrl?: boolean;
  /** Placeholder text for the base URL input field */
  baseUrlPlaceholder?: string;
  /** Default custom headers template (pre-filled for gateways that need headers) */
  defaultHeaders?: Record<string, string>;
}

/**
 * Model Platform options list
 *
 * Order: Providers alphabetically, then Custom last.
 * Hidden providers are commented out for easy re-enablement.
 */
export const MODEL_PLATFORMS: PlatformConfig[] = [
  // ===== Direct Providers (alphabetical) =====
  { name: 'Anthropic', value: 'Anthropic', logo: AnthropicLogo, platform: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  {
    name: 'Azure AI Foundry',
    value: 'AzureAIFoundry',
    logo: AzureLogo,
    platform: 'custom',
    requiresBaseUrl: true,
    baseUrlPlaceholder: 'https://{resource}.services.ai.azure.com/api/projects/{project}/openai/v1',
    helpUrl: 'https://learn.microsoft.com/en-us/azure/ai-foundry/',
  },
  {
    name: 'Azure OpenAI',
    value: 'AzureOpenAI',
    logo: AzureLogo,
    platform: 'custom',
    requiresBaseUrl: true,
    baseUrlPlaceholder: 'https://{resource}.openai.azure.com/openai/v1',
    helpUrl: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/',
  },
  { name: 'Gemini', value: 'gemini', logo: GeminiLogo, platform: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { name: 'Gemini (Vertex AI)', value: 'gemini-vertex-ai', logo: GeminiLogo, platform: 'gemini-vertex-ai' },
  { name: 'OpenAI', value: 'OpenAI', logo: OpenAILogo, platform: 'custom', baseUrl: 'https://api.openai.com/v1' },
  { name: 'OpenRouter', value: 'OpenRouter', logo: OpenRouterLogo, platform: 'custom', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'xAI', value: 'xAI', logo: XaiLogo, platform: 'custom', baseUrl: 'https://api.x.ai/v1' },

  // ===== LLM Gateways / Proxies (alphabetical) =====
  {
    name: 'AgentGateway',
    value: 'AgentGateway',
    logo: AgentGatewayLogo,
    platform: 'custom',
    requiresBaseUrl: true,
    baseUrlPlaceholder: 'http://gateway-host:3000/v1',
    helpUrl: 'https://agentgateway.dev/docs/',
  },
  {
    name: 'Envoy AI Gateway',
    value: 'EnvoyAI',
    logo: EnvoyLogo,
    platform: 'custom',
    requiresBaseUrl: true,
    baseUrlPlaceholder: 'http://envoy-host:10000/v1',
    helpUrl: 'https://aigateway.envoyproxy.io/',
  },
  {
    name: 'Kong AI Gateway',
    value: 'KongAI',
    logo: KongLogo,
    platform: 'custom',
    requiresBaseUrl: true,
    baseUrlPlaceholder: 'http://kong-host:8000/ai',
    helpUrl: 'https://developer.konghq.com/ai-gateway/',
  },
  {
    name: 'LiteLLM',
    value: 'LiteLLM',
    logo: LiteLLMLogo,
    platform: 'custom',
    baseUrl: 'http://localhost:4000/v1',
    baseUrlPlaceholder: 'http://your-litellm-host:4000/v1',
    helpUrl: 'https://docs.litellm.ai/',
  },
  {
    name: 'Portkey',
    value: 'Portkey',
    logo: PortkeyLogo,
    platform: 'custom',
    baseUrl: 'https://api.portkey.ai/v1',
    defaultHeaders: { 'x-portkey-api-key': '', 'x-portkey-provider': '' },
    helpUrl: 'https://portkey.ai/docs/',
  },

  // ===== Custom (always last — requires user-provided base URL) =====
  { name: 'Custom', value: 'custom', logo: null, platform: 'custom' },

  // ===== Hidden Providers (kept for reference, uncomment to re-enable) =====
  // { name: 'Ark', value: 'Ark', logo: VolcengineLogo, platform: 'custom', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  // { name: 'Ctyun', value: 'Ctyun', logo: CtyunLogo, platform: 'custom', baseUrl: 'https://wishub-x1.ctyun.cn/v1' },
  // { name: 'Dashscope', value: 'Dashscope', logo: QwenLogo, platform: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  // { name: 'DeepSeek', value: 'DeepSeek', logo: DeepSeekLogo, platform: 'custom', baseUrl: 'https://api.deepseek.com/v1' },
  // { name: 'Hunyuan', value: 'Hunyuan', logo: TencentLogo, platform: 'custom', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1' },
  // { name: 'InfiniAI', value: 'InfiniAI', logo: InfiniAILogo, platform: 'custom', baseUrl: 'https://cloud.infini-ai.com/maas/v1' },
  // { name: 'Lingyi', value: 'Lingyi', logo: LingyiLogo, platform: 'custom', baseUrl: 'https://api.lingyiwanwu.com/v1' },
  // { name: 'ModelScope', value: 'ModelScope', logo: ModelScopeLogo, platform: 'custom', baseUrl: 'https://api-inference.modelscope.cn/v1' },
  // { name: 'Moonshot (China)', value: 'Moonshot', logo: KimiLogo, platform: 'custom', baseUrl: 'https://api.moonshot.cn/v1' },
  // { name: 'Moonshot (Global)', value: 'Moonshot-Global', logo: KimiLogo, platform: 'custom', baseUrl: 'https://api.moonshot.ai/v1' },
  // { name: 'Poe', value: 'Poe', logo: PoeLogo, platform: 'custom', baseUrl: 'https://api.poe.com/v1' },
  // { name: 'Qianfan', value: 'Qianfan', logo: BaiduLogo, platform: 'custom', baseUrl: 'https://qianfan.baidubce.com/v2' },
  // { name: 'SiliconFlow', value: 'SiliconFlow', logo: SiliconFlowLogo, platform: 'custom', baseUrl: 'https://api.siliconflow.cn/v1' },
  // { name: 'StepFun', value: 'StepFun', logo: StepFunLogo, platform: 'custom', baseUrl: 'https://api.stepfun.com/v1' },
  // { name: 'Zhipu', value: 'Zhipu', logo: ZhipuLogo, platform: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
];

// ============ Utility Functions ============

/**
 * Get platform config by value
 */
export const getPlatformByValue = (value: string): PlatformConfig | undefined => {
  return MODEL_PLATFORMS.find((p) => p.value === value);
};

/**
 * Get all preset providers (with baseUrl)
 */
export const getPresetProviders = (): PlatformConfig[] => {
  return MODEL_PLATFORMS.filter((p) => p.baseUrl);
};

/**
 * Get official Gemini platforms
 */
export const getGeminiPlatforms = (): PlatformConfig[] => {
  return MODEL_PLATFORMS.filter((p) => p.platform === 'gemini' || p.platform === 'gemini-vertex-ai');
};

/**
 * Check if platform is Gemini type
 */
export const isGeminiPlatform = (platform: PlatformType): boolean => {
  return platform === 'gemini' || platform === 'gemini-vertex-ai';
};

/**
 * Check if it's custom option (no preset baseUrl)
 */
export const isCustomOption = (value: string): boolean => {
  const platform = getPlatformByValue(value);
  return value === 'custom' && !platform?.baseUrl;
};

/**
 * Search platforms by name (case-insensitive)
 */
export const searchPlatformsByName = (keyword: string): PlatformConfig[] => {
  const lowerKeyword = keyword.toLowerCase();
  return MODEL_PLATFORMS.filter((p) => p.name.toLowerCase().includes(lowerKeyword));
};
