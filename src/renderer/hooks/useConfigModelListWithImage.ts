import { useMemo } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '../../common';

const useConfigModelListWithImage = () => {
  const { data } = useSWR('configModelListWithImage', () => {
    return ipcBridge.mode.getModelConfig.invoke();
  });

  const modelListWithImage = useMemo(() => {
    return (data || []).map((platform) => {
      // Ensure each platform has corresponding image models
      if (platform.platform === 'gemini' && (!platform.baseUrl || platform.baseUrl.trim() === '')) {
        // Native Google Gemini platform (empty baseUrl) should have at least gemini-2.5-flash-image-preview
        const hasGeminiImage = platform.model.some((m) => m.includes('gemini') && m.includes('image'));
        if (!hasGeminiImage) {
          platform.model = platform.model.concat(['gemini-2.5-flash-image-preview']);
        }
      } else if (platform.platform === 'OpenRouter' && platform.baseUrl && platform.baseUrl.includes('openrouter.ai')) {
        // Official OpenRouter platform (baseUrl contains openrouter.ai) should have at least a free image model
        const hasOpenRouterImage = platform.model.some((m) => m.includes('image'));
        if (!hasOpenRouterImage) {
          platform.model = platform.model.concat(['google/gemini-2.5-flash-image-preview']);
        }
      }

      return platform;
    });
  }, [data]);

  return {
    modelListWithImage,
  };
};

export default useConfigModelListWithImage;
