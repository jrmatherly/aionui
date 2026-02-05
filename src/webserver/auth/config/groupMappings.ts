/**
 * @author Jason Matherly
 * @modified 2026-02-03
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UserRole } from '@process/database/types';
import fs from 'fs';
import { oidcLogger as log } from '@/common/logger';

/**
 * Maps an EntraID group object-ID to an application role.
 */
export interface IGroupRoleMapping {
  groupId: string; // EntraID group object ID
  groupName: string; // Human-readable label (display only)
  role: UserRole;
}

/**
 * Load group→role mappings.
 *
 * Priority:
 *   1. File at GROUP_MAPPINGS_FILE (default /etc/aionui/group-mappings.json)
 *   2. GROUP_MAPPINGS_JSON env var (JSON string)
 *   3. Empty array → all SSO users get 'user' role
 */
export function loadGroupMappings(): IGroupRoleMapping[] {
  // 1. Try file (only when explicitly configured or default path exists)
  const configPath = process.env.GROUP_MAPPINGS_FILE || '/etc/aionui/group-mappings.json';
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const mappings = JSON.parse(content) as IGroupRoleMapping[];
    log.info({ count: mappings.length, configPath }, 'Loaded group mappings from file');
    return mappings;
  } catch (error) {
    // File doesn't exist or isn't readable — fall through to env var check
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ err: error, configPath }, 'Failed to load group mappings from file');
    }
  }

  // 2. Try env var
  if (process.env.GROUP_MAPPINGS_JSON) {
    try {
      const mappings = JSON.parse(process.env.GROUP_MAPPINGS_JSON) as IGroupRoleMapping[];
      log.info({ count: mappings.length }, 'Loaded group mappings from GROUP_MAPPINGS_JSON');
      return mappings;
    } catch (error) {
      log.error({ err: error }, 'Failed to parse GROUP_MAPPINGS_JSON');
    }
  }

  // 3. No mappings
  return [];
}

/** Singleton — evaluated once at module load. */
export const GROUP_MAPPINGS = loadGroupMappings();

/**
 * Resolve the highest-priority role from a set of EntraID group IDs.
 * admin > user > viewer.  Falls back to 'user' when no groups match.
 */
export function resolveRoleFromGroups(userGroups: string[], mappings: IGroupRoleMapping[]): UserRole {
  const matched = mappings.filter((m) => userGroups.includes(m.groupId)).map((m) => m.role);

  if (matched.includes('admin')) return 'admin';
  if (matched.includes('user')) return 'user';
  if (matched.includes('viewer')) return 'viewer';
  return 'user'; // default
}
