/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 *
 * DirectoryService - Per-user and team directory isolation
 *
 * Provides:
 * - Per-user isolated directories (cache, workspace, skills, assistants)
 * - Team/organization shared directories
 * - Directory chain resolution for resource loading
 */

import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import type { IDirectoryChain, IOrgDirectories, ITeamDirectories, IUserDirectories } from '../database/types';
import { getSystemDir } from '../initStorage';
import { fsLogger as log } from '@/common/logger';

/**
 * Singleton service for managing per-user and team directory isolation
 */
export class DirectoryService {
  private static instance: DirectoryService | null = null;

  private constructor() {}

  static getInstance(): DirectoryService {
    if (!DirectoryService.instance) {
      DirectoryService.instance = new DirectoryService();
    }
    return DirectoryService.instance;
  }

  /**
   * Get the base directory for user data isolation
   * Uses the system cacheDir as the root
   */
  private getBaseDir(): string {
    return getSystemDir().cacheDir;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  private ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Get or create user directories
   * Creates the directory structure on first access
   */
  getUserDirectories(userId: string): IUserDirectories {
    const db = getDatabase();

    // Check if user directories already exist in DB
    const existing = db.getUserDirectories(userId);
    if (existing.success && existing.data) {
      // Ensure directories still exist on filesystem
      this.ensureDir(existing.data.cache_dir);
      this.ensureDir(existing.data.work_dir);
      if (existing.data.skills_dir) this.ensureDir(existing.data.skills_dir);
      if (existing.data.assistants_dir) this.ensureDir(existing.data.assistants_dir);
      return existing.data;
    }

    // Create new user directory structure
    const baseDir = path.join(this.getBaseDir(), 'users', userId);
    const userDirs: Omit<IUserDirectories, 'id' | 'created_at' | 'updated_at'> = {
      user_id: userId,
      base_dir: baseDir,
      cache_dir: path.join(baseDir, 'cache'),
      work_dir: path.join(baseDir, 'workspace'),
      skills_dir: path.join(baseDir, 'skills'),
      assistants_dir: path.join(baseDir, 'assistants'),
    };

    // Create directories on filesystem
    this.ensureDir(userDirs.cache_dir);
    this.ensureDir(userDirs.work_dir);
    this.ensureDir(userDirs.skills_dir!);
    this.ensureDir(userDirs.assistants_dir!);

    // Save to database
    const result = db.upsertUserDirectories(userDirs);
    if (!result.success || !result.data) {
      log.error({ userId, error: result.error }, 'Failed to save user directories');
      // Return computed directories even if DB save failed
      return {
        id: `udir_${userId}`,
        ...userDirs,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      };
    }

    log.info({ userId }, 'Created user directories');
    return result.data;
  }

  /**
   * Get user's cache directory
   */
  getUserCacheDir(userId: string): string {
    return this.getUserDirectories(userId).cache_dir;
  }

  /**
   * Get user's workspace directory (for CLI agents)
   */
  getUserWorkDir(userId: string): string {
    return this.getUserDirectories(userId).work_dir;
  }

  /**
   * Get user's skills directory
   */
  getUserSkillsDir(userId: string): string {
    const dirs = this.getUserDirectories(userId);
    return dirs.skills_dir || path.join(dirs.base_dir, 'skills');
  }

  /**
   * Get user's assistants directory
   */
  getUserAssistantsDir(userId: string): string {
    const dirs = this.getUserDirectories(userId);
    return dirs.assistants_dir || path.join(dirs.base_dir, 'assistants');
  }

  /**
   * Get or create team directories
   */
  getTeamDirectories(teamId: string): ITeamDirectories | null {
    const db = getDatabase();

    // Get team to find org_id
    const teamResult = db.getTeam(teamId);
    if (!teamResult.success || !teamResult.data) {
      return null;
    }

    // Check if team directories exist
    const existing = db.getTeamDirectories(teamId);
    if (existing.success && existing.data) {
      // Ensure directories exist
      this.ensureDir(existing.data.base_dir);
      if (existing.data.shared_skills_dir) this.ensureDir(existing.data.shared_skills_dir);
      if (existing.data.shared_assistants_dir) this.ensureDir(existing.data.shared_assistants_dir);
      if (existing.data.shared_workspace_dir) this.ensureDir(existing.data.shared_workspace_dir);
      return existing.data;
    }

    // Create new team directory structure
    const team = teamResult.data;
    const baseDir = path.join(this.getBaseDir(), 'organizations', team.org_id, 'teams', teamId);
    const teamDirs: Omit<ITeamDirectories, 'id' | 'created_at' | 'updated_at'> = {
      team_id: teamId,
      base_dir: baseDir,
      shared_skills_dir: path.join(baseDir, 'skills'),
      shared_assistants_dir: path.join(baseDir, 'assistants'),
      shared_workspace_dir: path.join(baseDir, 'workspace'),
    };

    // Create directories
    this.ensureDir(teamDirs.shared_skills_dir!);
    this.ensureDir(teamDirs.shared_assistants_dir!);
    this.ensureDir(teamDirs.shared_workspace_dir!);

    // Save to database
    const result = db.upsertTeamDirectories(teamDirs);
    if (!result.success || !result.data) {
      log.error({ teamId, error: result.error }, 'Failed to save team directories');
      return null;
    }

    log.info({ teamId }, 'Created team directories');
    return result.data;
  }

  /**
   * Get or create organization directories
   */
  getOrgDirectories(orgId: string): IOrgDirectories | null {
    const db = getDatabase();

    // Check if org directories exist
    const existing = db.getOrgDirectories(orgId);
    if (existing.success && existing.data) {
      this.ensureDir(existing.data.base_dir);
      if (existing.data.shared_skills_dir) this.ensureDir(existing.data.shared_skills_dir);
      if (existing.data.shared_assistants_dir) this.ensureDir(existing.data.shared_assistants_dir);
      return existing.data;
    }

    // Create new org directory structure
    const baseDir = path.join(this.getBaseDir(), 'organizations', orgId);
    const orgDirs: Omit<IOrgDirectories, 'id' | 'created_at' | 'updated_at'> = {
      org_id: orgId,
      base_dir: baseDir,
      shared_skills_dir: path.join(baseDir, 'shared', 'skills'),
      shared_assistants_dir: path.join(baseDir, 'shared', 'assistants'),
    };

    // Create directories
    this.ensureDir(orgDirs.shared_skills_dir!);
    this.ensureDir(orgDirs.shared_assistants_dir!);

    // Save to database
    const result = db.upsertOrgDirectories(orgDirs);
    if (!result.success || !result.data) {
      log.error({ orgId, error: result.error }, 'Failed to save org directories');
      return null;
    }

    log.info({ orgId }, 'Created org directories');
    return result.data;
  }

  /**
   * Get the full directory chain for a user
   * Used for resource resolution (skills, assistants)
   *
   * Resolution order: user -> teams -> org -> global
   */
  getDirectoryChain(userId: string): IDirectoryChain {
    const db = getDatabase();
    const systemDir = getSystemDir();

    // User directories (always created)
    const userDirs = this.getUserDirectories(userId);

    // Team directories (user may belong to multiple teams)
    const teamsResult = db.getUserTeams(userId);
    const teamDirs: ITeamDirectories[] = [];
    if (teamsResult.success && teamsResult.data) {
      for (const team of teamsResult.data) {
        const dirs = this.getTeamDirectories(team.id);
        if (dirs) teamDirs.push(dirs);
      }
    }

    // Organization directories (user may belong to orgs)
    const orgsResult = db.getUserOrganizations(userId);
    let orgDirs: IOrgDirectories | undefined;
    if (orgsResult.success && orgsResult.data && orgsResult.data.length > 0) {
      // Use first org (typically users belong to one org)
      const dirs = this.getOrgDirectories(orgsResult.data[0].id);
      if (dirs) orgDirs = dirs;
    }

    // Global directories (system-wide, builtin)
    const globalDirs = {
      skills_dir: path.join(systemDir.cacheDir, 'skills'),
      assistants_dir: path.join(systemDir.cacheDir, 'assistants'),
      builtin_skills_dir: path.join(systemDir.cacheDir, '_builtin', 'skills'),
    };

    return {
      user: userDirs,
      teams: teamDirs.length > 0 ? teamDirs : undefined,
      organization: orgDirs,
      global: globalDirs,
    };
  }

  /**
   * Resolve a skill path through the directory chain
   * Returns the first found path or null
   */
  resolveSkillPath(skillName: string, userId: string): string | null {
    const chain = this.getDirectoryChain(userId);

    // Check user skills first
    if (chain.user?.skills_dir) {
      const userPath = path.join(chain.user.skills_dir, skillName, 'SKILL.md');
      if (existsSync(userPath)) return path.dirname(userPath);
    }

    // Check team skills
    if (chain.teams) {
      for (const team of chain.teams) {
        if (team.shared_skills_dir) {
          const teamPath = path.join(team.shared_skills_dir, skillName, 'SKILL.md');
          if (existsSync(teamPath)) return path.dirname(teamPath);
        }
      }
    }

    // Check org skills
    if (chain.organization?.shared_skills_dir) {
      const orgPath = path.join(chain.organization.shared_skills_dir, skillName, 'SKILL.md');
      if (existsSync(orgPath)) return path.dirname(orgPath);
    }

    // Check global skills
    const globalPath = path.join(chain.global.skills_dir, skillName, 'SKILL.md');
    if (existsSync(globalPath)) return path.dirname(globalPath);

    // Check builtin skills
    const builtinPath = path.join(chain.global.builtin_skills_dir, skillName, 'SKILL.md');
    if (existsSync(builtinPath)) return path.dirname(builtinPath);

    return null;
  }

  /**
   * Resolve an assistant path through the directory chain
   * Returns the first found path or null
   */
  resolveAssistantPath(assistantId: string, userId: string): string | null {
    const chain = this.getDirectoryChain(userId);

    // Check user assistants first
    if (chain.user?.assistants_dir) {
      const userPath = path.join(chain.user.assistants_dir, assistantId, 'assistant.json');
      if (existsSync(userPath)) return path.dirname(userPath);
    }

    // Check team assistants
    if (chain.teams) {
      for (const team of chain.teams) {
        if (team.shared_assistants_dir) {
          const teamPath = path.join(team.shared_assistants_dir, assistantId, 'assistant.json');
          if (existsSync(teamPath)) return path.dirname(teamPath);
        }
      }
    }

    // Check org assistants
    if (chain.organization?.shared_assistants_dir) {
      const orgPath = path.join(chain.organization.shared_assistants_dir, assistantId, 'assistant.json');
      if (existsSync(orgPath)) return path.dirname(orgPath);
    }

    // Check global assistants
    const globalPath = path.join(chain.global.assistants_dir, assistantId, 'assistant.json');
    if (existsSync(globalPath)) return path.dirname(globalPath);

    return null;
  }

  /**
   * Get all skill directories in order of resolution priority
   * Used for listing available skills
   */
  getAllSkillDirectories(userId: string): string[] {
    const chain = this.getDirectoryChain(userId);
    const dirs: string[] = [];

    // User skills (highest priority)
    if (chain.user?.skills_dir && existsSync(chain.user.skills_dir)) {
      dirs.push(chain.user.skills_dir);
    }

    // Team skills
    if (chain.teams) {
      for (const team of chain.teams) {
        if (team.shared_skills_dir && existsSync(team.shared_skills_dir)) {
          dirs.push(team.shared_skills_dir);
        }
      }
    }

    // Org skills
    if (chain.organization?.shared_skills_dir && existsSync(chain.organization.shared_skills_dir)) {
      dirs.push(chain.organization.shared_skills_dir);
    }

    // Global skills
    if (existsSync(chain.global.skills_dir)) {
      dirs.push(chain.global.skills_dir);
    }

    // Builtin skills (lowest priority)
    if (existsSync(chain.global.builtin_skills_dir)) {
      dirs.push(chain.global.builtin_skills_dir);
    }

    return dirs;
  }

  /**
   * Initialize directories for a new user
   * Called when a user first logs in
   */
  initializeUserDirectories(userId: string): IUserDirectories {
    log.info({ userId }, 'Initializing directories for user');
    return this.getUserDirectories(userId);
  }

  /**
   * Clean up directories for a deleted user
   * Note: This only removes DB records; filesystem cleanup should be handled separately
   */
  cleanupUserDirectories(userId: string): void {
    const db = getDatabase();
    db.deleteUserDirectories(userId);
    log.info({ userId }, 'Removed directory records for user');
  }
}

// Export singleton getter
export function getDirectoryService(): DirectoryService {
  return DirectoryService.getInstance();
}
