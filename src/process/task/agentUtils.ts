/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpLogger as log } from '@/common/logger';
import { getSkillsDir, loadSkillsContent } from '@process/initStorage';
import { AcpSkillManager, buildSkillsIndexText } from './AcpSkillManager';
import { shouldSearchKnowledgeBase, formatRAGContext } from './RagUtils';

/**
 * First message processing configuration
 */
export interface FirstMessageConfig {
  /** Preset context/rules */
  presetContext?: string;
  /** Enabled skills list */
  enabledSkills?: string[];
}

/**
 * Build system instructions content (full skills content injection - for Gemini)
 *
 * @param config - First message configuration
 * @returns System instructions string or undefined
 */
export async function buildSystemInstructions(config: FirstMessageConfig): Promise<string | undefined> {
  const instructions: string[] = [];

  // Add preset context
  if (config.presetContext) {
    instructions.push(config.presetContext);
  }

  // Load and add skills content
  if (config.enabledSkills && config.enabledSkills.length > 0) {
    const skillsContent = await loadSkillsContent(config.enabledSkills);
    if (skillsContent) {
      instructions.push(skillsContent);
    }
  }

  if (instructions.length === 0) {
    return undefined;
  }

  return instructions.join('\n\n');
}

/**
 * Inject system instructions for first message (full skills content - for Gemini)
 *
 * Note: Use direct prefix instead of XML tags to ensure external agents like Claude Code CLI can recognize it
 *
 * @param content - Original message content
 * @param config - First message configuration
 * @returns Message content with system instructions injected
 */
export async function prepareFirstMessage(content: string, config: FirstMessageConfig): Promise<string> {
  const systemInstructions = await buildSystemInstructions(config);

  if (!systemInstructions) {
    return content;
  }

  // Use direct prefix format similar to Gemini Agent to ensure Claude/Codex can recognize it
  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
}

/**
 * Prepare first message: inject rules + skills INDEX (not full content)
 *
 * Used for ACP agents (Claude/OpenCode) and Codex, Agent reads skill files on-demand using Read tool
 *
 * Note: Builtin skills (in _builtin/ directory) are auto-injected, no need to specify in enabledSkills
 *
 * @param content - Original message content
 * @param config - First message configuration
 * @returns Message content with system instructions injected
 */
export async function prepareFirstMessageWithSkillsIndex(content: string, config: FirstMessageConfig): Promise<string> {
  const instructions: string[] = [];

  // 1. Add preset rules
  if (config.presetContext) {
    instructions.push(config.presetContext);
  }

  // 2. Load skills INDEX (including builtin skills + optional skills)
  // Use singleton to avoid repeated filesystem scans
  const skillManager = AcpSkillManager.getInstance(config.enabledSkills);
  // discoverSkills auto-loads builtin skills first
  await skillManager.discoverSkills(config.enabledSkills);

  // Only inject if there are any skills
  if (skillManager.hasAnySkills()) {
    const skillsIndex = skillManager.getSkillsIndex();
    if (skillsIndex.length > 0) {
      // getSkillsDir() already returns CLI-safe path (symlink on macOS)
      const skillsDir = getSkillsDir();
      const builtinSkillsDir = skillsDir + '/_builtin';
      const indexText = buildSkillsIndexText(skillsIndex);

      // Tell Agent where skills files are located for on-demand reading
      const skillsInstruction = `${indexText}

[Skills Location]
Skills are stored in two locations:
- Builtin skills (auto-enabled): ${builtinSkillsDir}/{skill-name}/SKILL.md
- Optional skills: ${skillsDir}/{skill-name}/SKILL.md

Each skill has a SKILL.md file containing detailed instructions.
To use a skill, read its SKILL.md file when needed.

For example:
- Builtin "cron" skill: ${builtinSkillsDir}/cron/SKILL.md
- Optional "pptx" skill: ${skillsDir}/pptx/SKILL.md`;

      instructions.push(skillsInstruction);
    }
  }

  if (instructions.length === 0) {
    return content;
  }

  const systemInstructions = instructions.join('\n\n');
  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
}

/**
 * Result of RAG context preparation
 */
export interface RAGPrepareResult {
  /** Message content with RAG context injected (if applicable) */
  content: string;
  /** Whether RAG context was added */
  ragUsed: boolean;
  /** Source files that provided context */
  sources: string[];
  /** Estimated tokens added by RAG context */
  tokenEstimate: number;
}

/**
 * RAG preparation options
 */
export interface RAGPrepareOptions {
  /** Maximum tokens for RAG context (default: 4000) */
  maxContextTokens?: number;
  /** Maximum number of search results (default: 10) */
  searchLimit?: number;
  /** Force RAG search regardless of pattern matching */
  forceSearch?: boolean;
  /** Files attached to the message */
  attachedFiles?: string[];
}

/**
 * Prepare message with RAG (Retrieval-Augmented Generation) context
 *
 * This function:
 * 1. Checks if the message should trigger knowledge base search
 * 2. Searches the user's knowledge base for relevant context
 * 3. Injects context before the user's message
 *
 * @param content - Original message content
 * @param userId - User ID for per-user knowledge base access
 * @param options - RAG preparation options
 * @returns Message with RAG context and metadata
 */
export async function prepareMessageWithRAGContext(content: string, userId: string, options?: RAGPrepareOptions): Promise<RAGPrepareResult> {
  const noRAGResult: RAGPrepareResult = {
    content,
    ragUsed: false,
    sources: [],
    tokenEstimate: 0,
  };

  try {
    // Import KnowledgeBaseService dynamically to avoid circular deps
    const { getKnowledgeBaseService } = await import('@process/services/KnowledgeBaseService');
    const kbService = getKnowledgeBaseService();

    // Check if knowledge base exists for this user
    const status = await kbService.getStatus(userId);

    if (!status.initialized || status.documentCount === 0) {
      log.debug({ userId }, 'No knowledge base or empty, skipping RAG');
      return noRAGResult;
    }

    // Check if message should trigger RAG
    const shouldSearch = shouldSearchKnowledgeBase(content, {
      force: options?.forceSearch,
      attachedFiles: options?.attachedFiles,
      hasKnowledgeBase: true,
    });

    if (!shouldSearch) {
      log.debug({ userId, message: content.substring(0, 50) }, 'Message does not trigger RAG');
      return noRAGResult;
    }

    // Search knowledge base
    log.info({ userId, query: content.substring(0, 100) }, 'Searching knowledge base for context');

    const searchResult = await kbService.searchForContext(userId, content, {
      maxTokens: options?.maxContextTokens || 4000,
      limit: options?.searchLimit || 10,
    });

    if (!searchResult.context || searchResult.sources.length === 0) {
      log.debug({ userId }, 'No relevant context found in knowledge base');
      return noRAGResult;
    }

    // Format and inject context
    const formattedContext = formatRAGContext(searchResult.context, searchResult.sources);
    const enhancedContent = `${formattedContext}[User Query]\n${content}`;

    log.info(
      {
        userId,
        sources: searchResult.sources,
        tokenEstimate: searchResult.tokenEstimate,
      },
      'RAG context injected into message'
    );

    return {
      content: enhancedContent,
      ragUsed: true,
      sources: searchResult.sources,
      tokenEstimate: searchResult.tokenEstimate,
    };
  } catch (error) {
    // RAG failure should not block the message
    log.warn({ userId, err: error }, 'RAG preparation failed, continuing without context');
    return noRAGResult;
  }
}
