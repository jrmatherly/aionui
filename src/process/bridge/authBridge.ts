/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, clearCachedCredentialFile, Config, getOauthInfoWithCache, loginWithOauth, Storage } from '@office-ai/aioncli-core';
import * as fs from 'node:fs';
import { ipcBridge } from '../../common';
import { authLogger as log } from '@/common/logger';

export function initAuthBridge(): void {
  ipcBridge.googleAuth.status.provider(async ({ proxy }) => {
    try {
      // First try to get user info from cache
      const info = await getOauthInfoWithCache(proxy);

      if (info) return { success: true, data: { account: info.email } };

      // If cache retrieval failed, check if credential file exists
      // This can happen when: terminal is logged in but google_accounts.json has active: null
      try {
        const credsPath = Storage.getOAuthCredsPath();
        const credsExist = fs.existsSync(credsPath);
        if (credsExist) {
          // Credentials file exists but getOauthInfoWithCache failed, token may need refresh
          // Read credentials file to check for refresh_token
          const credsContent = fs.readFileSync(credsPath, 'utf-8');
          const creds = JSON.parse(credsContent);
          if (creds.refresh_token) {
            // Has refresh_token, credentials are valid but may need refresh when used
            log.info('Credentials exist with refresh_token, returning success');
            return { success: true, data: { account: 'Logged in (refresh needed)' } };
          }
        }
      } catch (fsError) {
        // Ignore filesystem errors, continue to return false
        log.debug({ err: fsError }, 'Error checking credentials file');
      }

      return { success: false };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  // Google OAuth login handler
  ipcBridge.googleAuth.login.provider(async ({ proxy }) => {
    try {
      // Create config object with proxy settings
      const config = new Config({
        proxy,
        sessionId: '',
        targetDir: '',
        debugMode: false,
        cwd: '',
        model: '',
      });

      // Execute OAuth login flow
      // Add timeout to prevent hanging if user doesn't complete login
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Login timed out after 2 minutes')), 2 * 60 * 1000);
      });

      const client = await Promise.race([loginWithOauth(AuthType.LOGIN_WITH_GOOGLE, config), timeoutPromise]);

      if (client) {
        // After successful login, verify credentials were saved properly
        try {
          // Brief delay to ensure credential file is written
          await new Promise((resolve) => setTimeout(resolve, 500));

          const oauthInfo = await getOauthInfoWithCache(proxy);
          if (oauthInfo && oauthInfo.email) {
            log.info({ account: oauthInfo.email }, 'Login successful');
            return { success: true, data: { account: oauthInfo.email } };
          }

          // Credential retrieval failed - login returned client but credentials weren't saved properly
          log.warn('Login completed but no credentials found');
          return {
            success: false,
            msg: 'Login completed but credentials were not saved. Please try again.',
          };
        } catch (error) {
          log.error({ err: error }, 'Failed to verify credentials after login');
          return {
            success: false,
            msg: `Login verification failed: ${error.message || error.toString()}`,
          };
        }
      }

      // Login failed, return error message
      return { success: false, msg: 'Login failed: No client returned' };
    } catch (error) {
      // Catch all exceptions during login to prevent unhandled errors from showing error dialogs
      log.error({ err: error }, 'Login error');
      return { success: false, msg: error.message || error.toString() };
    }
  });

  ipcBridge.googleAuth.logout.provider(async () => {
    return await clearCachedCredentialFile();
  });
}
