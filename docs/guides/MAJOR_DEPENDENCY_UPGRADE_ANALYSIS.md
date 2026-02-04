# Major Dependency Upgrade Analysis

**Date:** February 4, 2026
**Author:** Bot42 (AI Analysis) for @jrmatherly
**Node.js:** v22.22.0 (engines: `>=22.0.0`)
**TypeScript:** v5.9.3

This document provides a comprehensive analysis of 10 major version upgrades flagged by Renovate,
cross-referenced against the AionUI codebase to determine upgrade feasibility, required refactoring,
and risk assessment.

---

## Summary Table

| Package | Current | Target | Verdict | Risk | Code Changes |
|---------|---------|--------|---------|------|-------------|
| croner | ^9.1.0 | ^10.0.1 | ✅ Upgrade | Low | Minor config addition |
| cross-env | ^7.0.3 | ^10.1.0 | ✅ Upgrade | None | None |
| css-loader | ^6.11.0 | ^7.1.3 | ✅ Upgrade | Low | Config change |
| express-rate-limit | ^7.5.1 | ^8.2.1 | ✅ Upgrade | None | None (security fix) |
| fix-path | ^4.0.0 | ^5.0.0 | ✅ Upgrade | None | None |
| fork-ts-checker-webpack-plugin | ^7.3.0 | ^9.1.0 | ✅ Upgrade | None | None |
| i18next | ^23.7.16 | ^25.8.1 | ⚠️ Upgrade with caution | Medium | Test thoroughly |
| i18next-browser-languagedetector | ^7.2.0 | ^8.2.0 | ✅ Upgrade | None | None |
| officeparser | ^5.2.2 | ^6.0.4 | 🔍 Consider removal | N/A | Unused in codebase |
| openai | ^5.12.2 | ^6.17.0 | ✅ Upgrade | Low | Type check only |

---

## Detailed Analysis

### 1. croner `^9.1.0` → `^10.0.1`

**Release Date:** February 1, 2026
**Changelog:** https://github.com/Hexagon/croner/releases/tag/10.0.0

#### Breaking Changes
1. **`?` character now acts as wildcard alias (same as `*`)** per OCPS 1.4 — previously substituted current time values
2. **Minimum Deno version increased to 2.0** — irrelevant (we use Node.js)
3. **Stricter range parsing by default** — use `sloppyRanges: true` for backward compatibility

#### New Features
- Year field support (7-field patterns)
- `previousRuns()` method
- `match()` method for date matching
- `dayOffset` option
- `mode` option for pattern precision control

#### Our Usage
- **File:** `src/process/services/cron/CronService.ts`
- **API surface used:**
  - `new Cron(expr, { timezone, paused }, callback)` — scheduling
  - `timer.nextRun()` — next run time calculation
  - `timer.stop()` — timer cancellation
  - `new Cron(expr, { timezone })` — expression validation

#### Impact Assessment
- We do NOT use the `?` character in our cron expressions (user-provided via UI)
- The `new Cron()` constructor signature is **unchanged**
- `.nextRun()` and `.stop()` methods are **unchanged**
- Stricter range parsing could potentially reject some edge-case user expressions

#### Recommended Action
**Upgrade** with one safeguard — add `sloppyRanges: true` to all `new Cron()` options to maintain backward compatibility with any existing user cron expressions:

```typescript
// Before
const timer = new Cron(schedule.expr, { timezone: schedule.tz, paused: false }, callback);

// After (safe)
const timer = new Cron(schedule.expr, { timezone: schedule.tz, paused: false, sloppyRanges: true }, callback);
```

---

### 2. cross-env `^7.0.3` → `^10.1.0`

**Release Date:** July 25, 2025 (v10.0.0)
**Changelog:** https://github.com/kentcdodds/cross-env/releases/tag/v10.0.0

#### Breaking Changes
1. **ESM-only module** — CJS `require()` no longer supported
2. **Node.js >= 20 required**

#### Our Usage
- **File:** `package.json` scripts only (CLI usage)
- `"webui:prod": "cross-env NODE_ENV=production npm run cli -- --webui"`
- `"webui:prod:remote": "cross-env NODE_ENV=production npm run cli -- --webui --remote"`

#### Impact Assessment
- We **only use the CLI binary**, not the programmatic API
- The ESM change does NOT affect CLI consumers — the `cross-env` binary still works the same way
- Node.js >=22 satisfies >=20

#### Recommended Action
**Upgrade directly** — no code changes needed.

---

