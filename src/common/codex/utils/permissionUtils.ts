/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexPermissionOption } from '../types/permissionTypes';
import { PERMISSION_DECISION_MAP, PermissionSeverity, PermissionType } from '../types/permissionTypes';

/**
 * Base permission options configuration
 * Provides four standard permission decision options
 */
const BASE_PERMISSION_OPTIONS: ReadonlyArray<CodexPermissionOption> = [
  {
    optionId: 'allow_once',
    name: 'codex.permissions.allow_once',
    kind: 'allow_once' as const,
    description: 'codex.permissions.allow_once_desc',
    severity: PermissionSeverity.LOW,
  },
  {
    optionId: 'allow_always',
    name: 'codex.permissions.allow_always',
    kind: 'allow_always' as const,
    description: 'codex.permissions.allow_always_desc',
    severity: PermissionSeverity.MEDIUM,
  },
  {
    optionId: 'reject_once',
    name: 'codex.permissions.reject_once',
    kind: 'reject_once' as const,
    description: 'codex.permissions.reject_once_desc',
    severity: PermissionSeverity.LOW,
  },
  {
    optionId: 'reject_always',
    name: 'codex.permissions.reject_always',
    kind: 'reject_always' as const,
    description: 'codex.permissions.reject_always_desc',
    severity: PermissionSeverity.HIGH,
  },
] as const;

/**
 * Permission configuration interface
 */
interface PermissionConfig {
  titleKey: string;
  descriptionKey: string;
  icon: string;
  severity: PermissionSeverity;
  options: CodexPermissionOption[];
}

/**
 * Predefined permission configurations
 * Provides standardized configuration for different types of permission requests
 */
const PERMISSION_CONFIGS: Record<PermissionType, PermissionConfig> = {
  [PermissionType.COMMAND_EXECUTION]: {
    titleKey: 'codex.permissions.titles.command_execution',
    descriptionKey: 'codex.permissions.descriptions.command_execution',
    icon: '⚡',
    severity: PermissionSeverity.HIGH,
    options: createPermissionOptions(PermissionType.COMMAND_EXECUTION),
  },
  [PermissionType.FILE_WRITE]: {
    titleKey: 'codex.permissions.titles.file_write',
    descriptionKey: 'codex.permissions.descriptions.file_write',
    icon: '📝',
    severity: PermissionSeverity.MEDIUM,
    options: createPermissionOptions(PermissionType.FILE_WRITE),
  },
  [PermissionType.FILE_READ]: {
    titleKey: 'codex.permissions.titles.file_read',
    descriptionKey: 'codex.permissions.descriptions.file_read',
    icon: '📖',
    severity: PermissionSeverity.LOW,
    options: createPermissionOptions(PermissionType.FILE_READ),
  },
};

/**
 * Create options for specific permission type
 * Generates type-specific description keys for each option
 */
function createPermissionOptions(permissionType: PermissionType): CodexPermissionOption[] {
  return BASE_PERMISSION_OPTIONS.map((option) => ({
    ...option,
    description: `codex.permissions.${permissionType}.${option.optionId}_desc`,
  }));
}

/**
 * Get permission configuration
 */
function getPermissionConfig(type: PermissionType): PermissionConfig {
  return PERMISSION_CONFIGS[type];
}

/**
 * Create options by permission type
 * Factory function to simplify permission option creation
 */
export function createPermissionOptionsForType(permissionType: PermissionType): CodexPermissionOption[] {
  const config = getPermissionConfig(permissionType);
  return config.options;
}

/**
 * Convert UI option decision to backend decision
 */
export function mapPermissionDecision(optionId: keyof typeof PERMISSION_DECISION_MAP): string {
  return PERMISSION_DECISION_MAP[optionId] || 'denied';
}

/**
 * Get display information for permission type
 */
export function getPermissionDisplayInfo(type: PermissionType) {
  const config = getPermissionConfig(type);
  return {
    titleKey: config.titleKey,
    descriptionKey: config.descriptionKey,
    icon: config.icon,
    severity: config.severity,
  };
}
