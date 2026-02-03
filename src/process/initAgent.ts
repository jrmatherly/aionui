/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/ipcBridge';
import type { TChatConversation, TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import fs from 'fs/promises';
import path from 'path';
import { getSystemDir } from './initStorage';

/**
 * Create workspace directory (without copying files)
 *
 * Note: File copying is handled by copyFilesToDirectory in sendMessage
 * This avoids files being copied twice (once during session creation, once when sending message)
 */
const buildWorkspaceWidthFiles = async (defaultWorkspaceName: string, workspace?: string, _defaultFiles?: string[], providedCustomWorkspace?: boolean) => {
  // Use the customWorkspace flag provided by frontend, otherwise determine based on workspace parameter
  const customWorkspace = providedCustomWorkspace !== undefined ? providedCustomWorkspace : !!workspace;

  if (!workspace) {
    const tempPath = getSystemDir().workDir;
    workspace = path.join(tempPath, defaultWorkspaceName);
    await fs.mkdir(workspace, { recursive: true });
  } else {
    // Normalize path: remove trailing slashes, resolve to absolute path
    workspace = path.resolve(workspace);
  }

  return { workspace, customWorkspace };
};

export const createGeminiAgent = async (model: TProviderWithModel, workspace?: string, defaultFiles?: string[], webSearchEngine?: 'google' | 'default', customWorkspace?: boolean, contextFileName?: string, presetRules?: string, enabledSkills?: string[], presetAssistantId?: string): Promise<TChatConversation> => {
  const { workspace: newWorkspace, customWorkspace: finalCustomWorkspace } = await buildWorkspaceWidthFiles(`gemini-temp-${Date.now()}`, workspace, defaultFiles, customWorkspace);

  return {
    type: 'gemini',
    model,
    extra: {
      workspace: newWorkspace,
      customWorkspace: finalCustomWorkspace,
      webSearchEngine,
      contextFileName,
      // System rules
      presetRules,
      // Backward compatible: contextContent stores rules
      contextContent: presetRules,
      // Enabled skills list (loaded via SkillManager)
      enabledSkills,
      // Preset assistant ID for displaying name and avatar in conversation panel
      presetAssistantId,
    },
    desc: finalCustomWorkspace ? newWorkspace : '',
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: newWorkspace,
    id: uuid(),
  };
};

export const createAcpAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(`${extra.backend}-temp-${Date.now()}`, extra.workspace, extra.defaultFiles, extra.customWorkspace);
  return {
    type: 'acp',
    extra: {
      workspace: workspace,
      customWorkspace,
      backend: extra.backend,
      cliPath: extra.cliPath,
      agentName: extra.agentName,
      customAgentId: extra.customAgentId, // Also used to identify preset assistant
      presetContext: extra.presetContext, // Preset rules/prompts for intelligent assistant
      // Enabled skills list (loaded via SkillManager)
      enabledSkills: extra.enabledSkills,
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

export const createCodexAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(`codex-temp-${Date.now()}`, extra.workspace, extra.defaultFiles, extra.customWorkspace);
  return {
    type: 'codex',
    extra: {
      workspace: workspace,
      customWorkspace,
      cliPath: extra.cliPath,
      sandboxMode: 'workspace-write', // Default to read-write permission
      presetContext: extra.presetContext, // Preset rules/prompts for intelligent assistant
      // Enabled skills list (loaded via SkillManager)
      enabledSkills: extra.enabledSkills,
      // Preset assistant ID for displaying name and avatar in conversation panel
      presetAssistantId: extra.presetAssistantId,
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };
};
