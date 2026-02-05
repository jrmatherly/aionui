/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createLogger } from '@/common/logger';
import type { GeminiCLIExtension, MCPServerConfig } from '@office-ai/aioncli-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const log = createLogger('Extension');

export const EXTENSIONS_DIRECTORY_NAME = path.join('.gemini', 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

/**
 * Extension config file structure (gemini-extension.json)
 */
interface ExtensionConfigFile {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

/**
 * Load all extensions from workspace and user home directory
 */
export function loadExtensions(workspaceDir: string): GeminiCLIExtension[] {
  const allExtensions = [...loadExtensionsFromDir(workspaceDir), ...loadExtensionsFromDir(os.homedir())];

  const uniqueExtensions = new Map<string, GeminiCLIExtension>();
  for (const extension of allExtensions) {
    if (!uniqueExtensions.has(extension.name)) {
      uniqueExtensions.set(extension.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

function loadExtensionsFromDir(dir: string): GeminiCLIExtension[] {
  const extensionsDir = path.join(dir, EXTENSIONS_DIRECTORY_NAME);
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: GeminiCLIExtension[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    const extension = loadExtension(extensionDir);
    if (extension != null) {
      extensions.push(extension);
    }
  }
  return extensions;
}

function loadExtension(extensionDir: string): GeminiCLIExtension | null {
  if (!fs.statSync(extensionDir).isDirectory()) {
    log.warn({ extensionDir }, 'Unexpected file in extensions directory');
    return null;
  }

  const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (!fs.existsSync(configFilePath)) {
    log.warn({ extensionDir, configFilePath }, 'Extension directory does not contain config file');
    return null;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = JSON.parse(configContent) as ExtensionConfigFile;
    if (!config.name || !config.version) {
      log.error({ configFilePath }, 'Invalid extension config: missing name or version');
      return null;
    }

    const contextFiles = getContextFileNames(config)
      .map((contextFileName) => path.join(extensionDir, contextFileName))
      .filter((contextFilePath) => fs.existsSync(contextFilePath));

    return {
      name: config.name,
      version: config.version,
      isActive: true, // Default to active; adjusted later by annotateActiveExtensions
      path: extensionDir,
      contextFiles,
      id: `${config.name}-${config.version}`,
      mcpServers: config.mcpServers,
      excludeTools: config.excludeTools,
    };
  } catch (e) {
    log.error({ err: e, configFilePath }, 'Error parsing extension config');
    return null;
  }
}

function getContextFileNames(config: ExtensionConfigFile): string[] {
  if (!config.contextFileName) {
    return ['QWEN.md'];
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

/**
 * Mark extension activation status based on enabled extension names list
 */
export function annotateActiveExtensions(extensions: GeminiCLIExtension[], enabledExtensionNames: string[]): GeminiCLIExtension[] {
  // If no list provided, all extensions are activated
  if (enabledExtensionNames.length === 0) {
    return extensions.map((ext) => ({ ...ext, isActive: true }));
  }

  const lowerCaseEnabledExtensions = new Set(enabledExtensionNames.map((e) => e.trim().toLowerCase()));

  // If 'none' specified, disable all extensions
  if (lowerCaseEnabledExtensions.size === 1 && lowerCaseEnabledExtensions.has('none')) {
    return extensions.map((ext) => ({ ...ext, isActive: false }));
  }

  const notFoundNames = new Set(lowerCaseEnabledExtensions);

  const annotatedExtensions = extensions.map((extension) => {
    const lowerCaseName = extension.name.toLowerCase();
    const isActive = lowerCaseEnabledExtensions.has(lowerCaseName);

    if (isActive) {
      notFoundNames.delete(lowerCaseName);
    }

    return { ...extension, isActive };
  });

  for (const requestedName of notFoundNames) {
    log.error({ requestedName }, 'Extension not found');
  }

  return annotatedExtensions;
}
