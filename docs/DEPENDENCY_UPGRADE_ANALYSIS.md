# Dependency Upgrade Analysis Report

**Generated**: February 2, 2026
**Project**: AionUI v1.8.1
**Analysis Scope**: Major version upgrades with potential breaking changes

---

## Executive Summary

| Package | Current | Target | Risk Level | Code Changes Required |
|---------|---------|--------|------------|----------------------|
| @electron/fuses | ^1.8.0 | ^2.0.0 | ⛔ BLOCKED | Peer dep conflict with @electron-forge/plugin-fuses |
| @types/bcryptjs | ^2.4.6 | ^3.0.0 | 🟢 LOW | Remove package (types now built-in) |
| @types/node | ^24.3.1 | ^25.2.0 | 🟢 LOW | None (types only) |
| @typescript-eslint/* | ^6.21.0 | ^8.54.0 | 🟠 MEDIUM | `.eslintrc.json` - migrate 3 rules |
| bcryptjs | ^2.4.3 | ^3.0.3 | 🟠 MEDIUM | None (test auth flows) |
| croner | ^9.1.0 | ^10.0.1 | 🟢 LOW | None (API compatible) |
| cross-env | ^7.0.3 | ^10.1.0 | 🟢 LOW | None (CLI only) |
| css-loader | ^6.11.0 | ^7.1.3 | 🟠 MEDIUM | `webpack.rules.ts` - add namedExport:false |

**Total files requiring changes: 2** (`.eslintrc.json`, `config/webpack/webpack.rules.ts`)
**Total packages to remove: 1** (`@types/bcryptjs`)

---

## Detailed Analysis

### 1. @electron/fuses (^1.8.0 → ^2.0.0)

**Risk Level**: 🔴 HIGH → ⛔ **BLOCKED**

#### Breaking Changes

- **ESM-only**: Package is now ESM-only, no CommonJS support
- **Node.js >=22.12.0 required**: Minimum Node version bumped (project already on >=24.0.0)

#### ⚠️ CRITICAL BLOCKER: Peer Dependency Conflict

**Current `@electron-forge/plugin-fuses@7.11.1` has peer dependency: `@electron/fuses ^1.0.0`**

The latest stable `@electron-forge/plugin-fuses` (v7.11.1) does NOT support `@electron/fuses@2.0.0`.
Even the alpha versions (v8.0.0-alpha.4) still require `@electron/fuses ^1.0.0`.

**This upgrade is BLOCKED until Electron Forge releases a compatible version.**

#### Current Usage in Codebase

| File | Line | Usage |
|------|------|-------|
| `forge.config.ts` | 12 | `import { FuseV1Options, FuseVersion } from '@electron/fuses'` |
| `forge.config.ts` | 242 | `version: FuseVersion.V1` |
| `forge.config.ts` | 243-248 | FuseV1Options configuration (6 fuse settings) |

```typescript
// forge.config.ts:12
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// forge.config.ts:242-248
version: FuseVersion.V1,
[FuseV1Options.RunAsNode]: false,
[FuseV1Options.EnableCookieEncryption]: true,
[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
[FuseV1Options.EnableNodeCliInspectArguments]: false,
[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
[FuseV1Options.OnlyLoadAppFromAsar]: true,
```

#### Additional Context

- **Project uses CommonJS**: `tsconfig.json` has `"module": "commonjs"`
- **No `type: "module"`** in package.json
- ESM-only `@electron/fuses@2.0.0` would require significant build system changes

#### Required Changes (When Unblocked)

1. Wait for `@electron-forge/plugin-fuses` to support `@electron/fuses@^2.0.0`
2. Verify `forge.config.ts` is treated as ESM (may need `.mts` extension or build changes)
3. Ensure Node.js >=24.0.0 in CI/CD and development environments
4. Test that fuse configuration syntax hasn't changed

#### Migration Steps (Deferred)

```bash
# 1. Verify Node version
node --version  # Must be >=24.0.0

# 2. Update BOTH packages together (when forge supports it)
npm install @electron-forge/plugin-fuses@latest @electron/fuses@^2.0.0

# 3. Test build
npm run build
```

#### Recommendation

**DO NOT UPGRADE** until `@electron-forge/plugin-fuses` releases a version with `@electron/fuses@^2.0.0` peer dependency support. Monitor:

- https://github.com/electron/forge/releases

#### Sources

- [GitHub Releases](https://github.com/electron/fuses/releases)
- [Electron Fuses Documentation](https://www.electronjs.org/docs/latest/tutorial/fuses)

---

### 2. @types/bcryptjs (^2.4.6 → ^3.0.0)

**Risk Level**: 🟢 LOW

#### Breaking Changes

- Type definitions updated to match bcryptjs v3.0.0 API
- May include stricter typing

#### Impact Assessment

- This is a dev dependency (types only)
- Should be upgraded alongside `bcryptjs` package
- No runtime code changes required

#### Migration Steps

```bash
# Upgrade together with bcryptjs
npm install bcryptjs@^3.0.3 @types/bcryptjs@^3.0.0
```

---

### 3. @types/node (^24.3.1 → ^25.2.0)

**Risk Level**: 🟢 LOW

#### Breaking Changes

- Updated type definitions for newer Node.js APIs
- May flag new type errors in existing code

#### Impact Assessment

- Dev dependency only
- Should match target Node.js version (22.x)
- Run TypeScript compilation to identify any new errors

#### Migration Steps

```bash
npm install @types/node@^25.2.0
npm run lint  # Check for new type errors
```

---

### 4. @typescript-eslint/eslint-plugin & parser (^6.21.0 → ^8.54.0)

**Risk Level**: 🟠 MEDIUM

#### Breaking Changes

- **Node.js >=18.18.0 or >=20.0.0 required**
- **ESLint ^8.57.0 required** (or ESLint 9.x) - Note: ESLint 9.39.2 is current
- **TypeScript >=4.8.4 <6.0.0 required**
- Formatting rules removed (moved to `@stylistic/eslint-plugin`)
- Rule configurations changed
- `@typescript-eslint/ban-types` renamed/restructured

#### Current Usage in Codebase

| File | Line | Affected Rule | Action Required |
|------|------|---------------|-----------------|
| `.eslintrc.json` | 17-28 | `@typescript-eslint/member-delimiter-style` | ⚠️ Migrate to `@stylistic/member-delimiter-style` |
| `.eslintrc.json` | 30-41 | `@typescript-eslint/type-annotation-spacing` | ⚠️ Migrate to `@stylistic/type-annotation-spacing` |
| `.eslintrc.json` | 68 | `@typescript-eslint/ban-types` | ⚠️ Replace with `@typescript-eslint/no-empty-object-type` |

**Full current configuration requiring changes:**

```json
// .eslintrc.json:17-28 - MUST MIGRATE
"@typescript-eslint/member-delimiter-style": [
  "error",
  {
    "multiline": { "delimiter": "semi", "requireLast": true },
    "singleline": { "delimiter": "semi", "requireLast": false }
  }
],

// .eslintrc.json:30-41 - MUST MIGRATE
"@typescript-eslint/type-annotation-spacing": [
  "error",
  {
    "before": false,
    "after": true,
    "overrides": { "arrow": { "before": true, "after": true } }
  }
],

// .eslintrc.json:68 - MUST RENAME
"@typescript-eslint/ban-types": "warn",
```

#### Required Changes

1. **Install stylistic plugin** (latest: v5.7.1):

```bash
npm install -D @stylistic/eslint-plugin@^5.7.1
```

2. **Update .eslintrc.json** with exact replacements:

```json
{
  "plugins": ["@typescript-eslint", "@stylistic", "prettier"],
  "rules": {
    // REMOVE these lines:
    // "@typescript-eslint/member-delimiter-style": [...],
    // "@typescript-eslint/type-annotation-spacing": [...],
    // "@typescript-eslint/ban-types": "warn",

    // ADD these replacements:
    "@stylistic/member-delimiter-style": [
      "error",
      {
        "multiline": { "delimiter": "semi", "requireLast": true },
        "singleline": { "delimiter": "semi", "requireLast": false }
      }
    ],
    "@stylistic/type-annotation-spacing": [
      "error",
      {
        "before": false,
        "after": true,
        "overrides": { "arrow": { "before": true, "after": true } }
      }
    ],
    "@typescript-eslint/no-empty-object-type": "warn"
  }
}
```

3. **Consider flat config migration** (optional but recommended):
   - ESLint 9.x supports flat config (`eslint.config.js`)
   - Legacy `.eslintrc.json` still works but is deprecated

#### Migration Steps

```bash
# 1. Update packages
npm install -D @typescript-eslint/eslint-plugin@^8.54.0 @typescript-eslint/parser@^8.54.0

# 2. Install stylistic plugin
npm install -D @stylistic/eslint-plugin@^5.7.1

# 3. Update .eslintrc.json as described above

# 4. Run lint to verify
npm run lint
```

#### Sources

- [typescript-eslint v8 Announcement](https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/)
- [typescript-eslint Releases](https://typescript-eslint.io/maintenance/releases/)
- [@stylistic/eslint-plugin](https://eslint.style/)

---

### 5. bcryptjs (^2.4.3 → ^3.0.3)

**Risk Level**: 🟠 MEDIUM

#### Breaking Changes

- **ESM default export**: Now exports ESM by default
- **Hash version 2b default**: Generates 2b hashes instead of previous default
- **dist/ removed from version control**
- **TypeScript types included**: Built-in types at `umd/index.d.ts` (may conflict with @types/bcryptjs)

#### Current Usage in Codebase

| File | Line | Import | API Usage |
|------|------|--------|-----------|
| `src/utils/resetPasswordCLI.ts` | 13 | `import bcrypt from 'bcryptjs'` | `bcrypt.hash()` |
| `src/webserver/auth/service/AuthService.ts` | 9 | `import bcrypt from 'bcryptjs'` | `bcrypt.hash()`, `bcrypt.compare()` |

**Detailed usage patterns:**

```typescript
// src/utils/resetPasswordCLI.ts:13,38
import bcrypt from 'bcryptjs';
bcrypt.hash(password, saltRounds, (error, hash) => { ... });  // Callback API

// src/webserver/auth/service/AuthService.ts:9,33,44
import bcrypt from 'bcryptjs';
bcrypt.hash(password, saltRounds, (error, hash) => { ... });  // Callback API
bcrypt.compare(password, hash, (error, same) => { ... });     // Callback API
```

#### Impact Assessment

- ✅ **Callback API unchanged** - Both files use callback-based API which remains compatible
- ✅ **Existing stored hashes work** - 2b hashes are backward compatible with 2a verification
- ⚠️ **Import syntax** - Default import may need adjustment for strict ESM
- ⚠️ **Type conflicts** - Built-in types may conflict with `@types/bcryptjs`

#### Required Changes

**Since project uses CommonJS (`"module": "commonjs"` in tsconfig.json) with `esModuleInterop: true`:**

1. **Import syntax should continue to work** - Webpack/ts-loader handles interop
2. **Remove `@types/bcryptjs`** - Use built-in types from bcryptjs v3.0.3
3. **Test thoroughly** - Verify hash/compare operations work correctly

#### Migration Steps

```bash
# 1. Update package
npm install bcryptjs@^3.0.3

# 2. Remove separate types (built-in types now included)
npm uninstall @types/bcryptjs

# 3. Test authentication flows
npm test

# 4. Manual verification
# - Test WebUI login with existing password
# - Test password reset CLI
# - Verify new users can register and login
```

#### Files Requiring Testing

- `src/utils/resetPasswordCLI.ts` - Password reset functionality
- `src/webserver/auth/service/AuthService.ts` - WebUI authentication

#### Sources

- [bcryptjs npm](https://www.npmjs.com/package/bcryptjs)
- [GitHub Releases](https://github.com/dcodeIO/bcrypt.js/releases)

---

### 6. croner (^9.1.0 → ^10.0.1)

**Risk Level**: 🟢 LOW

#### Breaking Changes

- **`?` character behavior**: Now acts as wildcard alias (same as `*`), previously replaced with current time values
- **`legacyMode` deprecated**: Use `domAndDow` instead
- **New features**: Year field support, W modifier, + modifier
- **Node.js >=18.0 required** (project already requires >=24.0.0)

#### Current Usage in Codebase

| File | Line | Usage |
|------|------|-------|
| `src/process/services/cron/CronService.ts` | 10 | `import { Cron } from 'croner'` |
| `src/process/services/cron/CronService.ts` | 196-205 | `new Cron(schedule.expr, { timezone, paused }, callback)` |
| `src/process/services/cron/CronService.ts` | 416 | `new Cron(schedule.expr, { timezone: schedule.tz })` |

**Detailed usage patterns:**

```typescript
// src/process/services/cron/CronService.ts:196-205
const timer = new Cron(
  schedule.expr,
  {
    timezone: schedule.tz,
    paused: false,
  },
  () => { void this.executeJob(job); }
);

// src/process/services/cron/CronService.ts:416
const cron = new Cron(schedule.expr, { timezone: schedule.tz });
```

#### Impact Assessment

- ✅ **Import syntax correct**: `import { Cron }` (named import)
- ✅ **Constructor syntax correct**: `new Cron()` used throughout
- ✅ **No `legacyMode` usage**: Codebase search found no occurrences
- ✅ **Options used are compatible**: `timezone`, `paused` remain unchanged
- ⚠️ **User-provided cron expressions**: If users create cron jobs with `?` character, behavior changes

#### Required Changes

**None for existing code.** However:

1. **Documentation update**: Inform users that `?` now means `*` (wildcard) instead of "current time"
2. **Database audit (optional)**: Check if any stored cron expressions use `?`

```sql
-- Check for cron expressions using ? character
SELECT * FROM cron_jobs WHERE schedule_value LIKE '%?%';
```

#### Migration Steps

```bash
# 1. Update package
npm install croner@^10.0.1

# 2. Test cron functionality
npm run test:integration

# 3. Manual verification
# - Create a test cron job
# - Verify it triggers at expected times
```

#### Sources

- [Croner Migration Guide](https://croner.56k.guru/migration/)

---

### 7. cross-env (^7.0.3 → ^10.1.0)

**Risk Level**: 🟢 LOW

#### Breaking Changes

- **ESM-only**: Package converted from CommonJS to ESM
- **Node.js v20+ required**

#### Current Usage in Codebase

```json
// package.json scripts (CLI usage only)
"webui:prod": "cross-env NODE_ENV=production npm run cli -- --webui",
"webui:prod:remote": "cross-env NODE_ENV=production npm run cli -- --webui --remote",
```

#### Impact Assessment

- ✅ CLI-only usage = **No changes required**
- ✅ Project already on Node.js >=24.0.0
- Package is archived (Nov 2025) but stable

#### Migration Steps

```bash
npm install cross-env@^10.1.0
```

#### Sources

- [cross-env v10.0.0 Release](https://github.com/kentcdodds/cross-env/releases/tag/v10.0.0)
- [npm package](https://www.npmjs.com/package/cross-env)

---

### 8. css-loader (^6.11.0 → ^7.1.3)

**Risk Level**: 🟠 MEDIUM

#### Breaking Changes

- **`namedExport: true` default**: CSS modules now use named exports by default
- **Node.js >=18.12.0 required**
- **Webpack >=5.27.0 required** (project uses Webpack via Electron Forge)

#### Current Usage in Codebase

| File | Line | Description |
|------|------|-------------|
| `config/webpack/webpack.rules.ts` | 50-61 | Main CSS loader config |
| `config/webpack/webpack.rules.ts` | 64-67 | UnoCSS virtual file config |
| `src/renderer/types.d.ts` | 6-9 | CSS module type declaration |
| `src/renderer/pages/guid/index.module.css` | - | Only CSS module file |
| `src/renderer/pages/guid/index.tsx` | 45 | CSS module import |

**Webpack config** (`config/webpack/webpack.rules.ts:50-61`):

```typescript
{
  test: /\.css$/,
  use: [
    MiniCssExtractPlugin.loader,
    {
      loader: 'css-loader',
      options: {
        importLoaders: 1,
        // ⚠️ No modules config - uses default (namedExport: true in v7)
      },
    },
    'postcss-loader',
  ],
  include: [/src/, /node_modules/],
},
// UnoCSS virtual CSS (line 64-67)
{
  test: /_virtual_%2F__uno\.css$/,
  use: [MiniCssExtractPlugin.loader, 'css-loader'],  // ⚠️ Also affected
},
```

**Type declaration** (`src/renderer/types.d.ts:6-9`):

```typescript
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;  // ⚠️ Uses default export - incompatible with v7 default
}
```

**Import usage** (`src/renderer/pages/guid/index.tsx:45`):

```typescript
import styles from './index.module.css';  // ⚠️ Default import - incompatible with v7 default
```

#### Impact Assessment

- ⚠️ **Only 1 CSS module file** in project: `src/renderer/pages/guid/index.module.css`
- ⚠️ **Type declaration uses default export** - breaks with `namedExport: true`
- ⚠️ **Import uses default import** - breaks with `namedExport: true`
- ✅ **UnoCSS virtual file** - likely unaffected (not a CSS module)

#### Required Changes

**Option A: Restore v6 behavior (Recommended - 1 file change)**

Update `config/webpack/webpack.rules.ts`:

```typescript
// Line 50-61: Update main CSS rule
{
  test: /\.css$/,
  use: [
    MiniCssExtractPlugin.loader,
    {
      loader: 'css-loader',
      options: {
        importLoaders: 1,
        modules: {
          namedExport: false,  // ← ADD THIS LINE
        },
      },
    },
    'postcss-loader',
  ],
  include: [/src/, /node_modules/],
},
```

**Option B: Migrate to named exports (3 file changes)**

```typescript
// 1. config/webpack/webpack.rules.ts - No changes needed (v7 default is namedExport: true)

// 2. src/renderer/types.d.ts:6-9 - Update type declaration
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export = classes;  // Changed from 'export default'
}

// 3. src/renderer/pages/guid/index.tsx:45 - Update import
import * as styles from './index.module.css';  // Changed from default import
```

#### Migration Steps

```bash
# 1. Update webpack config FIRST (Option A recommended)
# Edit config/webpack/webpack.rules.ts as shown above

# 2. Update package
npm install css-loader@^7.1.3

# 3. Test build
npm run build

# 4. Verify the guid page renders correctly
npm start
# Navigate to the guid page and verify styles are applied
```

#### Sources

- [css-loader v7 Breaking Change](https://toknow.ai/posts/breaking-change-css-loader-v7/)
- [css-loader CHANGELOG](https://github.com/webpack-contrib/css-loader/blob/master/CHANGELOG.md)

---

## Recommended Upgrade Order

Based on dependencies, risk levels, and blocking issues:

### Phase 1: Low-Risk Updates (Can do immediately)

| Package | Files to Change | Changes Required |
|---------|-----------------|------------------|
| `cross-env` → ^10.1.0 | None | CLI-only, no code changes |
| `croner` → ^10.0.1 | None | API compatible |
| `@types/node` → ^25.2.0 | None | Types only, may surface new errors |

### Phase 2: Medium-Risk Updates (Requires config/testing)

| Package | Files to Change | Changes Required |
|---------|-----------------|------------------|
| `css-loader` → ^7.1.3 | `config/webpack/webpack.rules.ts` | Add `modules: { namedExport: false }` |
| `bcryptjs` → ^3.0.3 | None (remove `@types/bcryptjs`) | Test auth flows |

### Phase 3: Config Migration Required

| Package | Files to Change | Changes Required |
|---------|-----------------|------------------|
| `@typescript-eslint/*` → ^8.54.0 | `.eslintrc.json` | Migrate 3 rules to @stylistic |

**Detailed .eslintrc.json changes:**

- Remove: `@typescript-eslint/member-delimiter-style`
- Remove: `@typescript-eslint/type-annotation-spacing`
- Remove: `@typescript-eslint/ban-types`
- Add: `@stylistic/member-delimiter-style` (same config)
- Add: `@stylistic/type-annotation-spacing` (same config)
- Add: `@typescript-eslint/no-empty-object-type`

### Phase 4: ⛔ BLOCKED

| Package | Status | Blocker |
|---------|--------|---------|
| `@electron/fuses` → ^2.0.0 | **BLOCKED** | `@electron-forge/plugin-fuses@7.11.1` requires `@electron/fuses ^1.0.0` |

**Action**: Monitor https://github.com/electron/forge/releases for a version supporting `@electron/fuses@^2.0.0`

---

## Complete File Change Summary

### Files Requiring Modification

| File | Package(s) | Change Description |
|------|------------|-------------------|
| `config/webpack/webpack.rules.ts` | css-loader | Add `modules: { namedExport: false }` to CSS rule options |
| `.eslintrc.json` | @typescript-eslint/* | Migrate 3 rules to @stylistic equivalents |
| `package.json` | @types/bcryptjs | Remove (built-in types in bcryptjs@3) |

### Files Requiring Testing (No Code Changes)

| File | Package(s) | Test Scenario |
|------|------------|---------------|
| `src/utils/resetPasswordCLI.ts` | bcryptjs | Run `npm run resetpass <user>` |
| `src/webserver/auth/service/AuthService.ts` | bcryptjs | Test WebUI login/logout |
| `src/process/services/cron/CronService.ts` | croner | Create and trigger a scheduled task |
| `src/renderer/pages/guid/index.tsx` | css-loader | Verify styles render correctly |

### Files NOT Requiring Changes

| File | Package(s) | Reason |
|------|------------|--------|
| `forge.config.ts` | @electron/fuses | ⛔ BLOCKED - do not upgrade |
| `package.json` scripts | cross-env | CLI usage unchanged |

---

## Pre-Upgrade Checklist

- [ ] Ensure Node.js >=24.0.0 installed (`node --version`)
- [ ] Run full test suite with current versions: `npm test`
- [ ] Create git branch for upgrades: `git checkout -b chore/dependency-upgrades`
- [ ] Back up `package-lock.json`
- [ ] Read this document thoroughly

## Post-Upgrade Validation

### Automated Checks

- [ ] `npm run lint` passes
- [ ] `npm run build` completes without errors
- [ ] `npm test` passes

### Manual Testing

- [ ] **WebUI authentication** (bcryptjs)
  - Start WebUI: `npm run webui`
  - Login with existing credentials
  - Create new user and login
  - Test password reset: `npm run resetpass <username>`
- [ ] **Cron scheduling** (croner)
  - Create a cron job in UI
  - Verify it triggers at expected time
  - Check cron job listing
- [ ] **CSS styling** (css-loader)
  - Navigate to guid page
  - Verify styles are correctly applied
- [ ] **Production build** (skip @electron/fuses upgrade)
  - `npm run build`
  - Test packaged application

---

## References

- [@electron/fuses GitHub](https://github.com/electron/fuses/releases)
- [@electron-forge/plugin-fuses](https://www.npmjs.com/package/@electron-forge/plugin-fuses)
- [bcryptjs npm](https://www.npmjs.com/package/bcryptjs)
- [Croner Migration](https://croner.56k.guru/migration/)
- [typescript-eslint v8](https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/)
- [@stylistic/eslint-plugin](https://eslint.style/)
- [cross-env Releases](https://github.com/kentcdodds/cross-env/releases)
- [css-loader CHANGELOG](https://github.com/webpack-contrib/css-loader/blob/master/CHANGELOG.md)
