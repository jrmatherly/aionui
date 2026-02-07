/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { initLogger as log } from '@/common/logger';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import type { AcpBackendConfig } from '@/types/acpTypes';
import { app } from 'electron';
import { mkdirSync as _mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { IChatConversationRefer, IConfigStorageRefer, IEnvStorageRefer, IMcpServer, TChatConversation, TProviderWithModel } from '../common/storage';
import { ChatMessageStorage, ChatStorage, ConfigStorage, EnvStorage } from '../common/storage';
import { getDatabase } from './database/export';
import { copyDirectoryRecursively, getConfigPath, getDataPath, getTempPath, verifyDirectoryFiles } from './utils';
// Platform and architecture types (moved from deleted updateConfig)
type PlatformType = 'win32' | 'darwin' | 'linux';
type ArchitectureType = 'x64' | 'arm64' | 'ia32' | 'arm';

const nodePath = path;

const STORAGE_PATH = {
  config: 'aionui-config.txt',
  chatMessage: 'aionui-chat-message.txt',
  chat: 'aionui-chat.txt',
  env: '.aionui-env',
  assistants: 'assistants',
  skills: 'skills',
};

const getHomePage = getConfigPath;

const mkdirSync = (path: string) => {
  return _mkdirSync(path, { recursive: true });
};

/**
 * Migrate legacy data from temp directory to userData/config directory
 */
const migrateLegacyData = async () => {
  const oldDir = getTempPath(); // Old temp directory
  const newDir = getConfigPath(); // New userData/config directory

  try {
    // Check if new directory is empty (doesn't exist or exists but has no content)
    const isNewDirEmpty =
      !existsSync(newDir) ||
      (() => {
        try {
          return existsSync(newDir) && readdirSync(newDir).length === 0;
        } catch (error) {
          log.warn({ err: error, dir: newDir }, 'Could not read new directory during migration check');
          return false; // Assume not empty to avoid migration overwrite
        }
      })();

    // Check migration conditions: old directory exists and new directory is empty
    if (existsSync(oldDir) && isNewDirEmpty) {
      // Create target directory
      mkdirSync(newDir);

      // Copy all files and folders
      await copyDirectoryRecursively(oldDir, newDir);

      // Verify migration was successful
      const isVerified = await verifyDirectoryFiles(oldDir, newDir);
      if (isVerified) {
        // Ensure we don't delete the same directory
        if (path.resolve(oldDir) !== path.resolve(newDir)) {
          try {
            await fs.rm(oldDir, { recursive: true });
          } catch (cleanupError) {
            log.warn({ err: cleanupError, oldDir }, 'Failed to clean up original directory, please delete manually');
          }
        }
      }

      return true;
    }
  } catch (error) {
    log.error({ err: error }, 'Data migration failed');
  }

  return false;
};

const WriteFile = (path: string, data: string) => {
  return fs.writeFile(path, data);
};

const ReadFile = (path: string) => {
  return fs.readFile(path);
};

const RmFile = (path: string) => {
  return fs.rm(path, { recursive: true });
};

const CopyFile = (src: string, dest: string) => {
  return fs.copyFile(src, dest);
};

const FileBuilder = (file: string) => {
  const stack: (() => Promise<unknown>)[] = [];
  let isRunning = false;
  const run = () => {
    if (isRunning || !stack.length) return;
    isRunning = true;
    void stack
      .shift()?.()
      .finally(() => {
        isRunning = false;
        run();
      });
  };
  const pushStack = <R>(fn: () => Promise<R>) => {
    return new Promise<R>((resolve, reject) => {
      stack.push(() => fn().then(resolve).catch(reject));
      run();
    });
  };
  return {
    path: file,
    write(data: string) {
      return pushStack(() => WriteFile(file, data));
    },
    read() {
      return pushStack(() =>
        ReadFile(file).then((data) => {
          return data.toString();
        })
      );
    },
    copy(dist: string) {
      return pushStack(() => CopyFile(file, dist));
    },
    rm() {
      return pushStack(() => RmFile(file));
    },
  };
};

const JsonFileBuilder = <S extends object = Record<string, unknown>>(path: string) => {
  const file = FileBuilder(path);
  const encode = (data: unknown) => {
    return btoa(encodeURIComponent(String(data)));
  };

  const decode = (base64: string) => {
    return decodeURIComponent(atob(base64));
  };

  const toJson = async (): Promise<S> => {
    try {
      const result = await file.read();
      if (!result) return {} as S;

      // Verify file content is not empty and not corrupted base64
      if (result.trim() === '') {
        log.warn({ filePath: path }, 'Empty file detected');
        return {} as S;
      }

      const decoded = decode(result);
      if (!decoded || decoded.trim() === '') {
        log.warn({ filePath: path }, 'Empty or corrupted content after decode');
        return {} as S;
      }

      const parsed = JSON.parse(decoded) as S;

      // Additional validation: if it's a chat history file and parsed result is empty object, warn user
      if (path.includes('chat.txt') && Object.keys(parsed).length === 0) {
        log.warn({ filePath: path }, 'Chat history file appears to be empty');
      }

      return parsed;
    } catch (e) {
      // console.error(`[Storage] Error reading/parsing file ${path}:`, e);
      return {} as S;
    }
  };

  const setJson = async (data: S): Promise<S> => {
    try {
      await file.write(encode(JSON.stringify(data)));
      return data;
    } catch (e) {
      return Promise.reject(e);
    }
  };

  const toJsonSync = (): S => {
    try {
      return JSON.parse(decode(readFileSync(path).toString())) as S;
    } catch (e) {
      return {} as S;
    }
  };

  return {
    toJson,
    setJson,
    toJsonSync,
    async set<K extends keyof S>(key: K, value: Awaited<S>[K]): Promise<Awaited<S>[K]> {
      const data = await toJson();
      data[key] = value;
      await setJson(data);
      return value;
    },
    async get<K extends keyof S>(key: K): Promise<Awaited<S>[K]> {
      const data = await toJson();
      return data[key] as Awaited<S>[K];
    },
    async remove<K extends keyof S>(key: K) {
      const data = await toJson();
      delete data[key];
      return setJson(data);
    },
    clear() {
      return setJson({} as S);
    },
    getSync<K extends keyof S>(key: K): S[K] {
      const data = toJsonSync();
      return data[key];
    },
    update<K extends keyof S>(key: K, updateFn: (value: S[K], data: S) => Promise<S[K]>) {
      return toJson().then((data) => {
        return updateFn(data[key], data).then((value) => {
          data[key] = value;
          return setJson(data);
        });
      });
    },
    backup(fullName: string) {
      const dir = nodePath.dirname(fullName);
      if (!existsSync(dir)) {
        mkdirSync(dir);
      }
      return file.copy(fullName).then(() => file.rm());
    },
  };
};

const envFile = JsonFileBuilder<IEnvStorageRefer>(path.join(getHomePage(), STORAGE_PATH.env));

const dirConfig = envFile.getSync('aionui.dir');

const cacheDir = dirConfig?.cacheDir || getHomePage();

const configFile = JsonFileBuilder<IConfigStorageRefer>(path.join(cacheDir, STORAGE_PATH.config));
type ConversationHistoryData = Record<string, TMessage[]>;

const _chatMessageFile = JsonFileBuilder<ConversationHistoryData>(path.join(cacheDir, STORAGE_PATH.chatMessage));
const _chatFile = JsonFileBuilder<IChatConversationRefer>(path.join(cacheDir, STORAGE_PATH.chat));

// Create chat history proxy with field migration
const isGeminiConversation = (conversation: TChatConversation): conversation is Extract<TChatConversation, { type: 'gemini' }> => {
  return conversation.type === 'gemini';
};

const chatFile = {
  ..._chatFile,
  async get<K extends keyof IChatConversationRefer>(key: K): Promise<IChatConversationRefer[K]> {
    const data = await _chatFile.get(key);

    // Special handling for chat.history field migration
    if (key === 'chat.history' && Array.isArray(data)) {
      const history = data as IChatConversationRefer['chat.history'];
      return history.map((conversation: TChatConversation) => {
        // Only Gemini conversations have a model field, need to migrate old format selectedModel to useModel
        if (isGeminiConversation(conversation) && conversation.model) {
          // Use Record type to handle old format migration
          const modelRecord = conversation.model as unknown as Record<string, unknown>;
          if ('selectedModel' in modelRecord && !('useModel' in modelRecord)) {
            modelRecord['useModel'] = modelRecord['selectedModel'];
            delete modelRecord['selectedModel'];
            conversation.model = modelRecord as TProviderWithModel;
          }
        }
        return conversation;
      }) as IChatConversationRefer[K];
    }

    return data;
  },
  async set<K extends keyof IChatConversationRefer>(key: K, value: IChatConversationRefer[K]): Promise<IChatConversationRefer[K]> {
    return await _chatFile.set(key, value);
  },
};

const buildMessageListStorage = (conversation_id: string, dir: string) => {
  const fullName = path.join(dir, 'aionui-chat-history', conversation_id + '.txt');
  if (!existsSync(fullName)) {
    mkdirSync(path.join(dir, 'aionui-chat-history'));
  }
  return JsonFileBuilder<TMessage[]>(path.join(dir, 'aionui-chat-history', conversation_id + '.txt'));
};

const conversationHistoryProxy = (options: typeof _chatMessageFile, dir: string) => {
  return {
    ...options,
    async set(key: string, data: TMessage[]) {
      const conversation_id = key;
      const storage = buildMessageListStorage(conversation_id, dir);
      return await storage.setJson(data);
    },
    async get(key: string): Promise<TMessage[]> {
      const conversation_id = key;
      const storage = buildMessageListStorage(conversation_id, dir);
      const data = await storage.toJson();
      if (Array.isArray(data)) return data;
      return [];
    },
    backup(conversation_id: string) {
      const storage = buildMessageListStorage(conversation_id, dir);
      return storage.backup(path.join(dir, 'aionui-chat-history', 'backup', conversation_id + '_' + Date.now() + '.txt'));
    },
  };
};

const chatMessageFile = conversationHistoryProxy(_chatMessageFile, cacheDir);

/**
 * Get assistant rules directory path
 */
const getAssistantsDir = () => {
  return path.join(cacheDir, STORAGE_PATH.assistants);
};

/**
 * Get skills scripts directory path
 */
const getSkillsDir = () => {
  return path.join(cacheDir, STORAGE_PATH.skills);
};

/**
 * Get builtin skills directory path (_builtin subdirectory)
 * Skills in this directory are automatically injected for ALL agents and scenarios
 */
const getBuiltinSkillsDir = () => {
  return path.join(getSkillsDir(), '_builtin');
};

/**
 * Initialize builtin assistant rule and skill files to user directory
 */
const initBuiltinAssistantRules = async (): Promise<void> => {
  const assistantsDir = getAssistantsDir();

  // In development, use project root. In production, use app.getAppPath()
  // When packaged, resources are in asarUnpack, so they're at app.asar.unpacked/
  const resolveBuiltinDir = (dirPath: string): string => {
    const appPath = app.getAppPath();
    let candidates: string[];
    if (app.isPackaged) {
      // asarUnpack extracts files to app.asar.unpacked directory
      const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
      candidates = [
        path.join(unpackedPath, dirPath), // Unpacked location (preferred)
        path.join(appPath, dirPath), // Fallback to asar path
      ];
    } else {
      candidates = [path.join(appPath, dirPath), path.join(appPath, '..', dirPath), path.join(appPath, '..', '..', dirPath), path.join(appPath, '..', '..', '..', dirPath), path.join(process.cwd(), dirPath)];
    }

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    // 'rules' directory is optional — only warn for directories that should exist
    if (dirPath !== 'rules') {
      log.warn({ dirPath, candidates }, 'Could not find builtin directory');
    }
    return candidates[0];
  };

  const rulesDir = resolveBuiltinDir('rules');
  const builtinSkillsDir = resolveBuiltinDir('skills');
  const userSkillsDir = getSkillsDir();

  // Debug-level: uncomment for troubleshooting asset resolution
  // console.log(`[AionUi] initBuiltinAssistantRules: rulesDir=${rulesDir}, builtinSkillsDir=${builtinSkillsDir}, userSkillsDir=${userSkillsDir}, assistantsDir=${assistantsDir}`);

  // Copy skills scripts directory to user config directory
  if (existsSync(builtinSkillsDir)) {
    try {
      // Ensure user skills directory exists
      if (!existsSync(userSkillsDir)) {
        mkdirSync(userSkillsDir);
      }
      // Copy builtin skills to user directory (do not overwrite existing files)
      await copyDirectoryRecursively(builtinSkillsDir, userSkillsDir, { overwrite: false });
      log.info({ userSkillsDir }, 'Skills directory initialized');
    } catch (error) {
      log.warn({ err: error, builtinSkillsDir, userSkillsDir }, 'Failed to copy skills directory');
    }
  }

  // Ensure assistants directory exists
  if (!existsSync(assistantsDir)) {
    mkdirSync(assistantsDir);
    log.info({ assistantsDir }, 'Created assistants directory');
  }

  for (const preset of ASSISTANT_PRESETS) {
    const assistantId = `builtin-${preset.id}`;

    // If resourceDir is set, use that directory; otherwise use default rules/ directory
    const presetRulesDir = preset.resourceDir ? resolveBuiltinDir(preset.resourceDir) : rulesDir;
    const presetSkillsDir = preset.resourceDir ? resolveBuiltinDir(preset.resourceDir) : builtinSkillsDir;

    // Copy rule files (English-only, 'en-US' key used for backward compatibility)
    const hasRuleFiles = Object.keys(preset.ruleFiles).length > 0;
    if (hasRuleFiles) {
      for (const [langKey, ruleFile] of Object.entries(preset.ruleFiles)) {
        try {
          const sourceRulesPath = path.join(presetRulesDir, ruleFile);
          // Target file name format: {assistantId}.{langKey}.md
          const targetFileName = `${assistantId}.${langKey}.md`;
          const targetPath = path.join(assistantsDir, targetFileName);

          // Check if source file exists
          if (!existsSync(sourceRulesPath)) {
            log.warn({ sourceRulesPath }, 'Source rule file not found');
            continue;
          }

          // Always overwrite builtin assistant rule files to ensure users get the latest version
          let content = await fs.readFile(sourceRulesPath, 'utf-8');
          // Replace relative paths with absolute paths so AI can find scripts correctly
          content = content.replace(/skills\//g, userSkillsDir + '/');
          await fs.writeFile(targetPath, content, 'utf-8');
          log.info({ targetFileName }, 'Updated builtin rule');
        } catch (error) {
          // Ignore missing files
          log.warn({ err: error, ruleFile }, 'Failed to copy rule file');
        }
      }
    } else {
      // If assistant has no ruleFiles config, delete old rules cache files
      const rulesFilePattern = new RegExp(`^${assistantId}\\..*\\.md$`);
      try {
        const files = readdirSync(assistantsDir);
        for (const file of files) {
          if (rulesFilePattern.test(file)) {
            const filePath = path.join(assistantsDir, file);
            await fs.unlink(filePath);
            log.info({ file }, 'Removed deprecated rule file');
          }
        }
      } catch (error) {
        // Ignore deletion failure
      }
    }

    // Copy skill files (English-only, 'en-US' key used for backward compatibility)
    if (preset.skillFiles) {
      for (const [langKey, skillFile] of Object.entries(preset.skillFiles)) {
        try {
          const sourceSkillsPath = path.join(presetSkillsDir, skillFile);
          // Target file name format: {assistantId}-skills.{langKey}.md
          const targetFileName = `${assistantId}-skills.${langKey}.md`;
          const targetPath = path.join(assistantsDir, targetFileName);

          // Check if source file exists
          if (!existsSync(sourceSkillsPath)) {
            log.warn({ sourceSkillsPath }, 'Source skill file not found');
            continue;
          }

          // Always overwrite builtin assistant skill files to ensure users get the latest version
          let content = await fs.readFile(sourceSkillsPath, 'utf-8');
          // Replace relative paths with absolute paths so AI can find scripts correctly
          content = content.replace(/skills\//g, userSkillsDir + '/');
          await fs.writeFile(targetPath, content, 'utf-8');
          log.info({ targetFileName }, 'Updated builtin skill');
        } catch (error) {
          // Ignore missing skill files
          log.warn({ err: error, skillFile }, 'Failed to copy skill file');
        }
      }
    } else {
      // If assistant has no skillFiles config, delete old skills cache files
      // This ensures old presetSkills won't be read after migrating to SkillManager
      const skillsFilePattern = new RegExp(`^${assistantId}-skills\\..*\\.md$`);
      try {
        const files = readdirSync(assistantsDir);
        for (const file of files) {
          if (skillsFilePattern.test(file)) {
            const filePath = path.join(assistantsDir, file);
            await fs.unlink(filePath);
            log.info({ file }, 'Removed deprecated skill file');
          }
        }
      } catch (error) {
        // Ignore deletion failure
      }
    }
  }
};

/**
 * Get built-in assistant configurations (without context, context is read from files)
 */
const getBuiltinAssistants = (): AcpBackendConfig[] => {
  const assistants: AcpBackendConfig[] = [];

  for (const preset of ASSISTANT_PRESETS) {
    // Read default enabled skills from preset config (excluding cron, which is builtin and auto-injected)
    const defaultEnabledSkills = preset.defaultEnabledSkills;
    const enabledByDefault = preset.id === 'cowork';

    assistants.push({
      id: `builtin-${preset.id}`,
      name: preset.nameI18n['en-US'],
      nameI18n: preset.nameI18n,
      description: preset.descriptionI18n['en-US'],
      descriptionI18n: preset.descriptionI18n,
      avatar: preset.avatar,
      // context is no longer stored in config, read from files instead
      // Cowork enabled by default
      enabled: enabledByDefault,
      isPreset: true,
      isBuiltin: true,
      presetAgentType: preset.presetAgentType || 'gemini',
      // Cowork enables all builtin skills by default
      enabledSkills: defaultEnabledSkills,
    });
  }

  return assistants;
};

/**
 * Create default MCP server configuration
 */
const getDefaultMcpServers = (): IMcpServer[] => {
  const now = Date.now();
  const defaultConfig = {
    mcpServers: {
      'chrome-devtools': {
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp@latest'],
      },
    },
  };

  return Object.entries(defaultConfig.mcpServers).map(([name, config], index) => ({
    id: `mcp_default_${now}_${index}`,
    name,
    description: `Default MCP server: ${name}`,
    enabled: false, // Disabled by default, let user enable manually
    transport: {
      type: 'stdio' as const,
      command: config.command,
      args: config.args,
    },
    createdAt: now,
    updatedAt: now,
    originalJson: JSON.stringify({ [name]: config }, null, 2),
  }));
};

/**
 * Initialize image generation config from environment variables.
 *
 * When IMAGE_GENERATION_ENABLED=true and tools.imageGenerationModel is not yet configured:
 * 1. Looks up the global model provider matching IMAGE_GENERATION_PROVIDER (by name)
 * 2. Falls back to auto-detecting the first global model with image-capable models
 * 3. Selects IMAGE_GENERATION_MODEL (or auto-detects from the provider's model list)
 * 4. Writes the config with switch=true so image generation is immediately available
 *
 * Respects existing user config — never overwrites a previously set image model.
 */
async function initImageGenerationFromEnv(): Promise<void> {
  const enabled = process.env.IMAGE_GENERATION_ENABLED?.toLowerCase();
  if (enabled !== 'true' && enabled !== '1') return;

  // Don't overwrite existing config
  const existing = await configFile.get('tools.imageGenerationModel').catch((): undefined => undefined);
  if (existing && existing.useModel) {
    log.debug('Image generation already configured, skipping env init');
    return;
  }

  // Need GlobalModelService to look up provider details
  let globalModelService: { getEffectiveModels: (userId: string, localModels: import('../common/storage').IProvider[], userGroups: string[] | null, userRole: string) => import('../common/storage').IProvider[] };
  try {
    const { GlobalModelService } = await import('./services/GlobalModelService');
    globalModelService = GlobalModelService.getInstance();
  } catch {
    log.warn('GlobalModelService not available, cannot initialize image generation from env');
    return;
  }

  const requestedProvider = process.env.IMAGE_GENERATION_PROVIDER?.trim();
  const requestedModel = process.env.IMAGE_GENERATION_MODEL?.trim();

  // Helper: check if a model name looks like an image model
  const isImageModel = (name: string) => {
    const lower = name.toLowerCase();
    return lower.includes('image') || lower.includes('banana');
  };

  // Get all enabled global models as IProvider[] (admin view, no user filtering)
  // Use system user to get all models without group filtering
  const allProviders = globalModelService.getEffectiveModels('system_default_user', [], null, 'admin') as import('../common/storage').IProvider[];
  const globalProviders = allProviders.filter((p: import('../common/storage').IProvider) => p.isGlobal);

  if (globalProviders.length === 0) {
    log.warn('No global models available, cannot auto-configure image generation');
    return;
  }

  // Find the target provider
  let targetProvider = requestedProvider ? globalProviders.find((p) => p.name === requestedProvider) : undefined;

  if (requestedProvider && !targetProvider) {
    log.warn({ requestedProvider }, 'IMAGE_GENERATION_PROVIDER not found in global models');
  }

  // Find the image model within the provider
  let targetModel: string | undefined;

  if (targetProvider) {
    // Provider specified — find image model within it
    targetModel = requestedModel && targetProvider.model.includes(requestedModel) ? requestedModel : targetProvider.model.find(isImageModel);
  } else {
    // No provider specified (or not found) — auto-detect from all global providers
    for (const provider of globalProviders) {
      const imageModel = requestedModel && provider.model.includes(requestedModel) ? requestedModel : provider.model.find(isImageModel);

      if (imageModel) {
        targetProvider = provider;
        targetModel = imageModel;
        break;
      }
    }
  }

  if (!targetProvider || !targetModel) {
    log.warn({ requestedProvider, requestedModel }, 'No image-capable model found in global models');
    return;
  }

  // Write the config matching the shape tools.imageGenerationModel expects
  const imageGenConfig: IConfigStorageRefer['tools.imageGenerationModel'] = {
    id: targetProvider.id,
    platform: targetProvider.platform,
    name: targetProvider.name,
    baseUrl: targetProvider.baseUrl,
    apiKey: targetProvider.apiKey,
    useModel: targetModel,
    switch: true,
    capabilities: targetProvider.capabilities,
    isGlobal: targetProvider.isGlobal,
  };

  await configFile.set('tools.imageGenerationModel', imageGenConfig);
  log.info({ provider: targetProvider.name, model: targetModel }, 'Image generation pre-configured from environment');
}

const initStorage = async () => {
  log.info('Starting storage initialization...');

  // 1. Execute data migration first (before any directory creation)
  await migrateLegacyData();

  // 2. Create necessary directories (after migration to ensure migration works correctly)
  if (!existsSync(getHomePage())) {
    mkdirSync(getHomePage());
  }
  if (!existsSync(getDataPath())) {
    mkdirSync(getDataPath());
  }

  // 3. Initialize storage system
  ConfigStorage.interceptor(configFile);
  ChatStorage.interceptor(chatFile);
  ChatMessageStorage.interceptor(chatMessageFile);
  EnvStorage.interceptor(envFile);

  // 4. Initialize MCP configuration (provide default config for all users)
  try {
    const existingMcpConfig = await configFile.get('mcp.config').catch((): undefined => undefined);

    // Only write defaults when config doesn't exist or is empty (applies to new and existing users)
    if (!existingMcpConfig || !Array.isArray(existingMcpConfig) || existingMcpConfig.length === 0) {
      const defaultServers = getDefaultMcpServers();
      await configFile.set('mcp.config', defaultServers);
      log.info('Default MCP servers initialized');
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to initialize default MCP servers');
  }
  // 5. Initialize builtin assistants
  try {
    // 5.1 Initialize builtin assistant rule files to user directory
    await initBuiltinAssistantRules();

    // 5.2 Initialize assistant config (metadata only, no context)
    const existingAgents = (await configFile.get('acp.customAgents').catch((): undefined => undefined)) || [];
    const builtinAssistants = getBuiltinAssistants();

    // 5.2.1 Check if migration needed: fix old version where all assistants were enabled by default
    const ASSISTANT_ENABLED_MIGRATION_KEY = 'migration.assistantEnabledFixed';
    const migrationDone = await configFile.get(ASSISTANT_ENABLED_MIGRATION_KEY).catch(() => false);
    const needsMigration = !migrationDone && existingAgents.length > 0;

    // 5.2.2 Check if migration needed: add default enabled skills for builtin assistants
    const BUILTIN_SKILLS_MIGRATION_KEY = 'migration.builtinDefaultSkillsAdded_v2';
    const builtinSkillsMigrationDone = await configFile.get(BUILTIN_SKILLS_MIGRATION_KEY).catch(() => false);
    const needsBuiltinSkillsMigration = !builtinSkillsMigrationDone;

    // Update or add built-in assistant configurations
    const updatedAgents = [...existingAgents];
    let hasChanges = false;

    for (const builtin of builtinAssistants) {
      const index = updatedAgents.findIndex((a: AcpBackendConfig) => a.id === builtin.id);
      if (index >= 0) {
        // Update existing built-in assistant config
        const existing = updatedAgents[index];
        // Update only if key fields are different to avoid unnecessary writes
        // Note: enabled and presetAgentType are user-controlled, not included in shouldUpdate check
        const shouldUpdate = existing.name !== builtin.name || existing.description !== builtin.description || existing.avatar !== builtin.avatar || existing.isPreset !== builtin.isPreset || existing.isBuiltin !== builtin.isBuiltin;
        // When enabled is undefined or migration needed, set default value (Cowork enabled, others disabled)
        const needsEnabledFix = existing.enabled === undefined || needsMigration;
        // Force default value during migration, otherwise preserve user setting
        const resolvedEnabled = needsEnabledFix ? builtin.enabled : existing.enabled;
        // presetAgentType is user-controlled, use builtin default if not set
        const resolvedPresetAgentType = existing.presetAgentType ?? builtin.presetAgentType;

        // Add default enabled skills for builtin assistants with defaultEnabledSkills (only during migration and if user hasn't set enabledSkills)
        let resolvedEnabledSkills = existing.enabledSkills;
        const needsSkillsMigration = needsBuiltinSkillsMigration && builtin.enabledSkills && (!existing.enabledSkills || existing.enabledSkills.length === 0);
        if (needsSkillsMigration) {
          resolvedEnabledSkills = builtin.enabledSkills;
        }

        if (shouldUpdate || needsEnabledFix || (needsSkillsMigration && resolvedEnabledSkills !== existing.enabledSkills)) {
          // Preserve user-set enabled and presetAgentType
          updatedAgents[index] = {
            ...existing,
            ...builtin,
            enabled: resolvedEnabled,
            presetAgentType: resolvedPresetAgentType,
            enabledSkills: resolvedEnabledSkills,
          };
          hasChanges = true;
        }
      } else {
        // Add new built-in assistant
        updatedAgents.unshift(builtin);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await configFile.set('acp.customAgents', updatedAgents);
    }

    // Mark migration as done
    if (needsMigration) {
      await configFile.set(ASSISTANT_ENABLED_MIGRATION_KEY, true);
      log.info('Assistant enabled migration completed');
    }
    if (needsBuiltinSkillsMigration) {
      await configFile.set(BUILTIN_SKILLS_MIGRATION_KEY, true);
      log.info('Builtin assistants default skills migration completed');
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to initialize builtin assistants');
  }

  // 6. Initialize database (better-sqlite3)
  try {
    getDatabase();
  } catch (error) {
    log.error({ err: error }, 'Database initialization failed, falling back to file-based storage');
  }

  // 7. Initialize image generation from environment (Docker/WebUI)
  // Only applies when IMAGE_GENERATION_ENABLED=true and no existing config is set.
  // Matches a global model provider by IMAGE_GENERATION_PROVIDER name (or auto-detects
  // the first provider with image models) and pre-selects IMAGE_GENERATION_MODEL.
  try {
    await initImageGenerationFromEnv();
  } catch (error) {
    log.error({ err: error }, 'Failed to initialize image generation from environment');
  }

  // NOTE: systemInfo provider is now in applicationBridge.ts
  // It handles per-user directories via __webUiUserId from WebSocket adapter.
};

export const ProcessConfig = configFile;

export const ProcessChat = chatFile;

export const ProcessChatMessage = chatMessageFile;

export const ProcessEnv = envFile;

export const getSystemDir = () => {
  return {
    cacheDir: cacheDir,
    // getDataPath() returns CLI-safe path (symlink on macOS) to avoid spaces
    workDir: dirConfig?.workDir || getDataPath(),
    platform: process.platform as PlatformType,
    arch: process.arch as ArchitectureType,
  };
};

/**
 * Get assistant rules directory path (for use by other modules)
 */
export { getAssistantsDir, getBuiltinSkillsDir, getSkillsDir };

/**
 * Skills content cache to avoid repeated file system reads
 */
const skillsContentCache = new Map<string, string>();

/**
 * Load content of specified skills (with caching)
 * @param enabledSkills - list of skill names
 * @returns merged skills content
 */
export const loadSkillsContent = async (enabledSkills: string[]): Promise<string> => {
  if (!enabledSkills || enabledSkills.length === 0) {
    return '';
  }

  // Use sorted skill names as cache key to ensure same combinations hit cache
  const cacheKey = [...enabledSkills].sort().join(',');
  const cached = skillsContentCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const skillsDir = getSkillsDir();
  const builtinSkillsDir = getBuiltinSkillsDir();
  const skillContents: string[] = [];

  for (const skillName of enabledSkills) {
    // First try builtin skills directory: _builtin/{skillName}/SKILL.md
    const builtinSkillFile = path.join(builtinSkillsDir, skillName, 'SKILL.md');
    // Then try directory structure: {skillName}/SKILL.md (consistent with aioncli-core's loadSkillsFromDir)
    const skillDirFile = path.join(skillsDir, skillName, 'SKILL.md');
    // Backward compatible: flat structure {skillName}.md
    const skillFlatFile = path.join(skillsDir, `${skillName}.md`);

    try {
      let content: string | null = null;

      if (existsSync(builtinSkillFile)) {
        content = await fs.readFile(builtinSkillFile, 'utf-8');
      } else if (existsSync(skillDirFile)) {
        content = await fs.readFile(skillDirFile, 'utf-8');
      } else if (existsSync(skillFlatFile)) {
        content = await fs.readFile(skillFlatFile, 'utf-8');
      }

      if (content && content.trim()) {
        skillContents.push(`## Skill: ${skillName}\n${content}`);
      }
    } catch (error) {
      log.warn({ err: error, skillName }, 'Failed to load skill');
    }
  }

  const result = skillContents.length === 0 ? '' : `[Available Skills]\n${skillContents.join('\n\n')}`;

  // Cache result
  skillsContentCache.set(cacheKey, result);

  return result;
};

/**
 * Clear skills cache (call after skills files are updated)
 */
export const clearSkillsCache = (): void => {
  skillsContentCache.clear();
};

export default initStorage;
