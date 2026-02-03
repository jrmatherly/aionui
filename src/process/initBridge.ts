/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { cronService } from '@process/services/cron/CronService';
import { initAllBridges } from './bridge';

logger.config({ print: true });

// Initialize all IPC bridges
initAllBridges();

// Initialize cron service (load jobs from database and start timers)
void cronService.init().catch((error) => {
  console.error('[initBridge] Failed to initialize CronService:', error);
});