### 3. css-loader `^6.11.0` → `^7.1.3`

**Release Date:** April 4, 2024 (v7.0.0)
**Changelog:** https://github.com/webpack-contrib/css-loader/releases/tag/v7.0.0

#### Breaking Changes
1. **`modules.namedExport` is now `true` by default** when `esModule` is enabled
   - Changes how CSS Modules are imported: `import * as style` instead of `import style`
2. **`modules.exportLocalsConvention` defaults to `as-is`** when `namedExport` is true
3. **Minimum webpack 5.27.0, Node.js 18.12.0**

#### Our Usage
- **File:** `config/webpack/webpack.rules.ts`
- CSS loader config with `importLoaders: 1`
- Global CSS imports (majority): `import './style.css'`, `import 'library/dist/css/file.css'`
- **One CSS Module import:** `src/renderer/pages/guid/index.tsx` → `import styles from './index.module.css'`
- TypeScript declaration: `src/renderer/types.d.ts` declares `*.module.css` with `export default classes`

#### Impact Assessment
- **Global CSS imports are unaffected** — the breaking change only applies to CSS Modules
- We have exactly **one CSS Module import** (`index.module.css`) that uses `export default` pattern
- The `export default` pattern breaks with `namedExport: true`

#### Recommended Action
**Upgrade** with config change — explicitly set `namedExport: false` to preserve current behavior:

```typescript
// config/webpack/webpack.rules.ts
{
  loader: 'css-loader',
  options: {
    importLoaders: 1,
    modules: {
      namedExport: false,  // Preserve v6 behavior for CSS Modules
    },
  },
}
```

This avoids needing to change the TypeScript declaration or the one component using CSS Modules.

---

### 4. express-rate-limit `^7.5.1` → `^8.2.1`

**Release Date:** 2025 (v8.0.0)
**Changelog:** https://express-rate-limit.mintlify.app/reference/changelog

#### Breaking Changes
1. **IPv6 addresses now masked with /56 subnet by default** — addresses in the same /56 block are treated as one user
   - This is a **security fix**: prevents IPv6 users from bypassing rate limits by iterating through addresses

#### New Features
- `ipv6Subnet` configuration option (default: 56)
- `ipKeyGenerator(ip, ipv6Subnet)` helper
- `knownOptions` validation (v8.2.0) — catches typos in config
- `forwardedHeader` validation (v8.1.0)

#### Our Usage
- **File:** `src/webserver/middleware/security.ts`
- 5 rate limiters: `authRateLimiter`, `apiRateLimiter`, `fileOperationLimiter`, `authenticatedActionLimiter`, `createRateLimiter`
- Standard options: `standardHeaders`, `legacyHeaders`, `windowMs`, `max`, `message`, `keyGenerator`
- Custom `keyGenerator` functions use `req.user?.id` or `req.ip`

#### Impact Assessment
- All our configuration options are **fully supported** in v8
- The IPv6 subnet masking is a **security improvement** — desirable behavior
- Our custom `keyGenerator` functions using `req.ip` will benefit from the improved IPv6 handling
- The `createRateLimiter` factory pattern using `Parameters<typeof rateLimit>[0]` will work with the new type

#### Recommended Action
**Upgrade directly** — no code changes needed. This is a security improvement.

---

### 5. fix-path `^4.0.0` → `^5.0.0`

**Release Date:** September 9, 2024 (v5.0.0)
**Changelog:** https://github.com/sindresorhus/fix-path/releases/tag/v5.0.0

#### Breaking Changes
1. **Node.js >= 20 required** (we use >=22)

#### Bug Fixes
- Fixes ANSI escape sequences in PATH environment variable

#### Our Usage
- **File:** `src/index.ts` (Electron main process entry)
- `import fixPath from 'fix-path'` → `fixPath()` — called once on app startup for macOS/Linux

#### Impact Assessment
- v4.0.0 was already pure ESM — we already import it as ESM via webpack
- v5.0.0 only bumps Node.js min and fixes ANSI in PATH
- The ANSI fix is beneficial for our use case (ensuring clean PATH for CLI agent spawning)

#### Recommended Action
**Upgrade directly** — no code changes needed. The ANSI PATH fix is beneficial.

---

### 6. fork-ts-checker-webpack-plugin `^7.3.0` → `^9.1.0`

**Release Date:** October 2023 (v9.0.0), March 2023 (v8.0.0)
**Changelog:** https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/releases

#### Breaking Changes
- **v8.0.0:** Drop support for Vue.js
- **v9.0.0:** Drop support for Node.js v12

