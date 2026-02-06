# Blocked & Pinned Dependency Upgrades

**Last Updated:** February 6, 2026
**Project:** AionUI (Electron 37 / Node.js 24 / TypeScript 5.8+)

This document tracks packages that cannot be upgraded due to breaking changes, peer dependency conflicts, or compatibility issues. Renovate is configured to skip major bumps for these packages.

---

## ⛔ Blocked Upgrades

### 1. `@electron/fuses` — Pinned to `^1.8.0`

| Current | Latest | Blocker |
|---------|--------|---------|
| 1.8.0 | 2.x | Peer dependency conflict with `@electron-forge/plugin-fuses` |

**Why:** `@electron-forge/plugin-fuses@7.11.1` requires `@electron/fuses ^1.0.0`. The v2.0.0 release is also ESM-only, and our project uses CommonJS (`"module": "commonjs"` in tsconfig.json).

**Impact:** `forge.config.ts` uses `FuseV1Options` and `FuseVersion` for Electron security fuses (RunAsNode, CookieEncryption, AsarIntegrity, etc.).

**Unblock condition:** Wait for `@electron-forge/plugin-fuses` to release a version supporting `@electron/fuses ^2.0.0`. Monitor: https://github.com/electron/forge/releases

**Renovate rule:** Major Electron upgrades disabled (`electron`, `@electron/fuses`, `@electron/notarize`).

---

### 2. `openid-client` — Pinned to `^5.7.1`

| Current | Latest | Blocker |
|---------|--------|---------|
| 5.7.1 | 6.x | Complete API rewrite — no migration path |

**Why:** v6 is a ground-up rewrite (first in 8 years). The `Issuer`, `Client`, and `TokenSet` classes are removed entirely, replaced with a function-based API. Our entire OIDC auth flow (`OidcService.ts`) uses these classes for Microsoft EntraID SSO.

**Impact:** Would require a complete rewrite of `src/webserver/auth/service/OidcService.ts` (~4-6 hours). PKCE is now mandatory in v6 examples.

**Why not upgrade:** v5 continues to receive security updates. Our implementation is stable and working. The migration cost doesn't justify the upgrade since v6 adds no features we need (we use basic authorization code flow).

**Renovate rule:** Major updates disabled for `openid-client`.

---

### 3. `web-tree-sitter` — Pinned to exact `0.25.10`

| Current | Latest | Blocker |
|---------|--------|---------|
| 0.25.10 | 0.26.x | WASM loading broken in Docker/Electron |

**Why:** v0.26.x changed the WASM build system from Emscripten to wasi-sdk, which breaks WASM file loading in the Docker headless Electron environment. Pinned to exact version (no `^` prefix) after diagnosing tree-sitter WASM loading errors in container.

**Impact:** Used by `@office-ai/aioncli-core` for code parsing. Listed as both a direct dependency and transitive dependency.

**Unblock condition:** Test v0.26.x WASM loading in Docker headless Electron (Xvfb) environment. If it works, unpin.

---

### 4. `@vercel/webpack-asset-relocator-loader` — Pinned to exact `1.7.3`

| Current | Latest | Blocker |
|---------|--------|---------|
| 1.7.3 | — | Newer versions break native module resolution in Electron |

**Why:** This loader handles native module asset relocation during webpack bundling. Upgrading has historically caused `better-sqlite3` and `node-pty` to fail at runtime in the packaged Electron app.

**Impact:** Critical for the build pipeline — incorrect relocation breaks the entire application.

**Renovate rule:** Updates disabled entirely.

---

### 5. Electron major version — Pinned to `37.x`

| Current | Latest | Blocker |
|---------|--------|---------|
| 37.x | 40.x | Major jump requiring manual evaluation |

**Why:** Electron major upgrades (37 → 38/39/40) involve Chromium and Node.js version bumps that can break native modules, WASM loading, and security fuse behavior. Each major version requires manual testing of the full build pipeline (Forge → electron-builder hybrid), Docker headless mode (Xvfb), and all native modules.

**Renovate rule:** Major updates disabled for `electron`, `@electron/fuses`, `@electron/notarize`.

---

### 6. `@types/node` — Major bumps disabled

| Current | Latest | Blocker |
|---------|--------|---------|
| ^24.x | 25.x | May include types for Node.js APIs not available in Node 24 |

**Why:** `@types/node@25.x` includes type definitions for Node.js 25 APIs. Since the project runs on Node.js 24, using these types could lead to code that compiles but fails at runtime.

**Unblock condition:** Upgrade to Node.js 25 first, then upgrade `@types/node` to match.

**Renovate rule:** Major updates disabled.

---

## 📋 Previously Blocked (Now Resolved)

These were documented in earlier analysis but have since been upgraded:

| Package | Was Blocked At | Resolved | Notes |
|---------|---------------|----------|-------|
| `css-loader` | ^6.x → ^7.x | ✅ Now at 7.1.3 | Required `modules: { auto: true, namedExport: false }` in webpack config |
| `i18next` | ^23.x | ✅ Removed | English-only — all i18n infrastructure removed in v1.8.2 |
| `i18next-browser-languagedetector` | ^7.x | ✅ Removed | Removed with i18n infrastructure |
| `officeparser` | ^5.x | ✅ Removed | Was unused in codebase |
| `style-loader` | ^3.x | ✅ Removed | Was unused (project uses MiniCssExtractPlugin) |
| `bcryptjs` | ^2.x → ^3.x | ✅ Upgraded | Built-in types, removed `@types/bcryptjs` |
| `cross-env` | ^7.x → ^10.x | ✅ Upgraded | CLI-only, no code changes |
| `croner` | ^9.x → ^10.x | ✅ Upgraded | API compatible |
| `@typescript-eslint/*` | ^6.x → ^8.x | ✅ Upgraded | Migrated 3 rules to `@stylistic/eslint-plugin` |

---

## Renovate Configuration

All blocked packages are configured in `renovate.json5`. Key rules:

```jsonc
// @vercel/webpack-asset-relocator-loader — all updates disabled
// electron, @electron/fuses, @electron/notarize — major updates disabled
// openid-client — major updates disabled
// @types/node — major updates disabled
// web-tree-sitter — pinned to exact version in package.json (no ^)
```

---

*Review this document when evaluating dependency upgrades. When a blocker is resolved, move the entry to "Previously Blocked" with resolution notes.*
