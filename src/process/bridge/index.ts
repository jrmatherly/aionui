/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { initAcpConversationBridge } from './acpConversationBridge';
import { initApplicationBridge } from './applicationBridge';
import { initAuthBridge } from './authBridge';
import { initChannelBridge } from './channelBridge';
import { initCodexConversationBridge } from './codexConversationBridge';
import { initConversationBridge } from './conversationBridge';
import { initCronBridge } from './cronBridge';
import { initDatabaseBridge } from './databaseBridge';
import { initDialogBridge } from './dialogBridge';
import { initDocumentBridge } from './documentBridge';
import { initFileWatchBridge } from './fileWatchBridge';
import { initFsBridge } from './fsBridge';
import { initGeminiBridge } from './geminiBridge';
import { initGeminiConversationBridge } from './geminiConversationBridge';
import { initMcpBridge } from './mcpBridge';
import { initModelBridge } from './modelBridge';
import { initPreviewHistoryBridge } from './previewHistoryBridge';
import { initShellBridge } from './shellBridge';
import { initUpdateBridge } from './updateBridge';
import { initUserApiKeysBridge } from './userApiKeysBridge';
import { initWebuiBridge } from './webuiBridge';
import { initWindowControlsBridge } from './windowControlsBridge';

/**
 * Initialize all IPC bridge modules
 */
export function initAllBridges(): void {
  initDialogBridge();
  initShellBridge();
  initFsBridge();
  initFileWatchBridge();
  initConversationBridge();
  initApplicationBridge();
  initGeminiConversationBridge();
  // Extra Gemini helper bridge (subscription detection, etc.) needs to be available after core bridges
  initGeminiBridge();
  initAcpConversationBridge();
  initCodexConversationBridge();
  initAuthBridge();
  initModelBridge();
  initMcpBridge();
  initDatabaseBridge();
  initPreviewHistoryBridge();
  initDocumentBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initWebuiBridge();
  initChannelBridge();
  initCronBridge();
  initUserApiKeysBridge();
}

/**
 * Initialize ACP detector
 */
export async function initializeAcpDetector(): Promise<void> {
  try {
    await acpDetector.initialize();
  } catch (error) {
    console.error('[ACP] Failed to initialize detector:', error);
  }
}

// Export init functions for individual use
export { initAcpConversationBridge, initApplicationBridge, initAuthBridge, initChannelBridge, initCodexConversationBridge, initConversationBridge, initCronBridge, initDatabaseBridge, initDialogBridge, initDocumentBridge, initFsBridge, initGeminiBridge, initGeminiConversationBridge, initMcpBridge, initModelBridge, initPreviewHistoryBridge, initShellBridge, initUpdateBridge, initUserApiKeysBridge, initWebuiBridge, initWindowControlsBridge };
// Export window control utility functions
export { registerWindowMaximizeListeners } from './windowControlsBridge';
