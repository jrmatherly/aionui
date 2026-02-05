/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createLogger } from '@/common/logger';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { createErrorRecoveryKeyboard, createResponseActionsKeyboard } from '../plugins/telegram/TelegramKeyboards';
import type { ActionHandler, IRegisteredAction } from './types';
import { ChatActionNames, createErrorResponse, createSuccessResponse } from './types';

const log = createLogger('ChatActions');

/**
 * ChatActions - Handlers for chat/AI-related actions
 *
 * These actions involve AI processing through Gemini or other agents.
 * They handle message sending, regeneration, and continuation.
 */

/**
 * Handle chat.send - Send a message to AI and get response
 * Note: The actual AI processing is handled by ActionExecutor
 * This handler just prepares the response format
 */
export const handleChatSend: ActionHandler = async (context) => {
  // This action is special - it triggers AI processing
  // The ActionExecutor will handle the actual AI call
  // This handler is a placeholder for the action registration

  return createSuccessResponse({
    type: 'text',
    text: '⏳ Thinking...',
    parseMode: 'HTML',
  });
};

/**
 * Handle chat.regenerate - Regenerate the last AI response
 */
export const handleChatRegenerate: ActionHandler = async (context, params) => {
  const originalMessageId = params?.originalMessageId;

  if (!originalMessageId) {
    return createErrorResponse('Cannot find original message');
  }

  // This will trigger a regeneration
  // The ActionExecutor will handle the actual AI call
  return createSuccessResponse({
    type: 'text',
    text: '🔄 Regenerating...',
    parseMode: 'HTML',
  });
};

/**
 * Handle chat.continue - Continue the AI response
 */
export const handleChatContinue: ActionHandler = async (context, params) => {
  // This will trigger a continuation
  // The ActionExecutor will handle the actual AI call
  return createSuccessResponse({
    type: 'text',
    text: '💬 Continuing...',
    parseMode: 'HTML',
  });
};

/**
 * Handle action.copy - Copy response content
 * Note: Copy is handled client-side in Telegram
 */
export const handleCopy: ActionHandler = async (context, params) => {
  // Telegram doesn't support programmatic copy
  // We just show a toast message
  return {
    success: true,
    message: {
      type: 'text',
      text: '💡 Long press the message text to copy',
      parseMode: 'HTML',
    },
  };
};

/**
 * Handle tool confirmation from Telegram buttons
 * Callback data format: confirm:{callId}:{value}
 */
export const handleToolConfirm: ActionHandler = async (context, params) => {
  log.debug({ params }, 'handleToolConfirm called');
  const callId = params?.callId;
  const value = params?.value;
  const conversationId = context.conversationId;

  log.debug({ callId, value, conversationId }, 'Tool confirm parameters');

  if (!callId || !value || !conversationId) {
    log.error({ callId, value, conversationId }, 'Missing confirmation parameters');
    return createErrorResponse('Missing confirmation parameters');
  }

  try {
    // Only call confirm, don't send message - agent will continue and send updates
    await getChannelMessageService().confirm(conversationId, callId, value);
    log.info({ callId, conversationId }, 'Tool confirmation sent successfully');

    // Return success without message, agent will continue and update via stream callback
    return { success: true };
  } catch (error: any) {
    log.error({ err: error }, 'Tool confirmation failed');
    return createErrorResponse(`Confirmation failed: ${error.message}`);
  }
};

/**
 * All chat actions
 */
export const chatActions: IRegisteredAction[] = [
  {
    name: ChatActionNames.SEND,
    category: 'chat',
    description: 'Send a message to AI',
    handler: handleChatSend,
  },
  {
    name: ChatActionNames.REGENERATE,
    category: 'chat',
    description: 'Regenerate the last AI response',
    handler: handleChatRegenerate,
  },
  {
    name: ChatActionNames.CONTINUE,
    category: 'chat',
    description: 'Continue the AI response',
    handler: handleChatContinue,
  },
  {
    name: ChatActionNames.COPY,
    category: 'chat',
    description: 'Copy response content',
    handler: handleCopy,
  },
  {
    name: ChatActionNames.TOOL_CONFIRM,
    category: 'chat',
    description: 'Confirm tool execution',
    handler: handleToolConfirm,
  },
];

/**
 * Build a chat response with action buttons
 */
export function buildChatResponse(
  text: string,
  isComplete: boolean = true
): {
  text: string;
  parseMode: 'HTML' | 'MarkdownV2' | 'Markdown';
  replyMarkup?: unknown;
} {
  return {
    text,
    parseMode: 'HTML',
    replyMarkup: isComplete ? createResponseActionsKeyboard() : undefined,
  };
}

/**
 * Build an error response for chat failures
 */
export function buildChatErrorResponse(error: string): {
  text: string;
  parseMode: 'HTML' | 'MarkdownV2' | 'Markdown';
  replyMarkup?: unknown;
} {
  return {
    text: `❌ <b>Processing Failed</b>\n\n${error}\n\nPlease retry or start a new conversation.`,
    parseMode: 'HTML',
    replyMarkup: createErrorRecoveryKeyboard(),
  };
}

/**
 * Build a streaming indicator
 */
export function buildStreamingIndicator(partialText: string): {
  text: string;
  parseMode: 'HTML' | 'MarkdownV2' | 'Markdown';
} {
  return {
    text: partialText + ' ⏳',
    parseMode: 'HTML',
  };
}
