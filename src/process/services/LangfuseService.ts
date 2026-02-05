/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Langfuse LLM Observability Service
 *
 * Provides centralized tracing and observability for LLM interactions via Langfuse.
 * Langfuse enables:
 * - Distributed tracing of LLM calls (prompts, completions, latency, tokens)
 * - Cost tracking and analysis
 * - Debugging production LLM behavior
 * - A/B testing and experimentation
 *
 * Configuration via environment variables or admin database settings.
 *
 * Usage:
 *   import { LangfuseService } from '@/process/services/LangfuseService';
 *
 *   // Initialize from env vars (app startup)
 *   await LangfuseService.initialize();
 *
 *   // Trace a generation
 *   const trace = LangfuseService.traceGeneration({
 *     name: 'chat-completion',
 *     input: { prompt: 'Hello' },
 *     output: { response: 'Hi there!' },
 *     model: 'gpt-4',
 *     userId: 'user123',
 *   });
 *
 *   // Flush traces on shutdown
 *   await LangfuseService.flush();
 */

import { createLogger } from '@/common/logger';
import Langfuse from 'langfuse';
import type { CreateGenerationBody, CreateSpanBody, CreateTraceBody } from 'langfuse';

const log = createLogger('Langfuse');

/**
 * Langfuse service configuration
 */
interface ILangfuseConfig {
  enabled: boolean;
  host: string;
  publicKey: string;
  secretKey: string;
}

/**
 * Singleton Langfuse service
 */
class LangfuseServiceImpl {
  private client: Langfuse | null = null;
  private config: ILangfuseConfig | null = null;

  /**
   * Initialize Langfuse from environment variables.
   * Should be called at application startup.
   */
  async initialize(config?: Partial<ILangfuseConfig>): Promise<void> {
    const enabled = config?.enabled ?? process.env.LANGFUSE_ENABLED === 'true';

    if (!enabled) {
      log.info('Langfuse disabled (LANGFUSE_ENABLED != true)');
      return;
    }

    const host = config?.host ?? process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com';
    const publicKey = config?.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY ?? '';
    const secretKey = config?.secretKey ?? process.env.LANGFUSE_SECRET_KEY ?? '';

    if (!publicKey || !secretKey) {
      log.warn('Langfuse enabled but missing credentials (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY)');
      return;
    }

    try {
      this.config = { enabled, host, publicKey, secretKey };

      this.client = new Langfuse({
        publicKey,
        secretKey,
        baseUrl: host,
      });

      log.info({ host }, 'Langfuse initialized successfully');
    } catch (error) {
      log.error({ err: error }, 'Failed to initialize Langfuse');
      this.client = null;
      this.config = null;
    }
  }

  /**
   * Check if Langfuse is enabled and configured.
   */
  isEnabled(): boolean {
    return this.client !== null && this.config?.enabled === true;
  }

  /**
   * Get the raw Langfuse client (for advanced usage).
   */
  getClient(): Langfuse | null {
    return this.client;
  }

  /**
   * Create a trace for an LLM generation.
   *
   * @example
   *   LangfuseService.traceGeneration({
   *     name: 'chat-completion',
   *     input: { prompt: 'Tell me a joke' },
   *     output: { response: 'Why did the chicken cross the road?' },
   *     model: 'gpt-4',
   *     userId: 'user123',
   *     metadata: { conversationId: 'conv456' },
   *   });
   */
  traceGeneration(params: { name: string; input?: any; output?: any; model?: string; userId?: string; sessionId?: string; metadata?: Record<string, any>; promptTokens?: number; completionTokens?: number; totalTokens?: number }): void {
    if (!this.isEnabled()) return;

    try {
      const trace = this.client!.trace({
        name: params.name,
        userId: params.userId,
        sessionId: params.sessionId,
        metadata: params.metadata,
      } as CreateTraceBody);

      trace.generation({
        name: params.name,
        model: params.model,
        input: params.input,
        output: params.output,
        usage: params.totalTokens
          ? {
              promptTokens: params.promptTokens,
              completionTokens: params.completionTokens,
              totalTokens: params.totalTokens,
            }
          : undefined,
      } as CreateGenerationBody);
    } catch (error) {
      log.error({ err: error }, 'Failed to trace generation');
    }
  }

  /**
   * Create a span for a multi-step conversation or workflow.
   *
   * @example
   *   const conversationId = 'conv123';
   *   LangfuseService.traceConversation({
   *     name: 'multi-turn-chat',
   *     sessionId: conversationId,
   *     userId: 'user123',
   *     steps: [
   *       { role: 'user', content: 'Hello' },
   *       { role: 'assistant', content: 'Hi there!' },
   *     ],
   *   });
   */
  traceConversation(params: { name: string; sessionId?: string; userId?: string; steps: Array<{ role: string; content: string }>; metadata?: Record<string, any> }): void {
    if (!this.isEnabled()) return;

    try {
      const trace = this.client!.trace({
        name: params.name,
        userId: params.userId,
        sessionId: params.sessionId,
        metadata: {
          ...params.metadata,
          messageCount: params.steps.length,
        },
      } as CreateTraceBody);

      params.steps.forEach((step, index) => {
        trace.span({
          name: `${params.name}-step-${index}`,
          input: { role: step.role, content: step.content },
        } as CreateSpanBody);
      });
    } catch (error) {
      log.error({ err: error }, 'Failed to trace conversation');
    }
  }

  /**
   * Flush pending traces to Langfuse (call before shutdown).
   * Returns a promise that resolves when all traces are sent.
   */
  async flush(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await this.client!.flushAsync();
      log.info('Langfuse traces flushed successfully');
    } catch (error) {
      log.error({ err: error }, 'Failed to flush Langfuse traces');
    }
  }

  /**
   * Shutdown Langfuse client (call at app termination).
   */
  async shutdown(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await this.flush();
      await this.client!.shutdownAsync();
      this.client = null;
      this.config = null;
      log.info('Langfuse shut down successfully');
    } catch (error) {
      log.error({ err: error }, 'Failed to shutdown Langfuse');
    }
  }
}

// Export singleton instance
export const LangfuseService = new LangfuseServiceImpl();
