/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * RAG (Retrieval-Augmented Generation) Utilities
 *
 * Provides:
 * - Detection of when RAG context should be injected
 * - File type and size analysis for auto-ingestion
 * - Token estimation utilities
 */

import { acpLogger as log } from '@/common/logger';
import path from 'path';
import fs from 'fs';

/**
 * Patterns that indicate the user is asking about document content
 * These trigger knowledge base search
 */
const RAG_TRIGGER_PATTERNS = [
  // Summary and explanation requests
  /\b(summariz|explain|describe|overview|outline)\w*/i,
  /\bwhat (does|is|are|was|were|did)\b/i,
  /\btell me (about|what|how)\b/i,

  // Document-specific queries
  /\b(from|in|within) (the|this|my|that) (document|file|pdf|contract|report|paper|attachment)/i,
  /\baccording to\b/i,
  /\bbased on (the|this|my)\b/i,
  /\bthe (document|file|pdf|contract|report) (says|states|mentions|contains)/i,

  // Search and lookup
  /\b(find|search|look up|look for|locate)\b/i,
  /\bwhere (does|is|are|did)\b/i,

  // Analysis requests
  /\bkey (points|terms|findings|takeaways|sections|clauses)/i,
  /\bmain (points|ideas|themes|topics|conclusions)/i,
  /\b(analyze|analysis|review|extract)\b/i,

  // Specific content queries
  /\b(definition|meaning|section|paragraph|page|clause)\b.*\b(of|about|regarding|in)\b/i,
  /\bwhat (are|is) the\b.*\b(terms|conditions|requirements|obligations)/i,
];

/**
 * File extensions that can be ingested into knowledge base
 */
const INGESTIBLE_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.txt', '.md', '.markdown', '.rtf', '.html', '.htm', '.csv', '.json', '.xml']);

/**
 * Approximate tokens per character for estimation
 */
const TOKENS_PER_CHAR = 0.25;

/**
 * Threshold in estimated tokens for auto-ingestion
 * Files larger than this are candidates for RAG
 */
const _AUTO_INGEST_TOKEN_THRESHOLD = 10_000; // Reserved for future use

/**
 * Threshold in bytes for considering a file "large"
 * ~10K tokens ≈ 40KB of text
 */
const LARGE_FILE_BYTE_THRESHOLD = 40_000;

/**
 * Check if a message should trigger knowledge base search
 *
 * @param message - User message content
 * @param options - Detection options
 * @returns Whether RAG context should be searched
 */
export function shouldSearchKnowledgeBase(
  message: string,
  options?: {
    /** Force search regardless of pattern matching */
    force?: boolean;
    /** Files attached to the message */
    attachedFiles?: string[];
    /** Whether knowledge base has any documents */
    hasKnowledgeBase?: boolean;
    /** Whether large files were auto-ingested this turn (forces RAG) */
    hasAutoIngestedFiles?: boolean;
  }
): boolean {
  // Explicit force flag
  if (options?.force) {
    return true;
  }

  // Large files were auto-ingested to KB and removed from workspace —
  // the ONLY way the agent can access their content is through RAG
  if (options?.hasAutoIngestedFiles) {
    log.debug('RAG forced: large files were auto-ingested to knowledge base');
    return true;
  }

  // Don't search if no knowledge base exists
  if (options?.hasKnowledgeBase === false) {
    return false;
  }

  // Check pattern matching
  const matchesPattern = RAG_TRIGGER_PATTERNS.some((pattern) => pattern.test(message));

  if (matchesPattern) {
    log.debug({ message: message.substring(0, 100) }, 'RAG trigger pattern matched');
    return true;
  }

  // If files are attached, more likely to need RAG
  if (options?.attachedFiles && options.attachedFiles.length > 0) {
    // Check if message references the files
    const fileReferences = /\b(file|document|attached|upload|pdf|contract)\b/i;
    if (fileReferences.test(message)) {
      log.debug({ fileCount: options.attachedFiles.length }, 'RAG triggered by file reference');
      return true;
    }
  }

  return false;
}

/**
 * Check if a file is a candidate for knowledge base ingestion
 *
 * @param filePath - Path to the file
 * @returns Whether the file should be ingested
 */
export function isIngestibleFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return INGESTIBLE_EXTENSIONS.has(ext);
}

/**
 * Check if a file is large enough to benefit from RAG
 * (i.e., would potentially overflow context window)
 *
 * @param filePath - Path to the file
 * @returns Whether the file is large enough for RAG
 */
export function isLargeFile(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return stats.size > LARGE_FILE_BYTE_THRESHOLD;
  } catch {
    // If we can't stat the file, assume it's not large
    return false;
  }
}

/**
 * Get files that should be auto-ingested to knowledge base
 *
 * @param files - Array of file paths
 * @returns Files that should be ingested
 */
export function getFilesForAutoIngest(files: string[]): string[] {
  return files.filter((file) => {
    // Must be ingestible type
    if (!isIngestibleFile(file)) {
      return false;
    }

    // Must be large enough to benefit from RAG
    if (!isLargeFile(file)) {
      log.debug({ file }, 'File too small for auto-ingest');
      return false;
    }

    log.debug({ file }, 'File selected for auto-ingest');
    return true;
  });
}

/**
 * Estimate token count from text length
 *
 * @param text - Text content
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

/**
 * Estimate token count from file size
 *
 * @param bytes - File size in bytes
 * @returns Estimated token count
 */
export function estimateTokensFromSize(bytes: number): number {
  // Assume file content is roughly the same size as bytes for text files
  return Math.ceil(bytes * TOKENS_PER_CHAR);
}

/**
 * Check if content would exceed a context window limit
 *
 * @param text - Text content
 * @param contextLimit - Context window size in tokens
 * @param reservedTokens - Tokens reserved for other content (default 20%)
 * @returns Whether content would overflow
 */
export function wouldExceedContext(text: string, contextLimit: number, reservedTokens?: number): boolean {
  const reserved = reservedTokens ?? contextLimit * 0.2;
  const available = contextLimit - reserved;
  const estimated = estimateTokens(text);
  return estimated > available;
}

/**
 * Format RAG context for injection into message
 *
 * @param context - Retrieved context from knowledge base
 * @param sources - Source file names
 * @returns Formatted context string
 */
export function formatRAGContext(context: string, sources: string[]): string {
  if (!context) {
    return '';
  }

  const sourceList = sources.length > 0 ? `\nSources: ${sources.join(', ')}` : '';

  return `<knowledge_base_context>
The following information was retrieved from the user's knowledge base to help answer their query:

${context}
${sourceList}
</knowledge_base_context>

`;
}

export default {
  shouldSearchKnowledgeBase,
  isIngestibleFile,
  isLargeFile,
  getFilesForAutoIngest,
  estimateTokens,
  estimateTokensFromSize,
  wouldExceedContext,
  formatRAGContext,
};
