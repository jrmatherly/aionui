/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP Skill Manager - Provides on-demand skill loading for ACP agents (Claude/OpenCode/Codex)
 * Inspired by aioncli-core's SkillManager design
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getBuiltinSkillsDir, getSkillsDir } from '../initStorage';
import { acpLogger as log } from '@/common/logger';

/**
 * Skill definition (compatible with aioncli-core)
 */
export interface SkillDefinition {
  /** Unique skill name */
  name: string;
  /** Skill description (for indexing) */
  description: string;
  /** File path */
  location: string;
  /** Full content (lazy loaded) */
  body?: string;
}

/**
 * Skill index (lightweight, for first message injection)
 */
export interface SkillIndex {
  name: string;
  description: string;
}

/**
 * Parse frontmatter from SKILL.md
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const result: { name?: string; description?: string } = {};

  // Parse name
  const nameMatch = frontmatter.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  // Parse description (supports single quotes, double quotes, or no quotes)
  const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  return result;
}

/**
 * Remove frontmatter, keep only body content
 */
function extractBody(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
}

/**
 * ACP Skill Manager
 * Provides skills index loading and on-demand retrieval for ACP agents
 *
 * Uses singleton pattern to avoid repeated filesystem scans
 *
 * Supports two types of skills:
 * - Builtin skills (_builtin/): Auto-injected for all scenarios
 * - Optional skills: Controlled via enabledSkills parameter
 */
export class AcpSkillManager {
  private static instance: AcpSkillManager | null = null;
  private static instanceKey: string | null = null;

