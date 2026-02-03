/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom CSS Processing Utilities
 * Unified handling of !important addition and formatting for custom CSS
 */

/**
 * Automatically add !important to all CSS properties
 * @param css - Original CSS string
 * @returns Processed CSS string (all properties with !important)
 */
export const addImportantToAll = (css: string): string => {
  if (!css || !css.trim()) {
    return '';
  }

  return css.replace(/([a-zA-Z-]+)\s*:\s*([^;!}]+);/g, (match, property, value) => {
    const trimmedValue = value.trim();
    // If already contains !important, don't add again
    if (trimmedValue.endsWith('!important')) {
      return match;
    }
    // Add !important
    return `${property}: ${trimmedValue} !important;`;
  });
};

/**
 * Wrap custom CSS with descriptive comments
 * @param css - Processed CSS string
 * @returns CSS string with comments
 */
export const wrapCustomCss = (css: string): string => {
  if (!css || !css.trim()) {
    return '';
  }

  return `
/* User Custom Styles - Auto !important for highest priority */
${css}
  `.trim();
};

/**
 * Complete custom CSS processing
 * @param css - Original CSS string
 * @returns Processed and wrapped CSS string
 */
export const processCustomCss = (css: string): string => {
  const processed = addImportantToAll(css);
  return wrapCustomCss(processed);
};

/**
 * Validate CSS syntax (simple validation)
 * @param css - CSS string
 * @returns Whether the CSS is valid
 */
export const validateCss = (css: string): { valid: boolean; error?: string } => {
  if (!css || !css.trim()) {
    return { valid: true };
  }

  try {
    // Simple validation: check if braces are balanced
    const openBraces = (css.match(/\{/g) || []).length;
    const closeBraces = (css.match(/\}/g) || []).length;

    if (openBraces !== closeBraces) {
      return {
        valid: false,
        error: 'Unmatched braces: { and } count does not match',
      };
    }

    // Check for basic CSS structure
    if (openBraces > 0 && !css.includes(':')) {
      return {
        valid: false,
        error: 'Invalid CSS: no property declarations found',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
