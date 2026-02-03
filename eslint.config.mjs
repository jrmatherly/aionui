// @ts-check
import eslint from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // Global ignores (replaces .eslintignore)
  // Note: gemini/cli is handled as an override below, not ignored
  {
    ignores: ['node_modules/', 'dist/', 'build/', '.webpack/', 'out/', '*.min.js', '*.min.css', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '*.log', '.DS_Store', 'Thumbs.db', 'public/', 'resources/', 'docs/', 'config/webpack/', 'scripts/', 'skills/', '.scratchpad/', '.local_docs/', '.drift/', 'src/agent/gemini/cli/', 'deploy/'],
  },

  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript ESLint recommended (matches old plugin:@typescript-eslint/recommended)
  // Using 'recommended' not 'recommendedTypeChecked' to match original config
  // Type-aware rules (no-floating-promises, await-thenable) are explicitly enabled below
  ...tseslint.configs.recommended,

  // Import plugin for TypeScript
  // @ts-expect-error - Type incompatibility between eslint-plugin-import-x and @eslint/core
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,

  // Prettier (must be last to override formatting rules)
  eslintPluginPrettier,

  // Main TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
        }),
      ],
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // Import rules
      'import-x/no-unresolved': 'off',
      'import-x/default': 'off', // Some modules like tiny-csrf have non-standard exports
      'import-x/no-named-as-default-member': 'warn',

      // TypeScript rules (matching original .eslintrc.json)
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-restricted-types': 'warn', // Replaces deprecated ban-types
      '@typescript-eslint/no-empty-object-type': 'warn', // Part of ban-types replacement
      '@typescript-eslint/no-unnecessary-type-constraint': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // Not in original config

      // Type-aware rules (require parserOptions.projectService)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // ESLint core rules
      'max-len': [
        'warn',
        {
          code: 200,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      'no-constant-condition': 'warn',
      'no-empty-pattern': 'warn',
    },
  },

  // JavaScript files - disable type checking (matches old *.js override)
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'require-await': 'off',
    },
  },

  // Config files and tests - disable type checking (matches old forge.config.ts/tests override)
  {
    files: ['forge.config.ts', 'tests/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'require-await': 'off',
    },
  }

  // Note: gemini/cli files are fully ignored (matching old .eslintignore behavior)
);
