/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Branding service with environment variable overrides.
 *
 * In the main process, `process.env` is read at runtime so that Docker /
 * desktop users can customise branding without rebuilding.  The renderer
 * should NOT import this file directly — use the `useBranding` hook which
 * fetches the config over IPC.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandingGitHubUrls {
  repo: string;
  wiki: string;
  releases: string;
  issues: string;
}

export interface BrandingDocsUrls {
  index: string;
  llmConfig: string;
  imageGeneration: string;
  remoteAccess: string;
}

export interface BrandingFeatureFlags {
  /** Allow users to toggle Claude YOLO (skip permissions) mode in Tools settings */
  allowClaudeYolo: boolean;
}

export interface BrandingConfig {
  brandName: string;
  githubRepo: string;
  websiteUrl: string;
  contactUrl: string;
  feedbackUrl: string;
  github: BrandingGitHubUrls;
  docs: BrandingDocsUrls;
  features: BrandingFeatureFlags;
}

// ---------------------------------------------------------------------------
// Defaults (our fork)
// ---------------------------------------------------------------------------

const DEFAULT_BRAND_NAME = 'AionUi';
const DEFAULT_GITHUB_REPO = 'jrmatherly/aionui';
const DEFAULT_WEBSITE_URL = 'https://github.com/jrmatherly/aionui';
const DEFAULT_CONTACT_URL = 'https://github.com/jrmatherly';
const DEFAULT_FEEDBACK_URL = 'https://github.com/jrmatherly/aionui/discussions';

// ---------------------------------------------------------------------------
// Helpers — read env vars at runtime (main process only)
// ---------------------------------------------------------------------------

const env = (key: string, fallback: string): string => (typeof process !== 'undefined' && process.env?.[key]) || fallback;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getBrandName(): string {
  return env('AIONUI_BRAND_NAME', DEFAULT_BRAND_NAME);
}

export function getGitHubRepo(): string {
  return env('AIONUI_GITHUB_REPO', DEFAULT_GITHUB_REPO);
}

export function getWebsiteUrl(): string {
  return env('AIONUI_WEBSITE_URL', DEFAULT_WEBSITE_URL);
}

export function getContactUrl(): string {
  return env('AIONUI_CONTACT_URL', DEFAULT_CONTACT_URL);
}

export function getFeedbackUrl(): string {
  return env('AIONUI_FEEDBACK_URL', DEFAULT_FEEDBACK_URL);
}

export function getGitHubUrls(): BrandingGitHubUrls {
  const base = `https://github.com/${getGitHubRepo()}`;
  return {
    repo: base,
    wiki: `${base}/wiki`,
    releases: `${base}/releases`,
    issues: `${base}/issues`,
  };
}

export function getDocsBaseUrl(): string {
  return getGitHubUrls().wiki;
}

export function getDocsUrl(page: string): string {
  return `${getDocsBaseUrl()}/${page}`;
}

export function getBrandingConfig(): BrandingConfig {
  const github = getGitHubUrls();
  return {
    brandName: getBrandName(),
    githubRepo: getGitHubRepo(),
    websiteUrl: getWebsiteUrl(),
    contactUrl: getContactUrl(),
    feedbackUrl: getFeedbackUrl(),
    github,
    docs: {
      index: github.wiki,
      llmConfig: getDocsUrl('LLM-Configuration'),
      imageGeneration: getDocsUrl('AionUi-Image-Generation-Tool-Model-Configuration-Guide'),
      remoteAccess: getDocsUrl('Remote-Internet-Access-Guide'),
    },
    features: {
      // ALLOW_CLAUDE_YOLO=true enables the "Claude YOLO (Skip Permissions)" toggle in Tools settings.
      // Hidden by default for safety — only expose when explicitly enabled by the administrator.
      allowClaudeYolo: env('ALLOW_CLAUDE_YOLO', 'false').toLowerCase() === 'true',
    },
  };
}
