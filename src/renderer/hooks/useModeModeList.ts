import { ipcBridge } from '@/common';
import useSWR from 'swr';

export interface GeminiModeOption {
  label: string;
  value: string;
  description: string;
  modelHint?: string;
  /** Sub-models for Manual mode */
  subModels?: Array<{ label: string; value: string }>;
}

type GeminiModeDescriptions = {
  autoGemini3: string;
  autoGemini25: string;
  manual: string;
};

type GeminiModeListOptions = {
  descriptions?: GeminiModeDescriptions;
};

const defaultGeminiModeDescriptions: GeminiModeDescriptions = {
  autoGemini3: 'Let Gemini CLI decide the best model for the task: gemini-3-pro-preview, gemini-2.5-flash',
  autoGemini25: 'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
  manual: 'Manually select a model',
};

// Build Gemini model list matching terminal CLI
// TODO: Backend aioncli-core needs to support auto-25 value for true Gemini 2.5 auto mode
export const getGeminiModeList = (options?: GeminiModeListOptions): GeminiModeOption[] => {
  const descriptions = options?.descriptions || defaultGeminiModeDescriptions;

  return [
    {
      label: 'Auto (Gemini 3)',
      value: 'auto', // Uses model router to auto-select gemini-3-pro-preview or gemini-2.5-flash
      description: descriptions.autoGemini3,
      modelHint: 'gemini-3-pro-preview, gemini-3-flash-preview',
    },
    {
      label: 'Auto (Gemini 2.5)',
      value: 'gemini-2.5-pro', // Explicitly use gemini-2.5-pro, auto-routing not yet supported
      description: descriptions.autoGemini25,
      modelHint: 'gemini-2.5-pro, gemini-2.5-flash',
    },
    {
      label: 'Manual',
      value: 'manual', // Expand submenu to select specific model
      description: descriptions.manual,
      // Match model names defined in aioncli-core/src/config/models.ts
      // PREVIEW_GEMINI_MODEL = 'gemini-3-pro-preview'
      // DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'
      // DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash'
      // DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite'
      subModels: [
        { label: 'gemini-3-pro-preview', value: 'gemini-3-pro-preview' },
        { label: 'gemini-3-flash-preview', value: 'gemini-3-flash-preview' },
        { label: 'gemini-2.5-pro', value: 'gemini-2.5-pro' },
        { label: 'gemini-2.5-flash', value: 'gemini-2.5-flash' },
        { label: 'gemini-2.5-flash-lite', value: 'gemini-2.5-flash-lite' },
      ],
    },
  ];
};

export const geminiModeList = getGeminiModeList();

// Sort Gemini models: Pro models first, then by version number descending
const sortGeminiModels = (models: { label: string; value: string }[]) => {
  return models.sort((a, b) => {
    const aPro = a.value.toLowerCase().includes('pro');
    const bPro = b.value.toLowerCase().includes('pro');

    // Pro models come first
    if (aPro && !bPro) return -1;
    if (!aPro && bPro) return 1;

    // Extract version number for comparison
    const extractVersion = (name: string) => {
      const match = name.match(/(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : 0;
    };

    const aVersion = extractVersion(a.value);
    const bVersion = extractVersion(b.value);

    // Higher version numbers come first
    if (aVersion !== bVersion) {
      return bVersion - aVersion;
    }

    // Sort alphabetically when version numbers are equal
    return a.value.localeCompare(b.value);
  });
};

const useModeModeList = (platform: string, base_url?: string, api_key?: string, try_fix?: boolean, custom_headers?: Record<string, string>) => {
  return useSWR([platform + '/models', { platform, base_url, api_key, try_fix }], async ([_url, { platform, base_url, api_key, try_fix }]): Promise<{ models: { label: string; value: string }[]; fix_base_url?: string }> => {
    // If API key or base_url is available, try to fetch model list via API
    if (api_key || base_url) {
      const res = await ipcBridge.mode.fetchModelList.invoke({ base_url, api_key, try_fix, platform, custom_headers });
      if (res.success) {
        let modelList =
          res.data?.mode.map((v) => ({
            label: v,
            value: v,
          })) || [];

        // Optimize sorting for Gemini platforms
        if (platform?.includes('gemini')) {
          modelList = sortGeminiModels(modelList);
        }

        // If a fixed base_url was returned, include it in the result
        if (res.data?.fix_base_url) {
          return {
            models: modelList,
            fix_base_url: res.data.fix_base_url,
          };
        }

        return { models: modelList };
      }
      // Backend has handled fallback logic, throw error directly here
      return Promise.reject(res.msg);
    }

    // Return empty list when neither API key nor base_url is available
    return { models: [] };
  });
};

export default useModeModeList;