#### Our Usage
- **File:** `config/webpack/webpack.plugins.ts`
- `const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')`
- `new ForkTsCheckerWebpackPlugin({ logger: 'webpack-infrastructure' })`

#### Impact Assessment
- We do **NOT use Vue.js** — Vue.js drop is irrelevant
- Node.js v12 drop is irrelevant (we require >=22)
- The `logger: 'webpack-infrastructure'` option is still supported
- Package still provides CJS exports (the `require()` in our config works)

#### Recommended Action
**Upgrade directly** — no code changes needed.

---

### 7. i18next `^23.7.16` → `^25.8.1`

**Release Date:** 2025 (v25.0.0), 2025 (v24.0.0)
**Migration Guide:** https://www.i18next.com/misc/migration-guide

⚠️ **This spans TWO major versions (v23→v24→v25). Higher risk.**

#### Breaking Changes (v23 → v24)
1. **`changeLanguage()` now always uses `getBestMatchFromCodes`** — may change language resolution behavior
2. **`getBestMatchFromCodes` now falls back to language code with same script**

#### Breaking Changes (v24 → v25)
1. **Removed support for older environments** (old browser/Node.js versions)
2. **Renamed `initImmediate` to `initAsync`** — we don't use this option
3. **Dropped TypeScript v4** — we use v5.9.3 ✅
4. **`jsonFormat` option removed** — we don't use this option
5. **`compatibilityJSON` only accepts `v4`** — we don't use this option
6. **New `enableSelector` API** for TypeScript IDE performance

#### Our Usage
- **Renderer:** `src/renderer/i18n/index.ts` — `i18n.use(LanguageDetector).use(initReactI18next).init({...})`
- **Main process:** `src/process/i18n/index.ts` — `i18n.init({...})`
- Standard usage: `.init()`, `.changeLanguage()`, `useTranslation()` hook (via react-i18next)
- 7 locale files (zh-CN, en-US, ja-JP, zh-TW, ko-KR, tr-TR in renderer; minus tr-TR in main)

#### Compatibility Check
- `react-i18next@14.1.3` peer-depends on `i18next >= 23.2.3` — v25 satisfies this
- i18next v25 still ships **both CJS and ESM** builds (`dist/cjs/i18next.js`) — main process usage is safe
- "Dropped support for Node.js" in migration guide refers to **old Node.js versions**, not the platform

#### Impact Assessment
- The `changeLanguage()` behavior change (v24) is the main risk — our setup uses explicit language codes from localStorage/navigator, so `getBestMatchFromCodes` should resolve correctly for our supported locales
- We don't use any of the removed options (`initImmediate`, `jsonFormat`, `compatibilityJSON`)
- TypeScript v5.9.3 satisfies the v5+ requirement
- The `enableSelector` API is optional and opt-in

#### Recommended Action
**Upgrade with thorough testing:**
1. Verify all 7 locale codes resolve correctly after upgrade
2. Test language switching in UI (Settings → Language)
3. Test the main process i18n initialization
4. Consider upgrading `react-i18next` to latest v14.x or v15.x alongside

---

### 8. i18next-browser-languagedetector `^7.2.0` → `^8.2.0`

**Release Date:** 2024 (v8.0.0)
**Changelog:** https://github.com/i18next/i18next-browser-languageDetector/blob/master/CHANGELOG.md

#### Breaking Changes
- **v8.0.0:** Updated browser targets to `defaults`, performance optimizations using optional chaining and object destructuring
- No API changes, no configuration changes

#### Our Usage
- **File:** `src/renderer/i18n/index.ts`
- `import LanguageDetector from 'i18next-browser-languagedetector'`
- `i18n.use(LanguageDetector)` with detection config: `{ order: ['localStorage', 'navigator'], caches: ['localStorage'] }`

#### Impact Assessment
- The breaking change is purely a **build modernization** (browser target update)
- Our detection configuration is fully compatible
- Added security: v8.0.5 adds XSS pattern detection on detected language values

#### Recommended Action
**Upgrade directly** — no code changes needed. Should be upgraded alongside i18next.

---

### 9. officeparser `^5.2.2` → `^6.0.4`

**Release Date:** 2025 (v6.0.0)
**Changelog:** https://github.com/harshankur/officeParser/releases

#### Breaking Changes
1. **Output changed from plain text string to structured AST** — major API change

