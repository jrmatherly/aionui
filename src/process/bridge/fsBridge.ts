/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIONUI_TIMESTAMP_SEPARATOR } from '@/common/constants';
import { app } from 'electron';
import fs from 'fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'os';
import path from 'path';
import { ipcBridge } from '../../common';
import { getAssistantsDir, getSystemDir } from '../initStorage';
import { readDirectoryRecursive } from '../utils';

// ============================================================================
// Helper functions for builtin resource directory resolution
// ============================================================================

type ResourceType = 'rules' | 'skills';

/**
 * Find the builtin resource directory (rules or skills)
 *
 * When packaged, resources are in asarUnpack, so they're at app.asar.unpacked/
 */
async function findBuiltinResourceDir(resourceType: ResourceType): Promise<string> {
  if (app.isPackaged) {
    const appPath = app.getAppPath();
    // asarUnpack extracts files to app.asar.unpacked directory
    const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
    const candidates = [
      path.join(unpackedPath, resourceType), // Unpacked location (preferred)
      path.join(appPath, resourceType), // Fallback to asar path
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next path
      }
    }
    console.warn(`[fsBridge] Could not find builtin ${resourceType} directory, tried:`, candidates);
    return candidates[0]; // Default to unpacked path
  }
  // Development: try multiple paths
  const appPath = app.getAppPath();
  const candidates = [path.join(appPath, resourceType), path.join(appPath, '..', resourceType), path.join(appPath, '..', '..', resourceType), path.join(appPath, '..', '..', '..', resourceType)];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next path
    }
  }
  return candidates[0]; // Default fallback
}

/**
 * Get user config skills directory
 */
function getUserSkillsDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config', 'skills');
}

/**
 * Copy directory recursively
 */
