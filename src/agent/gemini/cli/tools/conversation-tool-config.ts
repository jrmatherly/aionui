/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import type { GeminiClient } from '@office-ai/aioncli-core';
import { AuthType, Config } from '@office-ai/aioncli-core';
import { ImageGenerationTool } from './img-gen';
import { WebFetchTool } from './web-fetch';
import { WebSearchTool } from './web-search';

interface ConversationToolConfigOptions {
  proxy: string;
  imageGenerationModel?: TProviderWithModel;
  webSearchEngine?: 'google' | 'default';
}

/**
 * Conversation-level tool configuration.
 * Determines tool availability and selection at the start of a conversation.
 */
export class ConversationToolConfig {
  private useGeminiWebSearch = false;
  private useAionuiWebFetch = false;
  private geminiModel: TProviderWithModel | null = null;
  private excludeTools: string[] = [];
  private dedicatedGeminiClient: GeminiClient | null = null; // Cache for dedicated Gemini client
  private dedicatedConfig: Config | null = null; // Cache for dedicated Config (used for OAuth auth)
  private imageGenerationModel: TProviderWithModel | undefined;
  private webSearchEngine: 'google' | 'default' = 'default';
  private proxy: string = '';
  constructor(options: ConversationToolConfigOptions) {
    this.proxy = options.proxy;
    this.webSearchEngine = options.webSearchEngine ?? 'default';
    this.imageGenerationModel = options.imageGenerationModel;
  }

  /**
   * Determine tool configuration when conversation is created.
   * @param authType Authentication type (platform type)
   */
  async initializeForConversation(authType: AuthType): Promise<void> {
    // All models use aionui_web_fetch instead of the built-in web_fetch
    this.useAionuiWebFetch = true;
    this.excludeTools.push('web_fetch');

    // Decide which search tool to enable based on webSearchEngine config
    if (this.webSearchEngine === 'google' && authType === AuthType.USE_OPENAI) {
      // Enable Google search (only for OpenAI models, requires authentication)
      this.useGeminiWebSearch = true;
      this.excludeTools.push('google_web_search'); // Exclude built-in Google search
    }
  }

  /**
   * Find the best available Gemini model.
   */
  private async findBestGeminiModel(): Promise<TProviderWithModel | null> {
    try {
      // Check for Google Auth via webSearchEngine parameter
      const hasGoogleAuth = this.webSearchEngine === 'google';
      if (hasGoogleAuth) {
        return {
          id: uuid(),
          name: 'Gemini Google Auth',
          platform: 'gemini-with-google-auth',
          baseUrl: '',
          apiKey: '',
          useModel: 'gemini-2.5-flash',
        };
      }

      return null;
    } catch (error) {
      console.error('[ConversationTools] Error finding Gemini model:', error);
      return null;
    }
  }

  /**
   * Create dedicated Gemini configuration.
   */
  private createDedicatedGeminiConfig(geminiModel: TProviderWithModel): Config {
    // Create minimal config used specifically for Gemini WebSearch
    return new Config({
      sessionId: 'gemini-websearch-' + Date.now(),
      targetDir: process.cwd(),
      cwd: process.cwd(),
      debugMode: false,
      question: '',
      // parameter 'fullContext' was removed in aioncli-core v0.18.4
      userMemory: '',
      geminiMdFileCount: 0,
      model: geminiModel.useModel,
    });
  }

  /**
   * Get tool configuration for current conversation.
   */
  getConfig() {
    return {
      useGeminiWebSearch: this.useGeminiWebSearch,
      useAionuiWebFetch: this.useAionuiWebFetch,
      geminiModel: this.geminiModel,
      excludeTools: this.excludeTools,
    };
  }

  /**
   * Register custom tools for the given Config.
   * Called after conversation initialization.
   */
  async registerCustomTools(config: Config, geminiClient: GeminiClient): Promise<void> {
    const toolRegistry = await config.getToolRegistry();

    // Register aionui_web_fetch tool (all models)
    if (this.useAionuiWebFetch) {
      const customWebFetchTool = new WebFetchTool(geminiClient, config.getMessageBus());
      toolRegistry.registerTool(customWebFetchTool);
    }

    if (this.imageGenerationModel) {
      // Register aionui_image_generation tool (all models)
      const imageGenTool = new ImageGenerationTool(config, this.imageGenerationModel, this.proxy);
      toolRegistry.registerTool(imageGenTool);
    }

    // Register gemini_web_search tool (OpenAI models only)
    if (this.useGeminiWebSearch) {
      try {
        // Create client directly if authorized via webSearchEngine parameter
        // Create dedicated Config if it doesn't exist
        if (!this.dedicatedConfig) {
          const geminiModel = await this.findBestGeminiModel();
          if (geminiModel) {
            this.geminiModel = geminiModel;
            this.dedicatedConfig = this.createDedicatedGeminiConfig(geminiModel);
            const authType = AuthType.LOGIN_WITH_GOOGLE; // Fixed use of Google authentication

            await this.dedicatedConfig.initialize();
            await this.dedicatedConfig.refreshAuth(authType);

            // Create new GeminiClient to check authentication status
            this.dedicatedGeminiClient = this.dedicatedConfig.getGeminiClient();
          }
        }

        // Only register tool if Config successfully created
        if (this.dedicatedConfig && this.dedicatedGeminiClient) {
          const customWebSearchTool = new WebSearchTool(this.dedicatedConfig, this.dedicatedConfig.getMessageBus());
          toolRegistry.registerTool(customWebSearchTool);
        }
      } catch (error) {
        console.warn('Failed to register gemini_web_search tool:', error);
        // Error here doesn't affect other tool registration
      }
    }

    // Sync tools to model client
    await geminiClient.setTools();
  }
}
