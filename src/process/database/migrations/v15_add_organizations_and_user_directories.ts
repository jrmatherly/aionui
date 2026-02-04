/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 *
 * Migration v15: Add organizations, teams, team_members, and user_directories tables
 *
 * This migration adds support for:
 * - Multi-tenant organizations
 * - Team-based resource sharing
 * - Per-user directory isolation (cache, workspace, skills, assistants)
 */

import type Database from 'better-sqlite3';

export function migrate_v15_add_organizations_and_user_directories(db: Database.Database): void {
  console.log('[Migration v15] Adding organizations, teams, and user_directories tables...');

  // Organizations table - top-level tenant container
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      settings TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
  `);
  console.log('[Migration v15] organizations table created');

  // Teams table - groups within an organization
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      settings TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      UNIQUE(org_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams(org_id);
    CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(org_id, slug);
  `);
  console.log('[Migration v15] teams table created');

  // Team members - user membership in teams with roles
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'viewer')),
      joined_at INTEGER NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(team_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
  `);
  console.log('[Migration v15] team_members table created');

  // Organization members - user membership in organizations (separate from teams)
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_members (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'viewer')),
      joined_at INTEGER NOT NULL,
      FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(org_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
  `);
  console.log('[Migration v15] org_members table created');

  // User directories - per-user isolated directory paths
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_directories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      base_dir TEXT NOT NULL,
      cache_dir TEXT NOT NULL,
      work_dir TEXT NOT NULL,
      skills_dir TEXT,
      assistants_dir TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_directories_user_id ON user_directories(user_id);
  `);
  console.log('[Migration v15] user_directories table created');

  // Team directories - shared directories for team resources
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_directories (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL UNIQUE,
      base_dir TEXT NOT NULL,
      shared_skills_dir TEXT,
      shared_assistants_dir TEXT,
      shared_workspace_dir TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_directories_team_id ON team_directories(team_id);
  `);
  console.log('[Migration v15] team_directories table created');

  // Organization directories - org-wide shared directories
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_directories (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL UNIQUE,
      base_dir TEXT NOT NULL,
      shared_skills_dir TEXT,
      shared_assistants_dir TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_directories_org_id ON org_directories(org_id);
  `);
  console.log('[Migration v15] org_directories table created');

  console.log('[Migration v15] All tables created successfully');
}

export function rollback_v15(db: Database.Database): void {
  console.log('[Migration v15] Rolling back...');

  db.exec(`
    DROP INDEX IF EXISTS idx_org_directories_org_id;
    DROP TABLE IF EXISTS org_directories;

    DROP INDEX IF EXISTS idx_team_directories_team_id;
    DROP TABLE IF EXISTS team_directories;

    DROP INDEX IF EXISTS idx_user_directories_user_id;
    DROP TABLE IF EXISTS user_directories;

    DROP INDEX IF EXISTS idx_org_members_user_id;
    DROP INDEX IF EXISTS idx_org_members_org_id;
    DROP TABLE IF EXISTS org_members;

    DROP INDEX IF EXISTS idx_team_members_user_id;
    DROP INDEX IF EXISTS idx_team_members_team_id;
    DROP TABLE IF EXISTS team_members;

    DROP INDEX IF EXISTS idx_teams_slug;
    DROP INDEX IF EXISTS idx_teams_org_id;
    DROP TABLE IF EXISTS teams;

    DROP INDEX IF EXISTS idx_organizations_slug;
    DROP TABLE IF EXISTS organizations;
  `);

  console.log('[Migration v15] Rollback complete');
}
