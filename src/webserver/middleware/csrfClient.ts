/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/webserver/config/constants';

// Read cookie by name in browser environment
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookieString = document.cookie;
  if (!cookieString) {
    return null;
  }

  const cookies = cookieString.split(';');
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return null;
}

// Retrieve current CSRF token from cookie (if present)
export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE_NAME);
}

// Attach CSRF token to request headers, keeping original headers untouched when token missing
export function withCsrfHeader(headers: HeadersInit = {}): HeadersInit {
  const token = getCsrfToken();
  if (!token) {
    return headers;
  }

  if (headers instanceof Headers) {
    headers.set(CSRF_HEADER_NAME, token);
    return headers;
  }

  if (Array.isArray(headers)) {
    // [[name, value]] format
    const normalized = headers.filter(([name]) => name.toLowerCase() !== CSRF_HEADER_NAME.toLowerCase());
    normalized.push([CSRF_HEADER_NAME, token]);
    return normalized;
  }

  if (typeof headers === 'object' && headers !== null) {
    const plainHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
    plainHeaders[CSRF_HEADER_NAME] = token;
    return plainHeaders;
  }

  return headers;
}

// Attach CSRF token to request body for tiny-csrf compatibility
// tiny-csrf expects token in req.body._csrf, not in headers
export function withCsrfToken<T = unknown>(body: T): T & { _csrf?: string } {
  const token = getCsrfToken();
  if (!token) {
    return body as T & { _csrf?: string };
  }

  // Handle different body types
  if (body === null || body === undefined) {
    return { _csrf: token } as T & { _csrf?: string };
  }

  if (typeof body === 'object' && !Array.isArray(body)) {
    return { ...body, _csrf: token };
  }

  // For non-object bodies (string, FormData, etc.), return as-is
  // The caller should handle adding _csrf manually for these cases
  return body as T & { _csrf?: string };
}
