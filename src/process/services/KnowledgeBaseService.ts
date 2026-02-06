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
import { getSkillsDir } from '@process/initStorage';
import path from 'path';
import { getDirectoryService } from './DirectoryService';
import { getMiseEnvironmentService } from './MiseEnvironmentService';

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
 * Detailed source info for a single RAG chunk used in a response
 */
export interface KBSourceDetail {
  file: string;
  page: number;
  chunkIndex: number;
  score?: number;
  textPreview: string;
}

/**
 * Stage-level progress event from ingest.py
 */
export interface KBIngestProgress {
  stage: 'extracting' | 'setup' | 'chunking' | 'embedding' | 'indexing' | 'complete';
  detail?: string;
  percent: number;
  current?: number;
  total?: number;
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
   * Run a lance Python script with streaming progress via stderr.
   *
   * ingest.py emits JSON progress lines to stderr while the final result goes to stdout.
   * This method spawns the process, reads stderr line-by-line for progress callbacks,
   * then parses stdout for the final JSON result.
   */
  private async runLanceScriptWithProgress(scriptName: string, args: string[], workspaceDir: string, env: Record<string, string> | undefined, onProgress: (progress: KBIngestProgress) => void): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const { spawn } = await import('child_process');
    const miseService = getMiseEnvironmentService();

    if (!miseService.isMiseAvailable()) {
      return { success: false, error: 'Python environment not available' };
    }

    const skillsDir = getSkillsDir();
    const scriptPath = path.join(skillsDir, 'lance', 'scripts', scriptName);
    const fullArgs = ['exec', '--', 'python', scriptPath, ...args];

