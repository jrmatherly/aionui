/**
 * @author Jason Matherly
 * @modified 2026-02-06
 * SPDX-License-Identifier: Apache-2.0
 *
 * MiseEnvironmentService - Per-user Python environment management via mise
 *
 * Provides:
 * - Automatic virtualenv creation and management per user workspace
 * - Python version management via mise
 * - Package installation via uv (fast pip alternative)
 * - Environment resolution for CLI agent spawning
 *
 * mise (mise-en-place) is a polyglot runtime manager that handles Python
 * versions, virtual environments, and integrates with uv for fast package
 * installation. See: https://mise.jdx.dev
 */

import { execFile, execFileSync, spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { closeSync, constants, existsSync, mkdirSync, openSync, statSync, writeFileSync, writeSync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import { getDirectoryService } from './DirectoryService';
import { getSkillsDir } from '@process/initStorage';
import { miseLogger as log } from '@/common/logger';

const execFileAsync = promisify(execFile);

/**
 * Result of resolving mise environment for a workspace
 */
export interface MiseEnvResult {
  /** Resolved environment variables */
  env: Record<string, string>;
  /** Resolved PATH */
  path: string;
  /** Path to Python executable in venv (if available) */
  pythonPath?: string;
  /** Path to virtual environment directory */
  venvPath?: string;
  /** Whether mise was successfully used */
  miseUsed: boolean;
}

/**
 * Information about an installed tool
 */
export interface MiseToolInfo {
  name: string;
  version: string;
  requested: string;
  install_path: string;
  source?: string;
}

/**
 * Status of a user's Python workspace
 */
export interface PythonWorkspaceStatus {
  initialized: boolean;
  miseAvailable: boolean;
  pythonVersion?: string;
  uvVersion?: string;
  venvExists: boolean;
  venvPath?: string;
  installedPackages?: string[];
}

/**
 * Singleton service for managing per-user Python environments via mise
 */
export class MiseEnvironmentService {
  private static instance: MiseEnvironmentService | null = null;

  /** Path to mise binary */
  private readonly miseCmd: string;

  /** Path to mise.toml template for new workspaces */
  private readonly templatePath: string;

  /** Base environment variables for mise commands */
  private readonly baseMiseEnv: Record<string, string>;

  private constructor() {
    // Validate and set mise command path
    // Security: Only allow absolute paths to prevent PATH injection
    const misePathFromEnv = process.env.MISE_INSTALL_PATH || '/usr/local/bin/mise';
    this.miseCmd = this.validateMisePath(misePathFromEnv);

    this.templatePath = process.env.MISE_TEMPLATE_PATH || '/mise/template.toml';

    // Environment for non-interactive mise operations
    this.baseMiseEnv = {
      MISE_YES: '1', // Auto-approve prompts
      MISE_EXPERIMENTAL: '1', // Enable prepare feature
      MISE_LOG_LEVEL: 'warn', // Reduce noise
    };
  }

  /**
   * Validate mise binary path for security
   * Only allows absolute paths to existing executables
   */
  private validateMisePath(misePath: string): string {
    // Must be absolute path
    if (!path.isAbsolute(misePath)) {
      log.warn({ misePath }, 'MISE_INSTALL_PATH must be absolute, using default');
      return '/usr/local/bin/mise';
    }

    // Must not contain shell metacharacters (defense in depth)
    if (/[;&|`$(){}[\]<>!]/.test(misePath)) {
      log.error({ misePath }, 'MISE_INSTALL_PATH contains invalid characters');
      return '/usr/local/bin/mise';
    }

    // Check if file exists and is executable (best effort)
    try {
      const stats = statSync(misePath);
      if (!stats.isFile()) {
        log.warn({ misePath }, 'MISE_INSTALL_PATH is not a file, using default');
        return '/usr/local/bin/mise';
      }
    } catch {
      // File doesn't exist yet (may be created later), allow it
      log.debug({ misePath }, 'mise binary not found at path (may be created later)');
    }

    return misePath;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MiseEnvironmentService {
    if (!MiseEnvironmentService.instance) {
      MiseEnvironmentService.instance = new MiseEnvironmentService();
    }
    return MiseEnvironmentService.instance;
  }

  /**
   * Check if mise is available on the system
   */
  isMiseAvailable(): boolean {
    try {
      // Security: Use execFileSync with args array to prevent command injection
      execFileSync(this.miseCmd, ['--version'], {
        stdio: 'pipe',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get mise version string
   */
  getMiseVersion(): string | null {
    try {
      // Security: Use execFileSync with args array to prevent command injection
      const output = execFileSync(this.miseCmd, ['--version'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      });
      return output.trim();
    } catch {
      return null;
    }
  }

  /**
   * Initialize mise environment for a user's workspace
   * Creates mise.toml and ensures tools are installed
   *
   * @param userId - User ID for workspace lookup
   * @returns Promise that resolves when initialization is complete
   */
  async initUserWorkspace(userId: string): Promise<void> {
    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);
    const workDir = userDirs.work_dir;
    const miseTomlPath = path.join(workDir, 'mise.toml');

    log.debug({ userId, workDir }, 'Initializing mise workspace');

    // Create mise.toml from template if not exists
    if (!existsSync(miseTomlPath)) {
      await this.createUserMiseToml(workDir, userId);
    }

    // Trust the config (non-interactive)
    await this.trustConfig(workDir);

    // Install tools (Python, uv)
    await this.installTools(workDir);

    // Trigger venv creation by running a command
    // The _.python.venv setting creates venv lazily on first mise exec
    await this.ensureVenvCreated(workDir);

    // Auto-install skill requirements if available (first-time setup)
    // Security: Use atomic file creation to prevent TOCTOU race condition (CWE-367)
    const skillsReqPath = this.getSkillsRequirementsPath();
    if (skillsReqPath) {
      const venvMarker = path.join(workDir, '.venv', '.skills-installed');
      let fd: number | null = null;

      try {
        // Atomically create marker file with O_CREAT | O_EXCL (fails if exists)
        // This prevents race conditions where another process could create a symlink
        // between our check and write operations
        fd = openSync(venvMarker, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);

        // We successfully created the marker (didn't exist before)
        // Now safe to install requirements
        log.info({ skillsReqPath }, 'Installing skill Python requirements');
        const success = await this.installRequirements(workDir, skillsReqPath);

        // Write content to the marker file we already own
        const content = `Installed from: ${skillsReqPath}\nDate: ${new Date().toISOString()}\nSuccess: ${success}\n`;
        writeSync(fd, content);
      } catch (e: unknown) {
        const error = e as NodeJS.ErrnoException;
        if (error.code === 'EEXIST') {
          // Marker already exists — requirements already installed, skip
          log.debug({ venvMarker }, 'Skill requirements marker exists, skipping installation');
        } else if (error.code === 'ENOENT') {
          // .venv directory doesn't exist yet — will be created on first mise exec
          log.debug({ venvMarker }, 'Venv not yet created, will install requirements on first use');
        } else {
          // Unexpected error — log but don't fail (marker is just an optimization)
          log.warn({ venvMarker, err: error }, 'Failed to create skill requirements marker');
        }
      } finally {
        // Always close the file descriptor if we opened one
        if (fd !== null) {
          try {
            closeSync(fd);
          } catch {
            // Ignore close errors
          }
        }
      }
    }

    log.info({ userId, workDir }, 'Initialized mise workspace');
  }

  /**
   * Get path to aggregated skill requirements file
   * Checks skills/requirements.txt in the application's skills directory
   */
  private getSkillsRequirementsPath(): string | null {
    try {
      const skillsDir = getSkillsDir();
      const reqPath = path.join(skillsDir, 'requirements.txt');
      if (existsSync(reqPath)) {
        return reqPath;
      }
    } catch {
      // Skills dir may not be initialized yet
    }
    return null;
  }

  /**
   * Create mise.toml for user workspace
   */
  private async createUserMiseToml(workDir: string, userId: string): Promise<void> {
    const miseToml = `# mise.toml — Per-user Python environment
# Auto-generated by AionUI for user: ${userId}
# Created: ${new Date().toISOString()}
#
# This file configures Python and package management for this workspace.
# mise will automatically create a virtual environment in .venv/
# Packages are installed via uv for fast installation.
#
# To add packages manually:
#   mise exec -- uv pip install <package>
#
# To reset the environment:
#   rm -rf .venv && mise install

min_version = "2025.1.0"

[tools]
python = "3.14"
uv = "latest"

[env]
# Automatic venv creation and activation
_.python.venv = { path = ".venv", create = true }

# Python settings for reproducibility
PYTHONDONTWRITEBYTECODE = "1"
PYTHONUNBUFFERED = "1"

# AionUI metadata
AIONUI_USER_ID = "${userId}"
AIONUI_WORKSPACE = "{{ config_root }}"

[settings]
# Use uv for venv operations (faster)
python.uv_venv_auto = true
# Auto-install missing tools
not_found_auto_install = true
# Non-interactive mode
yes = true
`;

    mkdirSync(workDir, { recursive: true });
    writeFileSync(path.join(workDir, 'mise.toml'), miseToml);
    log.debug({ workDir }, 'Created mise.toml');
  }

  /**
   * Trust mise config for workspace (non-interactive)
   */
  private async trustConfig(workDir: string): Promise<void> {
    try {
      // Security: Use execFileAsync with args array to prevent command injection
      // Async to avoid blocking the Node.js event loop during login
      await execFileAsync(this.miseCmd, ['trust', '-a'], {
        cwd: workDir,
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 10000,
      });
      log.debug({ workDir }, 'Trusted mise config');
    } catch (e) {
      // Non-fatal: config may already be trusted or trust not required
      log.debug({ workDir, err: e }, 'Trust command failed (may be OK)');
    }
  }

  /**
   * Install tools defined in mise.toml
   */
  private async installTools(workDir: string): Promise<void> {
    if (!existsSync(path.join(workDir, 'mise.toml'))) {
      log.warn({ workDir }, 'No mise.toml found, skipping install');
      return;
    }

    try {
      // Security: Use execFileAsync with args array to prevent command injection
      // Async to avoid blocking the Node.js event loop during login
      await execFileAsync(this.miseCmd, ['install', '-y'], {
        cwd: workDir,
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 300000, // 5 minutes for initial install
      });
      log.debug({ workDir }, 'Installed mise tools');
    } catch (e) {
      log.error({ workDir, err: e }, 'Failed to install mise tools');
      throw new Error(`Failed to install mise tools: ${e}`);
    }
  }

  /**
   * Ensure the virtualenv is created
   * The _.python.venv setting creates venv lazily on first mise exec
   * We run a simple Python version check to trigger venv creation
   */
  private async ensureVenvCreated(workDir: string): Promise<void> {
    try {
      // Security: Use execFileAsync with args array to prevent command injection
      // Async to avoid blocking the Node.js event loop during login
      await execFileAsync(this.miseCmd, ['exec', '--', 'python', '--version'], {
        cwd: workDir,
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 60000, // 1 minute — venv creation can take a moment
      });
      log.debug({ workDir }, 'Ensured venv created');
    } catch (e) {
      log.warn({ workDir, err: e }, 'Failed to ensure venv creation (non-fatal)');
    }
  }

  /**
   * Get resolved environment for a workspace
   * Returns env vars including activated venv
   *
   * @param workDir - Workspace directory containing mise.toml
   * @returns Resolved environment with PATH and venv activated
   */
  async getWorkspaceEnv(workDir: string): Promise<MiseEnvResult> {
    if (!existsSync(path.join(workDir, 'mise.toml'))) {
      return {
        env: {},
        path: process.env.PATH || '',
        miseUsed: false,
      };
    }

    try {
      // Security: Use execFileAsync with args array to prevent command injection
      // Async to avoid blocking the Node.js event loop
      const { stdout: output } = await execFileAsync(this.miseCmd, ['env', '--json'], {
        cwd: workDir,
        encoding: 'utf-8',
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 30000,
      });

      const env = JSON.parse(output) as Record<string, string>;
      const venvPath = env.VIRTUAL_ENV;

      return {
        env,
        path: env.PATH || process.env.PATH || '',
        pythonPath: venvPath ? path.join(venvPath, 'bin', 'python') : undefined,
        venvPath,
        miseUsed: true,
      };
    } catch (e) {
      log.error({ workDir, err: e }, 'Failed to get mise env');
      return {
        env: {},
        path: process.env.PATH || '',
        miseUsed: false,
      };
    }
  }

  /**
   * Get list of installed tools in a workspace
   * Note: `mise ls --json` returns { toolName: [versions...] } format
   */
  async getInstalledTools(workDir: string): Promise<MiseToolInfo[]> {
    try {
      // Security: Use execFileSync with args array to prevent command injection
      const output = execFileSync(this.miseCmd, ['ls', '--json'], {
        cwd: workDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 10000,
      });

      // Parse the keyed format: { "python": [{version, ...}], "uv": [{version, ...}] }
      const parsed = JSON.parse(output) as Record<string, Array<{ version: string; requested_version: string; install_path: string }>>;
      const tools: MiseToolInfo[] = [];

      for (const [name, versions] of Object.entries(parsed)) {
        for (const v of versions) {
          tools.push({
            name,
            version: v.version,
            requested: v.requested_version,
            install_path: v.install_path,
          });
        }
      }

      return tools;
    } catch {
      return [];
    }
  }

  /**
   * Get status of user's Python workspace
   */
  async getWorkspaceStatus(userId: string): Promise<PythonWorkspaceStatus> {
    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);
    const workDir = userDirs.work_dir;
    const miseTomlPath = path.join(workDir, 'mise.toml');
    const venvPath = path.join(workDir, '.venv');

    const status: PythonWorkspaceStatus = {
      initialized: existsSync(miseTomlPath),
      miseAvailable: this.isMiseAvailable(),
      venvExists: existsSync(venvPath),
      venvPath: existsSync(venvPath) ? venvPath : undefined,
    };

    if (status.miseAvailable) {
      if (status.initialized) {
        // Workspace initialized — get user's installed tools
        const tools = await this.getInstalledTools(workDir);
        const pythonTool = tools.find((t) => t.name === 'python');
        const uvTool = tools.find((t) => t.name === 'uv');
        status.pythonVersion = pythonTool?.version;
        status.uvVersion = uvTool?.version;

        // Get installed packages if venv exists
        if (status.venvExists) {
          status.installedPackages = await this.getInstalledPackages(workDir);
        }
      } else {
        // Workspace not initialized — check global tools
        const globalTools = await this.getGlobalTools();
        const pythonTool = globalTools.find((t) => t.name === 'python');
        const uvTool = globalTools.find((t) => t.name === 'uv');
        status.pythonVersion = pythonTool?.version;
        status.uvVersion = uvTool?.version;
      }
    }

    return status;
  }

  /**
   * Get list of globally installed mise tools
   * Note: `mise ls -g --json` returns { toolName: [versions...] } format
   */
  async getGlobalTools(): Promise<MiseToolInfo[]> {
    try {
      // Security: Use execFileSync with args array to prevent command injection
      const output = execFileSync(this.miseCmd, ['ls', '-g', '--json'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 10000,
      });

      // Parse the keyed format: { "python": [{version, ...}], "uv": [{version, ...}] }
      const parsed = JSON.parse(output) as Record<string, Array<{ version: string; requested_version: string; install_path: string }>>;
      const tools: MiseToolInfo[] = [];

      for (const [name, versions] of Object.entries(parsed)) {
        for (const v of versions) {
          tools.push({
            name,
            version: v.version,
            requested: v.requested_version,
            install_path: v.install_path,
          });
        }
      }

      return tools;
    } catch {
      return [];
    }
  }

  /**
   * Get list of installed Python packages in workspace venv
   */
  async getInstalledPackages(workDir: string): Promise<string[]> {
    try {
      // Security: Use execFileSync with args array to prevent command injection
      const output = execFileSync(this.miseCmd, ['exec', '--', 'uv', 'pip', 'list', '--format=freeze'], {
        cwd: workDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 30000,
      });

      return output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    } catch {
      return [];
    }
  }

  /**
   * Install a Python package in user's venv
   *
   * @param workDir - Workspace directory
   * @param packageSpec - Package specifier (e.g., "requests", "anthropic>=0.39.0")
   * @returns true if installation succeeded
   */
  async installPackage(workDir: string, packageSpec: string): Promise<boolean> {
    log.info({ workDir, packageSpec }, 'Installing Python package');

    try {
      // Security: Use execFileSync with args array to prevent command injection
      // packageSpec is passed as a single argument, preventing shell interpretation
      execFileSync(this.miseCmd, ['exec', '--', 'uv', 'pip', 'install', packageSpec], {
        cwd: workDir,
        stdio: 'pipe',
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 120000, // 2 minutes per package
      });
      log.info({ workDir, packageSpec }, 'Package installed successfully');
      return true;
    } catch (e) {
      log.error({ workDir, packageSpec, err: e }, 'Failed to install package');
      return false;
    }
  }

  /**
   * Install requirements from a file
   *
   * @param workDir - Workspace directory
   * @param requirementsPath - Path to requirements.txt (relative or absolute)
   * @returns true if installation succeeded
   */
  async installRequirements(workDir: string, requirementsPath: string): Promise<boolean> {
    const fullPath = path.isAbsolute(requirementsPath) ? requirementsPath : path.join(workDir, requirementsPath);

    if (!existsSync(fullPath)) {
      log.warn({ requirementsPath: fullPath }, 'Requirements file not found');
      return false;
    }

    log.info({ workDir, requirementsPath: fullPath }, 'Installing requirements');

    try {
      // Security: Use execFileAsync with args array to prevent command injection
      // fullPath is passed as a single argument, preventing shell interpretation
      // Async to avoid blocking the Node.js event loop during login
      await execFileAsync(this.miseCmd, ['exec', '--', 'uv', 'pip', 'install', '-r', fullPath], {
        cwd: workDir,
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 300000, // 5 minutes for requirements
      });
      log.info({ workDir, requirementsPath: fullPath }, 'Requirements installed successfully');
      return true;
    } catch (e) {
      log.error({ workDir, requirementsPath: fullPath, err: e }, 'Failed to install requirements');
      return false;
    }
  }

  /**
   * Run mise prepare (auto-install dependencies if stale)
   * This checks if requirements.txt is newer than .venv and reinstalls if needed
   */
  async prepare(workDir: string): Promise<void> {
    if (!existsSync(path.join(workDir, 'mise.toml'))) {
      return;
    }

    try {
      // Security: Use execFileAsync with args array to prevent command injection
      // Async to avoid blocking the Node.js event loop
      await execFileAsync(this.miseCmd, ['prepare'], {
        cwd: workDir,
        env: { ...process.env, ...this.baseMiseEnv },
        timeout: 300000,
      });
      log.debug({ workDir }, 'mise prepare completed');
    } catch (e) {
      // Non-fatal: prepare is optional optimization
      log.debug({ workDir, err: e }, 'mise prepare failed (non-fatal)');
    }
  }

  /**
   * Execute a command within mise context
   * Use this for running Python scripts with the correct environment
   *
   * @param command - Command to execute (e.g., "python")
   * @param args - Command arguments
   * @param workDir - Workspace directory
   * @param env - Additional environment variables
   * @returns ChildProcess handle
   */
  miseExec(command: string, args: string[], workDir: string, env?: Record<string, string>): ChildProcess {
    const fullArgs = ['exec', '--', command, ...args];

    const options: SpawnOptions = {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...this.baseMiseEnv,
        ...env,
      },
    };

    log.debug({ command, args, workDir }, 'Executing command via mise');
    return spawn(this.miseCmd, fullArgs, options);
  }

  /**
   * Execute a command and wait for result
   */
  async miseExecSync(command: string, args: string[], workDir: string, env?: Record<string, string>): Promise<string> {
    const fullArgs = ['exec', '--', command, ...args];

    // Security: Use execFileSync with args array to prevent command injection
    const output = execFileSync(this.miseCmd, fullArgs, {
      cwd: workDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...this.baseMiseEnv,
        ...env,
      },
      timeout: 60000,
    });

    return output;
  }

  /**
   * Reset user's Python environment (delete and recreate venv)
   * Also reinstalls skill requirements from skills/requirements.txt
   */
  async resetUserEnv(userId: string): Promise<void> {
    const dirService = getDirectoryService();
    const userDirs = dirService.getUserDirectories(userId);
    const workDir = userDirs.work_dir;
    const venvPath = path.join(workDir, '.venv');

    log.info({ userId, venvPath }, 'Resetting user Python environment');

    // Remove existing venv
    if (existsSync(venvPath)) {
      const { rm } = await import('fs/promises');
      await rm(venvPath, { recursive: true, force: true });
      log.debug({ venvPath }, 'Removed existing venv');
    }

    // Reinstall (will recreate venv)
    await this.installTools(workDir);

    // Reinstall skill requirements
    const skillsReqPath = this.getSkillsRequirementsPath();
    if (skillsReqPath) {
      log.info({ skillsReqPath }, 'Reinstalling skill Python requirements after reset');
      const success = await this.installRequirements(workDir, skillsReqPath);

      // Recreate the marker file
      if (success) {
        const venvMarker = path.join(workDir, '.venv', '.skills-installed');
        try {
          const content = `Installed from: ${skillsReqPath}\nDate: ${new Date().toISOString()}\nReset: true\n`;
          writeFileSync(venvMarker, content, { mode: 0o644 });
        } catch {
          // Non-fatal
        }
      }
    }

    log.info({ userId }, 'Reset user Python environment complete');
  }

  /**
   * Check if a workspace has Python available
   */
  async hasPython(workDir: string): Promise<boolean> {
    const result = await this.getWorkspaceEnv(workDir);
    return !!result.pythonPath && existsSync(result.pythonPath);
  }

  /**
   * Get Python version in workspace
   */
  async getPythonVersion(workDir: string): Promise<string | null> {
    try {
      const output = await this.miseExecSync('python', ['--version'], workDir);
      return output.trim().replace('Python ', '');
    } catch {
      return null;
    }
  }
}

/**
 * Get singleton instance of MiseEnvironmentService
 */
export function getMiseEnvironmentService(): MiseEnvironmentService {
  return MiseEnvironmentService.getInstance();
}
