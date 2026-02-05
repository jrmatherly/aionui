/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpLogger as log } from '@/common/logger';
import { ProcessConfig } from '@/process/initStorage';
import type { AcpBackendAll, PresetAgentType } from '@/types/acpTypes';
import { POTENTIAL_ACP_CLIS } from '@/types/acpTypes';
import { execSync } from 'child_process';

interface DetectedAgent {
  backend: AcpBackendAll;
  name: string;
  cliPath?: string;
  acpArgs?: string[];
  customAgentId?: string; // UUID for custom agents
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: PresetAgentType; // Primary agent type for presets
}

/**
 * Global ACP Detector - Detects once at startup, shares results globally
 */
class AcpDetector {
  private detectedAgents: DetectedAgent[] = [];
  private isDetected = false;

  /**
   * Add custom agents to detected list if configured and enabled (appends to end).
   */
  private async addCustomAgentsToList(detected: DetectedAgent[]): Promise<void> {
    try {
      const customAgents = await ProcessConfig.get('acp.customAgents');
      if (!customAgents || !Array.isArray(customAgents) || customAgents.length === 0) return;

      // Filter enabled agents with valid CLI path or marked as preset
      const enabledAgents = customAgents.filter((agent) => agent.enabled && (agent.defaultCliPath || agent.isPreset));
      if (enabledAgents.length === 0) return;

      // Append all custom agents to the end
      const customDetectedAgents: DetectedAgent[] = enabledAgents.map((agent) => ({
        backend: 'custom',
        name: agent.name || 'Custom Agent',
        cliPath: agent.defaultCliPath,
        acpArgs: agent.acpArgs,
        customAgentId: agent.id, // Store the UUID for identification
        isPreset: agent.isPreset,
        context: agent.context,
        avatar: agent.avatar,
        presetAgentType: agent.presetAgentType, // Primary agent type
      }));

      detected.push(...customDetectedAgents);
    } catch (error) {
      // Distinguish expected vs unexpected errors when reading config
      if (error instanceof Error && (error.message.includes('ENOENT') || error.message.includes('not found'))) {
        // No custom agents configured - this is normal
        return;
      }
      log.warn({ err: error }, 'Unexpected error loading custom agents');
    }
  }

  /**
   * Execute detection at startup - Detect installed CLIs using POTENTIAL_ACP_CLIS list
   */
  async initialize(): Promise<void> {
    if (this.isDetected) return;

    log.info('Starting agent detection...');
    const startTime = Date.now();

    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';

    const isCliAvailable = (cliCommand: string): boolean => {
      // Keep original behavior: prefer where/which, then fallback on Windows to Get-Command.
      try {
        execSync(`${whichCommand} ${cliCommand}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 1000,
        });
        return true;
      } catch {
        if (!isWindows) return false;
      }

      if (isWindows) {
        try {
          // PowerShell fallback for shim scripts like claude.ps1 (vfox)
          execSync(`powershell -NoProfile -NonInteractive -Command "Get-Command -All ${cliCommand} | Select-Object -First 1 | Out-Null"`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 1000,
          });
          return true;
        } catch {
          return false;
        }
      }

      return false;
    };

    const detected: DetectedAgent[] = [];

    // Detect all potential ACP CLIs in parallel
    const detectionPromises = POTENTIAL_ACP_CLIS.map((cli) => {
      return Promise.resolve().then(() => {
        if (!isCliAvailable(cli.cmd)) {
          return null;
        }

        return {
          backend: cli.backendId,
          name: cli.name,
          cliPath: cli.cmd,
          acpArgs: cli.args,
        };
      });
    });

    const results = await Promise.allSettled(detectionPromises);

    // Collect detection results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        detected.push(result.value);
      }
    }

    // If ACP tools detected, add built-in Gemini
    if (detected.length > 0) {
      detected.unshift({
        backend: 'gemini',
        name: 'Gemini CLI',
        cliPath: undefined,
        acpArgs: undefined,
      });
    }

    // Check for custom agents configuration - insert after claude if found
    await this.addCustomAgentsToList(detected);

    this.detectedAgents = detected;
    this.isDetected = true;

    const elapsed = Date.now() - startTime;
    log.info({ elapsed, agentCount: detected.length }, 'Detection completed');
  }

  /**
   * Get detection results
   */
  getDetectedAgents(): DetectedAgent[] {
    return this.detectedAgents;
  }

  /**
   * Check if any ACP tools are available
   */
  hasAgents(): boolean {
    return this.detectedAgents.length > 0;
  }

  /**
   * Refresh custom agents detection only (called when config changes)
   */
  async refreshCustomAgents(): Promise<void> {
    // Remove existing custom agents if present
    this.detectedAgents = this.detectedAgents.filter((agent) => agent.backend !== 'custom');

    // Re-add custom agents with current config
    await this.addCustomAgentsToList(this.detectedAgents);
  }
}

// Singleton instance
export const acpDetector = new AcpDetector();
