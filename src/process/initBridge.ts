/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initUserApiKeyService } from '@/common/UserApiKeyService';
import { initLogger } from '@/common/logger';
import { logger } from '@office-ai/platform';
import { getDatabase } from '@process/database';
import { cronService } from '@process/services/cron/CronService';
import { GlobalModelService } from '@process/services/GlobalModelService';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { initAllBridges } from './bridge';

const log = initLogger;
logger.config({ print: true });

// Initialize all IPC bridges
initAllBridges();

// Initialize services that require database and JWT secret
try {
  const db = getDatabase();
  const jwtSecret = AuthService.getJwtSecret();

  // Initialize per-user API key storage
  initUserApiKeyService(db.getRawDb(), jwtSecret);
  log.info('UserApiKeyService initialized');

  // Initialize global model service (admin-managed shared models)
  GlobalModelService.initialize(db.getRawDb(), jwtSecret);
  log.info('GlobalModelService initialized');
} catch (error) {
  log.error({ err: error }, 'Failed to initialize services');
}

// Initialize cron service (load jobs from database and start timers)
void cronService.init().catch((error) => {
  log.error({ err: error }, 'Failed to initialize CronService');
});