  private skills: Map<string, SkillDefinition> = new Map();
  private builtinSkills: Map<string, SkillDefinition> = new Map();
  private skillsDir: string;
  private builtinSkillsDir: string;
  private initialized: boolean = false;
  private builtinInitialized: boolean = false;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || getSkillsDir();
    this.builtinSkillsDir = getBuiltinSkillsDir();
  }

  /**
   * Get singleton instance (with enabledSkills cache key)
   *
   * @param enabledSkills - Enabled skills list, used as cache key
   * @returns AcpSkillManager instance
   */
  static getInstance(enabledSkills?: string[]): AcpSkillManager {
    const cacheKey = enabledSkills?.sort().join(',') || 'all';

    // If cache key changed, need to recreate instance
    if (AcpSkillManager.instance && AcpSkillManager.instanceKey === cacheKey) {
      return AcpSkillManager.instance;
    }

    // Create new instance
    AcpSkillManager.instance = new AcpSkillManager();
    AcpSkillManager.instanceKey = cacheKey;
    return AcpSkillManager.instance;
  }

  /**
   * Reset singleton instance (for testing or config changes)
   */
  static resetInstance(): void {
    AcpSkillManager.instance = null;
    AcpSkillManager.instanceKey = null;
  }

  /**
   * Initialize: discover and load index of builtin skills (auto-injected for all scenarios)
   */
  async discoverBuiltinSkills(): Promise<void> {
    if (this.builtinInitialized) return;

    const builtinDir = this.builtinSkillsDir;
    if (!existsSync(builtinDir)) {
      log.info({ builtinDir }, 'Builtin skills directory not found');
      this.builtinInitialized = true;
      return;
    }

    try {
      const entries = await fs.readdir(builtinDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillName = entry.name;
        const skillFile = path.join(builtinDir, skillName, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const { name, description } = parseFrontmatter(content);

          const skillDef: SkillDefinition = {
            name: name || skillName,
            description: description || `Builtin Skill: ${skillName}`,
            location: skillFile,
            // body is not loaded here, retrieved on-demand
          };

          this.builtinSkills.set(skillName, skillDef);
        } catch (error) {
          log.warn({ skillName, err: error }, 'Failed to load builtin skill');
        }
      }

      log.info({ count: this.builtinSkills.size }, 'Discovered builtin skills');
    } catch (error) {
      log.error({ err: error }, 'Failed to discover builtin skills');
    }

    this.builtinInitialized = true;
  }

  /**
   * Initialize: discover and load index of all skills (without body)
   */
  async discoverSkills(enabledSkills?: string[]): Promise<void> {
    // Always load builtin skills first
    await this.discoverBuiltinSkills();

    if (this.initialized) return;

    const skillsDir = this.skillsDir;
    if (!existsSync(skillsDir)) {
      log.warn({ skillsDir }, 'Skills directory not found');
      this.initialized = true;
      return;
    }

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillName = entry.name;

        // Skip builtin skills directory
        if (skillName === '_builtin') continue;

        // If enabledSkills is specified, only load enabled ones
        if (enabledSkills && enabledSkills.length > 0 && !enabledSkills.includes(skillName)) {
          continue;
        }

        const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const { name, description } = parseFrontmatter(content);

          const skillDef: SkillDefinition = {
            name: name || skillName,
            description: description || `Skill: ${skillName}`,
            location: skillFile,
            // body is not loaded here, retrieved on-demand
          };

          this.skills.set(skillName, skillDef);
        } catch (error) {
          log.warn({ skillName, err: error }, 'Failed to load skill');
        }
      }

      log.info({ count: this.skills.size }, 'Discovered optional skills');
    } catch (error) {
      log.error({ err: error }, 'Failed to discover skills');
    }

    this.initialized = true;
  }

  /**
   * Get index of all skills (lightweight)
   * Includes builtin skills + optional skills
   */
  getSkillsIndex(): SkillIndex[] {
    // Merge builtin and optional skills
    const allSkills: SkillIndex[] = [];

    // Builtin skills first
    for (const skill of this.builtinSkills.values()) {
      allSkills.push({
        name: skill.name,
        description: skill.description,
      });
    }

    // Then optional skills
    for (const skill of this.skills.values()) {
      allSkills.push({
        name: skill.name,
        description: skill.description,
      });
    }

    return allSkills;
  }

  /**
   * Get index of builtin skills only
   */
  getBuiltinSkillsIndex(): SkillIndex[] {
    return Array.from(this.builtinSkills.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  /**
   * Check if there are any skills (builtin or optional)
   */
  hasAnySkills(): boolean {
    return this.builtinSkills.size > 0 || this.skills.size > 0;
  }

  /**
   * Get full content of a skill by name (on-demand loading)
   * Search builtin skills first, then optional skills
   */
  async getSkill(name: string): Promise<SkillDefinition | null> {
    // Search builtin skills first
    let skill = this.builtinSkills.get(name);
    // Then search optional skills
    if (!skill) {
      skill = this.skills.get(name);
    }
    if (!skill) return null;

    // If body hasn't been loaded yet, load it now
    if (skill.body === undefined) {
      try {
        const content = await fs.readFile(skill.location, 'utf-8');
        skill.body = extractBody(content);
      } catch (error) {
        log.warn({ skillName: name, err: error }, 'Failed to load skill body');
        skill.body = '';
      }
    }

    return skill;
  }

  /**
   * Get full content of multiple skills
   */
  async getSkills(names: string[]): Promise<SkillDefinition[]> {
    const results: SkillDefinition[] = [];
    for (const name of names) {
      const skill = await this.getSkill(name);
      if (skill) {
        results.push(skill);
      }
    }
    return results;
  }

  /**
   * Check if a skill exists (including builtin and optional)
   */
  hasSkill(name: string): boolean {
    return this.builtinSkills.has(name) || this.skills.has(name);
  }

  /**
   * Clear cached body content (for refresh)
   */
  clearCache(): void {
    for (const skill of this.builtinSkills.values()) {
      skill.body = undefined;
    }
    for (const skill of this.skills.values()) {
      skill.body = undefined;
    }
  }
}

/**
 * Build skills index text (for first message injection)
 */
export function buildSkillsIndexText(skills: SkillIndex[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);

  return `[Available Skills]
The following skills are available. When you need detailed instructions for a specific skill,
you can request it by outputting: [LOAD_SKILL: skill-name]

${lines.join('\n')}`;
}

/**
 * Detect if message requests loading a skill
 */
export function detectSkillLoadRequest(content: string): string[] {
  const matches = content.matchAll(/\[LOAD_SKILL:\s*([^\]]+)\]/gi);
  const requested: string[] = [];
  for (const match of matches) {
    requested.push(match[1].trim());
  }
  return requested;
}

/**
 * Build skill content text (for injection)
 */
export function buildSkillContentText(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';

  return skills.map((s) => `[Skill: ${s.name}]\n${s.body}`).join('\n\n');
}
