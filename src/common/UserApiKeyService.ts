/**
 * @license
 * Copyright 2026 Jason Matherly (jrmatherly/aionui)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';

// Provider name to environment variable mapping
export const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  dashscope: 'DASHSCOPE_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  factory: 'FACTORY_API_KEY',
};

export class UserApiKeyService {
  private db: any; // better-sqlite3 Database
  private masterKey: Buffer;

  constructor(db: any, jwtSecret: string) {
    this.db = db;
    // Derive a 32-byte key from JWT_SECRET using SHA-256
    this.masterKey = crypto.createHash('sha256').update(jwtSecret).digest();
  }

  private deriveUserKey(userId: string): Buffer {
    // HMAC the master key with userId for per-user key derivation
    return crypto.createHmac('sha256', this.masterKey).update(userId).digest();
  }

  private encrypt(userId: string, plaintext: string): string {
    const key = this.deriveUserKey(userId);
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(userId: string, encryptedStr: string): string {
    const [ivB64, authTagB64, ciphertextB64] = encryptedStr.split(':');
    const key = this.deriveUserKey(userId);
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  private getKeyHint(apiKey: string): string {
    // Show last 4 characters: "...sk-abc"
    if (apiKey.length <= 4) return '****';
    return '...' + apiKey.slice(-4);
  }

  setKey(userId: string, provider: string, apiKey: string): void {
    const id = crypto.randomUUID();
    const encrypted = this.encrypt(userId, apiKey);
    const hint = this.getKeyHint(apiKey);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO user_api_keys (id, user_id, provider, encrypted_key, key_hint, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET
        encrypted_key = excluded.encrypted_key,
        key_hint = excluded.key_hint,
        updated_at = excluded.updated_at
    `);
    stmt.run(id, userId, provider, encrypted, hint, now, now);
  }

  getKey(userId: string, provider: string): string | null {
    const stmt = this.db.prepare('SELECT encrypted_key FROM user_api_keys WHERE user_id = ? AND provider = ?');
    const row = stmt.get(userId, provider) as { encrypted_key: string } | undefined;
    if (!row) return null;
    return this.decrypt(userId, row.encrypted_key);
  }

  getKeys(userId: string): Array<{ provider: string; keyHint: string }> {
    const stmt = this.db.prepare('SELECT provider, key_hint FROM user_api_keys WHERE user_id = ?');
    const rows = stmt.all(userId) as Array<{ provider: string; key_hint: string }>;
    return rows.map((row) => ({
      provider: row.provider,
      keyHint: row.key_hint,
    }));
  }

  deleteKey(userId: string, provider: string): boolean {
    const stmt = this.db.prepare('DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?');
    const result = stmt.run(userId, provider);
    return result.changes > 0;
  }

  /**
   * Get environment variables with user's API keys for ACP process spawn.
   * User keys override container-level env vars.
   */
  getEnvForUser(userId: string): Record<string, string> {
    const env: Record<string, string> = {};
    const stmt = this.db.prepare('SELECT provider, encrypted_key FROM user_api_keys WHERE user_id = ?');
    const rows = stmt.all(userId) as Array<{ provider: string; encrypted_key: string }>;

    for (const row of rows) {
      const envVar = PROVIDER_ENV_MAP[row.provider];
      if (envVar) {
        env[envVar] = this.decrypt(userId, row.encrypted_key);
      }
    }
    return env;
  }
}

// Singleton instance (initialized after DB is ready)
let instance: UserApiKeyService | null = null;

export function initUserApiKeyService(db: any, jwtSecret: string): UserApiKeyService {
  instance = new UserApiKeyService(db, jwtSecret);
  return instance;
}

export function getUserApiKeyService(): UserApiKeyService {
  if (!instance) throw new Error('UserApiKeyService not initialized');
  return instance;
}
