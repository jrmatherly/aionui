/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getChannelManager } from '@/channels/core/ChannelManager';
import { getPairingService } from '@/channels/pairing/PairingService';
import type { IChannelPluginStatus } from '@/channels/types';
import { channel } from '@/common/ipcBridge';
import { channelLogger as log } from '@/common/logger';
import { getDatabase } from '@/process/database';

/**
 * Initialize Channel IPC Bridge
 * Handles communication between renderer (Settings UI) and main process (Channel system)
 */
export function initChannelBridge(): void {
  log.info('Initializing...');

  // ==================== Plugin Management ====================

  /**
   * Get status of all plugins
   */
  channel.getPluginStatus.provider(async () => {
    try {
      const db = getDatabase();
      const result = db.getChannelPlugins();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      const statuses: IChannelPluginStatus[] = result.data.map((plugin) => {
        // Check credentials based on plugin type
        let hasToken = false;
        if (plugin.type === 'lark') {
          hasToken = !!(plugin.credentials?.appId && plugin.credentials?.appSecret);
        } else {
          hasToken = !!plugin.credentials?.token;
        }

        return {
          id: plugin.id,
          type: plugin.type,
          name: plugin.name,
          enabled: plugin.enabled,
          connected: plugin.status === 'running',
          status: plugin.status,
          lastConnected: plugin.lastConnected,
          activeUsers: 0, // Will be populated from PluginManager when implemented
          hasToken,
        };
      });

      return { success: true, data: statuses };
    } catch (error: any) {
      log.error({ err: error }, 'getPluginStatus error');
      return { success: false, msg: error.message };
    }
  });

  /**
   * Enable a plugin
   */
  channel.enablePlugin.provider(async ({ pluginId, config }) => {
    try {
      const manager = getChannelManager();
      const result = await manager.enablePlugin(pluginId, config);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      return { success: true };
    } catch (error: any) {
      log.error({ err: error, pluginId }, 'enablePlugin error');
      return { success: false, msg: error.message };
    }
  });

  /**
   * Disable a plugin
   */
  channel.disablePlugin.provider(async ({ pluginId }) => {
    try {
      const manager = getChannelManager();
      const result = await manager.disablePlugin(pluginId);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      return { success: true };
    } catch (error: any) {
      log.error({ err: error, pluginId }, 'disablePlugin error');
      return { success: false, msg: error.message };
    }
  });

  /**
   * Test plugin connection (validate token)
   */
  channel.testPlugin.provider(async ({ pluginId, token, extraConfig }) => {
    try {
      const manager = getChannelManager();
      const result = await manager.testPlugin(pluginId, token, extraConfig);
      return { success: true, data: result };
    } catch (error: any) {
      log.error({ err: error, pluginId }, 'testPlugin error');
      return { success: false, data: { success: false, error: error.message } };
    }
  });

  // ==================== Pairing Management ====================

  /**
   * Get pending pairing requests
   */
  channel.getPendingPairings.provider(async () => {
    try {
      const db = getDatabase();
      const result = db.getPendingPairingRequests();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      log.error({ err: error }, 'getPendingPairings error');
      return { success: false, msg: error.message };
    }
  });

  /**
   * Approve a pairing request
   * Delegates to PairingService to avoid duplicate logic
   */
  channel.approvePairing.provider(async ({ code }) => {
    try {
      const pairingService = getPairingService();
      const result = await pairingService.approvePairing(code);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      log.info({ code }, 'Approved pairing');
      return { success: true };
    } catch (error: any) {
      log.error({ err: error, code }, 'approvePairing error');
      return { success: false, msg: error.message };
    }
  });

  /**
   * Reject a pairing request
   * Delegates to PairingService to avoid duplicate logic
   */
  channel.rejectPairing.provider(async ({ code }) => {
    try {
      const pairingService = getPairingService();
      const result = await pairingService.rejectPairing(code);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      log.info({ code }, 'Rejected pairing');
      return { success: true };
    } catch (error: any) {
      log.error({ err: error, code }, 'rejectPairing error');
      return { success: false, msg: error.message };
    }
  });

  // ==================== User Management ====================

  /**
   * Get all authorized users
   */
  channel.getAuthorizedUsers.provider(async () => {
    try {
      const db = getDatabase();
      const result = db.getChannelUsers();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      log.error({ err: error }, 'getAuthorizedUsers error');
      return { success: false, msg: error.message };
    }
  });

  /**
   * Revoke user authorization
   */
  channel.revokeUser.provider(async ({ userId }) => {
    try {
      const db = getDatabase();

      // Delete user (cascades to sessions)
      const result = db.deleteChannelUser(userId);

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      log.info({ userId }, 'Revoked user');
      return { success: true };
    } catch (error: any) {
      log.error({ err: error, userId }, 'revokeUser error');
      return { success: false, msg: error.message };
    }
  });

  // ==================== Session Management ====================

  /**
   * Get active sessions
   */
  channel.getActiveSessions.provider(async () => {
    try {
      const db = getDatabase();
      const result = db.getChannelSessions();

      if (!result.success || !result.data) {
        return { success: false, msg: result.error };
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      log.error({ err: error }, 'getActiveSessions error');
      return { success: false, msg: error.message };
    }
  });

  log.info('Initialized');
}
