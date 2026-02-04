/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared provider constants for API key management.
 * Used by both frontend (UI display) and can be referenced by backend.
 */

/**
 * Provider metadata for display in the UI.
 * Only providers listed here will appear in the API Keys settings.
 */
export const PROVIDER_INFO: Record<string, { name: string; description: string; link?: string }> = {
  // ===== Common Providers (alphabetical) =====
  anthropic: { name: 'Anthropic', description: 'Claude models', link: 'https://console.anthropic.com/' },
  azure: { name: 'Azure OpenAI', description: 'Azure-hosted OpenAI', link: 'https://azure.microsoft.com/products/ai-services/openai-service' },
  gemini: { name: 'Gemini', description: 'Google AI Studio', link: 'https://ai.google.dev/' },
  openai: { name: 'OpenAI', description: 'GPT models, Codex', link: 'https://platform.openai.com/' },

  // ===== Other Providers (alphabetical) =====
  cohere: { name: 'Cohere', description: 'Enterprise LLMs', link: 'https://cohere.com/' },
  groq: { name: 'Groq', description: 'Fast inference', link: 'https://console.groq.com/' },
  openrouter: { name: 'OpenRouter', description: 'Multi-model proxy', link: 'https://openrouter.ai/' },
  perplexity: { name: 'Perplexity', description: 'Search-augmented', link: 'https://www.perplexity.ai/' },

  // ===== Hidden Providers (kept for reference, not shown in UI) =====
  // These are commented out but kept for documentation.
  // To re-enable, uncomment and add to COMMON_PROVIDERS or leave in OTHER.
  //
  // mistral: { name: 'Mistral', description: 'Mistral models', link: 'https://console.mistral.ai/' },
  // deepseek: { name: 'DeepSeek', description: 'DeepSeek models', link: 'https://platform.deepseek.com/' },
  // together: { name: 'Together AI', description: 'Open models hosting', link: 'https://api.together.xyz/' },
  // fireworks: { name: 'Fireworks', description: 'Fast open models', link: 'https://fireworks.ai/' },
  // dashscope: { name: 'Dashscope', description: 'Alibaba/Qwen', link: 'https://dashscope.console.aliyun.com/' },
  // moonshot: { name: 'Moonshot', description: 'Kimi models', link: 'https://platform.moonshot.cn/' },
  // replicate: { name: 'Replicate', description: 'Model hosting', link: 'https://replicate.com/' },
  // huggingface: { name: 'Hugging Face', description: 'Model hub', link: 'https://huggingface.co/' },
  // google: { name: 'Google Vertex AI', description: 'GCP Vertex AI', link: 'https://cloud.google.com/vertex-ai' },
};

/**
 * Providers shown in the "Common Providers" section (expanded by default).
 * Order determines display order (alphabetical).
 */
export const COMMON_PROVIDERS = ['anthropic', 'azure', 'gemini', 'openai'];

/**
 * Get all provider IDs that should be shown in the UI.
 */
export const getVisibleProviders = (): string[] => Object.keys(PROVIDER_INFO);

/**
 * Get provider IDs for the "Other Providers" section.
 */
export const getOtherProviders = (): string[] => getVisibleProviders().filter((p) => !COMMON_PROVIDERS.includes(p));
