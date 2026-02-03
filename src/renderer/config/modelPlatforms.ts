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
import AnthropicLogo from '@/renderer/assets/logos/anthropic.svg';
import BaiduLogo from '@/renderer/assets/logos/baidu.svg';
import CtyunLogo from '@/renderer/assets/logos/ctyun.svg';
import DeepSeekLogo from '@/renderer/assets/logos/deepseek.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import InfiniAILogo from '@/renderer/assets/logos/infiniai.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import LingyiLogo from '@/renderer/assets/logos/lingyiwanwu.svg';
import ModelScopeLogo from '@/renderer/assets/logos/modelscope.svg';
import OpenAILogo from '@/renderer/assets/logos/openai.svg';
import OpenRouterLogo from '@/renderer/assets/logos/openrouter.svg';
import PoeLogo from '@/renderer/assets/logos/poe.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import SiliconFlowLogo from '@/renderer/assets/logos/siliconflow.svg';
import StepFunLogo from '@/renderer/assets/logos/stepfun.svg';
import TencentLogo from '@/renderer/assets/logos/tencent.svg';
import VolcengineLogo from '@/renderer/assets/logos/volcengine.svg';
import XaiLogo from '@/renderer/assets/logos/xai.svg';
import ZhipuLogo from '@/renderer/assets/logos/zhipu.svg';

/**
 * Platform type
 */
export type PlatformType = 'gemini' | 'gemini-vertex-ai' | 'anthropic' | 'custom';

/**
 * Model Platform Configuration Interface
 */
export interface PlatformConfig {
  /** Platform name */
  name: string;
  /** Platform value (for form) */
  value: string;
  /** Logo path */
  logo: string | null;
  /** Platform identifier */
  platform: PlatformType;
  /** Base URL (for preset providers) */
  baseUrl?: string;
  /** i18n key (optional, for platform names that need translation) */
  i18nKey?: string;
}

/**
 * Model Platform options list
 *
 * Order:
 * 1. Gemini (official)
 * 2. Gemini Vertex AI
 * 3. Custom (requires user to input base url)
 * 4+ Preset providers
 */
export const MODEL_PLATFORMS: PlatformConfig[] = [
  // Custom option (requires user to input base url)
  { name: 'Custom', value: 'custom', logo: null, platform: 'custom', i18nKey: 'settings.platformCustom' },

  // Official Gemini platforms
  { name: 'Gemini', value: 'gemini', logo: GeminiLogo, platform: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  { name: 'Gemini (Vertex AI)', value: 'gemini-vertex-ai', logo: GeminiLogo, platform: 'gemini-vertex-ai' },

  // Preset providers (sorted alphabetically)
  { name: 'OpenAI', value: 'OpenAI', logo: OpenAILogo, platform: 'custom', baseUrl: 'https://api.openai.com/v1' },
  { name: 'Anthropic', value: 'Anthropic', logo: AnthropicLogo, platform: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  { name: 'DeepSeek', value: 'DeepSeek', logo: DeepSeekLogo, platform: 'custom', baseUrl: 'https://api.deepseek.com/v1' },
  { name: 'OpenRouter', value: 'OpenRouter', logo: OpenRouterLogo, platform: 'custom', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Dashscope', value: 'Dashscope', logo: QwenLogo, platform: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: 'SiliconFlow', value: 'SiliconFlow', logo: SiliconFlowLogo, platform: 'custom', baseUrl: 'https://api.siliconflow.cn/v1' },
  { name: 'Zhipu', value: 'Zhipu', logo: ZhipuLogo, platform: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: 'Moonshot (China)', value: 'Moonshot', logo: KimiLogo, platform: 'custom', baseUrl: 'https://api.moonshot.cn/v1' },
  { name: 'Moonshot (Global)', value: 'Moonshot-Global', logo: KimiLogo, platform: 'custom', baseUrl: 'https://api.moonshot.ai/v1' },
  { name: 'xAI', value: 'xAI', logo: XaiLogo, platform: 'custom', baseUrl: 'https://api.x.ai/v1' },
  { name: 'Ark', value: 'Ark', logo: VolcengineLogo, platform: 'custom', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { name: 'Qianfan', value: 'Qianfan', logo: BaiduLogo, platform: 'custom', baseUrl: 'https://qianfan.baidubce.com/v2' },
  { name: 'Hunyuan', value: 'Hunyuan', logo: TencentLogo, platform: 'custom', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1' },
  { name: 'Lingyi', value: 'Lingyi', logo: LingyiLogo, platform: 'custom', baseUrl: 'https://api.lingyiwanwu.com/v1' },
  { name: 'Poe', value: 'Poe', logo: PoeLogo, platform: 'custom', baseUrl: 'https://api.poe.com/v1' },
  { name: 'ModelScope', value: 'ModelScope', logo: ModelScopeLogo, platform: 'custom', baseUrl: 'https://api-inference.modelscope.cn/v1' },
  { name: 'InfiniAI', value: 'InfiniAI', logo: InfiniAILogo, platform: 'custom', baseUrl: 'https://cloud.infini-ai.com/maas/v1' },
  { name: 'Ctyun', value: 'Ctyun', logo: CtyunLogo, platform: 'custom', baseUrl: 'https://wishub-x1.ctyun.cn/v1' },
  { name: 'StepFun', value: 'StepFun', logo: StepFunLogo, platform: 'custom', baseUrl: 'https://api.stepfun.com/v1' },
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