async function copyDirectory(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Read a builtin resource file (.md only)
 */
async function readBuiltinResource(resourceType: ResourceType, fileName: string): Promise<string> {
  const safeFileName = path.basename(fileName);
  if (!safeFileName.endsWith('.md')) {
    throw new Error('Only .md files are allowed');
  }
  const dir = await findBuiltinResourceDir(resourceType);
  return fs.readFile(path.join(dir, safeFileName), 'utf-8');
}

/**
 * Read assistant resource file with locale fallback
 */
async function readAssistantResource(resourceType: ResourceType, assistantId: string, locale: string, fileNamePattern: (id: string, loc: string) => string): Promise<string> {
  const assistantsDir = getAssistantsDir();
  const locales = [locale, 'en-US', 'zh-CN'].filter((l, i, arr) => arr.indexOf(l) === i);

  // 1. Try user data directory first
  for (const loc of locales) {
    const fileName = fileNamePattern(assistantId, loc);
    try {
      return await fs.readFile(path.join(assistantsDir, fileName), 'utf-8');
    } catch {
      // Try next locale
    }
  }

  // 2. Fallback to builtin directory
  const builtinDir = await findBuiltinResourceDir(resourceType);
  for (const loc of locales) {
    const fileName = fileNamePattern(assistantId, loc);
    try {
      const content = await fs.readFile(path.join(builtinDir, fileName), 'utf-8');
      console.log(`[fsBridge] Read builtin ${resourceType} for ${assistantId}: ${fileName}`);
      return content;
    } catch {
      // Try next locale
    }
  }

  return ''; // Not found
}

/**
 * Write assistant resource file to user directory
 */
async function writeAssistantResource(resourceType: ResourceType, assistantId: string, content: string, locale: string, fileNamePattern: (id: string, loc: string) => string): Promise<boolean> {
  try {
    const assistantsDir = getAssistantsDir();
    await fs.mkdir(assistantsDir, { recursive: true });
    const fileName = fileNamePattern(assistantId, locale);
    await fs.writeFile(path.join(assistantsDir, fileName), content, 'utf-8');
    console.log(`[fsBridge] Wrote assistant ${resourceType}: ${fileName}`);
    return true;
  } catch (error) {
    console.error(`Failed to write assistant ${resourceType}:`, error);
    return false;
  }
}

/**
 * Delete assistant resource files (all locale versions)
 */
async function deleteAssistantResource(resourceType: ResourceType, filePattern: RegExp): Promise<boolean> {
  try {
    const assistantsDir = getAssistantsDir();
    const files = await fs.readdir(assistantsDir);
    for (const file of files) {
      if (filePattern.test(file)) {
        await fs.unlink(path.join(assistantsDir, file));
        console.log(`[fsBridge] Deleted assistant ${resourceType}: ${file}`);
      }
    }
    return true;
  } catch (error) {
    console.error(`Failed to delete assistant ${resourceType}:`, error);
    return false;
  }
}

// File name patterns for rules and skills
const ruleFilePattern = (id: string, loc: string) => `${id}.${loc}.md`;
const skillFilePattern = (id: string, loc: string) => `${id}-skills.${loc}.md`;

export function initFsBridge(): void {
  ipcBridge.fs.getFilesByDir.provider(async ({ dir }) => {
    const tree = await readDirectoryRecursive(dir);
    return tree ? [tree] : [];
  });

  ipcBridge.fs.getImageBase64.provider(async ({ path: filePath }) => {
    try {
      const ext = (path.extname(filePath) || '').toLowerCase().replace(/^\./, '');
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        tif: 'image/tiff',
        tiff: 'image/tiff',
        avif: 'image/avif',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';
      const base64 = await fs.readFile(filePath, { encoding: 'base64' });
      return `data:${mime};base64,${base64}`;
    } catch (error) {
      // Return a placeholder data URL instead of throwing
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
    }
  });

  // Download remote resource with protocol & redirect guard
  const downloadRemoteBuffer = (targetUrl: string, redirectCount = 0): Promise<{ buffer: Buffer; contentType?: string }> => {
    const allowedProtocols = new Set(['http:', 'https:']);
    const parsedUrl = new URL(targetUrl);
    if (!allowedProtocols.has(parsedUrl.protocol)) {
      return Promise.reject(new Error('Unsupported protocol'));
    }

    // Restrict to a whitelist of hosts for safety
    const allowedHosts = ['github.com', 'raw.githubusercontent.com', 'contrib.rocks', 'img.shields.io'];
    const isAllowedHost = allowedHosts.some((host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`));
    if (!isAllowedHost) {
      return Promise.reject(new Error('URL not allowed for remote fetch'));
    }

    return new Promise((resolve, reject) => {
      try {
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const request = client.get(
          targetUrl,
          {
            headers: {
              'User-Agent': 'AionUI-Preview',
              Referer: 'https://github.com/iOfficeAI/AionUi',
            },
          },
          (response) => {
            const { statusCode = 0, headers } = response;

            if (statusCode >= 300 && statusCode < 400 && headers.location && redirectCount < 5) {
              const redirectUrl = new URL(headers.location, targetUrl).toString();
              response.resume();
              resolve(downloadRemoteBuffer(redirectUrl, redirectCount + 1));
              return;
            }

            if (statusCode >= 400) {
              response.resume();
              reject(new Error(`Failed to fetch image: HTTP ${statusCode}`));
              return;
            }

            const chunks: Buffer[] = [];
            let receivedBytes = 0;
            const MAX_BYTES = 5 * 1024 * 1024; // 5MB limit

            response.on('data', (chunk: Buffer) => {
              receivedBytes += chunk.length;
              if (receivedBytes > MAX_BYTES) {
                response.destroy(new Error('Remote image exceeds size limit (5MB)'));
                return;
              }
              chunks.push(chunk);
            });

            response.on('end', () => {
              resolve({ buffer: Buffer.concat(chunks), contentType: headers['content-type'] });
            });
            response.on('error', (error) => reject(error));
          }
        );

        request.setTimeout(15000, () => {
          request.destroy(new Error('Remote image request timed out'));
        });

        request.on('error', (error) => reject(error));
      } catch (error) {
        reject(error);
      }
    });
  };

  // Fetch remote image via bridge and return base64
  ipcBridge.fs.fetchRemoteImage.provider(async ({ url }) => {
    const { buffer, contentType } = await downloadRemoteBuffer(url);
    const base64 = buffer.toString('base64');
    return `data:${contentType || 'application/octet-stream'};base64,${base64}`;
  });

  // Create temporary file on disk
  ipcBridge.fs.createTempFile.provider(async ({ fileName }) => {
    try {
      const { cacheDir } = getSystemDir();
      const tempDir = path.join(cacheDir, 'temp');

      // Ensure temp directory exists
      await fs.mkdir(tempDir, { recursive: true });

      // Keep original name but sanitize illegal characters
      const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
      let tempFilePath = path.join(tempDir, safeFileName);

      // Append timestamp when duplicate exists
      const fileExists = await fs
        .access(tempFilePath)
        .then(() => true)
        .catch(() => false);

      if (fileExists) {
        const timestamp = Date.now();
        const ext = path.extname(safeFileName);
        const name = path.basename(safeFileName, ext);
        const tempFileName = `${name}${AIONUI_TIMESTAMP_SEPARATOR}${timestamp}${ext}`;
        tempFilePath = path.join(tempDir, tempFileName);
      }

      // Create empty placeholder file
      await fs.writeFile(tempFilePath, Buffer.alloc(0));

      return tempFilePath;
    } catch (error) {
      console.error('Failed to create temp file:', error);
      throw error;
    }
  });

  // Read file content (UTF-8 encoding)
  ipcBridge.fs.readFile.provider(async ({ path: filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Failed to read file:', error);
      throw error;
    }
  });

  // Read binary file as ArrayBuffer
  ipcBridge.fs.readFileBuffer.provider(async ({ path: filePath }) => {
    try {
      const buffer = await fs.readFile(filePath);
      // Convert Node.js Buffer to ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (error) {
      console.error('Failed to read file buffer:', error);
      throw error;
    }
  });

  // Write file
  ipcBridge.fs.writeFile.provider(async ({ path: filePath, data }) => {
    try {
      // Handle string type
      if (typeof data === 'string') {
        await fs.writeFile(filePath, data, 'utf-8');

        // Send streaming content update to preview panel (for real-time updates)
        try {
          const pathSegments = filePath.split(path.sep);
          const fileName = pathSegments[pathSegments.length - 1];
          const workspace = pathSegments.slice(0, -1).join(path.sep);

          const eventData = {
            filePath: filePath,
            content: data,
            workspace: workspace,
            relativePath: fileName,
            operation: 'write' as const,
          };

          ipcBridge.fileStream.contentUpdate.emit(eventData);
        } catch (emitError) {
          console.error('[fsBridge] ❌ Failed to emit file stream update:', emitError);
        }

        return true;
      }

      // Handle Uint8Array being serialized as object during IPC transfer
      let bufferData;

      // Check if it's a serialized typed array (object with numeric keys)
      if (data && typeof data === 'object' && data.constructor?.name === 'Object') {
        const keys = Object.keys(data);
        // Check if all keys are numeric strings (characteristic of typed arrays)
        const isTypedArrayLike = keys.length > 0 && keys.every((key) => /^\d+$/.test(key));

        if (isTypedArrayLike) {
          // Ensure values are numeric array
          const values = Object.values(data).map((v) => (typeof v === 'number' ? v : parseInt(v, 10)));
          bufferData = Buffer.from(values);
        } else {
          bufferData = data;
        }
      } else if (data instanceof Uint8Array) {
        bufferData = Buffer.from(data);
      } else if (Buffer.isBuffer(data)) {
        bufferData = data;
      } else {
        bufferData = data;
      }

      await fs.writeFile(filePath, bufferData);
      return true;
    } catch (error) {
      console.error('Failed to write file:', error);
      return false;
    }
  });

  // Get file metadata
  ipcBridge.fs.getFileMetadata.provider(async ({ path: filePath }) => {
    try {
      const stats = await fs.stat(filePath);
      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        type: '', // MIME type can be inferred from file extension
        lastModified: stats.mtime.getTime(),
      };
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      throw error;
    }
  });

  // Copy files to workspace
  ipcBridge.fs.copyFilesToWorkspace.provider(async ({ filePaths, workspace, sourceRoot }) => {
    try {
      const copiedFiles: string[] = [];
      const failedFiles: Array<{ path: string; error: string }> = [];

      // Ensure workspace directory exists
      await fs.mkdir(workspace, { recursive: true });

      for (const filePath of filePaths) {
        try {
          let targetPath: string;

          if (sourceRoot) {
            // Preserve directory structure
            const relativePath = path.relative(sourceRoot, filePath);
            targetPath = path.join(workspace, relativePath);

            // Ensure parent directory exists
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
          } else {
            // Flatten to root (legacy behavior)
            const fileName = path.basename(filePath);
            targetPath = path.join(workspace, fileName);
          }

          // Check if target file already exists
          const exists = await fs
            .access(targetPath)
            .then(() => true)
            .catch(() => false);

          let finalTargetPath = targetPath;
          if (exists) {
            // Append timestamp when target file already exists
            const timestamp = Date.now();
            const ext = path.extname(targetPath);
            const name = path.basename(targetPath, ext);
            // Construct new path in the same directory
            const dir = path.dirname(targetPath);
            const newFileName = `${name}${AIONUI_TIMESTAMP_SEPARATOR}${timestamp}${ext}`;
            finalTargetPath = path.join(dir, newFileName);
          }

          await fs.copyFile(filePath, finalTargetPath);
          copiedFiles.push(finalTargetPath);
        } catch (error) {
          // Record failed file info so UI can warn user
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to copy file ${filePath}:`, message);
          failedFiles.push({ path: filePath, error: message });
        }
      }

      // Mark operation as non-success if anything failed and provide hint text
      const success = failedFiles.length === 0;
      const msg = success ? undefined : 'Some files failed to copy';

      return {
        success,
        data: { copiedFiles, failedFiles },
        msg,
      };
    } catch (error) {
      console.error('Failed to copy files to workspace:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Delete file or directory on disk
  ipcBridge.fs.removeEntry.provider(async ({ path: targetPath }) => {
    try {
      const stats = await fs.lstat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);

        // Send streaming delete event to preview panel (to close preview)
        try {
          const pathSegments = targetPath.split(path.sep);
          const fileName = pathSegments[pathSegments.length - 1];
          const workspace = pathSegments.slice(0, -1).join(path.sep);

          ipcBridge.fileStream.contentUpdate.emit({
            filePath: targetPath,
            content: '',
            workspace: workspace,
            relativePath: fileName,
            operation: 'delete',
          });
        } catch (emitError) {
          console.error('[fsBridge] Failed to emit file stream delete:', emitError);
        }
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to remove entry:', error);
      return { success: false, msg: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Rename file or directory and return new path
  ipcBridge.fs.renameEntry.provider(async ({ path: targetPath, newName }) => {
    try {
      const directory = path.dirname(targetPath);
      const newPath = path.join(directory, newName);

      if (newPath === targetPath) {
        // Skip when the new name equals the original path
        return { success: true, data: { newPath } };
      }

      const exists = await fs
        .access(newPath)
        .then(() => true)
        .catch(() => false);

      if (exists) {
        // Avoid overwriting existing targets
        return { success: false, msg: 'Target path already exists' };
      }

      await fs.rename(targetPath, newPath);
      return { success: true, data: { newPath } };
    } catch (error) {
      console.error('Failed to rename entry:', error);
      return { success: false, msg: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Read built-in rules file from app resources
  ipcBridge.fs.readBuiltinRule.provider(async ({ fileName }) => {
    try {
      return await readBuiltinResource('rules', fileName);
    } catch (error) {
      console.error('Failed to read builtin rule:', error);
      throw error;
    }
  });

  // Read built-in skills file from app resources
  ipcBridge.fs.readBuiltinSkill.provider(async ({ fileName }) => {
    try {
      return await readBuiltinResource('skills', fileName);
    } catch (error) {
      console.error('Failed to read builtin skill:', error);
      throw error;
    }
  });

  // Read assistant rule file from user directory or builtin rules
  ipcBridge.fs.readAssistantRule.provider(async ({ assistantId, locale = 'en-US' }) => {
    try {
      return await readAssistantResource('rules', assistantId, locale, ruleFilePattern);
    } catch (error) {
      console.error('Failed to read assistant rule:', error);
      throw error;
    }
  });

  // Write assistant rule file to user directory
  ipcBridge.fs.writeAssistantRule.provider(({ assistantId, content, locale = 'en-US' }) => {
    return writeAssistantResource('rules', assistantId, content, locale, ruleFilePattern);
  });

  // Delete assistant rule files
  ipcBridge.fs.deleteAssistantRule.provider(({ assistantId }) => {
    return deleteAssistantResource('rules', new RegExp(`^${assistantId}\\..*\\.md$`));
  });

  // Read assistant skill file from user directory or builtin skills
  ipcBridge.fs.readAssistantSkill.provider(async ({ assistantId, locale = 'en-US' }) => {
    try {
      return await readAssistantResource('skills', assistantId, locale, skillFilePattern);
    } catch (error) {
      console.error('Failed to read assistant skill:', error);
      throw error;
    }
  });

  // Write assistant skill file to user directory
  ipcBridge.fs.writeAssistantSkill.provider(({ assistantId, content, locale = 'en-US' }) => {
    return writeAssistantResource('skills', assistantId, content, locale, skillFilePattern);
  });

  // Delete assistant skill files
  ipcBridge.fs.deleteAssistantSkill.provider(({ assistantId }) => {
    return deleteAssistantResource('skills', new RegExp(`^${assistantId}-skills\\..*\\.md$`));
  });

  // List available skills from both builtin and user directories
  ipcBridge.fs.listAvailableSkills.provider(async () => {
    try {
      const skills: Array<{ name: string; description: string; location: string; isCustom: boolean }> = [];

      // Helper function: read skills from directory
      const readSkillsFromDir = async (skillsDir: string, isCustomDir: boolean) => {
        try {
          await fs.access(skillsDir);
          const entries = await fs.readdir(skillsDir, { withFileTypes: true });

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            // Skip builtin skills directory (_builtin), these are auto-injected, no user selection needed
            if (entry.name === '_builtin') continue;

            const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');

            try {
              const content = await fs.readFile(skillMdPath, 'utf-8');
              // Parse YAML front matter
              const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
              if (frontMatterMatch) {
                const yaml = frontMatterMatch[1];
                const nameMatch = yaml.match(/^name:\s*(.+)$/m);
                const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
                if (nameMatch) {
                  skills.push({
                    name: nameMatch[1].trim(),
                    description: descMatch ? descMatch[1].trim() : '',
                    location: skillMdPath,
                    isCustom: isCustomDir,
                  });
                }
              }
            } catch {
              // Skill directory without SKILL.md, skip
            }
          }
        } catch {
          // Directory doesn't exist, skip
        }
      };

      // Read builtin skills (isCustom: false)
      const builtinSkillsDir = await findBuiltinResourceDir('skills');
      const builtinCountBefore = skills.length;
      await readSkillsFromDir(builtinSkillsDir, false);
      const builtinCount = skills.length - builtinCountBefore;

      // Read user custom skills (isCustom: true)
      const userSkillsDir = getUserSkillsDir();
      const userCountBefore = skills.length;
      await readSkillsFromDir(userSkillsDir, true);
      const userCount = skills.length - userCountBefore;

      // Deduplicate: if custom and builtin skills have same name, keep only builtin
      const skillMap = new Map<string, { name: string; description: string; location: string; isCustom: boolean }>();
      for (const skill of skills) {
        const existing = skillMap.get(skill.name);
        // Add/update if: already exists and current is builtin, or doesn't exist yet
        if (!existing || !skill.isCustom) {
          skillMap.set(skill.name, skill);
        }
      }
      const deduplicatedSkills = Array.from(skillMap.values());

      console.log(`[fsBridge] Listed ${deduplicatedSkills.length} available skills (${skills.length} before deduplication):`);
      console.log(`  - Builtin skills (${builtinCount}): ${builtinSkillsDir}`);
      console.log(`  - User skills (${userCount}): ${userSkillsDir}`);
      console.log(`  - Skills breakdown:`, deduplicatedSkills.map((s) => `${s.name} (${s.isCustom ? 'custom' : 'builtin'})`).join(', '));

      return deduplicatedSkills;
    } catch (error) {
      console.error('[fsBridge] Failed to list available skills:', error);
      return [];
    }
  });

  // Read skill info without importing
  ipcBridge.fs.readSkillInfo.provider(async ({ skillPath }) => {
    try {
      // Verify SKILL.md file exists
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      try {
        await fs.access(skillMdPath);
      } catch {
        return {
          success: false,
          msg: 'SKILL.md file not found in the selected directory',
        };
      }

      // Read SKILL.md to get skill info
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      let skillName = path.basename(skillPath); // Default to directory name
      let skillDescription = '';

      if (frontMatterMatch) {
        const yaml = frontMatterMatch[1];
        const nameMatch = yaml.match(/^name:\s*(.+)$/m);
        const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
        if (nameMatch) {
          skillName = nameMatch[1].trim();
        }
        if (descMatch) {
          skillDescription = descMatch[1].trim();
        }
      }

      return {
        success: true,
        data: {
          name: skillName,
          description: skillDescription,
        },
        msg: 'Skill info loaded successfully',
      };
    } catch (error) {
      console.error('[fsBridge] Failed to read skill info:', error);
      return {
        success: false,
        msg: `Failed to read skill info: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // Import skill directory
  ipcBridge.fs.importSkill.provider(async ({ skillPath }) => {
    try {
      // Verify SKILL.md file exists
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      try {
        await fs.access(skillMdPath);
      } catch {
        return {
          success: false,
          msg: 'SKILL.md file not found in the selected directory',
        };
      }

      // Read SKILL.md to get skill name
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      let skillName = path.basename(skillPath); // Default to directory name

      if (frontMatterMatch) {
        const yaml = frontMatterMatch[1];
        const nameMatch = yaml.match(/^name:\s*(.+)$/m);
        if (nameMatch) {
          skillName = nameMatch[1].trim();
        }
      }

      // Get user skills directory
      const userSkillsDir = getUserSkillsDir();
      const targetDir = path.join(userSkillsDir, skillName);

      // Check if skill already exists in both builtin and user directories
      const builtinSkillsDir = await findBuiltinResourceDir('skills');
      const builtinTargetDir = path.join(builtinSkillsDir, skillName);

      try {
        await fs.access(targetDir);
        return {
          success: false,
          msg: `Skill "${skillName}" already exists in user skills`,
        };
      } catch {
        // User skill doesn't exist
      }

      try {
        await fs.access(builtinTargetDir);
        return {
          success: false,
          msg: `Skill "${skillName}" already exists in builtin skills`,
        };
      } catch {
        // Builtin skill doesn't exist, proceed with copy
      }

      // Copy entire directory
      await copyDirectory(skillPath, targetDir);

      console.log(`[fsBridge] Successfully imported skill "${skillName}" to ${targetDir}`);

      return {
        success: true,
        data: { skillName },
        msg: `Skill "${skillName}" imported successfully`,
      };
    } catch (error) {
      console.error('[fsBridge] Failed to import skill:', error);
      return {
        success: false,
        msg: `Failed to import skill: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // Scan directory for skills
  ipcBridge.fs.scanForSkills.provider(async ({ folderPath }) => {
    console.log(`[fsBridge] scanForSkills called with path: ${folderPath}`);
    try {
      const skills: Array<{ name: string; description: string; path: string }> = [];

      await fs.access(folderPath);
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      console.log(`[fsBridge] Found ${entries.length} entries in ${folderPath}`);

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(folderPath, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          // Parse YAML front matter
          const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (frontMatterMatch) {
            const yaml = frontMatterMatch[1];
            const nameMatch = yaml.match(/^name:\s*(.+)$/m);
            const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
            if (nameMatch) {
              skills.push({
                name: nameMatch[1].trim(),
                description: descMatch ? descMatch[1].trim() : '',
                path: skillDir,
              });
              console.log(`[fsBridge] Found skill in subdirectory: ${nameMatch[1].trim()}`);
            }
          }
        } catch {
          // Skill directory without SKILL.md, skip
        }
      }

      // Si no se encontraron skills en subdirectorios, probamos si la carpeta seleccionada en sí es una skill
      if (skills.length === 0) {
        console.log(`[fsBridge] No skills in subdirectories, checking if ${folderPath} is a skill itself`);
        const skillMdPath = path.join(folderPath, 'SKILL.md');
        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (frontMatterMatch) {
            const yaml = frontMatterMatch[1];
            const nameMatch = yaml.match(/^name:\s*(.+)$/m);
            const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
            if (nameMatch) {
              skills.push({
                name: nameMatch[1].trim(),
                description: descMatch ? descMatch[1].trim() : '',
                path: folderPath,
              });
              console.log(`[fsBridge] Found skill in the folder itself: ${nameMatch[1].trim()}`);
            }
          }
        } catch {
          // Not a skill directory
        }
      }

      console.log(`[fsBridge] scanForSkills finished. Found ${skills.length} skills.`);
      return {
        success: true,
        data: skills,
        msg: `Found ${skills.length} skills`,
      };
    } catch (error) {
      console.error('[fsBridge] Failed to scan skills:', error);
      return {
        success: false,
        msg: `Failed to scan skills: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // Detect common skills paths
  ipcBridge.fs.detectCommonSkillPaths.provider(async () => {
    try {
      const homedir = os.homedir();
      const candidates = [
        { name: 'Gemini', path: path.join(homedir, '.gemini', 'skills') },
        { name: 'Claude', path: path.join(homedir, '.claude', 'skills') },
      ];

      const detected: Array<{ name: string; path: string }> = [];
      for (const candidate of candidates) {
        try {
          await fs.access(candidate.path);
          detected.push(candidate);
        } catch {
          // Path doesn't exist
        }
      }

      return {
        success: true,
        data: detected,
        msg: `Detected ${detected.length} common paths`,
      };
    } catch (error) {
      console.error('[fsBridge] Failed to detect common paths:', error);
      return {
        success: false,
        msg: 'Failed to detect common paths',
      };
    }
  });
}
