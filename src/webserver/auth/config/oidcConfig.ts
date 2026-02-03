/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EntraID OIDC configuration.
 * Loaded from environment variables — disabled by default.
 */

export interface IOidcConfig {
  enabled: boolean;
  issuer: string; // e.g. https://login.microsoftonline.com/{tenant}/v2.0
  clientId: string;
  clientSecret: string;
  redirectUri: string; // e.g. http://localhost:25808/api/auth/oidc/callback
  scopes: string[];
  responseType: string;
  groupsClaim: string; // ID-token claim key that carries group IDs
}

/**
 * Load OIDC config from process.env.
 * Returns a disabled config when OIDC_ENABLED is not 'true'.
 */
export function loadOidcConfig(): IOidcConfig {
  const enabled = process.env.OIDC_ENABLED === 'true';

  if (!enabled) {
    return {
      enabled: false,
      issuer: '',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      scopes: [],
      responseType: 'code',
      groupsClaim: 'groups',
    };
  }

  // Validate required fields
  const required = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI'] as const;
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`OIDC enabled but ${key} not configured`);
    }
  }

  return {
    enabled: true,
    issuer: process.env.OIDC_ISSUER!,
    clientId: process.env.OIDC_CLIENT_ID!,
    clientSecret: process.env.OIDC_CLIENT_SECRET!,
    redirectUri: process.env.OIDC_REDIRECT_URI!,
    scopes: (process.env.OIDC_SCOPES || 'openid profile email').split(' '),
    responseType: 'code',
    groupsClaim: process.env.OIDC_GROUPS_CLAIM || 'groups',
  };
}

/** Singleton — evaluated once at module load. */
export const OIDC_CONFIG = loadOidcConfig();
