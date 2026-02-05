/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/// Multi-threaded management model
// 1. Main process manages child processes -> Process manager that maintains all current child processes and handles their communication
// 2. Child process management handles different agent tasks based on agent type, while all child processes share the same communication mechanism
import { GeminiAgent } from '@/agent/gemini';
import { createLogger } from '@/common/logger';
import { forkTask } from './utils';

const log = createLogger('GeminiWorker');

export default forkTask(({ data }, pipe) => {
  pipe.log('gemini.init', data);
  log.debug({ presetRulesLength: data.presetRules?.length || 0 }, 'presetRules length');
  log.debug({ presetRulesPreview: data.presetRules?.substring(0, 200) || 'empty' }, 'presetRules preview');
  const agent = new GeminiAgent({
    ...data,
    onStreamEvent(event) {
      if (event.type === 'tool_group') {
        event.data = (event.data as any[]).map((tool: any) => {
          const { confirmationDetails, ...other } = tool;
          if (confirmationDetails) {
            const { onConfirm, ...details } = confirmationDetails;
            pipe.once(tool.callId, (confirmKey: string) => {
              onConfirm(confirmKey);
            });
            return {
              ...other,
              confirmationDetails: details,
            };
          }
          return other;
        });
      }
      pipe.call('gemini.message', event);
    },
  });
  pipe.on('stop.stream', (_, deferred) => {
    agent.stop();
    deferred.with(Promise.resolve());
  });
  pipe.on('init.history', (event: { text: string }, deferred) => {
    deferred.with(agent.injectConversationHistory(event.text));
  });
  pipe.on('send.message', (event: { input: string; msg_id: string; files?: string[] }, deferred) => {
    deferred.with(agent.send(event.input, event.msg_id, event.files));
  });

  return agent.bootstrap;
});