#### Our Usage
- **Package.json:** Listed as a direct dependency
- **Source code:** **NOT imported or referenced anywhere in `src/`**
- **Not used by `@office-ai/aioncli-core`** either (verified by searching compiled output)
- `npm ls officeparser` shows it's a direct top-level dependency only

#### Impact Assessment
- This package appears to be **unused dead weight** — possibly was planned for document parsing but never integrated, or was removed from code but not from dependencies
- Upgrading would have zero impact since it's not imported
- Removing it would reduce install size

#### Recommended Action
**Consider removing entirely** with `npm uninstall officeparser`. If document parsing is needed in the future, install v6 at that time with the new AST API. If removal isn't desired, pin at current version since upgrading an unused package provides no benefit.

---

### 10. openai `^5.12.2` → `^6.17.0`

**Release Date:** September 30, 2025 (v6.0.0)
**Changelog:** https://github.com/openai/openai-node/blob/master/CHANGELOG.md

#### Breaking Changes
1. **`ResponseFunctionToolCallOutputItem.output` and `ResponseCustomToolCallOutput.output`** now return `string | Array<ResponseInputText | ResponseInputImage | ResponseInputFile>` instead of `string` only

#### Our Usage
- **`src/common/adapters/OpenAIRotatingClient.ts`** — `new OpenAI({...})`, `client.chat.completions.create()`, `client.images.generate()`, `client.embeddings.create()`
- **`src/process/bridge/modelBridge.ts`** — `new OpenAI({...})`, `openai.models.list()`, type references
- **`src/agent/gemini/cli/tools/img-gen.ts`** — `type OpenAI from 'openai'` (type-only import)

#### Impact Assessment
- The breaking change affects the **Responses API** types (`ResponseFunctionToolCallOutputItem`, `ResponseCustomToolCallOutput`)
- We do **NOT use the Responses API** — our code uses:
  - Chat Completions API ✅ unchanged
  - Models API ✅ unchanged
  - Images API ✅ unchanged
  - Embeddings API ✅ unchanged
- The `img-gen.ts` uses `type OpenAI` for type references — this should compile fine
- v6 includes many new model types (GPT-5, GPT-5.1, GPT-5.2, gpt-image-1.5, Realtime GA, etc.)

#### Recommended Action
**Upgrade** — the breaking change does not affect our API surface. Run TypeScript compilation to verify no type errors. Benefits include access to latest model type definitions.

---

## Upgrade Execution Plan

### Phase 1: Safe Upgrades (No Code Changes)
```bash
npm install cross-env@^10 express-rate-limit@^8 fix-path@^5 fork-ts-checker-webpack-plugin@^9 i18next-browser-languagedetector@^8
```

### Phase 2: Upgrades with Minor Config/Code Changes
```bash
npm install croner@^10 css-loader@^7 openai@^6
```
Then apply:
- `croner`: Add `sloppyRanges: true` to Cron constructor options
- `css-loader`: Add `modules: { namedExport: false }` to loader config
- `openai`: Run `npx tsc --noEmit` to verify no type errors

### Phase 3: Multi-Version Upgrade (Careful Testing)
```bash
npm install i18next@^25
```
Test: Language detection, switching, fallback, main process i18n

### Phase 4: Cleanup
- Evaluate `officeparser` removal: `npm uninstall officeparser`

---

## Renovate Configuration Updates

Packages that need Renovate rules:
- **officeparser**: Disabled until decision on removal vs upgrade
- **i18next group**: Should include `react-i18next` in the group for coordinated upgrades

---

## References

- [Croner 10.0.0 Release](https://github.com/Hexagon/croner/releases/tag/10.0.0)
- [cross-env 10.0.0 Release](https://github.com/kentcdodds/cross-env/releases/tag/v10.0.0)
- [css-loader 7.0.0 Release](https://github.com/webpack-contrib/css-loader/releases/tag/v7.0.0)
- [express-rate-limit Changelog](https://express-rate-limit.mintlify.app/reference/changelog)
- [fix-path 5.0.0 Release](https://github.com/sindresorhus/fix-path/releases/tag/v5.0.0)
- [fork-ts-checker-webpack-plugin Releases](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/releases)
- [i18next Migration Guide](https://www.i18next.com/misc/migration-guide)
- [i18next-browser-languageDetector Changelog](https://github.com/i18next/i18next-browser-languageDetector/blob/master/CHANGELOG.md)
- [officeParser Releases](https://github.com/harshankur/officeParser/releases)
- [openai-node Changelog](https://github.com/openai/openai-node/blob/master/CHANGELOG.md)
