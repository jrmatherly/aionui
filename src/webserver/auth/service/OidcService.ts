/**
 * @author Jason Matherly
 * @modified 2026-02-03
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OIDC Service — handles the full EntraID authorization-code flow,
 * JIT user provisioning, and group→role mapping.
 */

import crypto from 'crypto';
import type { Client, TokenSet } from 'openid-client';
import { Issuer } from 'openid-client';
import { GROUP_MAPPINGS, resolveRoleFromGroups } from '../config/groupMappings';
import { OIDC_CONFIG } from '../config/oidcConfig';
import { UserRepository } from '../repository/UserRepository';
import AuthService from './AuthService';
import { oidcLogger as log } from '@/common/logger';

interface StateEntry {
  createdAt: number;
  redirectTo?: string;
}

/**
 * Normalize display names from identity providers.
 * Microsoft EntraID often returns "Last, First" — flip to "First Last".
 */
function normalizeDisplayName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  // "Last, First" or "Last, First Middle" → "First Last" / "First Middle Last"
  const commaMatch = name.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    return `${commaMatch[2]} ${commaMatch[1]}`.trim();
  }
  return name.trim();
}

export interface OidcCallbackResult {
  success: boolean;
  user?: {
    id: string;
    username: string;
    displayName?: string;
    email?: string;
    oidcSubject: string;
    groups: string[];
    role: 'admin' | 'user' | 'viewer';
    auth_method: 'oidc';
    avatarUrl?: string;
  };
  redirectTo?: string;
  error?: string;
}

export class OidcService {
  private static client: Client | null = null;
  private static stateStore: Map<string, StateEntry> = new Map();
  private static readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 min

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                          */
  /* ------------------------------------------------------------------ */

  /** Discover the OIDC issuer and create a client. Call once at startup. */
  public static async initialize(): Promise<void> {
    if (!OIDC_CONFIG.enabled) {
      log.info('Disabled, skipping initialization');
      return;
    }

    try {
      const issuer = await Issuer.discover(OIDC_CONFIG.issuer);

      this.client = new issuer.Client({
        client_id: OIDC_CONFIG.clientId,
        client_secret: OIDC_CONFIG.clientSecret,
        redirect_uris: [OIDC_CONFIG.redirectUri],
        response_types: [OIDC_CONFIG.responseType],
      });

      log.info(
        {
          issuer: OIDC_CONFIG.issuer,
          redirectUri: OIDC_CONFIG.redirectUri,
        },
        'Initialized successfully'
      );
    } catch (error) {
      log.error({ err: error }, 'Failed to initialize');
      throw error;
    }
  }

  /** Whether the OIDC client is ready. */
  public static isReady(): boolean {
    return OIDC_CONFIG.enabled && this.client !== null;
  }

  /* ------------------------------------------------------------------ */
  /*  Authorization URL                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Build an authorization URL and a CSRF state token.
   * @param redirectTo — optional path the user should land on after auth.
   */
  public static getAuthorizationUrl(redirectTo?: string): { authUrl: string; state: string } {
    if (!this.client) {
      throw new Error('OIDC client not initialized');
    }

    const state = crypto.randomBytes(32).toString('hex');
    this.stateStore.set(state, { createdAt: Date.now(), redirectTo });

    // Housekeeping
    this.cleanupExpiredStates();

    const authUrl = this.client.authorizationUrl({
      scope: OIDC_CONFIG.scopes.join(' '),
      state,
    });

    return { authUrl, state };
  }

  /* ------------------------------------------------------------------ */
  /*  Callback handler                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Exchange the authorization code for tokens, extract claims,
   * JIT-provision the user, and resolve their role.
   */
  public static async handleCallback(callbackParams: Record<string, string>): Promise<OidcCallbackResult> {
    if (!this.client) {
      return { success: false, error: 'OIDC client not initialized' };
    }

    try {
      /* ── verify state ───────────────────────────────────────────── */
      const state = callbackParams.state;
      const stateData = this.stateStore.get(state);

      if (!stateData) {
        return { success: false, error: 'Invalid or expired state token' };
      }

      this.stateStore.delete(state);

      /* ── exchange code ──────────────────────────────────────────── */
      const tokenSet: TokenSet = await this.client.callback(OIDC_CONFIG.redirectUri, callbackParams, { state });

      const claims = tokenSet.claims();

      const oidcSubject = claims.sub;
      const email = claims.email as string | undefined;
      const displayName = normalizeDisplayName(claims.name as string | undefined);

      // Groups come from the configured claim (often 'groups' or '_claim_names')
      const groups = (claims[OIDC_CONFIG.groupsClaim] as string[]) || [];

      const role = resolveRoleFromGroups(groups, GROUP_MAPPINGS);

      /* ── fetch profile photo ────────────────────────────────────── */
      let avatarUrl: string | undefined;
      try {
        const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${tokenSet.access_token}` },
        });
        if (photoResponse.ok) {
          const contentType = photoResponse.headers.get('content-type') || 'image/jpeg';
          const buffer = Buffer.from(await photoResponse.arrayBuffer());
          avatarUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
        }
      } catch (e) {
        // Photo not available — not an error, just skip
        log.debug('Profile photo not available');
      }

      /* ── JIT provisioning ───────────────────────────────────────── */
      let user = UserRepository.findByOidcSubject(oidcSubject);

      if (!user) {
        // Derive a username: prefer email local-part, fallback to subject stub
        const username = email?.split('@')[0] || `user_${oidcSubject.substring(0, 8)}`;

        user = UserRepository.createOidcUser({
          username,
          oidcSubject,
          displayName,
          email,
          role,
          groups,
          avatarUrl,
        });

        log.info({ username, oidcSubject }, 'Created new user');
      } else {
        // Returning user — sync role / groups / display name / avatar
        UserRepository.updateOidcUserInfo(user.id, { role, groups, displayName, avatarUrl });
        log.info({ username: user.username, role }, 'Updated user');
      }

      UserRepository.updateLastLogin(user.id);

      // Initialize user workspace (non-blocking)
      AuthService.postLoginInit(user.id);

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name ?? undefined,
          email: user.email ?? undefined,
          oidcSubject,
          groups,
          role,
          auth_method: 'oidc',
          avatarUrl: user.avatar_url ?? undefined,
        },
        redirectTo: stateData.redirectTo,
      };
    } catch (error) {
      log.error({ err: error }, 'Callback error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Housekeeping                                                       */
  /* ------------------------------------------------------------------ */

  private static cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [key, entry] of this.stateStore.entries()) {
      if (now - entry.createdAt > this.STATE_EXPIRY_MS) {
        this.stateStore.delete(key);
      }
    }
  }
}
