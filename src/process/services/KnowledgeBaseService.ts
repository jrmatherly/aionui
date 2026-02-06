/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * KnowledgeBaseService - RAG integration for per-user knowledge bases
 *
 * Provides:
 * - Document ingestion with automatic chunking and embedding
 * - Semantic, keyword, and hybrid search
 * - Context-aware retrieval for AI conversations
 * - Token estimation for context window management
 *
 * Uses LanceDB via Python scripts in skills/lance/scripts/
 */

import { kbLogger as log } from '@/common/logger';
import { getDirectoryService } from './DirectoryService';
import { getMiseEnvironmentService } from './MiseEnvironmentService';
import { getSkillsDir } from '@process/initStorage';
import path from 'path';

/**
 * Search result from knowledge base
 */
export interface KBSearchResult {
  id: string;
  text: string;
  source_file: string;
  page: number;
  chunk_index: number;
  score?: number;
}

/**
 * Knowledge base status
 */
export interface KBStatus {
  initialized: boolean;
  documentCount: number;
  chunkCount: number;
  storageMB: number;
  version?: number;
}

/**
 * Ingestion result
 */
export interface KBIngestResult {
  success: boolean;
  chunksAdded: number;
  version?: number;
  error?: string;
}

/**
 * Approximate tokens per character (conservative estimate)
 */
const TOKENS_PER_CHAR = 0.25;

/**
 * Default context window size if unknown
 */
const DEFAULT_CONTEXT_SIZE = 128_000;

/**
 * Singleton service for knowledge base operations
 */
class KnowledgeBaseService {
  private static instance: KnowledgeBaseService;

  private constructor() {}

  public static getInstance(): KnowledgeBaseService {
    if (!KnowledgeBaseService.instance) {
      KnowledgeBaseService.instance = new KnowledgeBaseService();
    }
    return KnowledgeBaseService.instance;
  }

  /**
   * Run a lance Python script and parse JSON output
   */
  private async runLanceScript(scriptName: string, args: string[], workspaceDir: string, env?: Record<string, string>): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const miseService = getMiseEnvironmentService();

    if (!miseService.isMiseAvailable()) {
      return { success: false, error: 'Python environment not available' };
    }

    const skillsDir = getSkillsDir();
    const scriptPath = path.join(skillsDir, 'lance', 'scripts', scriptName);

