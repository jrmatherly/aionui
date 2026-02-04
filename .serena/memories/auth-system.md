# AionUI Authentication System

## Overview

Multi-user enterprise authentication added February 2026. Supports both local admin and OIDC SSO.

## Architecture

### Auth Flow

- **Local login:** `POST /login` → bcryptjs password verify → JWT access token (15min) + refresh token (7d)
- **OIDC SSO:** `GET /api/auth/oidc/login` → EntraID redirect → callback → JIT user provisioning → JWT pair
- **Token refresh:** `POST /api/auth/refresh` → rotate refresh token, issue new access token
- **Desktop:** No auth required (Electron app, single user)

### Key Files

- `src/webserver/auth/service/AuthService.ts` — Token generation, password hashing, blacklist management
- `src/webserver/auth/service/OidcService.ts` — OIDC discovery, authorization flow, JIT provisioning
- `src/webserver/auth/middleware/AuthMiddleware.ts` — Request authentication
- `src/webserver/auth/middleware/TokenMiddleware.ts` — JWT extraction and validation
- `src/webserver/auth/middleware/RoleMiddleware.ts` — Role-based access control (requireAdmin, requireRole)
- `src/webserver/auth/middleware/DataScopeMiddleware.ts` — User data isolation (scopeToUser)
- `src/webserver/auth/repository/UserRepository.ts` — Database operations for users
- `src/webserver/auth/config/oidcConfig.ts` — OIDC configuration from environment
- `src/webserver/auth/config/groupMappings.ts` — EntraID group → app role mapping
- `src/webserver/routes/authRoutes.ts` — Login, logout, refresh, OIDC, change password endpoints
- `src/webserver/routes/adminRoutes.ts` — User management, role changes (admin only)

### Database

- **Schema version:** 14 (`CURRENT_DB_VERSION` in `src/process/database/schema.ts`)
- **Tables:** `users` (with role, auth_method, oidc_subject, display_name, groups, avatar_url), `refresh_tokens`, `token_blacklist`, `user_api_keys`
- **Migrations:** v10 (auth columns), v11 (refresh tokens + blacklist), v12 (avatar_url), v13 (upstream Lark), v14 (user_api_keys for per-user API key storage)

### Frontend

- `src/renderer/context/AuthContext.tsx` — Auth state management, login/logout/refresh
- `src/renderer/pages/login/index.tsx` — Login page (OIDC primary, local collapsible)
- `src/renderer/components/UserMenu/index.tsx` — Sidebar avatar dropdown
- `src/renderer/pages/profile/ProfilePage.tsx` — User profile with avatar

### Roles

- `admin` — Full access, user management, group mapping viewer
- `user` — Standard access, own conversations
- `viewer` — Read-only access

### Per-User API Keys

- **Storage:** `user_api_keys` table (v14 migration), AES-256-GCM encryption at rest
- **UI:** `src/renderer/components/SettingsModal/contents/ApiKeysModalContent.tsx`
- **Backend:** `src/webserver/routes/apiRoutes.ts` — CRUD endpoints, never returns decrypted keys (only hints like `...sk-abc`)
- **Wiring:** userId threaded through `WorkerManage → AgentManager → Agent → Connection → getEnhancedEnv()` for per-user key injection into CLI agent spawns
- **Docs:** `docs/guides/PER_USER_API_KEY_ISOLATION.md`

### Admin Password

- **Env var:** `AIONUI_ADMIN_PASSWORD` — sets initial admin password in Docker
- **Behavior:** Only applies when admin has no valid password (first run or blank DB). Does NOT overwrite existing password on container restart.
- **Console:** Suppresses plaintext password display when env-provided (shows "(set via AIONUI_ADMIN_PASSWORD)")
- **Implementation:** `src/webserver/index.ts` → `initializeDefaultAdmin()`

### Security

- bcrypt-ts@8.0.1 for password hashing (migrated from bcryptjs)
- CSRF protection via tiny-csrf (exclusions: /login, /logout, /api/auth/refresh, /api/auth/qr-login)
- Token blacklist persisted in SQLite with in-memory cache
- Rate limiting per authenticated user (falls back to IP)
- Security headers: HSTS, Permissions-Policy, CSP, X-Frame-Options

### OIDC Configuration

- Provider: Microsoft EntraID (tested and verified)
- Scopes: openid, profile, email, User.Read (for Graph API profile photos)
- Group mappings: File-based (`GROUP_MAPPINGS_FILE`) or env var (`GROUP_MAPPINGS_JSON`)
- JIT user provisioning on first OIDC login
- Display name normalization: "Last, First" → "First Last"

## Key Decisions

- Desktop stays login-free; multi-user targets WebUI/Docker/K8s only
- SQLite for token blacklist (not Redis) — single-node deployment
- 15min access / 7d refresh token split
- `bcrypt-ts@8.0.1` (pure JS, modern ESM) — migrated from bcryptjs
- `openid-client@5.7.1` for OIDC (certified library, pure JS)
- Per-user API keys encrypted at rest (AES-256-GCM), never returned decrypted to frontend
- `AIONUI_ADMIN_PASSWORD` env var: one-shot initial password, never overwrites on restart