    return new Promise((resolve) => {
      const proc = spawn(miseService.getMiseCmd(), fullArgs, {
        cwd: workspaceDir,
        env: {
          ...process.env,
          ...miseService.getBaseMiseEnv(),
          ...env,
        },
      });

      let stdout = '';
      let stderrBuffer = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderrBuffer += data.toString();

        // Process complete lines from stderr
        const lines = stderrBuffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (parsed.progress) {
              onProgress({
                stage: parsed.stage as KBIngestProgress['stage'],
                detail: parsed.detail as string | undefined,
                percent: (parsed.percent as number) || 0,
                current: parsed.current as number | undefined,
                total: parsed.total as number | undefined,
              });
            }
          } catch {
            // Not a JSON progress line — log for debugging
            log.debug({ line: trimmed }, 'Non-progress stderr from ingest.py');
          }
        }
      });

      proc.on('close', (code) => {
        // Process any remaining stderr
        if (stderrBuffer.trim()) {
          try {
            const parsed = JSON.parse(stderrBuffer.trim()) as Record<string, unknown>;
            if (parsed.progress) {
              onProgress({
                stage: parsed.stage as KBIngestProgress['stage'],
                detail: parsed.detail as string | undefined,
                percent: (parsed.percent as number) || 0,
                current: parsed.current as number | undefined,
                total: parsed.total as number | undefined,
              });
            }
          } catch {
            // ignore
          }
        }

        if (code !== 0) {
          resolve({ success: false, error: `Script exited with code ${code}` });
          return;
        }

        try {
          const result = JSON.parse(stdout) as Record<string, unknown>;
          if (result.status === 'error') {
            resolve({ success: false, error: (result.error as string) || 'Unknown error' });
          } else {
            resolve({ success: true, data: result });
          }
        } catch {
          resolve({ success: false, error: `Failed to parse output: ${stdout.slice(0, 200)}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      // Kill after 5 minutes (large files)
      setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({ success: false, error: 'Ingestion timed out after 5 minutes' });
      }, 300_000);
    });
  }

  /**
   * Get the workspace directory for a user
   */
  private getWorkspaceDir(userId: string): string {
    const dirService = getDirectoryService();
    return dirService.getUserDirectories(userId).work_dir;
  }

  /**
   * Get embedding configuration for Python scripts
   *
   * Uses EMBEDDING_* environment variables exclusively.
   * Falls back to OPENAI_API_KEY if EMBEDDING_API_KEY is not set.
   *
   * @returns Environment variables to pass to Python scripts
   */
  private getEmbeddingEnv(): Record<string, string> {
    const env: Record<string, string> = {};

    const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
    if (apiKey) {
      env.EMBEDDING_API_KEY = apiKey;
      env.OPENAI_API_KEY = apiKey;
    }

    if (process.env.EMBEDDING_API_BASE) {
      env.EMBEDDING_API_BASE = process.env.EMBEDDING_API_BASE;
    }

    if (process.env.EMBEDDING_MODEL) {
      env.EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;
    }

    if (process.env.EMBEDDING_DIMENSIONS) {
      env.EMBEDDING_DIMENSIONS = process.env.EMBEDDING_DIMENSIONS;
    }

    return env;
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
   * Ingest a file with stage-level progress reporting.
   *
   * Uses streaming stderr from ingest.py to provide real-time progress
   * through extraction → chunking → embedding → indexing stages.
   */
  public async ingestFileWithProgress(userId: string, filePath: string, onProgress: (progress: KBIngestProgress) => void, options?: { chunkSize?: number; overlap?: number }): Promise<KBIngestResult> {
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

    log.info({ userId, filePath }, 'Ingesting file to knowledge base (with progress)');

    const result = await this.runLanceScriptWithProgress('ingest.py', args, workspaceDir, env, onProgress);

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
   * Ingest text content with stage-level progress reporting.
   */
  public async ingestWithProgress(userId: string, sourceFile: string, textContent: string, onProgress: (progress: KBIngestProgress) => void, options?: { chunkSize?: number; overlap?: number }): Promise<KBIngestResult> {
    const workspaceDir = this.getWorkspaceDir(userId);
    const args = [workspaceDir, sourceFile, '--text', textContent];

    if (options?.chunkSize) {
      args.push('--chunk-size', String(options.chunkSize));
    }
    if (options?.overlap) {
      args.push('--overlap', String(options.overlap));
    }

    const env = this.getEmbeddingEnv();

    log.info({ userId, sourceFile, textLength: textContent.length }, 'Ingesting document to knowledge base (with progress)');

    const result = await this.runLanceScriptWithProgress('ingest.py', args, workspaceDir, env, onProgress);

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
  public async searchForContext(userId: string, query: string, options?: { maxTokens?: number; limit?: number }): Promise<{ context: string; sources: string[]; sourceDetails: KBSourceDetail[]; tokenEstimate: number }> {
    const maxTokens = options?.maxTokens || 4000;
    const limit = options?.limit || 10;

    const results = await this.search(userId, query, { type: 'hybrid', limit });

    if (results.length === 0) {
      return { context: '', sources: [], sourceDetails: [], tokenEstimate: 0 };
    }

    // Build context string, respecting token limit
    const contextParts: string[] = [];
    const sources = new Set<string>();
    const sourceDetails: KBSourceDetail[] = [];
    let totalChars = 0;
    const maxChars = maxTokens / TOKENS_PER_CHAR;

    for (const result of results) {
      const chunk = `[Source: ${result.source_file}, Page ${result.page}]\n${result.text}\n`;
      if (totalChars + chunk.length > maxChars) {
        break;
      }
      contextParts.push(chunk);
      sources.add(result.source_file);
      sourceDetails.push({
        file: result.source_file,
        page: result.page,
        chunkIndex: result.chunk_index,
        score: result.score,
        textPreview: result.text.substring(0, 120) + (result.text.length > 120 ? '...' : ''),
      });
      totalChars += chunk.length;
    }

    const context = contextParts.length > 0 ? `<knowledge_base_context>\nThe following information was retrieved from the user's knowledge base:\n\n${contextParts.join('\n---\n')}\n</knowledge_base_context>` : '';

    return {
      context,
      sources: Array.from(sources),
      sourceDetails,
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