    try {
      const output = await miseService.miseExecSync('python', [scriptPath, ...args], workspaceDir, env);

      // Parse JSON output
      const result = JSON.parse(output) as Record<string, unknown>;

      if (result.status === 'error') {
        return { success: false, error: (result.error as string) || 'Unknown error' };
      }

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ err: error, scriptName, args }, 'Failed to run lance script');
      return { success: false, error: message };
    }
  }

  /**
   * Get the workspace directory for a user
   */
  private getWorkspaceDir(userId: string): string {
    const dirService = getDirectoryService();
    return dirService.getUserDirectories(userId).work_dir;
  }

  /**
   * Get embedding configuration from environment
   * Supports custom OpenAI-compatible endpoints (Azure, LiteLLM, etc.)
   *
   * Environment variables (in order of precedence):
   * - EMBEDDING_API_KEY: API key for embedding provider
   * - EMBEDDING_API_BASE: Base URL for OpenAI-compatible endpoint
   * - OPENAI_API_KEY: Fallback if EMBEDDING_API_KEY not set
   */
  private getEmbeddingEnv(): Record<string, string> {
    const env: Record<string, string> = {};

    // API key (EMBEDDING_API_KEY takes precedence over OPENAI_API_KEY)
    const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
    if (apiKey) {
      env.EMBEDDING_API_KEY = apiKey;
      env.OPENAI_API_KEY = apiKey; // Also set for backward compatibility
    }

    // Custom base URL for OpenAI-compatible endpoints
    if (process.env.EMBEDDING_API_BASE) {
      env.EMBEDDING_API_BASE = process.env.EMBEDDING_API_BASE;
    }

    return env;
  }

  /**
   * Get OpenAI API key from environment (deprecated, use getEmbeddingEnv)
   */
  private getOpenAIKey(): string {
    return process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '';
  }

  /**
   * Estimate token count from text
   */
  public estimateTokens(text: string): number {
    return Math.ceil(text.length * TOKENS_PER_CHAR);
  }

  /**
   * Check if content would exceed context window
   */
  public wouldExceedContext(contentLength: number, contextSize: number = DEFAULT_CONTEXT_SIZE): boolean {
    const estimatedTokens = this.estimateTokens(String(contentLength));
    // Leave 20% buffer for system prompt and response
    return estimatedTokens > contextSize * 0.8;
  }

  /**
   * Get knowledge base status for a user
   */
  public async getStatus(userId: string): Promise<KBStatus> {
    const workspaceDir = this.getWorkspaceDir(userId);
    const result = await this.runLanceScript('manage.py', [workspaceDir, 'stats'], workspaceDir);

    if (!result.success || !result.data) {
      return {
        initialized: false,
        documentCount: 0,
        chunkCount: 0,
        storageMB: 0,
      };
    }

    const data = result.data;
    const knowledge = data.knowledge as Record<string, unknown> | undefined;

    return {
      initialized: data.initialized === true,
      documentCount: (knowledge?.unique_sources as number) || 0,
      chunkCount: (knowledge?.row_count as number) || 0,
      storageMB: (data.size_mb as number) || 0,
      version: knowledge?.version as number | undefined,
    };
  }

  /**
   * Ingest a document into the knowledge base (from text content)
   */
  public async ingest(userId: string, sourceFile: string, textContent: string, options?: { chunkSize?: number; overlap?: number }): Promise<KBIngestResult> {
    const workspaceDir = this.getWorkspaceDir(userId);
    const args = [workspaceDir, sourceFile, '--text', textContent];

    if (options?.chunkSize) {
      args.push('--chunk-size', String(options.chunkSize));
    }
    if (options?.overlap) {
      args.push('--overlap', String(options.overlap));
    }

    const env = this.getEmbeddingEnv();

    log.info({ userId, sourceFile, textLength: textContent.length }, 'Ingesting document to knowledge base');

    const result = await this.runLanceScript('ingest.py', args, workspaceDir, env);

    if (!result.success) {
      return { success: false, chunksAdded: 0, error: result.error };
    }

    return {
      success: true,
      chunksAdded: (result.data?.chunks_added as number) || 0,
      version: result.data?.version as number | undefined,
    };
  }

  /**
   * Ingest a document from a file path (supports binary files like PDFs)
   *
   * Use this for binary file types that can't be read as UTF-8.
   * The Python script handles text extraction for PDFs using pypdf.
   */
  public async ingestFile(userId: string, filePath: string, options?: { chunkSize?: number; overlap?: number }): Promise<KBIngestResult> {
    const workspaceDir = this.getWorkspaceDir(userId);
    const sourceFile = path.basename(filePath);
    const args = [workspaceDir, sourceFile, '--file', filePath];

    if (options?.chunkSize) {
      args.push('--chunk-size', String(options.chunkSize));
    }
    if (options?.overlap) {
      args.push('--overlap', String(options.overlap));
    }

    const env = this.getEmbeddingEnv();

    log.info({ userId, filePath }, 'Ingesting file to knowledge base');

    const result = await this.runLanceScript('ingest.py', args, workspaceDir, env);

    if (!result.success) {
      return { success: false, chunksAdded: 0, error: result.error };
    }

    return {
      success: true,
      chunksAdded: (result.data?.chunks_added as number) || 0,
      version: result.data?.version as number | undefined,
    };
  }

  /**
   * Search the knowledge base
   */
  public async search(userId: string, query: string, options?: { type?: 'vector' | 'fts' | 'hybrid'; limit?: number; filter?: string }): Promise<KBSearchResult[]> {
    const workspaceDir = this.getWorkspaceDir(userId);
    const searchType = options?.type || 'hybrid';
    const limit = options?.limit || 10;

    const args = [workspaceDir, query, '--type', searchType, '--limit', String(limit)];

    if (options?.filter) {
      args.push('--filter', options.filter);
    }

    const env = this.getEmbeddingEnv();

    const result = await this.runLanceScript('search.py', args, workspaceDir, env);

    if (!result.success || !result.data) {
      log.warn({ userId, query, error: result.error }, 'Knowledge base search failed');
      return [];
    }

    return (result.data.results as KBSearchResult[]) || [];
  }

  /**
   * Search and format results for inclusion in AI context
   * Returns a formatted string ready to be added to the conversation
   */
  public async searchForContext(userId: string, query: string, options?: { maxTokens?: number; limit?: number }): Promise<{ context: string; sources: string[]; tokenEstimate: number }> {
    const maxTokens = options?.maxTokens || 4000;
    const limit = options?.limit || 10;

    const results = await this.search(userId, query, { type: 'hybrid', limit });

    if (results.length === 0) {
      return { context: '', sources: [], tokenEstimate: 0 };
    }

    // Build context string, respecting token limit
    const contextParts: string[] = [];
    const sources = new Set<string>();
    let totalChars = 0;
    const maxChars = maxTokens / TOKENS_PER_CHAR;

    for (const result of results) {
      const chunk = `[Source: ${result.source_file}, Page ${result.page}]\n${result.text}\n`;
      if (totalChars + chunk.length > maxChars) {
        break;
      }
      contextParts.push(chunk);
      sources.add(result.source_file);
      totalChars += chunk.length;
    }

    const context = contextParts.length > 0 ? `<knowledge_base_context>\nThe following information was retrieved from the user's knowledge base:\n\n${contextParts.join('\n---\n')}\n</knowledge_base_context>` : '';

    return {
      context,
      sources: Array.from(sources),
      tokenEstimate: this.estimateTokens(context),
    };
  }

  /**
   * Delete a document from the knowledge base
   */
  public async deleteDocument(userId: string, sourceFile: string): Promise<{ success: boolean; deletedChunks: number; error?: string }> {
    const workspaceDir = this.getWorkspaceDir(userId);
    const result = await this.runLanceScript('manage.py', [workspaceDir, 'delete', sourceFile], workspaceDir);

    if (!result.success) {
      return { success: false, deletedChunks: 0, error: result.error };
    }

    return {
      success: true,
      deletedChunks: (result.data?.deleted_chunks as number) || 0,
    };
  }

  /**
   * Initialize the knowledge base for a user
   * Creates an empty knowledge base if it doesn't exist (idempotent)
   *
   * @param userId - User ID
   * @returns Initialization result
   */
  public async initialize(userId: string): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> {
    const workspaceDir = this.getWorkspaceDir(userId);
    const env = this.getEmbeddingEnv();

    log.info({ userId }, 'Initializing knowledge base');

    const result = await this.runLanceScript('manage.py', [workspaceDir, 'init'], workspaceDir, env);

    if (!result.success) {
      log.warn({ userId, error: result.error }, 'Failed to initialize knowledge base');
      return { success: false, error: result.error };
    }

    const alreadyExists = result.data?.already_exists === true;
    log.info({ userId, alreadyExists }, alreadyExists ? 'Knowledge base already initialized' : 'Knowledge base initialized');

    return { success: true, alreadyExists };
  }

  /**
   * Check if a file should be added to knowledge base based on size
   * Returns true if file is large enough to benefit from RAG
   */
  public shouldUseRAG(textContent: string, contextSize: number = DEFAULT_CONTEXT_SIZE): boolean {
    const tokens = this.estimateTokens(textContent);
    // Suggest RAG for files that would take up more than 30% of context
    return tokens > contextSize * 0.3;
  }
}

/**
 * Get the singleton KnowledgeBaseService instance
 */
export function getKnowledgeBaseService(): KnowledgeBaseService {
  return KnowledgeBaseService.getInstance();
}

export default KnowledgeBaseService;
